import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { crc32 as zlibCrc32, inflateRawSync } from "node:zlib";

import {
  XLSX_CONTENT_TYPE,
  XLSX_MAX_CELL_LENGTH,
  buildXlsx,
  cleanCellText,
  cleanSheetName,
  columnLetter,
  crc32,
  type XlsxColumn,
} from "./write-xlsx.ts";

/* A ZIP reader written for the test: walks the end record and the central
   directory, checks each local header against its central entry, inflates
   every part and checks its size and CRC-32 (against node:zlib's own CRC,
   not the writer's). */
const readZip = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;

  for (let at = bytes.length - 22; at >= 0; at -= 1) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }

  assert.notEqual(end, -1, "end of central directory record");
  assert.equal(end, bytes.length - 22, "no comment, nothing after the end record");
  assert.equal(view.getUint16(end + 4, true), 0);
  assert.equal(view.getUint16(end + 6, true), 0);

  const count = view.getUint16(end + 10, true);
  assert.equal(view.getUint16(end + 8, true), count);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  assert.equal(centralOffset + centralSize, end, "central directory ends at the end record");

  const parts = new Map<string, string>();
  const order: string[] = [];
  let at = centralOffset;
  let expectedLocal = 0;

  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(at, true), 0x02014b50, "central header signature");
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));

    assert.equal(method, 8, `${name}: deflate`);
    assert.equal(localOffset, expectedLocal, `${name}: local headers back to back`);

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `${name}: local header signature`);
    assert.equal(view.getUint16(localOffset + 8, true), method);
    assert.equal(view.getUint32(localOffset + 14, true), crc, `${name}: local CRC`);
    assert.equal(view.getUint32(localOffset + 18, true), compressedSize);
    assert.equal(view.getUint32(localOffset + 22, true), size);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    assert.equal(
      new TextDecoder().decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength)),
      name
    );

    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const inflated = inflateRawSync(bytes.subarray(dataStart, dataStart + compressedSize));
    assert.equal(inflated.length, size, `${name}: size`);
    assert.equal(zlibCrc32(inflated), crc, `${name}: CRC-32 matches the inflated bytes`);

    parts.set(name, new TextDecoder("utf-8", { fatal: true }).decode(inflated));
    order.push(name);
    expectedLocal = dataStart + compressedSize;
    at += 46 + nameLength + extraLength + commentLength;
  }

  assert.equal(expectedLocal, centralOffset, "central directory follows the last part");
  return { parts, order };
};

const columns: XlsxColumn[] = [
  { header: "No.", width: 6, kind: "number" },
  { header: "Rider", width: 24, kind: "text" },
  { header: "Phone", width: 16, kind: "text" },
  { header: "Age", width: 7, kind: "number" },
];

const sheetOf = (rows: (string | number | null | undefined)[][], sheetName = "Solo riders") => {
  const zip = readZip(buildXlsx({ sheetName, columns, rows }));
  return { ...zip, sheet: zip.parts.get("xl/worksheets/sheet1.xml") ?? "" };
};

test("crc32 agrees with node:zlib", () => {
  for (const sample of ["", "a", "Harpreet Singh", "ਸਿੰਘ", "x".repeat(10000)]) {
    const bytes = new TextEncoder().encode(sample);
    assert.equal(crc32(bytes), zlibCrc32(bytes));
  }
});

test("the workbook is a valid ZIP with every required part", () => {
  const { parts, order } = sheetOf([[1, "Harpreet Singh", "09876543210", 24]]);

  assert.deepEqual(order, [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
  ]);

  for (const [name, xml] of parts) {
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?>/, name);
  }

  const types = parts.get("[Content_Types].xml") ?? "";
  assert.match(types, /<Default Extension="rels" ContentType="application\/vnd\.openxmlformats-package\.relationships\+xml"\/>/);
  assert.match(types, /<Override PartName="\/xl\/workbook\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet\.main\+xml"\/>/);
  assert.match(types, /<Override PartName="\/xl\/worksheets\/sheet1\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.worksheet\+xml"\/>/);
  assert.match(types, /<Override PartName="\/xl\/styles\.xml" ContentType="application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.styles\+xml"\/>/);

  assert.match(parts.get("_rels/.rels") ?? "", /relationships\/officeDocument" Target="xl\/workbook\.xml"/);
  const workbookRels = parts.get("xl/_rels/workbook.xml.rels") ?? "";
  assert.match(workbookRels, /Id="rId1" Type="[^"]+\/worksheet" Target="worksheets\/sheet1\.xml"/);
  assert.match(workbookRels, /Id="rId2" Type="[^"]+\/styles" Target="styles\.xml"/);

  const workbook = parts.get("xl/workbook.xml") ?? "";
  assert.match(workbook, /<sheet name="Solo riders" sheetId="1" r:id="rId1"\/>/);
  assert.match(workbook, /<definedName name="_xlnm\._FilterDatabase" localSheetId="0" hidden="1">'Solo riders'!\$A\$1:\$D\$2<\/definedName>/);

  // The minimum Excel insists on: two fonts (plain, bold), the two mandatory
  // fills, a border, the style records and the Normal style.
  const styles = parts.get("xl/styles.xml") ?? "";
  assert.match(styles, /<fonts count="2"><font>.*?<\/font><font><b\/>/);
  assert.match(styles, /<fills count="2"><fill><patternFill patternType="none"\/><\/fill><fill><patternFill patternType="gray125"\/><\/fill><\/fills>/);
  assert.match(styles, /<borders count="1">/);
  assert.match(styles, /<cellStyleXfs count="1">/);
  assert.match(styles, /<cellXfs count="3">/);
  assert.match(styles, /<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"\/><\/cellStyles>/);
  const order2 = ["<fonts", "<fills", "<borders", "<cellStyleXfs", "<cellXfs", "<cellStyles", "<dxfs", "<tableStyles"]
    .map((tag) => styles.indexOf(tag));
  assert.deepEqual(order2, [...order2].sort((a, b) => a - b));
  assert.ok(order2.every((index) => index > 0));

  assert.equal(XLSX_CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("worksheet children are in the order Excel requires", () => {
  const { sheet } = sheetOf([[1, "A", "1", 2]]);
  const positions = ["<dimension", "<sheetViews", "<sheetFormatPr", "<cols", "<sheetData", "<autoFilter", "<pageMargins"]
    .map((tag) => sheet.indexOf(tag));

  assert.ok(positions.every((index) => index > 0), String(positions));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(sheet, /<dimension ref="A1:D2"\/>/);
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:D2"\/>/);
  assert.match(sheet, /<col min="1" max="1" width="6" customWidth="1"\/><col min="2" max="2" width="24" customWidth="1"\/>/);
});

test("the header row is bold, one cell per column, and every cell has a reference", () => {
  const { sheet } = sheetOf([[1, "A", "1", 2], [2, "B", "2", 3]]);
  const header = /<row r="1">(.*?)<\/row>/.exec(sheet)?.[1] ?? "";
  const headerCells = header.match(/<c /g) ?? [];

  assert.equal(headerCells.length, columns.length);
  assert.match(header, /^<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">No\.<\/t><\/is><\/c>/);
  assert.match(header, /<c r="D1" s="1" t="inlineStr"><is><t xml:space="preserve">Age<\/t><\/is><\/c>$/);

  const rowNumbers = [...sheet.matchAll(/<row r="(\d+)"/g)].map((match) => Number(match[1]));
  assert.deepEqual(rowNumbers, [1, 2, 3]);

  const cells = sheet.match(/<c [^>]*>/g) ?? [];
  assert.equal(cells.length, 12);
  assert.ok(cells.every((cell) => /^<c r="[A-Z]+\d+"/.test(cell)), "every cell has r=");
  // The bold font is the header's style.
  assert.match(sheet, /<c r="B3" s="2" t="inlineStr"><is><t xml:space="preserve">B<\/t><\/is><\/c>/);
});

test("formulas can never be written: =, +, - and @ values are inline strings", () => {
  const { sheet } = sheetOf([[1, "=1+1", "+919876543210", "-5"], [2, "@SUM(A1)", "=HYPERLINK(\"x\")", null]]);

  assert.doesNotMatch(sheet, /<f>|<f /);
  assert.match(sheet, /<c r="B2" s="2" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="C2" s="2" t="inlineStr"><is><t xml:space="preserve">\+919876543210<\/t><\/is><\/c>/);
  // A string in a number column is still text.
  assert.match(sheet, /<c r="D2" s="2" t="inlineStr"><is><t xml:space="preserve">-5<\/t><\/is><\/c>/);
  assert.match(sheet, /<t xml:space="preserve">@SUM\(A1\)<\/t>/);
  assert.match(sheet, /<t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)<\/t>/);
  // No shared strings part, no t="s", no t="str".
  assert.doesNotMatch(sheet, /t="(s|str)"/);
});

test("numbers are numeric cells only in number columns and only when finite", () => {
  const { sheet } = sheetOf([
    [1, "A", 9876543210, 24],
    [2, "B", "0987654321", Number.NaN],
    [3, "C", null, Number.POSITIVE_INFINITY],
    [4, "D", undefined, 0],
  ]);

  assert.match(sheet, /<c r="A2" s="0"><v>1<\/v><\/c>/);
  assert.match(sheet, /<c r="D2" s="0"><v>24<\/v><\/c>/);
  // A number in a text column (a phone) is text.
  assert.match(sheet, /<c r="C2" s="2" t="inlineStr"><is><t xml:space="preserve">9876543210<\/t><\/is><\/c>/);
  // The leading zero survives.
  assert.match(sheet, /<t xml:space="preserve">0987654321<\/t>/);
  assert.match(sheet, /<c r="D3" s="2" t="inlineStr"><is><t xml:space="preserve">NaN<\/t>/);
  assert.match(sheet, /<c r="D4" s="2" t="inlineStr"><is><t xml:space="preserve">Infinity<\/t>/);
  assert.match(sheet, /<c r="D5" s="0"><v>0<\/v><\/c>/);
});

test("null, undefined and empty text leave the cell out", () => {
  const { sheet } = sheetOf([[1, "", null, undefined]]);

  assert.match(sheet, /<row r="2"><c r="A2" s="0"><v>1<\/v><\/c><\/row>/);
  assert.doesNotMatch(sheet, /r="B2"|r="C2"|r="D2"/);
});

test("XML specials are escaped and forbidden characters removed", () => {
  const nasty = `Tom & Jerry <b>"x"</b> 'y'\u0000\u0001\u0008\u000B\u000C\u001F￾￿\uD800 end\u0007`;
  const { sheet } = sheetOf([[1, nasty, "tab\there\nline\r\nCR\rx", "_x0041_"]]);

  assert.match(
    sheet,
    /<t xml:space="preserve">Tom &amp; Jerry &lt;b&gt;&quot;x&quot;&lt;\/b&gt; 'y' end<\/t>/
  );
  assert.match(sheet, /<t xml:space="preserve">tab\there\nline\nCR\nx<\/t>/);
  // Excel's own escape syntax is itself escaped, so the text stays as typed.
  assert.match(sheet, /<t xml:space="preserve">_x005F_x0041_<\/t>/);
  // Nothing XML 1.0 forbids is left anywhere in the sheet.
  assert.doesNotMatch(sheet, /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/);
});

test("lone surrogates go, surrogate pairs stay", () => {
  assert.equal(cleanCellText("a\uD800b\uDC00c"), "abc");
  assert.equal(cleanCellText("horse 🐎"), "horse 🐎");
  assert.equal(cleanCellText("\uDC00🐎\uD83D"), "🐎");
});

test("Gurmukhi text round-trips byte for byte", () => {
  const name = "ਹਰਪ੍ਰੀਤ ਸਿੰਘ";
  const place = "ਪਿੰਡ ਖੇੜਾ, ਲੁਧਿਆਣਾ, ਪੰਜਾਬ";
  const { sheet } = sheetOf([[1, name, place, 30]]);

  assert.ok(sheet.includes(`<t xml:space="preserve">${name}</t>`));
  assert.ok(sheet.includes(`<t xml:space="preserve">${place}</t>`));
  assert.ok(Buffer.from(sheet, "utf8").includes(Buffer.from(name, "utf8")));
});

test("text is cut at Excel's cell limit without splitting a pair", () => {
  assert.equal(cleanCellText("x".repeat(XLSX_MAX_CELL_LENGTH + 50)).length, XLSX_MAX_CELL_LENGTH);
  const pairAtTheEdge = `${"x".repeat(XLSX_MAX_CELL_LENGTH - 1)}🐎`;
  assert.equal(cleanCellText(pairAtTheEdge), "x".repeat(XLSX_MAX_CELL_LENGTH - 1));
});

test("sheet names follow Excel's rules", () => {
  assert.equal(cleanSheetName("Solo riders"), "Solo riders");
  assert.equal(cleanSheetName("a[b]c:d*e?f/g\\h"), "a b c d e f g h");
  assert.equal(cleanSheetName("x".repeat(40)).length, 31);
  assert.equal(cleanSheetName("   "), "Sheet1");
  assert.equal(cleanSheetName("[]:*?/\\"), "Sheet1");
  assert.equal(cleanSheetName("'quoted'"), "quoted");
  assert.equal(cleanSheetName("History"), "History sheet");

  const { parts } = sheetOf([[1, "A", "1", 2]], "Riders & <friends>'s list");
  assert.match(parts.get("xl/workbook.xml") ?? "", /<sheet name="Riders &amp; &lt;friends&gt;'s list"/);
  assert.match(parts.get("xl/workbook.xml") ?? "", /'Riders &amp; &lt;friends&gt;''s list'!\$A\$1:\$D\$2/);
});

test("column letters", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter), [
    "A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA",
  ]);
});

test("an empty list still writes the header row and a one-row filter", () => {
  const { sheet } = sheetOf([]);

  assert.match(sheet, /<dimension ref="A1:D1"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:D1"\/>/);
  assert.deepEqual([...sheet.matchAll(/<row r="(\d+)"/g)].map((match) => match[1]), ["1"]);
  assert.throws(() => buildXlsx({ sheetName: "x", columns: [], rows: [] }));
});

test("the same rows give the same bytes", () => {
  const input = { sheetName: "Solo riders", columns, rows: [[1, "A", "0123", 4]] };
  assert.deepEqual(buildXlsx(input), buildXlsx(input));
});

test("the writer imports nothing but node:zlib", () => {
  const source = readFileSync(new URL("./write-xlsx.ts", import.meta.url), "utf8");
  const imports = [...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1]);

  assert.deepEqual(imports, ["node:zlib"]);
  assert.doesNotMatch(source, /require\(/);
});

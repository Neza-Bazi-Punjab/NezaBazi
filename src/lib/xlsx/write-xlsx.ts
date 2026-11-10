// A small, dependency-free .xlsx writer: one worksheet, a bold frozen header
// row with an auto-filter, fixed column widths, text and number cells.
//
// Written for the administrators' rider export
// (src/app/api/admin/registrations/export). The file is an Office Open XML
// workbook (six parts) in a ZIP container built here: deflate from node:zlib,
// CRC-32 from the table below, local headers, central directory, end record.
//
// Safety rules, all enforced in this file:
//   - Every text value is an inline string (t="inlineStr"). Nothing is ever
//     written as a formula, so a value such as "=1+1", "+91…" or "@x" is text.
//   - A number cell is written only for a finite number in a `kind: "number"`
//     column. Anything else in such a column is text; null, undefined and ""
//     leave the cell out.
//   - Text is made safe for XML 1.0 (escaped; characters XML forbids are
//     removed) and cut at Excel's 32,767-character cell limit. Gurmukhi and
//     every other valid character pass through unchanged.
//
// It imports nothing but node:zlib, so the tests can load it directly.
import { deflateRawSync } from "node:zlib";

export type XlsxColumn = { header: string; width: number; kind: "text" | "number" };
export type XlsxCell = string | number | null | undefined;

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/* Excel's limit on the characters in one cell. */
export const XLSX_MAX_CELL_LENGTH = 32767;
/* Excel's limit on a sheet name. */
export const XLSX_MAX_SHEET_NAME_LENGTH = 31;

/* CRC-32 ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

export const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
};

/* ZIP ---------------------------------------------------------------------- */

type ZipEntry = { name: string; data: Uint8Array };

/* 1 January 1980 00:00, the earliest DOS date: a fixed stamp, so the same
   rows always give the same bytes. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const textEncoder = new TextEncoder();

const buildZip = (entries: ZipEntry[]): Uint8Array<ArrayBuffer> => {
  const prepared = entries.map((entry) => {
    const name = textEncoder.encode(entry.name);
    const compressed = deflateRawSync(entry.data, { level: 6 });
    return { name, data: entry.data, compressed, crc: crc32(entry.data) };
  });

  const localSize = prepared.reduce(
    (total, entry) => total + 30 + entry.name.length + entry.compressed.length,
    0
  );
  const centralSize = prepared.reduce((total, entry) => total + 46 + entry.name.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  const offsets: number[] = [];
  let at = 0;

  for (const entry of prepared) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true); // local file header signature
    view.setUint16(at + 4, 20, true); // version needed to extract (2.0)
    view.setUint16(at + 6, 0, true); // general purpose flags
    view.setUint16(at + 8, 8, true); // method: deflate
    view.setUint16(at + 10, DOS_TIME, true);
    view.setUint16(at + 12, DOS_DATE, true);
    view.setUint32(at + 14, entry.crc, true);
    view.setUint32(at + 18, entry.compressed.length, true);
    view.setUint32(at + 22, entry.data.length, true);
    view.setUint16(at + 26, entry.name.length, true);
    view.setUint16(at + 28, 0, true); // extra field length
    output.set(entry.name, at + 30);
    output.set(entry.compressed, at + 30 + entry.name.length);
    at += 30 + entry.name.length + entry.compressed.length;
  }

  const centralStart = at;

  prepared.forEach((entry, index) => {
    view.setUint32(at, 0x02014b50, true); // central directory header signature
    view.setUint16(at + 4, 20, true); // version made by (2.0, MS-DOS)
    view.setUint16(at + 6, 20, true); // version needed to extract
    view.setUint16(at + 8, 0, true); // flags
    view.setUint16(at + 10, 8, true); // method: deflate
    view.setUint16(at + 12, DOS_TIME, true);
    view.setUint16(at + 14, DOS_DATE, true);
    view.setUint32(at + 16, entry.crc, true);
    view.setUint32(at + 20, entry.compressed.length, true);
    view.setUint32(at + 24, entry.data.length, true);
    view.setUint16(at + 28, entry.name.length, true);
    view.setUint16(at + 30, 0, true); // extra field length
    view.setUint16(at + 32, 0, true); // comment length
    view.setUint16(at + 34, 0, true); // disk number start
    view.setUint16(at + 36, 0, true); // internal attributes
    view.setUint32(at + 38, 0, true); // external attributes
    view.setUint32(at + 42, offsets[index], true); // local header offset
    output.set(entry.name, at + 46);
    at += 46 + entry.name.length;
  });

  view.setUint32(at, 0x06054b50, true); // end of central directory signature
  view.setUint16(at + 4, 0, true); // this disk
  view.setUint16(at + 6, 0, true); // disk with the central directory
  view.setUint16(at + 8, prepared.length, true); // entries on this disk
  view.setUint16(at + 10, prepared.length, true); // entries in total
  view.setUint32(at + 12, at - centralStart, true); // central directory size
  view.setUint32(at + 16, centralStart, true); // central directory offset
  view.setUint16(at + 20, 0, true); // comment length

  return output;
};

/* Text --------------------------------------------------------------------- */

/* Control characters XML 1.0 forbids (tab, line feed, carriage return are
   allowed) and the two non-characters U+FFFE and U+FFFF. */
const FORBIDDEN_XML_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/* Removes surrogates that are not half of a pair (XML cannot carry them, and
   UTF-8 cannot encode them). Pairs, such as an emoji, are kept. */
const removeLoneSurrogates = (text: string) => {
  let result = "";

  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);

    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);

      if (next >= 0xdc00 && next <= 0xdfff) {
        result += text[index] + text[index + 1];
        index += 1;
      }

      continue;
    }

    if (unit >= 0xdc00 && unit <= 0xdfff) {
      continue;
    }

    result += text[index];
  }

  return result;
};

const removeForbidden = (text: string) =>
  removeLoneSurrogates(text.replace(FORBIDDEN_XML_CHARACTERS, ""));

/* Cuts at `limit` UTF-16 units without splitting a surrogate pair. */
const truncate = (text: string, limit: number) => {
  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
};

/* The text a cell will hold: forbidden characters removed, line endings made
   line feeds (an XML parser does that to a raw carriage return anyway), and
   cut at Excel's limit. */
export const cleanCellText = (value: string) =>
  truncate(
    removeForbidden(value).replace(/\r\n?/g, "\n"),
    XLSX_MAX_CELL_LENGTH
  );

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Excel reads "_x0041_" in a string as an escaped character. Its own escape
   for the underscore keeps such text exactly as typed. */
const escapeExcelText = (text: string) => escapeXml(text.replace(/_(x[0-9A-Fa-f]{4}_)/g, "_x005F_$1"));

/* Excel's rules: 1 to 31 characters, none of [ ] : * ? / \, not starting or
   ending with an apostrophe, not "History". */
export const cleanSheetName = (name: string) => {
  let cleaned = removeForbidden(String(name ?? ""))
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .trim();

  cleaned = truncate(cleaned, XLSX_MAX_SHEET_NAME_LENGTH).replace(/'+$/g, "").trim();

  if (cleaned === "") {
    return "Sheet1";
  }

  return cleaned.toLowerCase() === "history" ? "History sheet" : cleaned;
};

/* Cell references ---------------------------------------------------------- */

export const columnLetter = (index: number) => {
  let number = index + 1;
  let letters = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    number = Math.floor((number - 1) / 26);
  }

  return letters;
};

/* Parts -------------------------------------------------------------------- */

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const CONTENT_TYPES_XML =
  XML_DECLARATION +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  "</Types>";

const ROOT_RELS_XML =
  XML_DECLARATION +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

const WORKBOOK_RELS_XML =
  XML_DECLARATION +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

/* Cell formats: 0 default (numbers), 1 bold header, 2 text ("@"), so a phone
   number an organiser later retypes in Excel stays text too. */
const STYLE_NUMBER = 0;
const STYLE_HEADER = 1;
const STYLE_TEXT = 2;

const STYLES_XML =
  XML_DECLARATION +
  `<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  "</fonts>" +
  '<fills count="2">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  "</fills>" +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  "</cellXfs>" +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '<dxfs count="0"/>' +
  '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
  "</styleSheet>";

/* A sheet name inside a formula reference: quoted, apostrophes doubled. */
const quotedSheetName = (name: string) => `'${name.replace(/'/g, "''")}'`;

const workbookXml = (sheetName: string, filterRange: string) =>
  XML_DECLARATION +
  `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
  '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="12300"/></bookViews>' +
  `<sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>` +
  // Excel keeps the auto-filter's range under this hidden name.
  '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">' +
  escapeXml(`${quotedSheetName(sheetName)}!${filterRange}`) +
  "</definedName></definedNames>" +
  "</workbook>";

const inlineStringCell = (ref: string, text: string, style: number) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeExcelText(text)}</t></is></c>`;

/* The XML for one cell, or "" to leave it out. */
const cellXml = (ref: string, value: XlsxCell, column: XlsxColumn) => {
  if (value === null || value === undefined) {
    return "";
  }

  if (column.kind === "number" && typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${ref}" s="${STYLE_NUMBER}"><v>${String(value)}</v></c>`;
  }

  const text = cleanCellText(String(value));
  return text === "" ? "" : inlineStringCell(ref, text, STYLE_TEXT);
};

const columnWidth = (width: number) =>
  Number.isFinite(width) ? Math.min(255, Math.max(1, Math.round(width * 100) / 100)) : 10;

const worksheetXml = (columns: XlsxColumn[], rows: XlsxCell[][]) => {
  const lastColumn = columnLetter(columns.length - 1);
  const lastRow = rows.length + 1;
  const range = `A1:${lastColumn}${lastRow}`;
  const parts: string[] = [];

  parts.push(XML_DECLARATION, `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">`);
  parts.push(`<dimension ref="${range}"/>`);
  parts.push(
    '<sheetViews><sheetView tabSelected="1" workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' +
      "</sheetView></sheetViews>"
  );
  parts.push('<sheetFormatPr defaultRowHeight="15"/>');
  parts.push(
    "<cols>" +
      columns
        .map(
          (column, index) =>
            `<col min="${index + 1}" max="${index + 1}" width="${columnWidth(column.width)}" customWidth="1"/>`
        )
        .join("") +
      "</cols>"
  );

  parts.push("<sheetData>");
  parts.push(
    `<row r="1">${columns
      .map((column, index) => {
        const header = cleanCellText(String(column.header ?? ""));
        return header === "" ? "" : inlineStringCell(`${columnLetter(index)}1`, header, STYLE_HEADER);
      })
      .join("")}</row>`
  );

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = columns
      .map((column, index) => cellXml(`${columnLetter(index)}${rowNumber}`, row[index], column))
      .join("");
    parts.push(`<row r="${rowNumber}">${cells}</row>`);
  });

  parts.push("</sheetData>");
  parts.push(`<autoFilter ref="${range}"/>`);
  parts.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
  parts.push("</worksheet>");

  return { xml: parts.join(""), range };
};

/* A one-sheet workbook. Cells beyond the column list are ignored. */
export const buildXlsx = (input: {
  sheetName: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
}): Uint8Array<ArrayBuffer> => {
  if (input.columns.length === 0) {
    throw new Error("A workbook needs at least one column.");
  }

  if (input.rows.length + 1 > 1048576) {
    throw new Error("Too many rows for one worksheet.");
  }

  const sheetName = cleanSheetName(input.sheetName);
  const sheet = worksheetXml(input.columns, input.rows);
  const absoluteRange = sheet.range.replace(/([A-Z]+)(\d+)/g, "$$$1$$$2");

  return buildZip([
    { name: "[Content_Types].xml", data: textEncoder.encode(CONTENT_TYPES_XML) },
    { name: "_rels/.rels", data: textEncoder.encode(ROOT_RELS_XML) },
    { name: "xl/workbook.xml", data: textEncoder.encode(workbookXml(sheetName, absoluteRange)) },
    { name: "xl/_rels/workbook.xml.rels", data: textEncoder.encode(WORKBOOK_RELS_XML) },
    { name: "xl/styles.xml", data: textEncoder.encode(STYLES_XML) },
    { name: "xl/worksheets/sheet1.xml", data: textEncoder.encode(sheet.xml) },
  ]);
};

// Builds the printable registration forms:
//
//   public/documents/registration-form-solo.pdf
//   public/documents/registration-form-team.pdf
//
// Run with `npm run build:forms` (Node 24 runs this file directly) and commit
// both PDFs. Riders who will not register online print one, fill it in by hand
// or type into it (every box is also a fillable form field), and an
// administrator keys it in at /admin/paper.
//
// Event facts come from src/lib/site.ts and the field list from
// src/lib/paper-registration.ts, which the admin entry panel also reads, so
// the panel always asks for the fields in the order the sheet prints them.
// Stakeholder rule: no organisation, club or sponsor is named anywhere.
//
// Punjabi (Gurmukhi) labels use Noto Sans Gurmukhi (SIL Open Font License),
// downloaded into scripts/fonts/ on first run and reused afterwards. If the
// download fails the forms are still built, English only, with a warning.
//
// Print-safe: black on white, and no fill darker than 10 % grey.
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  PageSizes,
  StandardFonts,
  clip,
  concatTransformationMatrix,
  endPath,
  grayscale,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingGrayscaleColor,
  type PDFFont,
  type PDFForm,
  type PDFPage,
} from "pdf-lib";
import { svgPathToOperators } from "pdf-lib/cjs/api/svgPath.js";
import {
  PAPER_EMERGENCY_FIELDS,
  PAPER_RIDER_FIELDS,
  PAPER_TEAM_EMERGENCY_FIELDS,
  PAPER_TEAM_NAME_FIELD,
  TEAM_SIZE,
  type PaperFieldDefinition,
} from "../src/lib/paper-registration.ts";
import { site } from "../src/lib/site.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = join(ROOT, "scripts", "fonts");
const OUTPUT_DIR = join(ROOT, "public", "documents");
const LOGO_PATH = join(ROOT, "public", "brand", "logo-mark.svg");

const OUTPUT_FILES = {
  solo: join(OUTPUT_DIR, "registration-form-solo.pdf"),
  team: join(OUTPUT_DIR, "registration-form-team.pdf"),
} as const;

// ---------------------------------------------------------------------------
// Fonts

/* @pdf-lib/fontkit was transpiled with Babel's regenerator and expects its
   runtime as a global. Exactly one generator in the bundle uses it — the
   syllable matcher of the Indic shaper, which Gurmukhi needs — and it uses
   only mark, wrap, and a context with prev/next/stop. This is that much of the
   runtime and no more, so the build needs no extra dependency. */
type RegeneratorContext = { prev: number; next: number; done: boolean; stop: () => undefined };

if (!("regeneratorRuntime" in globalThis)) {
  Object.defineProperty(globalThis, "regeneratorRuntime", {
    configurable: true,
    writable: true,
    value: {
      mark: <T,>(generatorFunction: T) => generatorFunction,
      wrap: (step: (context: RegeneratorContext) => unknown) => {
        const context: RegeneratorContext = {
          prev: 0,
          next: 0,
          done: false,
          stop() {
            this.done = true;
            return undefined;
          },
        };

        const iterator: IterableIterator<unknown> = {
          next() {
            if (context.done) {
              return { value: undefined, done: true };
            }

            const value = step(context);
            return context.done ? { value: undefined, done: true } : { value, done: false };
          },
          [Symbol.iterator]() {
            return iterator;
          },
        };

        return iterator;
      },
    },
  });
}

const NOTO_SOURCES = {
  regular: {
    file: "NotoSansGurmukhi-Regular.ttf",
    urls: [
      "https://notofonts.github.io/gurmukhi/fonts/NotoSansGurmukhi/unhinted/ttf/NotoSansGurmukhi-Regular.ttf",
      "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansGurmukhi/unhinted/ttf/NotoSansGurmukhi-Regular.ttf",
      "https://notofonts.github.io/gurmukhi/fonts/NotoSansGurmukhi/hinted/ttf/NotoSansGurmukhi-Regular.ttf",
    ],
  },
  bold: {
    file: "NotoSansGurmukhi-Bold.ttf",
    urls: [
      "https://notofonts.github.io/gurmukhi/fonts/NotoSansGurmukhi/unhinted/ttf/NotoSansGurmukhi-Bold.ttf",
      "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansGurmukhi/unhinted/ttf/NotoSansGurmukhi-Bold.ttf",
      "https://notofonts.github.io/gurmukhi/fonts/NotoSansGurmukhi/hinted/ttf/NotoSansGurmukhi-Bold.ttf",
    ],
  },
} as const;

const GURMUKHI_PA = 0x0a2a; // ਪ — any real Gurmukhi font has it.
const MAX_FONT_BYTES = 5 * 1024 * 1024;

/* A file is accepted only if fontkit parses it as a font with Gurmukhi in it,
   so a captive-portal page or a truncated download is never embedded. */
const isUsableGurmukhiFont = (bytes: Uint8Array) => {
  if (bytes.byteLength < 10_000 || bytes.byteLength > MAX_FONT_BYTES) {
    return false;
  }

  try {
    return fontkit.create(bytes).hasGlyphForCodePoint(GURMUKHI_PA);
  } catch {
    return false;
  }
};

const loadGurmukhiFont = async (
  source: (typeof NOTO_SOURCES)[keyof typeof NOTO_SOURCES]
): Promise<Uint8Array | null> => {
  const cachedPath = join(FONT_DIR, source.file);

  if (existsSync(cachedPath)) {
    const cached = new Uint8Array(await readFile(cachedPath));

    if (isUsableGurmukhiFont(cached)) {
      return cached;
    }
  }

  for (const url of source.urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });

      if (!response.ok) {
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (!isUsableGurmukhiFont(bytes)) {
        continue;
      }

      await mkdir(FONT_DIR, { recursive: true });
      await writeFile(cachedPath, bytes);
      return bytes;
    } catch {
      // Try the next mirror.
    }
  }

  return null;
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  latinCoverage: Set<number>;
  punjabi: PDFFont | null;
  punjabiBold: PDFFont | null;
  punjabiCoverage: Set<number>;
};

type FontBytes = { regular: Uint8Array | null; bold: Uint8Array | null };

const embedFonts = async (doc: PDFDocument, bytes: FontBytes): Promise<Fonts> => {
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const latinCoverage = new Set(regular.getCharacterSet());

  if (!bytes.regular) {
    return { regular, bold, latinCoverage, punjabi: null, punjabiBold: null, punjabiCoverage: new Set() };
  }

  doc.registerFontkit(fontkit);
  const punjabi = await doc.embedFont(bytes.regular, { subset: true });
  const punjabiBold = bytes.bold ? await doc.embedFont(bytes.bold, { subset: true }) : punjabi;

  return {
    regular,
    bold,
    latinCoverage,
    punjabi,
    punjabiBold,
    punjabiCoverage: new Set(fontkit.create(bytes.regular).characterSet),
  };
};

// ---------------------------------------------------------------------------
// Text. A Punjabi string is drawn in runs: Gurmukhi (and anything else the
// Noto font carries) in Noto, the rest — digits, brackets, slashes, Latin —
// in Helvetica. A label always has its English line first.

type Run = { text: string; font: PDFFont };

const toRuns = (text: string, fonts: Fonts, weight: "regular" | "bold"): Run[] => {
  const latin = weight === "bold" ? fonts.bold : fonts.regular;
  const punjabi = weight === "bold" ? fonts.punjabiBold : fonts.punjabi;
  const runs: Run[] = [];

  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const isGurmukhi = codePoint >= 0x0a00 && codePoint <= 0x0a7f;
    let font: PDFFont | null = null;

    if (punjabi && fonts.punjabiCoverage.has(codePoint) && (isGurmukhi || !fonts.latinCoverage.has(codePoint) || codePoint === 0x20)) {
      font = punjabi;
    } else if (fonts.latinCoverage.has(codePoint)) {
      font = latin;
    }

    if (!font) {
      continue;
    }

    const last = runs[runs.length - 1];

    if (last && last.font === font) {
      last.text += character;
    } else {
      runs.push({ text: character, font });
    }
  }

  return runs;
};

const runsWidth = (runs: Run[], size: number) =>
  runs.reduce((total, run) => total + run.font.widthOfTextAtSize(run.text, size), 0);

const drawRuns = (page: PDFPage, runs: Run[], x: number, y: number, size: number) => {
  let cursor = x;

  for (const run of runs) {
    page.drawText(run.text, { x: cursor, y, size, font: run.font, color: grayscale(0) });
    cursor += run.font.widthOfTextAtSize(run.text, size);
  }

  return cursor;
};

/* The largest size, down to a floor, at which the text fits the width. */
const fitSize = (runs: Run[], width: number, preferred: number, minimum: number) => {
  let size = preferred;

  while (size > minimum && runsWidth(runs, size) > width) {
    size -= 0.25;
  }

  return size;
};

const wrap = (text: string, fonts: Fonts, weight: "regular" | "bold", size: number, width: number) => {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;

    if (line !== "" && runsWidth(toRuns(candidate, fonts, weight), size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line !== "") {
    lines.push(line);
  }

  return lines;
};

// ---------------------------------------------------------------------------
// Page geometry (PDF points; 1 mm = 2.835 pt).

const MM = 72 / 25.4;
const [PAGE_WIDTH, PAGE_HEIGHT] = PageSizes.A4;
const MARGIN_X = 12 * MM;
const MARGIN_TOP = 10 * MM;
const MARGIN_BOTTOM = 9 * MM;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const GUTTER = 3 * MM;
const ROW_GAP = 4.5;
const SECTION_HEIGHT = 15;
const SECTION_GAP = 4;
const BLOCK_GAP = 7;
const BLACK = grayscale(0);
const RULE_GREY = grayscale(0.55);
const HEADING_FILL = grayscale(0.94); // 6 % — well under the 10 % ceiling.

type Layout = {
  doc: PDFDocument;
  form: PDFForm;
  fonts: Fonts;
  page: PDFPage;
  /* Distance from the bottom of the page to the next free line. */
  y: number;
  boxHeight: number;
  /* English label size; the Punjabi line beneath matches it. */
  labelSize: number;
  /* Label block above each box: the English line and the Punjabi line. */
  labelHeight: number;
  fieldNames: string[];
};

type Cell =
  | {
      name: string;
      label: string;
      punjabi: string;
      weight: number;
      maxLength?: number;
    }
  | { spacer: true; weight: number };

const fromDefinition = (
  definition: PaperFieldDefinition,
  name: string,
  weight: number
): Cell => ({
  name,
  label: definition.label,
  punjabi: definition.punjabi,
  weight,
  maxLength: definition.maxLength,
});

const spacer = (weight: number): Cell => ({ spacer: true, weight });

const drawLabel = (layout: Layout, label: string, punjabi: string, x: number, top: number, width: number) => {
  const { page, fonts, labelSize } = layout;
  const english = toRuns(label, fonts, "bold");
  drawRuns(page, english, x, top - labelSize, fitSize(english, width, labelSize, 6));

  if (fonts.punjabi) {
    const gurmukhi = toRuns(punjabi, fonts, "regular");
    drawRuns(page, gurmukhi, x, top - labelSize * 2.1, fitSize(gurmukhi, width, labelSize, 6));
  }
};

/* One boxed, ruled writing space with its label above and a fillable text
   field laid exactly over the box. */
const drawBox = (layout: Layout, cell: Exclude<Cell, { spacer: true }>, x: number, top: number, width: number) => {
  const { page, form, boxHeight } = layout;
  drawLabel(layout, cell.label, cell.punjabi, x, top, width);

  const boxTop = top - layout.labelHeight;
  const boxBottom = boxTop - boxHeight;

  page.drawRectangle({
    x,
    y: boxBottom,
    width,
    height: boxHeight,
    borderColor: BLACK,
    borderWidth: 0.7,
  });

  // The writing line, a little above the bottom edge.
  page.drawLine({
    start: { x: x + 3, y: boxBottom + 2.4 * MM },
    end: { x: x + width - 3, y: boxBottom + 2.4 * MM },
    thickness: 0.35,
    color: RULE_GREY,
  });

  const field = form.createTextField(cell.name);

  if (cell.maxLength) {
    field.setMaxLength(cell.maxLength);
  }

  field.addToPage(page, {
    x: x + 1,
    y: boxBottom + 1,
    width: width - 2,
    height: boxHeight - 2,
    font: layout.fonts.regular,
    textColor: BLACK,
    backgroundColor: undefined,
    borderColor: undefined,
    borderWidth: 0,
  });
  field.setFontSize(11);
  layout.fieldNames.push(cell.name);
};

const rowHeight = (layout: Layout) => layout.labelHeight + layout.boxHeight + ROW_GAP;

const drawRow = (layout: Layout, cells: Cell[], x = MARGIN_X, width = CONTENT_WIDTH) => {
  const totalWeight = cells.reduce((total, cell) => total + cell.weight, 0);
  const usable = width - GUTTER * (cells.length - 1);
  let cursor = x;

  for (const cell of cells) {
    const cellWidth = (usable * cell.weight) / totalWeight;

    if (!("spacer" in cell)) {
      drawBox(layout, cell, cursor, layout.y, cellWidth);
    }

    cursor += cellWidth + GUTTER;
  }

  layout.y -= rowHeight(layout);
};

const drawSectionHeading = (layout: Layout, label: string, punjabi: string, x = MARGIN_X, width = CONTENT_WIDTH) => {
  const { page, fonts } = layout;
  const top = layout.y;

  page.drawRectangle({ x, y: top - SECTION_HEIGHT, width, height: SECTION_HEIGHT, color: HEADING_FILL });
  const end = drawRuns(page, toRuns(label.toUpperCase(), fonts, "bold"), x + 5, top - 10.5, 9);

  if (fonts.punjabi) {
    drawRuns(page, toRuns(punjabi, fonts, "bold"), end + 8, top - 10.8, 9);
  }

  layout.y -= SECTION_HEIGHT + SECTION_GAP;
};

const drawParagraph = (layout: Layout, english: string, punjabi: string, size: number, x = MARGIN_X, width = CONTENT_WIDTH) => {
  const { page, fonts } = layout;
  const lineHeight = size + 3;

  for (const line of wrap(english, fonts, "regular", size, width)) {
    drawRuns(page, toRuns(line, fonts, "regular"), x, layout.y - size, size);
    layout.y -= lineHeight;
  }

  if (fonts.punjabi) {
    for (const line of wrap(punjabi, fonts, "regular", size, width)) {
      drawRuns(page, toRuns(line, fonts, "regular"), x, layout.y - size, size);
      layout.y -= lineHeight + 0.5;
    }
  }
};

// ---------------------------------------------------------------------------
// Logo: the mark from public/brand/logo-mark.svg, drawn as vector paths. The
// file holds one path for the whole lockup and crops the wordmark with its
// viewBox, so the same crop is applied here as a clip. Even-odd fill, as in
// the SVG.

type LogoMark = { path: string; minX: number; minY: number; width: number; height: number };

const loadLogoMark = async (): Promise<LogoMark | null> => {
  try {
    const svg = await readFile(LOGO_PATH, "utf8");
    const viewBox = svg.match(/viewBox="([\d.\s-]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
    const path = svg.match(/\sd="([^"]+)"/)?.[1];

    if (!viewBox || viewBox.length !== 4 || viewBox.some(Number.isNaN) || !path) {
      return null;
    }

    const [minX, minY, width, height] = viewBox;
    return { path, minX, minY, width, height };
  } catch {
    return null;
  }
};

const drawLogo = (page: PDFPage, logo: LogoMark, x: number, top: number, height: number) => {
  const scale = height / logo.height;
  const width = logo.width * scale;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(x, top - height, width, height),
    clip(),
    endPath(),
    concatTransformationMatrix(scale, 0, 0, -scale, x - logo.minX * scale, top + logo.minY * scale),
    setFillingGrayscaleColor(0),
    ...svgPathToOperators(logo.path),
    PDFOperator.of(PDFOperatorNames.FillEvenOdd),
    popGraphicsState()
  );

  return width;
};

// ---------------------------------------------------------------------------
// Page furniture.

const HOST = site.url.replace(/^https?:\/\//, "");

const drawHeader = (
  layout: Layout,
  logo: LogoMark | null,
  title: string,
  titlePunjabi: string
) => {
  const { page, fonts } = layout;
  const top = PAGE_HEIGHT - MARGIN_TOP;
  const logoHeight = 52;
  const logoWidth = logo ? drawLogo(page, logo, MARGIN_X, top, logoHeight) : 0;
  const textX = MARGIN_X + logoWidth + (logo ? 12 : 0);
  const textWidth = PAGE_WIDTH - MARGIN_X - textX;

  const eventTitle = toRuns(site.title.toUpperCase(), fonts, "bold");
  drawRuns(page, eventTitle, textX, top - 15, fitSize(eventTitle, textWidth, 16, 11));
  drawRuns(page, toRuns(`${site.eventDate}  ·  ${site.venue}`, fonts, "regular"), textX, top - 29, 10.5);

  const formTitle = toRuns(title.toUpperCase(), fonts, "bold");
  drawRuns(page, formTitle, textX, top - 44, fitSize(formTitle, textWidth, 11.5, 8));

  if (fonts.punjabi) {
    drawRuns(page, toRuns(titlePunjabi, fonts, "bold"), textX, top - 57, 10);
  }

  // Below the logo and below the Punjabi title, whose subjoined letters
  // reach under its baseline.
  const ruleY = top - Math.max(logoHeight, fonts.punjabi ? 60 : 46) - 4;
  page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ruleY },
    thickness: 1,
    color: BLACK,
  });

  layout.y = ruleY - 5;
};

const drawFooter = (layout: Layout, formName: string, pageNumber: number, pageCount: number) => {
  const { page, fonts } = layout;
  const y = MARGIN_BOTTOM - 2;

  page.drawLine({
    start: { x: MARGIN_X, y: y + 10 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: y + 10 },
    thickness: 0.5,
    color: BLACK,
  });

  drawRuns(page, toRuns(formName, fonts, "regular"), MARGIN_X, y, 7.5);

  const contact = toRuns(`${HOST}  ·  ${site.email}`, fonts, "bold");
  const contactWidth = runsWidth(contact, 8);
  drawRuns(page, contact, (PAGE_WIDTH - contactWidth) / 2, y, 8);

  const pageLabel = toRuns(`Page ${pageNumber} of ${pageCount}`, fonts, "regular");
  drawRuns(page, pageLabel, PAGE_WIDTH - MARGIN_X - runsWidth(pageLabel, 7.5), y, 7.5);
};

/* The administrator's box. Bordered so it reads as separate from the rider's
   part of the form. */
const drawOfficeBox = (layout: Layout, rows: Cell[][]) => {
  const { page } = layout;
  const padding = 5;
  const height = padding + SECTION_HEIGHT + SECTION_GAP + rows.length * rowHeight(layout) - ROW_GAP + padding;
  const top = layout.y;

  page.drawRectangle({
    x: MARGIN_X,
    y: top - height,
    width: CONTENT_WIDTH,
    height,
    borderColor: BLACK,
    borderWidth: 1.2,
  });

  layout.y -= padding;
  drawSectionHeading(layout, "Office use only", "ਸਿਰਫ਼ ਦਫ਼ਤਰੀ ਵਰਤੋਂ ਲਈ", MARGIN_X + padding, CONTENT_WIDTH - padding * 2);

  for (const row of rows) {
    drawRow(layout, row, MARGIN_X + padding, CONTENT_WIDTH - padding * 2);
  }

  layout.y = top - height - BLOCK_GAP;
};

const assertFits = (layout: Layout, label: string) => {
  if (layout.y < MARGIN_BOTTOM + 12) {
    throw new Error(`${label} overflows the page by ${(MARGIN_BOTTOM + 12 - layout.y).toFixed(1)} pt.`);
  }
};

const definition = (key: string) => {
  const found = [...PAPER_RIDER_FIELDS, ...PAPER_EMERGENCY_FIELDS].find((field) => field.key === key);

  if (!found) {
    throw new Error(`Unknown paper field ${key}.`);
  }

  return found;
};

const signatureCell = (name: string, label: string, punjabi: string, weight: number): Cell => ({
  name,
  label,
  punjabi,
  weight,
  maxLength: 200,
});

const dateCell = (name: string, weight: number): Cell => ({
  name,
  label: "Date",
  punjabi: "ਮਿਤੀ",
  weight,
  maxLength: 20,
});

const officeCell = (name: string, label: string, punjabi: string, weight: number, maxLength = 60): Cell => ({
  name,
  label,
  punjabi,
  weight,
  maxLength,
});

const RETURN_EN = `Write clearly. Hand the completed form to the organisers, or email a clear photo or scan of every page to ${site.email}. A confirmation code is issued once the form has been entered.`;
const RETURN_PA =
  "ਕਿਰਪਾ ਕਰਕੇ ਸਾਫ਼ ਲਿਖੋ। ਭਰਿਆ ਫ਼ਾਰਮ ਪ੍ਰਬੰਧਕਾਂ ਨੂੰ ਦਿਓ, ਜਾਂ ਹਰ ਪੰਨੇ ਦੀ ਸਾਫ਼ ਫ਼ੋਟੋ ਜਾਂ ਸਕੈਨ ਈਮੇਲ ਕਰੋ। ਫ਼ਾਰਮ ਦਰਜ ਹੋਣ ਤੋਂ ਬਾਅਦ ਪੁਸ਼ਟੀ ਕੋਡ ਦਿੱਤਾ ਜਾਂਦਾ ਹੈ।";

const newDocument = async (title: string, fontBytes: FontBytes) => {
  // No automatic metadata, so a rebuild with nothing changed stays small in
  // a diff; the title and subject are set by hand.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(`${site.title} — ${title}`, { showInWindowTitleBar: true });
  doc.setSubject(`${title}, ${site.eventDate}, ${site.venue}.`);
  doc.setLanguage("en");

  const fonts = await embedFonts(doc, fontBytes);
  const form = doc.getForm();

  return { doc, fonts, form };
};

// ---------------------------------------------------------------------------
// Solo form: one page.

const buildSoloForm = async (fontBytes: FontBytes, logo: LogoMark | null) => {
  const title = "Solo rider registration form";
  const { doc, fonts, form } = await newDocument(title, fontBytes);
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const layout: Layout = {
    doc,
    form,
    fonts,
    page,
    y: 0,
    boxHeight: 10 * MM,
    labelSize: 8.5,
    labelHeight: 22,
    fieldNames: [],
  };
  const field = (key: string, weight: number) => fromDefinition(definition(key), key, weight);

  drawHeader(layout, logo, title, "ਇਕੱਲੇ ਸਵਾਰ ਦਾ ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਫ਼ਾਰਮ");
  drawParagraph(layout, RETURN_EN, RETURN_PA, 8.5);
  layout.y -= BLOCK_GAP;

  drawSectionHeading(layout, "Rider details", "ਸਵਾਰ ਦੇ ਵੇਰਵੇ");
  drawRow(layout, [field("full_name", 1)]);
  drawRow(layout, [field("father_name", 1), field("mother_name", 1)]);
  drawRow(layout, [field("age", 0.5), field("phone", 1.3), field("email", 2.2)]);
  drawRow(layout, [field("village_city", 1.2), field("district", 1), field("state", 1), field("country", 1)]);
  drawRow(layout, [field("years_experience", 1.5), spacer(2.5)]);
  layout.y -= BLOCK_GAP - ROW_GAP;

  drawSectionHeading(layout, "Horse details", "ਘੋੜੇ ਦੇ ਵੇਰਵੇ");
  drawRow(layout, [field("horse_name", 1.4), field("horse_age", 0.6), field("horse_breed", 1.4)]);
  layout.y -= BLOCK_GAP - ROW_GAP;

  drawSectionHeading(layout, "Emergency contact", "ਐਮਰਜੈਂਸੀ ਸੰਪਰਕ");
  drawRow(layout, [field("emergency_contact_name", 1.4), field("emergency_contact_phone", 1)]);
  layout.y -= BLOCK_GAP - ROW_GAP;

  drawSectionHeading(layout, "Rider declaration", "ਸਵਾਰ ਦਾ ਐਲਾਨ");
  drawParagraph(
    layout,
    `I accept the rules of the ${site.title} and confirm these details are correct.`,
    "ਮੈਂ ਇਸ ਚੈਂਪੀਅਨਸ਼ਿਪ ਦੇ ਨਿਯਮ ਸਵੀਕਾਰ ਕਰਦਾ/ਕਰਦੀ ਹਾਂ ਅਤੇ ਪੁਸ਼ਟੀ ਕਰਦਾ/ਕਰਦੀ ਹਾਂ ਕਿ ਇਹ ਵੇਰਵੇ ਸਹੀ ਹਨ।",
    9
  );
  layout.y -= 3;
  drawRow(layout, [
    signatureCell("rider_signature", "Rider's signature", "ਸਵਾਰ ਦੇ ਦਸਤਖ਼ਤ", 2),
    dateCell("signature_date", 1),
  ]);
  layout.y -= BLOCK_GAP - ROW_GAP;

  drawOfficeBox(layout, [
    [
      officeCell("office_confirmation_code", "Confirmation code", "ਪੁਸ਼ਟੀ ਕੋਡ", 1.2, 20),
      officeCell("office_entered_by", "Entered by", "ਦਰਜ ਕਰਨ ਵਾਲਾ", 1.3),
      officeCell("office_date_entered", "Date entered", "ਦਰਜ ਕਰਨ ਦੀ ਮਿਤੀ", 1, 20),
      officeCell("office_checked", "Checked", "ਜਾਂਚ ਕੀਤੀ", 0.8),
    ],
  ]);

  assertFits(layout, "The solo form");
  drawFooter(layout, `${site.name} — solo registration`, 1, 1);

  return { doc, fieldNames: layout.fieldNames };
};

// ---------------------------------------------------------------------------
// Team form: two pages. Page 1 the team and riders 1-2, page 2 riders 3-4,
// the declaration and the office box.

const buildTeamForm = async (fontBytes: FontBytes, logo: LogoMark | null) => {
  const title = "Team registration form — four riders";
  const formName = `${site.name} — team registration`;
  const { doc, fonts, form } = await newDocument(title, fontBytes);
  const firstPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const layout: Layout = {
    doc,
    form,
    fonts,
    page: firstPage,
    y: 0,
    boxHeight: 9 * MM,
    labelSize: 7.75,
    labelHeight: 19.5,
    fieldNames: [],
  };

  const riderField = (rider: number, key: string, weight: number) =>
    fromDefinition(definition(key), `rider${rider}_${key}`, weight);

  const drawRiderBlock = (rider: number) => {
    const isLeader = rider === 1;
    drawSectionHeading(
      layout,
      isLeader ? "Rider 1 — team leader" : `Rider ${rider}`,
      isLeader ? "ਸਵਾਰ 1 — ਟੀਮ ਲੀਡਰ" : `ਸਵਾਰ ${rider}`
    );
    drawRow(layout, [riderField(rider, "full_name", 1.5), riderField(rider, "father_name", 1.2), riderField(rider, "mother_name", 1.2)]);
    drawRow(layout, [riderField(rider, "age", 0.45), riderField(rider, "phone", 1.15), riderField(rider, "email", 2.3)]);
    drawRow(layout, [riderField(rider, "village_city", 1.2), riderField(rider, "district", 1), riderField(rider, "state", 1), riderField(rider, "country", 1)]);
    drawRow(layout, [riderField(rider, "years_experience", 1.25), riderField(rider, "horse_name", 1.3), riderField(rider, "horse_age", 0.55), riderField(rider, "horse_breed", 1.3)]);
    layout.y -= BLOCK_GAP - ROW_GAP;
  };

  // Page 1.
  drawHeader(layout, logo, title, "ਟੀਮ ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਫ਼ਾਰਮ — ਚਾਰ ਸਵਾਰ");
  drawParagraph(
    layout,
    `${RETURN_EN} Fill in one block per rider; rider 1 is the team leader. All four riders sign the declaration on page 2.`,
    `${RETURN_PA} ਹਰ ਸਵਾਰ ਲਈ ਇੱਕ ਹਿੱਸਾ ਭਰੋ; ਸਵਾਰ 1 ਟੀਮ ਲੀਡਰ ਹੈ। ਚਾਰੇ ਸਵਾਰ ਪੰਨਾ 2 ’ਤੇ ਐਲਾਨ ਉੱਤੇ ਦਸਤਖ਼ਤ ਕਰਨ।`,
    8
  );
  layout.y -= BLOCK_GAP;

  const teamName = fromDefinition(PAPER_TEAM_NAME_FIELD, "team_name", 1);
  const [contactName, contactPhone] = PAPER_TEAM_EMERGENCY_FIELDS;

  drawSectionHeading(layout, "Team details", "ਟੀਮ ਦੇ ਵੇਰਵੇ");
  drawRow(layout, [teamName]);
  drawRow(layout, [
    fromDefinition(contactName, "team_emergency_contact_name", 1.4),
    fromDefinition(contactPhone, "team_emergency_contact_phone", 1),
  ]);
  layout.y -= BLOCK_GAP - ROW_GAP;

  drawRiderBlock(1);
  drawRiderBlock(2);
  assertFits(layout, "Page 1 of the team form");
  drawFooter(layout, formName, 1, 2);

  // Page 2. The team name is a second widget of the same field, so a typed
  // name appears on both pages and a separated page 2 still says whose it is.
  const secondPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  layout.page = secondPage;

  const top = PAGE_HEIGHT - MARGIN_TOP;
  const teamBoxWidth = 210;
  const headingWidth = CONTENT_WIDTH - teamBoxWidth - GUTTER * 2;
  const continued = toRuns(`${site.title.toUpperCase()} — TEAM FORM, CONTINUED`, fonts, "bold");
  drawRuns(secondPage, continued, MARGIN_X, top - 12, fitSize(continued, headingWidth, 11, 7));

  if (fonts.punjabi) {
    drawRuns(secondPage, toRuns("ਟੀਮ ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਫ਼ਾਰਮ — ਜਾਰੀ", fonts, "bold"), MARGIN_X, top - 26, 10);
  }

  const teamBoxX = PAGE_WIDTH - MARGIN_X - teamBoxWidth;
  drawLabel(layout, PAPER_TEAM_NAME_FIELD.label, PAPER_TEAM_NAME_FIELD.punjabi, teamBoxX, top, teamBoxWidth);
  const teamBoxBottom = top - layout.labelHeight - layout.boxHeight;
  secondPage.drawRectangle({
    x: teamBoxX,
    y: teamBoxBottom,
    width: teamBoxWidth,
    height: layout.boxHeight,
    borderColor: BLACK,
    borderWidth: 0.7,
  });
  form.getTextField("team_name").addToPage(secondPage, {
    x: teamBoxX + 1,
    y: teamBoxBottom + 1,
    width: teamBoxWidth - 2,
    height: layout.boxHeight - 2,
    font: fonts.regular,
    textColor: BLACK,
    backgroundColor: undefined,
    borderColor: undefined,
    borderWidth: 0,
  });

  const ruleY = teamBoxBottom - 6;
  secondPage.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: PAGE_WIDTH - MARGIN_X, y: ruleY },
    thickness: 1,
    color: BLACK,
  });
  layout.y = ruleY - 6;

  drawRiderBlock(3);
  drawRiderBlock(4);

  drawSectionHeading(layout, "Rider declaration", "ਸਵਾਰਾਂ ਦਾ ਐਲਾਨ");
  drawParagraph(
    layout,
    `We, the four riders on this form, accept the rules of the ${site.title} and confirm these details are correct.`,
    "ਅਸੀਂ, ਇਸ ਫ਼ਾਰਮ ਦੇ ਚਾਰ ਸਵਾਰ, ਇਸ ਚੈਂਪੀਅਨਸ਼ਿਪ ਦੇ ਨਿਯਮ ਸਵੀਕਾਰ ਕਰਦੇ ਹਾਂ ਅਤੇ ਪੁਸ਼ਟੀ ਕਰਦੇ ਹਾਂ ਕਿ ਇਹ ਵੇਰਵੇ ਸਹੀ ਹਨ।",
    9
  );
  layout.y -= 3;

  const signature = (rider: number): Cell[] => [
    signatureCell(
      `rider${rider}_signature`,
      rider === 1 ? "Rider 1 (team leader) signature" : `Rider ${rider} signature`,
      rider === 1 ? "ਸਵਾਰ 1 (ਟੀਮ ਲੀਡਰ) ਦੇ ਦਸਤਖ਼ਤ" : `ਸਵਾਰ ${rider} ਦੇ ਦਸਤਖ਼ਤ`,
      1.7
    ),
    dateCell(`rider${rider}_signature_date`, 0.8),
  ];

  drawRow(layout, [...signature(1), ...signature(2)]);
  drawRow(layout, [...signature(3), ...signature(4)]);
  layout.y -= BLOCK_GAP - ROW_GAP;

  drawOfficeBox(layout, [
    Array.from({ length: TEAM_SIZE }, (_, index) =>
      officeCell(
        `office_rider${index + 1}_confirmation_code`,
        `Rider ${index + 1} confirmation code`,
        `ਸਵਾਰ ${index + 1} ਦਾ ਪੁਸ਼ਟੀ ਕੋਡ`,
        1,
        20
      )
    ),
    [
      officeCell("office_entered_by", "Entered by", "ਦਰਜ ਕਰਨ ਵਾਲਾ", 1.3),
      officeCell("office_date_entered", "Date entered", "ਦਰਜ ਕਰਨ ਦੀ ਮਿਤੀ", 1, 20),
      officeCell("office_checked", "Checked", "ਜਾਂਚ ਕੀਤੀ", 0.8),
      spacer(0.9),
    ],
  ]);

  assertFits(layout, "Page 2 of the team form");
  drawFooter(layout, formName, 2, 2);

  return { doc, fieldNames: layout.fieldNames };
};

// ---------------------------------------------------------------------------

const main = async () => {
  const fontBytes: FontBytes = {
    regular: await loadGurmukhiFont(NOTO_SOURCES.regular),
    bold: null,
  };

  if (fontBytes.regular) {
    fontBytes.bold = await loadGurmukhiFont(NOTO_SOURCES.bold);
  } else {
    console.warn(
      "WARNING: Noto Sans Gurmukhi could not be downloaded into scripts/fonts/. " +
        "Building the forms in English only — rerun `npm run build:forms` with a network connection to add the Punjabi labels."
    );
  }

  const logo = await loadLogoMark();

  if (!logo) {
    console.warn(`WARNING: could not read the logo mark from ${relative(ROOT, LOGO_PATH)}; building without it.`);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const forms = [
    { file: OUTPUT_FILES.solo, ...(await buildSoloForm(fontBytes, logo)) },
    { file: OUTPUT_FILES.team, ...(await buildTeamForm(fontBytes, logo)) },
  ];

  for (const { file, doc, fieldNames } of forms) {
    const bytes = await doc.save();
    await writeFile(file, bytes);
    console.log(
      `Wrote ${relative(ROOT, file)}: ${doc.getPageCount()} page(s), ${fieldNames.length} fillable fields, ` +
        `${Math.round(bytes.byteLength / 1024)} KB, ${fontBytes.regular ? "English + Punjabi" : "English only"}.`
    );
  }
};

await main();

// Builds the printed guides, one A4 PDF each (see GUIDES below):
//
//   public/documents/staff-guide.pdf      "How the live scoring works", for event-day staff
//   public/documents/vmix-guide.pdf       "Live scoring data for vMix", for the graphics team
//   public/documents/rehearsal-guide.pdf  "Rehearse the live scoring", practice and the
//                                         team's dress rehearsal before event day
//
// Run with `npm run build:guide` (Node 24 runs this file directly); it builds
// every guide, then commit the PDFs. The text is not in this file: each guide
// is read from its own Markdown, in a small dialect described at the top of
// docs/superpowers/plans/2026-10-25-staff-guide-outline.md (the additions the
// vMix guide uses, `code` and a cover summary, at the top of
// docs/vmix-data-feed.md), so the wording can be edited without touching code. The vMix guide's Markdown is the graphics
// team's handout itself, docs/vmix-data-feed.md, so the handout and its PDF
// cannot drift apart. Pictures are found in each guide's figure folder (the
// staff guide's are screenshots in scripts/staff-guide/, cropped and
// compressed once). Event facts come from src/lib/site.ts through {site.*}
// placeholders.
//
// Layout: black on white, the site's bronze for headings and rules, generous
// margins, a running footer, and every `#` section on a new page with a big
// label and a tab on the page edge, so each reader can find their own pages.
// Fonts are the PDF built-ins (Helvetica, and Courier for `code`), so nothing
// is downloaded.
//
// Stakeholder rule: no organisation, club or sponsor is named anywhere.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  PDFString,
  PageSizes,
  StandardFonts,
  clip,
  concatTransformationMatrix,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setCharacterSpacing,
  setFillingRgbColor,
  type Color,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { svgPathToOperators } from "pdf-lib/cjs/api/svgPath.js";
import { site } from "../src/lib/site.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_PATH = join(ROOT, "public", "brand", "logo-mark.svg");

/* The guides this script builds, one renderer for all. `source` is the
   Markdown, `figureDir` the folder its picture file names are found in,
   `kicker` the small capitals above the cover title and `contents` the
   sentence under "Read your section" on the cover. Text before a guide's
   first `#` section is printed on its cover as a summary. */
type Guide = {
  source: string;
  figureDir: string;
  output: string;
  kicker: string;
  contents: string;
  subject: string;
};

const GUIDES: Guide[] = [
  {
    source: join(ROOT, "docs", "superpowers", "plans", "2026-10-25-staff-guide-outline.md"),
    figureDir: join(ROOT, "scripts", "staff-guide"),
    output: join(ROOT, "public", "documents", "staff-guide.pdf"),
    kicker: "STAFF GUIDE · EVENT DAY",
    contents:
      "Everyone: read **The one idea** and **If something goes wrong**. Then read only the pages for your job. Each section starts on a new page, with its name on the tab at the page edge.",
    subject: `Staff guide to the live scoring, ${site.eventDate}, ${site.venue}.`,
  },
  {
    // The handout is the source. Its pictures are named relative to docs/,
    // as GitHub resolves them, so the Markdown shows them too.
    source: join(ROOT, "docs", "vmix-data-feed.md"),
    figureDir: join(ROOT, "docs"),
    output: join(ROOT, "public", "documents", "vmix-guide.pdf"),
    kicker: "LIVE STREAM · DATA FEEDS",
    contents:
      "Building titles: read **The four feeds**, **Setting up** and **Screens**, and keep **Columns** open while you bind. On the day, work through **Event day** before you go on air. Each section has its name on the tab at the page edge.",
    subject: `Live scoring data feeds for vMix: the graphics team's guide, ${site.eventDate}, ${site.venue}.`,
  },
  {
    // Reuses the staff guide's screenshots; it has none of its own.
    source: join(ROOT, "docs", "superpowers", "plans", "2026-10-26-rehearsal-guide-outline.md"),
    figureDir: join(ROOT, "scripts", "staff-guide"),
    output: join(ROOT, "public", "documents", "rehearsal-guide.pdf"),
    kicker: "STAFF GUIDE · REHEARSAL",
    contents:
      "Practising alone: read **Practise alone**. For the dress rehearsal, everyone reads **Dress rehearsal** and follows the **Run sheet** step by step; the head organiser also does **The day before**. Each section has its name on the tab at the page edge.",
    subject: `Rehearsing the live scoring before event day: practice on your own and the team's dress rehearsal, ${site.eventDate}, ${site.venue}.`,
  },
];

// ---------------------------------------------------------------------------
// Page geometry and colours (PDF points; 1 mm = 2.835 pt).

const MM = 72 / 25.4;
const [PAGE_WIDTH, PAGE_HEIGHT] = PageSizes.A4;
const MARGIN_X = 21 * MM;
const MARGIN_TOP = 17 * MM;
const MARGIN_BOTTOM = 18 * MM;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_TOP = PAGE_HEIGHT - MARGIN_TOP;

const hex = (value: string) =>
  rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255
  );

const INK = hex("#1c1917");
const GREY = hex("#57534e");
const LIGHT_RULE = hex("#d6d3d1");
const BRONZE = hex("#b45817");
const BRONZE_DEEP = hex("#8a400f");
const BRONZE_TINT = hex("#fbf3ec");
const CODE_TINT = hex("#efe9e3");
const WHITE = rgb(1, 1, 1);

const BODY_SIZE = 9.5;
const BODY_LEADING = 13.2;
const SMALL_SIZE = 8.5;

/* `code` is Courier, a little smaller than the text around it, on a light
   box that reaches CODE_PAD beyond its letters at either end. */
const CODE_SCALE = 0.92;
const CODE_PAD = 1.8;

// ---------------------------------------------------------------------------
// Fonts and text runs. Body text is Helvetica, emphasis Helvetica-Bold,
// `code` Courier on a light box (embedded only when a guide has some), and
// web addresses are drawn in deep bronze with a link annotation over them.

type Fonts = { regular: PDFFont; bold: PDFFont; code: PDFFont | null; charset: Set<number> };

/* A code segment has `padStart`/`padEnd` when it begins or ends its code
   span (a long address can be split into pieces), for the box's padding. */
type Segment = { text: string; bold: boolean; url?: string; code?: boolean; padStart?: boolean; padEnd?: boolean };
/* `attach`: joins the word before it without a space (the next piece of a
   long address in code), but may still start a new line. */
type Word = { segments: Segment[]; width: number; attach?: boolean };
type Line = { words: Word[]; width: number };
type LinkBox = { page: PDFPage; x: number; y: number; width: number; height: number; url: string };

const URL_PATTERN = /https?:\/\/[^\s]+/g;
const CODE_PATTERN = /`([^`]+)`/g;

/* Text outside code: bare web addresses become links. A trailing full stop,
   comma or bracket after an address is ordinary text. */
const parsePlain = (segments: Segment[], part: string, bold: boolean) => {
  let cursor = 0;

  for (const match of part.matchAll(URL_PATTERN)) {
    let url = match[0];

    while (/[.,;:)]$/.test(url)) {
      url = url.slice(0, -1);
    }

    const start = match.index ?? 0;

    if (start > cursor) {
      segments.push({ text: part.slice(cursor, start), bold });
    }

    segments.push({ text: url, bold, url });
    cursor = start + url.length;
  }

  if (cursor < part.length) {
    segments.push({ text: part.slice(cursor), bold });
  }
};

/* `**bold**` toggles, `code` spans and bare web addresses. A code span that
   is a whole web address is a link as well. */
const parseInline = (text: string): Segment[] => {
  const segments: Segment[] = [];
  const parts = text.split("**");

  parts.forEach((part, index) => {
    const bold = index % 2 === 1;
    let cursor = 0;

    for (const match of part.matchAll(CODE_PATTERN)) {
      const start = match.index ?? 0;
      const code = match[1];
      parsePlain(segments, part.slice(cursor, start), bold);
      segments.push({
        text: code,
        bold,
        code: true,
        padStart: true,
        padEnd: true,
        url: /^https?:\/\/\S+$/.test(code) ? code : undefined,
      });
      cursor = start + match[0].length;
    }

    parsePlain(segments, part.slice(cursor), bold);
  });

  return segments.filter((segment) => segment.text !== "");
};

/* Width without kerning. pdf-lib's widthOfTextAtSize subtracts the font's
   kerning pairs, but drawText does not apply them, so text measured that way
   runs into whatever is drawn after it. */
const textWidth = (font: PDFFont, text: string, size: number) => {
  let width = 0;

  for (const character of text) {
    width += font.widthOfTextAtSize(character, size);
  }

  return width;
};

const fontFor = (fonts: Fonts, segment: Segment) => {
  if (segment.code) {
    if (!fonts.code) {
      throw new Error("Code text needs the code font, which was not embedded.");
    }

    return fonts.code;
  }

  return segment.bold ? fonts.bold : fonts.regular;
};

const codePadding = (segment: { padStart?: boolean; padEnd?: boolean }) =>
  (segment.padStart ? CODE_PAD : 0) + (segment.padEnd ? CODE_PAD : 0);

const segmentWidth = (fonts: Fonts, segment: Segment, size: number) =>
  segment.code
    ? textWidth(fontFor(fonts, segment), segment.text, size * CODE_SCALE) + codePadding(segment)
    : textWidth(fontFor(fonts, segment), segment.text, size);

/* Where a long web address in code may break: after a slash (not inside
   "://") and before ? and &. Shorter code, and code with spaces, never
   breaks here, so a column name always stays whole. */
const addressPieces = (text: string): string[] => {
  if (text.length < 30 || /\s/.test(text) || !/[/?&]/.test(text)) {
    return [text];
  }

  const pieces: string[] = [];
  let start = 0;

  for (let index = 1; index < text.length; index += 1) {
    const afterSlash = text[index - 1] === "/" && text[index] !== "/" && !text.slice(0, index).endsWith("://");

    if (afterSlash || text[index] === "?" || text[index] === "&") {
      pieces.push(text.slice(start, index));
      start = index;
    }
  }

  pieces.push(text.slice(start));
  return pieces;
};

/* Splits runs into words at spaces; a word may change style midway
   ("**Save Podium**." is one word in two styles). Code is never split at its
   spaces; a long address in code becomes pieces that join without one. */
const toWords = (fonts: Fonts, segments: Segment[], size: number): Word[] => {
  const words: Word[] = [];
  let current: Segment[] = [];
  let attach = false;

  const flush = () => {
    if (current.length > 0) {
      words.push({
        segments: current,
        width: current.reduce((total, segment) => total + segmentWidth(fonts, segment, size), 0),
        ...(attach ? { attach } : {}),
      });
      current = [];
      attach = false;
    }
  };

  for (const segment of segments) {
    if (segment.code) {
      const pieces = addressPieces(segment.text);

      pieces.forEach((piece, index) => {
        if (index > 0) {
          flush();
          attach = true;
        }

        current.push({
          ...segment,
          text: piece,
          padStart: segment.padStart && index === 0,
          padEnd: segment.padEnd && index === pieces.length - 1,
        });
      });
      continue;
    }

    const pieces = segment.text.split(" ");

    pieces.forEach((piece, index) => {
      if (index > 0) {
        flush();
      }

      if (piece !== "") {
        current.push({ ...segment, text: piece });
      }
    });
  }

  flush();
  return words;
};

/* A word wider than the line (a long address in a narrow column) is broken
   after a slash, or anywhere if it has none. */
const splitWide = (fonts: Fonts, word: Word, size: number, width: number): Word[] => {
  if (word.width <= width || word.segments.length !== 1) {
    return [word];
  }

  const [segment] = word.segments;

  if (segment.code) {
    return splitCode(fonts, word, segment, size, width);
  }

  const pieces: Word[] = [];
  let rest = segment.text;

  while (rest !== "") {
    let cut = rest.length;

    while (cut > 1 && segmentWidth(fonts, { ...segment, text: rest.slice(0, cut) }, size) > width) {
      const slash = rest.lastIndexOf("/", cut - 2);
      cut = slash > 0 ? slash + 1 : cut - 1;
    }

    const piece = { ...segment, text: rest.slice(0, cut) };
    pieces.push({ segments: [piece], width: segmentWidth(fonts, piece, size) });
    rest = rest.slice(cut);
  }

  return pieces;
};

/* Code wider than the line (a command line, or an address in a narrow
   column) breaks after a space, a slash or =, or before ? and &; only if it
   has none of those, anywhere. The pieces join without a space. */
const splitCode = (fonts: Fonts, word: Word, segment: Segment, size: number, width: number): Word[] => {
  const pieces: Word[] = [];
  const text = segment.text;
  let start = 0;

  const pieceOf = (end: number): Segment => ({
    ...segment,
    text: text.slice(start, end),
    padStart: segment.padStart && start === 0,
    padEnd: segment.padEnd && end === text.length,
  });

  while (start < text.length) {
    let end = text.length;

    while (end > start + 1 && segmentWidth(fonts, pieceOf(end), size) > width) {
      let point = -1;

      for (let index = end - 1; index > start; index -= 1) {
        const before = text[index - 1];

        if (before === " " || before === "/" || before === "=" || text[index] === "?" || text[index] === "&") {
          point = index;
          break;
        }
      }

      end = point > start ? point : end - 1;
    }

    const piece = pieceOf(end);
    pieces.push({
      segments: [piece],
      width: segmentWidth(fonts, piece, size),
      ...(start > 0 || word.attach ? { attach: true } : {}),
    });
    start = end;
  }

  return pieces;
};

const wrapText = (fonts: Fonts, text: string, size: number, width: number): Line[] => {
  const space = textWidth(fonts.regular, " ", size);
  const words = toWords(fonts, parseInline(text), size).flatMap((word) =>
    splitWide(fonts, word, size, width)
  );
  const lines: Line[] = [];
  let line: Line = { words: [], width: 0 };

  for (const word of words) {
    const candidate = line.words.length === 0 ? word.width : line.width + (word.attach ? 0 : space) + word.width;

    if (line.words.length > 0 && candidate > width) {
      lines.push(line);
      line = { words: [word], width: word.width };
    } else {
      line.words.push(word);
      line.width = candidate;
    }
  }

  if (line.words.length > 0) {
    lines.push(line);
  }

  return lines;
};

type TextOptions = {
  size?: number;
  leading?: number;
  color?: Color;
  align?: "left" | "center";
  forceBold?: boolean;
};

/* The painter: every drawing call goes through it, and with `paint` false
   nothing is drawn, so the same code measures a block before it is placed. */
type Painter = {
  doc: PDFDocument;
  fonts: Fonts;
  page: PDFPage;
  paint: boolean;
  links: LinkBox[];
  images: Map<string, PDFImage>;
};

/* Draws wrapped text with its first line's top at `top`; returns the
   height used. */
const drawText = (p: Painter, text: string, x: number, top: number, width: number, options: TextOptions = {}) => {
  const size = options.size ?? BODY_SIZE;
  const leading = options.leading ?? BODY_LEADING;
  const color = options.color ?? INK;
  const lines = wrapText(p.fonts, options.forceBold ? `**${text.replaceAll("**", "")}**` : text, size, width);

  if (p.paint) {
    lines.forEach((line, index) => {
      const baseline = top - size * 0.9 - index * leading;
      let cursor = options.align === "center" ? x + (width - line.width) / 2 : x;

      // Whole runs of one style, spaces included, so the text copies and
      // searches as ordinary sentences. A space between two styles goes
      // with the run before it, unless that run is a link. Code has runs of
      // its own, and a space next to it is always in the text font, the
      // width it was measured at.
      const runs: { text: string; font: PDFFont; url?: string; code?: { padStart: number; padEnd: number } }[] = [];

      line.words.forEach((word, wordIndex) => {
        word.segments.forEach((segment, segmentIndex) => {
          const font = fontFor(p.fonts, segment);
          const last = runs[runs.length - 1];
          const spaceBefore = wordIndex > 0 && segmentIndex === 0 && !word.attach ? " " : "";

          if (segment.code) {
            const padEnd = segment.padEnd ? CODE_PAD : 0;

            if (last?.code && !spaceBefore && last.url === segment.url) {
              // The next piece of the same address, on the same line.
              last.text += segment.text;
              last.code.padEnd = padEnd;
              return;
            }

            if (spaceBefore && last && !last.url && !last.code) {
              last.text += spaceBefore;
            } else if (spaceBefore) {
              runs.push({ text: spaceBefore, font: p.fonts.regular });
            }

            runs.push({ text: segment.text, font, url: segment.url, code: { padStart: segment.padStart ? CODE_PAD : 0, padEnd } });
          } else if (last && !last.code && last.font === font && last.url === segment.url) {
            last.text += spaceBefore + segment.text;
          } else if (last && spaceBefore && !last.url && !last.code) {
            last.text += spaceBefore;
            runs.push({ text: segment.text, font, url: segment.url });
          } else {
            runs.push({ text: spaceBefore + segment.text, font, url: segment.url });
          }
        });
      });

      for (const run of runs) {
        if (run.code) {
          const codeSize = size * CODE_SCALE;
          const letters = textWidth(run.font, run.text, codeSize);
          const boxWidth = run.code.padStart + textWidth(run.font, run.text.trimEnd(), codeSize) + run.code.padEnd;
          box(p, cursor, baseline + size * 0.8, boxWidth, size * 1.05, { fill: CODE_TINT, radius: 1.6 });
          p.page.drawText(run.text, {
            x: cursor + run.code.padStart,
            y: baseline,
            size: codeSize,
            font: run.font,
            color: run.url ? BRONZE_DEEP : color,
          });

          if (run.url) {
            p.links.push({ page: p.page, x: cursor, y: baseline - size * 0.25, width: boxWidth, height: size * 1.15, url: run.url });
          }

          cursor += run.code.padStart + letters + run.code.padEnd;
          continue;
        }

        p.page.drawText(run.text, {
          x: cursor,
          y: baseline,
          size,
          font: run.font,
          color: run.url ? BRONZE_DEEP : color,
        });

        if (run.url) {
          const lead = textWidth(run.font, run.text.length - run.text.trimStart().length > 0 ? " " : "", size);
          p.links.push({
            page: p.page,
            x: cursor + lead,
            y: baseline - size * 0.25,
            width: textWidth(run.font, run.text.trim(), size),
            height: size * 1.15,
            url: run.url,
          });
        }

        cursor += textWidth(run.font, run.text, size);
      }
    });
  }

  return lines.length === 0 ? 0 : (lines.length - 1) * leading + size * 1.2;
};

const spaced = (p: Painter, text: string, x: number, y: number, size: number, font: PDFFont, color: Color, spacing: number) => {
  if (p.paint) {
    p.page.pushOperators(setCharacterSpacing(spacing));
    p.page.drawText(text, { x, y, size, font, color });
    p.page.pushOperators(setCharacterSpacing(0));
  }

  return textWidth(font, text, size) + spacing * Math.max(0, text.length - 1);
};

const roundedRect = (width: number, height: number, radius: number) => {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M ${r} 0`,
    `L ${width - r} 0`,
    `Q ${width} 0 ${width} ${r}`,
    `L ${width} ${height - r}`,
    `Q ${width} ${height} ${width - r} ${height}`,
    `L ${r} ${height}`,
    `Q 0 ${height} 0 ${height - r}`,
    `L 0 ${r}`,
    `Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");
};

const box = (
  p: Painter,
  x: number,
  top: number,
  width: number,
  height: number,
  options: { fill?: Color; border?: Color; borderWidth?: number; radius?: number }
) => {
  if (!p.paint) {
    return;
  }

  p.page.drawSvgPath(roundedRect(width, height, options.radius ?? 6), {
    x,
    y: top,
    color: options.fill,
    borderColor: options.border,
    borderWidth: options.border ? (options.borderWidth ?? 1) : undefined,
  });
};

const arrow = (p: Painter, from: [number, number], to: [number, number], color: Color, width = 1.4) => {
  if (!p.paint) {
    return;
  }

  const [x1, y1] = from;
  const [x2, y2] = to;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 7;
  const baseX = x2 - Math.cos(angle) * head;
  const baseY = y2 - Math.sin(angle) * head;

  p.page.drawLine({ start: { x: x1, y: y1 }, end: { x: baseX, y: baseY }, thickness: width, color });

  const left = [baseX + Math.sin(angle) * head * 0.5, baseY - Math.cos(angle) * head * 0.5];
  const right = [baseX - Math.sin(angle) * head * 0.5, baseY + Math.cos(angle) * head * 0.5];
  // drawSvgPath measures y downwards from its origin, so flip each point.
  p.page.drawSvgPath(`M ${x2} ${-y2} L ${left[0]} ${-left[1]} L ${right[0]} ${-right[1]} Z`, {
    x: 0,
    y: 0,
    color,
  });
};

const circle = (p: Painter, x: number, y: number, radius: number, fill?: Color, border?: Color, borderWidth = 1) => {
  if (p.paint) {
    p.page.drawCircle({
      x,
      y,
      size: radius,
      color: fill,
      borderColor: border,
      borderWidth: border ? borderWidth : undefined,
    });
  }
};

/* A numbered disc: the step numbers and the figure labels. */
const numberDisc = (p: Painter, label: string, x: number, y: number, radius = 7.5) => {
  circle(p, x, y, radius, BRONZE);

  if (p.paint) {
    const size = radius * 1.15;
    const width = textWidth(p.fonts.bold, label, size);
    p.page.drawText(label, { x: x - width / 2, y: y - size * 0.36, size, font: p.fonts.bold, color: WHITE });
  }
};

// ---------------------------------------------------------------------------
// The Markdown dialect (see the notes at the top of the outline file).

type Block =
  | { kind: "section"; label: string; subtitle: string; samePage: boolean }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "callout"; paragraphs: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "figures"; images: { file: string; caption: string; maxWidth: number | null }[] }
  | { kind: "annotated"; file: string; width: number; callouts: { at: number; text: string }[] }
  | { kind: "side"; file: string; width: number; caption: string; blocks: Block[] }
  | { kind: "diagram"; name: "pointer" | "points" | "pools" }
  | { kind: "page" };

type FrontMatter = { title: string; subtitle: string; version: string };

const fillPlaceholders = (text: string, name: string) =>
  text.replace(/\{site\.([a-zA-Z]+)\}/g, (whole, key: string) => {
    const value = (site as Record<string, unknown>)[key];

    if (typeof value !== "string" || value === "" || value === "#") {
      throw new Error(`Unknown or empty placeholder ${whole} in ${name}.`);
    }

    return value;
  });

const directiveArgs = (text: string) => {
  const args: Record<string, string> = {};

  for (const match of text.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)) {
    args[match[1]] = match[2] ?? match[3];
  }

  return args;
};

const parseOutline = (source: string, name: string): { front: FrontMatter; blocks: Block[] } => {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const front: Record<string, string> = {};
  let index = 0;

  if (lines[0] === "---") {
    index = 1;

    while (index < lines.length && lines[index] !== "---") {
      const match = lines[index].match(/^(\w+):\s*(.*)$/);

      if (match) {
        front[match[1]] = match[2].trim();
      }

      index += 1;
    }

    index += 1;
  }

  for (const key of ["title", "subtitle", "version"]) {
    if (!front[key]) {
      throw new Error(`${name} needs "${key}:" in its front matter.`);
    }
  }

  const root: Block[] = [];
  const stack: Block[][] = [root];
  const out = () => stack[stack.length - 1];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let callout: string[] | null = null;
  let table: string[][] | null = null;
  let samePage = false;
  let annotate: { file: string; width: number } | null = null;

  const flush = () => {
    if (paragraph.length > 0) {
      const text = paragraph.join(" ").trim();
      const images = [...text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"(\d+)")?\)/g)];
      const rest = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "").trim();

      if (images.length > 0 && rest === "") {
        out().push({
          kind: "figures",
          images: images.map((match) => ({
            caption: match[1],
            file: match[2],
            maxWidth: match[3] ? Number(match[3]) : null,
          })),
        });
      } else {
        out().push({ kind: "paragraph", text });
      }

      paragraph = [];
    }

    if (list) {
      if (annotate) {
        out().push({
          kind: "annotated",
          file: annotate.file,
          width: annotate.width,
          callouts: list.items.map((item) => {
            const match = item.match(/^@([\d.]+)\s+(.*)$/);

            if (!match) {
              throw new Error(`An annotated picture's label must start with @position: "${item}"`);
            }

            return { at: Number(match[1]), text: match[2] };
          }),
        });
        annotate = null;
      } else {
        out().push({ kind: "list", ordered: list.ordered, items: list.items });
      }

      list = null;
    }

    if (callout) {
      out().push({
        kind: "callout",
        paragraphs: callout.join("\n").split(/\n\s*\n/).map((part) => part.replace(/\n/g, " ").trim()),
      });
      callout = null;
    }

    if (table) {
      const [header, separator, ...rows] = table;

      if (!header || !separator || !/^[\s|:-]+$/.test(separator.join("|"))) {
        throw new Error(`A table in ${name} needs a header and a --- row: ${header?.join(" | ")}`);
      }

      out().push({ kind: "table", header, rows });
      table = null;
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    index += 1;

    if (trimmed.startsWith("<!--")) {
      let comment = trimmed;

      while (!comment.includes("-->") && index < lines.length) {
        comment += `\n${lines[index]}`;
        index += 1;
      }

      flush();
      const body = comment.replace(/^<!--/, "").replace(/-->[\s\S]*$/, "").trim();
      const [name, ...restParts] = body.split(/\s*:\s*/);
      const rest = restParts.join(":");

      if (body === "same-page") {
        samePage = true;
      } else if (body === "page") {
        out().push({ kind: "page" });
      } else if (name === "diagram") {
        if (rest !== "pointer" && rest !== "points" && rest !== "pools") {
          throw new Error(`Unknown diagram "${rest}" in ${name}.`);
        }

        out().push({ kind: "diagram", name: rest });
      } else if (name === "annotated") {
        const args = directiveArgs(rest);
        annotate = { file: rest.split(/\s+/)[0], width: Number(args.width ?? 180) };
      } else if (name === "side") {
        const args = directiveArgs(rest);
        const side: Block = {
          kind: "side",
          file: rest.split(/\s+/)[0],
          width: Number(args.width ?? 150),
          caption: args.caption ?? "",
          blocks: [],
        };
        out().push(side);
        stack.push(side.blocks);
      } else if (body === "/side") {
        if (stack.length === 1) {
          throw new Error(`A /side comment in ${name} has no side to close.`);
        }

        stack.pop();
      }
      // Anything else is a note for editors.
      continue;
    }

    if (trimmed === "") {
      if (callout) {
        // A blank line inside a callout separates its paragraphs only if the
        // next line is still part of the callout.
        if (lines[index]?.trim().startsWith(">")) {
          callout.push("");
          continue;
        }
      }

      flush();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);

    if (heading) {
      flush();
      const text = heading[2].trim();

      if (heading[1] === "#") {
        if (stack.length > 1) {
          throw new Error(`Section "${text}" starts inside a side picture; close it with /side first.`);
        }

        // Drawn as plain text on the cover, the tabs and the footers, so
        // `code` marks are dropped.
        const [label, ...subtitle] = text.replaceAll("`", "").split(" — ");
        root.push({ kind: "section", label: label.trim(), subtitle: subtitle.join(" — ").trim(), samePage });
        samePage = false;
      } else {
        out().push({ kind: heading[1] === "##" ? "h2" : "h3", text });
      }

      continue;
    }

    if (trimmed.startsWith(">")) {
      if (!callout) {
        flush();
        callout = [];
      }

      callout.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    if (trimmed.startsWith("|")) {
      if (!table) {
        flush();
        table = [];
      }

      table.push(
        trimmed
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim())
      );
      continue;
    }

    const item = line.match(/^(\d+\.|-)\s+(.*)$/);

    if (item) {
      const ordered = item[1] !== "-";

      if (paragraph.length > 0 || (list && list.ordered !== ordered)) {
        flush();
      }

      list ??= { ordered, items: [] };
      list.items.push(item[2].trim());
      continue;
    }

    if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${trimmed}`;
      continue;
    }

    if (list) {
      flush();
    }

    paragraph.push(trimmed);
  }

  flush();

  if (stack.length > 1) {
    throw new Error(`A side picture in ${name} is never closed with /side.`);
  }

  return { front: front as FrontMatter, blocks: root };
};

// ---------------------------------------------------------------------------
// Blocks: each knows its height at a width and how to draw itself with its
// top at `top`. Pages break between blocks (and between list items and table
// rows), never inside one.

type Unit = {
  height: (p: Painter, width: number) => number;
  draw: (p: Painter, x: number, top: number, width: number) => void;
  spaceBefore: number;
  keepWithNext?: boolean;
  /* Drawn again at the top of a new page before this unit (table headers). */
  header?: Unit;
  /* A forced page break. */
  pageBreak?: boolean;
  /* The height of the whole group this unit starts (a table): kept on one
     page when it is short enough. */
  groupHeight?: (p: Painter, width: number) => number;
};

const measure = (p: Painter, unit: Unit, width: number) => unit.height({ ...p, paint: false }, width);

const paragraphUnit = (text: string, spaceBefore = 7, options: TextOptions = {}): Unit => ({
  spaceBefore,
  height: (p, width) => drawText(p, text, 0, 0, width, options),
  draw: (p, x, top, width) => {
    drawText(p, text, x, top, width, options);
  },
});

const headingUnit = (text: string, level: 2 | 3): Unit => {
  const size = level === 2 ? 12.5 : 10;
  const color = level === 2 ? BRONZE : INK;

  return {
    spaceBefore: level === 2 ? 14 : 9,
    keepWithNext: true,
    height: (p, width) => drawText(p, text, 0, 0, width, { size, leading: size * 1.25, forceBold: true }) + 2,
    draw: (p, x, top, width) => {
      drawText(p, text, x, top, width, { size, leading: size * 1.25, color, forceBold: true });
    },
  };
};

const LIST_INDENT = 20;

const listItemUnit = (text: string, ordered: boolean, number: number, first: boolean): Unit => ({
  spaceBefore: first ? 7 : 3,
  height: (p, width) => drawText(p, text, 0, 0, width - LIST_INDENT),
  draw: (p, x, top, width) => {
    if (ordered) {
      numberDisc(p, String(number), x + 7.5, top - 6.1, 6.9);
    } else if (p.paint) {
      p.page.drawRectangle({ x: x + 5, y: top - 7.3, width: 3.5, height: 3.5, color: BRONZE });
    }

    drawText(p, text, x + LIST_INDENT, top, width - LIST_INDENT);
  },
});

const CALLOUT_PAD = 9;

const calloutUnit = (paragraphs: string[]): Unit => {
  const inner = (p: Painter, x: number, top: number, width: number) => {
    let y = top;

    paragraphs.forEach((text, index) => {
      if (index > 0) {
        y -= 6;
      }

      y -= drawText(p, text, x, y, width, { size: 9.3, leading: 12.8 });
    });

    return top - y;
  };

  return {
    spaceBefore: 12,
    height: (p, width) => inner(p, 0, 0, width - CALLOUT_PAD * 2 - 4) + CALLOUT_PAD * 2,
    draw: (p, x, top, width) => {
      const height = inner({ ...p, paint: false }, 0, 0, width - CALLOUT_PAD * 2 - 4) + CALLOUT_PAD * 2;

      if (p.paint) {
        p.page.drawRectangle({ x, y: top - height, width, height, color: BRONZE_TINT });
        p.page.drawRectangle({ x, y: top - height, width: 3.5, height, color: BRONZE });
      }

      inner(p, x + CALLOUT_PAD + 4, top - CALLOUT_PAD, width - CALLOUT_PAD * 2 - 4);
    },
  };
};

const TABLE_SIZE = 9;
const TABLE_LEADING = 12;
const CELL_PAD_X = 5;
const CELL_PAD_Y = 5;

const tableColumns = (p: Painter, header: string[], rows: string[][], width: number) => {
  const count = header.length;
  const longestWord = new Array<number>(count).fill(0);
  const natural = new Array<number>(count).fill(0);

  for (const row of [header, ...rows]) {
    row.forEach((cell, column) => {
      const words = toWords(p.fonts, parseInline(row === header ? `**${cell}**` : cell), TABLE_SIZE);
      const wordMax = Math.max(0, ...words.map((word) => Math.min(word.width, width * 0.45)));
      const total = words.reduce((sum, word) => sum + word.width + 2.5, 0);
      longestWord[column] = Math.max(longestWord[column], wordMax + CELL_PAD_X * 2);
      natural[column] = Math.max(natural[column], total + CELL_PAD_X * 2);
    });
  }

  const minimum = longestWord.reduce((sum, value) => sum + value, 0);

  if (natural.reduce((sum, value) => sum + value, 0) <= width) {
    // Everything fits on one line: share the spare room by natural width.
    const total = natural.reduce((sum, value) => sum + value, 0);
    return natural.map((value) => (value / total) * width);
  }

  // Give each column its longest word, then share the rest by how much
  // more it would like.
  const spare = Math.max(0, width - minimum);
  const wants = natural.map((value, column) => Math.max(0, value - longestWord[column]));
  const totalWants = wants.reduce((sum, value) => sum + value, 0) || 1;
  return longestWord.map((value, column) => value + (spare * wants[column]) / totalWants);
};

const tableRowUnit = (cells: string[], columns: (p: Painter, width: number) => number[], isHeader: boolean, first: boolean): Unit => {
  const layout = (p: Painter, x: number, top: number, width: number) => {
    const widths = columns(p, width);
    let height = 0;
    let cursor = x;

    cells.forEach((cell, column) => {
      const used = drawText(p, cell, cursor + CELL_PAD_X, top - CELL_PAD_Y, widths[column] - CELL_PAD_X * 2, {
        size: TABLE_SIZE,
        leading: TABLE_LEADING,
        forceBold: isHeader,
      });
      height = Math.max(height, used);
      cursor += widths[column];
    });

    return height + CELL_PAD_Y * 2;
  };

  return {
    spaceBefore: first ? 10 : 0,
    height: (p, width) => layout(p, 0, 0, width),
    draw: (p, x, top, width) => {
      const height = layout({ ...p, paint: false }, x, top, width);

      if (p.paint && isHeader) {
        p.page.drawRectangle({ x, y: top - height, width, height, color: BRONZE_TINT });
      }

      layout(p, x, top, width);

      if (p.paint) {
        p.page.drawLine({
          start: { x, y: top - height },
          end: { x: x + width, y: top - height },
          thickness: isHeader ? 1.2 : 0.5,
          color: isHeader ? BRONZE : LIGHT_RULE,
        });
      }
    },
  };
};

const tableUnits = (header: string[], rows: string[][]): Unit[] => {
  const cache = new Map<number, number[]>();
  const columns = (p: Painter, width: number) => {
    const cached = cache.get(width);

    if (cached) {
      return cached;
    }

    const computed = tableColumns(p, header, rows, width);
    cache.set(width, computed);
    return computed;
  };

  const headerUnit = tableRowUnit(header, columns, true, true);
  const repeatHeader: Unit = { ...headerUnit, spaceBefore: 0 };
  const rowUnits = rows.map((row) => tableRowUnit(row, columns, false, false));
  return [
    {
      ...headerUnit,
      keepWithNext: true,
      groupHeight: (p, width) =>
        [headerUnit, ...rowUnits].reduce((total, unit) => total + unit.height(p, width), 0),
    },
    ...rows.map((row, index) => ({ ...tableRowUnit(row, columns, false, false), header: index > 0 ? repeatHeader : undefined })),
  ];
};

// Figures -------------------------------------------------------------------

const figureImage = (p: Painter, file: string) => {
  const image = p.images.get(file);

  if (!image) {
    throw new Error(`Picture ${file} is not loaded.`);
  }

  return image;
};

const drawPicture = (p: Painter, file: string, x: number, top: number, width: number, height: number) => {
  if (!p.paint) {
    return;
  }

  p.page.drawImage(figureImage(p, file), { x, y: top - height, width, height });
  p.page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    borderColor: LIGHT_RULE,
    borderWidth: 0.6,
  });
};

const CAPTION_GAP = 5;
const captionOptions: TextOptions = { size: SMALL_SIZE, leading: 11, color: GREY, align: "center" };

const figuresUnit = (images: { file: string; caption: string; maxWidth: number | null }[]): Unit => {
  const gap = 14;
  const layout = (p: Painter, x: number, top: number, width: number) => {
    const ratios = images.map(({ file }) => {
      const image = figureImage(p, file);
      return image.width / image.height;
    });
    const available = width - gap * (images.length - 1);
    let height = Math.min(available / ratios.reduce((sum, ratio) => sum + ratio, 0), 360);

    images.forEach((image, index) => {
      if (image.maxWidth) {
        height = Math.min(height, image.maxWidth / ratios[index]);
      }
    });

    const total = ratios.reduce((sum, ratio) => sum + ratio * height, 0) + gap * (images.length - 1);
    let cursor = x + (width - total) / 2;
    let captionHeight = 0;

    images.forEach((image, index) => {
      const imageWidth = ratios[index] * height;
      drawPicture(p, image.file, cursor, top, imageWidth, height);

      if (image.caption) {
        captionHeight = Math.max(
          captionHeight,
          CAPTION_GAP + drawText(p, image.caption, cursor, top - height - CAPTION_GAP, imageWidth, captionOptions)
        );
      }

      cursor += imageWidth + gap;
    });

    return height + captionHeight;
  };

  return {
    spaceBefore: 12,
    height: (p, width) => layout(p, 0, 0, width),
    draw: (p, x, top, width) => {
      layout(p, x, top, width);
    },
  };
};

/* A picture on the left with numbered labels down its right side, each
   joined to the point it describes. */
const annotatedUnit = (file: string, imageWidth: number, callouts: { at: number; text: string }[]): Unit => {
  const textGap = 44;
  const layout = (p: Painter, x: number, top: number, width: number) => {
    const image = figureImage(p, file);
    const height = (imageWidth * image.height) / image.width;
    const textX = x + imageWidth + textGap;
    const textWidth = width - imageWidth - textGap - 18;
    const options: TextOptions = { size: 9, leading: 12 };
    const heights = callouts.map((callout) => drawText({ ...p, paint: false }, callout.text, 0, 0, textWidth, options));

    // Each label wants its first line level with its point; push down to
    // avoid the one above, then back up from the bottom if it overflows.
    const tops = callouts.map((callout) => top - callout.at * height + 6);

    for (let index = 1; index < tops.length; index += 1) {
      tops[index] = Math.min(tops[index], tops[index - 1] - heights[index - 1] - 7);
    }

    const floor = top - height;

    for (let index = tops.length - 1; index >= 0; index -= 1) {
      const limit = index === tops.length - 1 ? floor + heights[index] : tops[index + 1] + heights[index] + 7;
      tops[index] = Math.max(tops[index], limit);
    }

    drawPicture(p, file, x, top, imageWidth, height);

    callouts.forEach((callout, index) => {
      const pointY = top - callout.at * height;
      const labelY = tops[index] - 6;

      if (p.paint) {
        p.page.drawLine({
          start: { x: x + imageWidth - 4, y: pointY },
          end: { x: x + imageWidth + 12, y: pointY },
          thickness: 0.8,
          color: BRONZE,
        });
        p.page.drawLine({
          start: { x: x + imageWidth + 12, y: pointY },
          end: { x: textX - 10, y: labelY },
          thickness: 0.8,
          color: BRONZE,
        });
        circle(p, x + imageWidth - 4, pointY, 2.2, BRONZE, WHITE, 0.8);
      }

      numberDisc(p, String(index + 1), textX - 2, labelY, 7);
      drawText(p, callout.text, textX + 10, tops[index], textWidth - 2, options);
    });

    const lowest = Math.min(...tops.map((value, index) => value - heights[index]));
    return top - Math.min(floor, lowest);
  };

  return {
    spaceBefore: 12,
    height: (p, width) => layout(p, 0, 0, width),
    draw: (p, x, top, width) => {
      layout(p, x, top, width);
    },
  };
};

/* Text on the left, a picture (with its caption) on the right. */
const sideUnit = (file: string, imageWidth: number, caption: string, inner: Unit[]): Unit => {
  const gap = 18;
  const layout = (p: Painter, x: number, top: number, width: number) => {
    const image = figureImage(p, file);
    const imageHeight = (imageWidth * image.height) / image.width;
    const textWidth = width - imageWidth - gap;
    let y = top;

    inner.forEach((unit, index) => {
      if (index > 0) {
        y -= unit.spaceBefore;
      }

      const height = unit.height({ ...p, paint: false }, textWidth);
      unit.draw(p, x, y, textWidth);
      y -= height;
    });

    drawPicture(p, file, x + width - imageWidth, top, imageWidth, imageHeight);
    let pictureBottom = top - imageHeight;

    if (caption) {
      pictureBottom -=
        CAPTION_GAP + drawText(p, caption, x + width - imageWidth, pictureBottom - CAPTION_GAP, imageWidth, captionOptions);
    }

    return top - Math.min(y, pictureBottom);
  };

  return {
    spaceBefore: 10,
    height: (p, width) => layout(p, 0, 0, width),
    draw: (p, x, top, width) => {
      layout(p, x, top, width);
    },
  };
};

// Diagrams ------------------------------------------------------------------

/* Who moves the live pointer, and every screen that follows it. */
const POINTER_HEIGHT = 214;

const pointerDiagram: Unit = {
  spaceBefore: 14,
  height: () => POINTER_HEIGHT,
  draw: (p, x, top, width) => {
    const leftWidth = 138;
    const centreWidth = 132;
    const rightWidth = 150;
    const centreX = x + (width - centreWidth) / 2 - 6;
    const rightX = x + width - rightWidth;
    const bodyTop = top - 20;
    const bodyHeight = POINTER_HEIGHT - 20;
    const midY = bodyTop - bodyHeight / 2 + 6;

    const kicker = (text: string, kx: number, ky: number) => spaced(p, text, kx, ky, 7.5, p.fonts.bold, BRONZE, 1.2);

    kicker("MOVE IT", x, top - 8);
    kicker("THE LIVE POINTER", centreX, top - 8);
    kicker("FOLLOW IT, WITHIN A SECOND", rightX, top - 8);

    // Who moves it.
    const movers = [
      { title: "Organisers", lines: ["Laptop: /admin/scoring", "Set live, call pools,", "put riders on course"] },
      { title: "Judges", lines: ["Phone: /judge", "Record results, call", "pools, fix mistakes"] },
    ];
    const moverHeight = 64;
    const moverGap = 20;
    const moversTop = midY + moverHeight + moverGap / 2;

    movers.forEach((mover, index) => {
      const boxTop = moversTop - index * (moverHeight + moverGap);
      box(p, x, boxTop, leftWidth, moverHeight, { border: BRONZE, borderWidth: 1.2, fill: WHITE });
      drawText(p, mover.title, x + 10, boxTop - 8, leftWidth - 20, { size: 11, forceBold: true });
      mover.lines.forEach((line, lineIndex) => {
        drawText(p, line, x + 10, boxTop - 25 - lineIndex * 10.5, leftWidth - 20, { size: 8.3, color: GREY });
      });
      arrow(p, [x + leftWidth + 2, boxTop - moverHeight / 2], [centreX - 3, midY + (index === 0 ? 14 : -14)], BRONZE);
    });

    // The pointer itself: its title, then what it holds.
    const items = ["live round", "called pool", "rider on course", "screen mode", "message"];
    const titleOptions: TextOptions = { size: 12.5, leading: 14.5, color: WHITE, forceBold: true, align: "center" };
    const titleHeight = drawText({ ...p, paint: false }, "WHO IS ON COURSE", 0, 0, centreWidth - 16, titleOptions);
    const centreHeight = 14 + titleHeight + 8 + items.length * 12.5 + 8;
    const centreTop = midY + centreHeight / 2;
    box(p, centreX, centreTop, centreWidth, centreHeight, { fill: BRONZE, radius: 8 });
    drawText(p, "WHO IS ON COURSE", centreX + 8, centreTop - 12, centreWidth - 16, titleOptions);

    if (p.paint) {
      const ruleY = centreTop - 12 - titleHeight - 5;
      p.page.drawLine({
        start: { x: centreX + 24, y: ruleY },
        end: { x: centreX + centreWidth - 24, y: ruleY },
        thickness: 0.6,
        color: WHITE,
      });
    }

    items.forEach((line, index) => {
      drawText(p, line, centreX + 8, centreTop - 12 - titleHeight - 11 - index * 12.5, centreWidth - 16, {
        size: 9,
        color: WHITE,
        align: "center",
      });
    });
    drawText(p, "One record, kept on the server", centreX - 14, centreTop - centreHeight - 6, centreWidth + 28, {
      size: 8,
      color: GREY,
      align: "center",
    });

    // Who follows it.
    const followers = [
      { title: "Judges' phones", detail: "/judge" },
      { title: "Commentary panel", detail: "/commentary" },
      { title: "Public scoreboard", detail: "/live" },
      { title: "Stream graphics", detail: "vMix data feeds, overlays" },
    ];
    const followerHeight = 36;
    const followerGap = 10;
    const followersHeight = followers.length * followerHeight + (followers.length - 1) * followerGap;
    const followersTop = midY + followersHeight / 2;

    followers.forEach((follower, index) => {
      const boxTop = followersTop - index * (followerHeight + followerGap);
      box(p, rightX, boxTop, rightWidth, followerHeight, { border: INK, borderWidth: 0.9, fill: WHITE });
      drawText(p, follower.title, rightX + 10, boxTop - 6, rightWidth - 20, { size: 10, forceBold: true });
      drawText(p, follower.detail, rightX + 10, boxTop - 20, rightWidth - 20, { size: 8.3, color: GREY });
      arrow(
        p,
        [centreX + centreWidth + 3, midY + 27 - index * 18],
        [rightX - 3, boxTop - followerHeight / 2],
        INK,
        1.1
      );
    });
  },
};

/* The three results, drawn like the judges' buttons. */
const pointsDiagram: Unit = {
  spaceBefore: 10,
  height: () => 70,
  draw: (p, x, top, width) => {
    const results = [
      { label: "CARRIED", points: "4", fill: hex("#34d399"), icon: "full", note: "Peg struck and carried across the line" },
      { label: "STRUCK", points: "2", fill: hex("#fcd34d"), icon: "half", note: "Peg struck but not carried across" },
      { label: "MISS", points: "0", fill: hex("#e7e5e4"), icon: "empty", note: "Peg not struck" },
    ] as const;
    const gap = 12;
    const chipWidth = (width - gap * 2) / 3;
    const chipHeight = 40;

    results.forEach((result, index) => {
      const chipX = x + index * (chipWidth + gap);
      box(p, chipX, top, chipWidth, chipHeight, { fill: result.fill, radius: 9 });
      const iconX = chipX + 18;
      const iconY = top - chipHeight / 2;

      if (result.icon === "full") {
        circle(p, iconX, iconY, 6.5, INK);
      } else if (result.icon === "half") {
        circle(p, iconX, iconY, 6, undefined, INK, 1.6);

        if (p.paint) {
          // The left half filled, as on the button.
          p.page.drawSvgPath(`M 0 -6.8 A 6.8 6.8 0 0 0 0 6.8 Z`, { x: iconX, y: iconY, color: INK });
        }
      } else {
        circle(p, iconX, iconY, 6, undefined, INK, 1.6);
      }

      if (p.paint) {
        p.page.drawText(result.label, { x: chipX + 32, y: iconY - 5.5, size: 15, font: p.fonts.bold, color: INK });
        const pointsWidth = textWidth(p.fonts.bold, result.points, 22);
        p.page.drawText(result.points, {
          x: chipX + chipWidth - 14 - pointsWidth,
          y: iconY - 8,
          size: 22,
          font: p.fonts.bold,
          color: INK,
        });
      }

      drawText(p, result.note, chipX, top - chipHeight - 7, chipWidth, { size: 8.5, color: GREY, align: "center" });
    });
  },
};

/* 25 riders at a pool size of 10: three balanced pools, ridden in turn. */
const poolsDiagram: Unit = {
  spaceBefore: 10,
  height: () => 98,
  draw: (p, x, top, width) => {
    const sizes = [9, 8, 8];
    const labels = ["A", "B", "C"];
    const order = ["rides first", "rides second", "rides third"];
    const captionWidth = 112;

    drawText(p, "Example: 25 checked-in riders, pool size 10", x, top - 18, captionWidth, {
      size: 9,
      leading: 12.5,
      forceBold: true,
    });
    drawText(p, "makes 3 pools of 9, 8 and 8, drawn in a random order.", x, top - 46, captionWidth, {
      size: 9,
      leading: 12.5,
      color: GREY,
    });

    const gap = 26;
    const poolsX = x + captionWidth + 18;
    const poolWidth = (width - captionWidth - 18 - gap * 2) / 3;
    const poolHeight = 80;

    sizes.forEach((size, index) => {
      const poolX = poolsX + index * (poolWidth + gap);
      box(p, poolX, top, poolWidth, poolHeight, { border: BRONZE, borderWidth: 1.1, fill: BRONZE_TINT, radius: 7 });
      drawText(p, `POOL ${labels[index]}`, poolX + 9, top - 8, poolWidth - 18, { size: 10, forceBold: true, color: BRONZE_DEEP });

      if (p.paint) {
        const count = `${size} riders`;
        const countWidth = textWidth(p.fonts.regular, count, 8.5);
        p.page.drawText(count, { x: poolX + poolWidth - 9 - countWidth, y: top - 16.5, size: 8.5, font: p.fonts.regular, color: GREY });
      }

      for (let rider = 0; rider < size; rider += 1) {
        const column = rider % 5;
        const row = Math.floor(rider / 5);
        circle(p, poolX + 16 + column * ((poolWidth - 32) / 4), top - 36 - row * 17, 5.2, INK);
      }

      drawText(p, order[index], poolX, top - poolHeight - 5, poolWidth, { size: 8, color: GREY, align: "center" });

      if (index < sizes.length - 1) {
        arrow(p, [poolX + poolWidth + 4, top - poolHeight / 2], [poolX + poolWidth + gap - 4, top - poolHeight / 2], BRONZE, 1.4);
      }
    });
  },
};

// Sections ------------------------------------------------------------------

type SectionInfo = { label: string; subtitle: string; tab: number; page: number };

const sectionHeaderUnit = (section: SectionInfo): Unit => ({
  spaceBefore: 0,
  keepWithNext: true,
  height: (p, width) => sectionHeader(p, section, 0, 0, width),
  draw: (p, x, top, width) => {
    sectionHeader(p, section, x, top, width);
  },
});

const sectionHeader = (p: Painter, section: SectionInfo, x: number, top: number, width: number) => {
  let y = top;
  y -= drawText(p, section.label.toUpperCase(), x, y, width, { size: 27, leading: 30, color: BRONZE, forceBold: true });
  y -= 5;

  if (section.subtitle) {
    const subtitle = section.subtitle.charAt(0).toUpperCase() + section.subtitle.slice(1);
    y -= drawText(p, subtitle, x, y, width, { size: 12.5, leading: 16, color: INK });
    y -= 3;
  }

  y -= 5;

  if (p.paint) {
    p.page.drawRectangle({ x, y: y - 2.5, width, height: 2.5, color: BRONZE });
  }

  return top - y + 4;
};

// ---------------------------------------------------------------------------
// Building the document.

const unitsFor = (blocks: Block[]): Unit[] =>
  blocks.flatMap((block): Unit[] => {
    switch (block.kind) {
      case "h2":
      case "h3":
        return [headingUnit(block.text, block.kind === "h2" ? 2 : 3)];
      case "paragraph":
        return [paragraphUnit(block.text)];
      case "list":
        return block.items.map((item, index) => listItemUnit(item, block.ordered, index + 1, index === 0));
      case "callout":
        return [calloutUnit(block.paragraphs)];
      case "table":
        return tableUnits(block.header, block.rows);
      case "figures":
        return [figuresUnit(block.images)];
      case "annotated":
        return [annotatedUnit(block.file, block.width, block.callouts)];
      case "side":
        return [sideUnit(block.file, block.width, block.caption, unitsFor(block.blocks))];
      case "diagram":
        return [block.name === "pointer" ? pointerDiagram : block.name === "points" ? pointsDiagram : poolsDiagram];
      default:
        return [];
    }
  });

const collectFigures = (blocks: Block[]): string[] =>
  blocks.flatMap((block) => {
    switch (block.kind) {
      case "figures":
        return block.images.map((image) => image.file);
      case "annotated":
        return [block.file];
      case "side":
        return [block.file, ...collectFigures(block.blocks)];
      default:
        return [];
    }
  });

const collectText = (blocks: Block[]): string[] =>
  blocks.flatMap((block) => {
    switch (block.kind) {
      case "section":
        return [block.label, block.subtitle];
      case "h2":
      case "h3":
      case "paragraph":
        return [block.text];
      case "list":
        return block.items;
      case "callout":
        return block.paragraphs;
      case "table":
        return [...block.header, ...block.rows.flat()];
      case "figures":
        return block.images.map((image) => image.caption);
      case "annotated":
        return block.callouts.map((callout) => callout.text);
      case "side":
        return [block.caption, ...collectText(block.blocks)];
      default:
        return [];
    }
  });

/* The built-in fonts only carry WinAnsi characters. Say which character and
   where, rather than letting pdf-lib fail halfway through a page. */
const checkCharacters = (fonts: Fonts, texts: string[]) => {
  for (const text of texts) {
    for (const character of text) {
      const codePoint = character.codePointAt(0) ?? 0;

      if (codePoint !== 0x0a && !fonts.charset.has(codePoint)) {
        throw new Error(
          `The character "${character}" (U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}) cannot be printed ` +
            `with the built-in fonts. Reword: "${text.slice(0, 80)}"`
        );
      }
    }
  }
};

type LogoMark = { path: string; minX: number; minY: number; width: number; height: number };

/* The NBP mark from public/brand/logo-mark.svg, as in build-paper-forms.mts:
   one even-odd path, cropped to the mark by the viewBox. */
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
    setFillingRgbColor(0xb4 / 255, 0x58 / 255, 0x17 / 255),
    ...svgPathToOperators(logo.path),
    PDFOperator.of(PDFOperatorNames.FillEvenOdd),
    popGraphicsState()
  );

  return width;
};

/* `lead` is the text before the guide's first section, printed as a
   summary between the title and the section list. */
const drawCover = (
  p: Painter,
  guide: Guide,
  front: FrontMatter,
  lead: string[],
  logo: LogoMark | null,
  sections: SectionInfo[]
) => {
  const { page, fonts } = p;
  const top = PAGE_HEIGHT - 20 * MM;
  const logoHeight = 50;
  const logoWidth = logo ? drawLogo(page, logo, MARGIN_X, top, logoHeight) : 0;
  const textX = MARGIN_X + logoWidth + (logo ? 14 : 0);

  spaced(p, site.title.toUpperCase(), textX, top - 20, 11, fonts.bold, INK, 1.2);
  drawText(p, `${site.eventDate}  ·  ${site.venue}`, textX, top - 30, 300, { size: 10.5, color: GREY });

  // Title block.
  let y = PAGE_HEIGHT - 66 * MM;
  spaced(p, guide.kicker, MARGIN_X, y, 10, fonts.bold, BRONZE, 2);
  y -= 16;
  y -= drawText(p, front.title, MARGIN_X, y, CONTENT_WIDTH * 0.8, { size: 40, leading: 44, forceBold: true });
  y -= 14;
  const subtitle = front.subtitle.charAt(0).toUpperCase() + front.subtitle.slice(1);
  y -= drawText(p, subtitle, MARGIN_X, y, CONTENT_WIDTH * 0.86, { size: 13, leading: 18, color: GREY });
  y -= 20;
  page.drawRectangle({ x: MARGIN_X, y, width: CONTENT_WIDTH, height: 2.5, color: BRONZE });
  y -= 30;

  // The summary, if the guide has one.
  if (lead.length > 0) {
    lead.forEach((text, index) => {
      if (index > 0) {
        y -= 8;
      }

      y -= drawText(p, text, MARGIN_X, y, CONTENT_WIDTH, { size: 11, leading: 16 });
    });
    y -= 30;
  }

  // Read your section.
  drawText(p, "Read your section", MARGIN_X, y, CONTENT_WIDTH, { size: 15, color: BRONZE, forceBold: true });
  y -= 24;
  y -= drawText(p, guide.contents, MARGIN_X, y, CONTENT_WIDTH, { size: 10.5, leading: 15 });
  y -= 12;

  for (const section of sections) {
    const rowTop = y;
    const pageLabel = String(section.page);
    const labelWidth = textWidth(fonts.bold, section.label, 11.5);
    page.drawText(section.label, { x: MARGIN_X, y: rowTop - 11, size: 11.5, font: fonts.bold, color: INK });
    let end = MARGIN_X + labelWidth;

    if (section.subtitle) {
      const subtitle = ` — ${section.subtitle}`;
      page.drawText(subtitle, { x: end, y: rowTop - 11, size: 10.5, font: fonts.regular, color: GREY });
      end += textWidth(fonts.regular, subtitle, 10.5);
    }

    const pageWidth = textWidth(fonts.bold, pageLabel, 11.5);
    const pageX = PAGE_WIDTH - MARGIN_X - pageWidth;

    for (let dot = end + 8; dot < pageX - 8; dot += 5) {
      page.drawCircle({ x: dot, y: rowTop - 8.5, size: 0.7, color: LIGHT_RULE });
    }

    page.drawText(pageLabel, { x: pageX, y: rowTop - 11, size: 11.5, font: fonts.bold, color: BRONZE });
    y -= 22;
  }

  // Foot of the cover.
  const footY = MARGIN_BOTTOM + 8;
  page.drawLine({
    start: { x: MARGIN_X, y: footY + 34 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: footY + 34 },
    thickness: 0.6,
    color: LIGHT_RULE,
  });
  drawText(p, `Version: ${front.version}. Check-in: ${site.checkInDate}. Event: ${site.eventDate}, ${site.venue}.`, MARGIN_X, footY + 24, CONTENT_WIDTH, {
    size: 9,
    color: GREY,
  });
  drawText(p, `Questions about this guide or the site: ${site.email} · ${site.url}`, MARGIN_X, footY + 10, CONTENT_WIDTH, {
    size: 9,
    color: GREY,
  });
};

/* The tab on the right edge of each page: one slot per section, so a
   printed copy falls open at your own pages. */
const drawTabs = (page: PDFPage, fonts: Fonts, tabs: string[], active: Set<number>) => {
  const width = 15;
  const gap = 4;
  const spacing = 0.8;
  const padding = 14;
  const available = PAGE_HEIGHT - 2 * 12 * MM;
  const measureTabs = (size: number) =>
    tabs.map((label) => textWidth(fonts.bold, label.toUpperCase(), size) + spacing * (label.length - 1) + padding * 2);
  const totalOf = (heights: number[]) => heights.reduce((sum, value) => sum + value, 0) + gap * (heights.length - 1);

  // Every tab has its own slot down the edge; long section names shrink the
  // lettering until they all fit between the page's top and bottom.
  let size = 7;

  while (size > 4.5 && totalOf(measureTabs(size)) > available) {
    size -= 0.25;
  }

  const heights = measureTabs(size);
  let top = PAGE_HEIGHT - (PAGE_HEIGHT - totalOf(heights)) / 2;

  tabs.forEach((label, index) => {
    const height = heights[index];

    if (active.has(index)) {
      page.drawRectangle({ x: PAGE_WIDTH - width, y: top - height, width, height, color: BRONZE });
      const text = label.toUpperCase();
      const labelWidth = textWidth(fonts.bold, text, size) + spacing * (text.length - 1);
      page.pushOperators(setCharacterSpacing(spacing));
      page.drawText(text, {
        x: PAGE_WIDTH - width / 2 + size * 0.35,
        y: top - height + (height - labelWidth) / 2,
        size,
        font: fonts.bold,
        color: WHITE,
        rotate: degrees(90),
      });
      page.pushOperators(setCharacterSpacing(0));
    }

    top -= height + gap;
  });
};

const drawFooter = (page: PDFPage, fonts: Fonts, title: string, pageNumber: number, sectionLabel: string) => {
  const y = MARGIN_BOTTOM - 26;
  page.drawLine({
    start: { x: MARGIN_X, y: y + 12 },
    end: { x: PAGE_WIDTH - MARGIN_X, y: y + 12 },
    thickness: 0.6,
    color: LIGHT_RULE,
  });
  page.drawText(`${title} · page ${pageNumber}`, { x: MARGIN_X, y, size: 8, font: fonts.regular, color: GREY });
  const width = textWidth(fonts.bold, sectionLabel, 8);
  page.drawText(sectionLabel, { x: PAGE_WIDTH - MARGIN_X - width, y, size: 8, font: fonts.bold, color: BRONZE });
};

const addLinkAnnotations = (doc: PDFDocument, links: LinkBox[]) => {
  for (const link of links) {
    const annotation = doc.context.register(
      doc.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [link.x, link.y, link.x + link.width, link.y + link.height],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(link.url) },
      })
    );
    link.page.node.addAnnot(annotation);
  }
};

const buildGuide = async (guide: Guide) => {
  const name = relative(ROOT, guide.source);
  const source = fillPlaceholders(await readFile(guide.source, "utf8"), name);
  const { front, blocks } = parseOutline(source, name);
  const texts = [front.title, front.subtitle, front.version, guide.contents, ...collectText(blocks)];

  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(`${front.title} — ${site.title}`, { showInWindowTitleBar: true });
  doc.setSubject(guide.subject);
  doc.setLanguage("en");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const fonts: Fonts = {
    regular,
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    code: null,
    charset: new Set(regular.getCharacterSet()),
  };

  // Courier only when the guide has `code`, so a guide without any is
  // unchanged by it.
  if (texts.some((text) => text.includes("`"))) {
    fonts.code = await doc.embedFont(StandardFonts.Courier);
  }

  checkCharacters(fonts, texts);

  const images = new Map<string, PDFImage>();

  for (const file of new Set(collectFigures(blocks))) {
    const path = join(guide.figureDir, file);
    let bytes: Uint8Array;

    try {
      bytes = new Uint8Array(await readFile(path));
    } catch {
      throw new Error(`${name} names ${file}, but ${relative(ROOT, path)} does not exist.`);
    }

    images.set(file, /\.png$/i.test(file) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
  }

  const logo = await loadLogoMark();

  if (!logo) {
    console.warn(`WARNING: could not read the logo mark from ${relative(ROOT, LOGO_PATH)}; building without it.`);
  }

  // Page 1 is the cover; its section list is filled in once every section
  // has a page number.
  const cover = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const links: LinkBox[] = [];
  const painter: Painter = { doc, fonts, page: cover, paint: true, links, images };

  const tabLabels: string[] = [];
  const sections: SectionInfo[] = [];
  const pages: { page: PDFPage; sections: SectionInfo[] }[] = [];
  let y = 0;
  let atTop = true;
  let current: SectionInfo | null = null;

  const newPage = () => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    painter.page = page;
    // A section is listed on a page once its header is there (see below).
    pages.push({ page, sections: current && current.page > 0 ? [current] : [] });
    y = CONTENT_TOP;
    atTop = true;
  };

  /* A short table stays on one page, and a heading (or a paragraph that
     introduces a table) stays with what follows it, in a chain. */
  const groupOf = (candidate: Unit) => {
    const group = candidate.groupHeight ? candidate.groupHeight({ ...painter, paint: false }, CONTENT_WIDTH) : 0;
    return group > 0 && group <= 320 ? group : 0;
  };

  const keptAfter = (units: Unit[], index: number): number => {
    const unit = units[index];
    const next = units[index + 1];

    if (!unit.keepWithNext || !next || next.pageBreak) {
      return 0;
    }

    const own = groupOf(next) || Math.min(measure(painter, next, CONTENT_WIDTH), 120);
    return next.spaceBefore + own + (groupOf(next) ? 0 : keptAfter(units, index + 1));
  };

  const place = (units: Unit[], index: number) => {
    const unit = units[index];
    const height = measure(painter, unit, CONTENT_WIDTH);
    const following = groupOf(unit) ? groupOf(unit) - height : keptAfter(units, index);
    let gap = atTop ? 0 : unit.spaceBefore;

    if (!atTop && y - gap - height - following < MARGIN_BOTTOM) {
      newPage();
      gap = 0;

      if (unit.header) {
        const headerHeight = measure(painter, unit.header, CONTENT_WIDTH);
        unit.header.draw(painter, MARGIN_X, y, CONTENT_WIDTH);
        y -= headerHeight;
        atTop = false;
      }
    }

    y -= gap;
    unit.draw(painter, MARGIN_X, y, CONTENT_WIDTH);
    y -= height;
    atTop = false;

    if (y < MARGIN_BOTTOM - 1) {
      console.warn(`WARNING: a block runs ${(MARGIN_BOTTOM - y).toFixed(0)} pt into the bottom margin on page ${doc.getPageCount()}.`);
    }
  };

  // Group blocks into sections, then lay each out. Paragraphs before the
  // first section are the cover's summary.
  const groups: { section: Block & { kind: "section" }; blocks: Block[] }[] = [];
  const lead: string[] = [];

  for (const block of blocks) {
    if (block.kind === "section") {
      groups.push({ section: block, blocks: [] });
    } else if (groups.length === 0) {
      if (block.kind !== "paragraph") {
        throw new Error(`Only plain paragraphs may come before the first # section of ${name}: they are the cover's summary.`);
      }

      lead.push(block.text);
    } else {
      groups[groups.length - 1].blocks.push(block);
    }
  }

  for (const { section: block, blocks: sectionBlocks } of groups) {
    if (!tabLabels.includes(block.label)) {
      tabLabels.push(block.label);
    }

    const section: SectionInfo = {
      label: block.label,
      subtitle: block.subtitle,
      tab: tabLabels.indexOf(block.label),
      page: 0,
    };
    current = section;
    sections.push(section);
    const units: Unit[] = [sectionHeaderUnit(section)];
    const textBlocks = new Set<Unit>();
    const introductions = new Set<Unit>();

    for (const sectionBlock of sectionBlocks) {
      if (sectionBlock.kind === "page") {
        units.push({ spaceBefore: 0, pageBreak: true, height: () => 0, draw: () => {} });
      } else {
        const added = unitsFor([sectionBlock]);

        if (sectionBlock.kind === "paragraph") {
          added.forEach((unit) => textBlocks.add(unit));

          if (sectionBlock.text.trimEnd().endsWith(":")) {
            added.forEach((unit) => introductions.add(unit));
          }
        }

        units.push(...added);
      }
    }

    // A paragraph just before a table introduces it, and so does one that
    // ends with a colon (before a list, a box or an address): keep them
    // together.
    units.forEach((unit, index) => {
      const next = units[index + 1];

      if (textBlocks.has(unit) && (next?.groupHeight || (introductions.has(unit) && next && !next.pageBreak))) {
        units[index] = { ...unit, keepWithNext: true };
      }
    });

    // A section starts a new page, unless it may follow on: then it goes on
    // the same page if its header and what must stay with it fit there.
    if (!block.samePage || pages.length === 0) {
      newPage();
    } else {
      y -= 18;
    }

    units.forEach((unit, index) => {
      if (unit.pageBreak) {
        newPage();
        return;
      }

      place(units, index);

      if (index === 0) {
        // Where the header actually landed.
        const onPage = pages[pages.length - 1].sections;
        section.page = doc.getPageCount();

        if (!onPage.includes(section)) {
          onPage.push(section);
        }
      }
    });
  }

  // Furniture: the cover's section list, tabs and footers.
  painter.page = cover;
  drawCover(painter, guide, front, lead, logo, sections);

  pages.forEach(({ page, sections: onPage }, index) => {
    drawTabs(page, fonts, tabLabels, new Set(onPage.map((section) => section.tab)));
    drawFooter(page, fonts, front.title, index + 2, [...new Set(onPage.map((section) => section.label))].join(" · "));
  });

  addLinkAnnotations(doc, links);

  await mkdir(dirname(guide.output), { recursive: true });
  const bytes = await doc.save();
  await writeFile(guide.output, bytes);
  console.log(
    `Wrote ${relative(ROOT, guide.output)}: ${doc.getPageCount()} pages, ${images.size} pictures, ` +
      `${links.length} links, ${Math.round(bytes.byteLength / 1024)} KB.`
  );
  sections.forEach((section) => console.log(`  page ${String(section.page).padStart(2)}  ${section.label}${section.subtitle ? ` — ${section.subtitle}` : ""}`));
};

for (const guide of GUIDES) {
  await buildGuide(guide);
}

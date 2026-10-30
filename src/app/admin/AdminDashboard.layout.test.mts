import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./AdminDashboard.tsx", import.meta.url),
  "utf8"
);

test("registration tables contain long values and usable edit fields", () => {
  assert.match(source, /const adminTableInputClass =[\s\S]*?min-w-0/);
  assert.match(source, /function AdminTableText[\s\S]*?truncate/);
  // Two 170px columns each for the parents' names.
  assert.match(source, /min-w-\[2380px\]/);
  assert.match(source, /min-w-\[1880px\]/);
  assert.match(source, /<colgroup>/);

  for (const label of [
    "Horse Name",
    "Emergency Contact",
    "Emergency Phone",
    "Father&apos;s Name",
    "Mother&apos;s Name",
  ]) {
    assert.match(source, new RegExp(`>\\s*${label}\\s*<`));
  }
});

test("the tab bar links one PDF Guides page that opens the three guides, and all three PDFs are built", () => {
  assert.match(source, /href="\/admin\/guides"[\s\S]{0,300}?>\s*PDF Guides\s*</);
  assert.doesNotMatch(source, /href="\/documents\//);

  const page = readFileSync(new URL("./guides/page.tsx", import.meta.url), "utf8");

  for (const [href, title] of [
    ["/documents/staff-guide.pdf", "Staff guide"],
    ["/documents/vmix-guide.pdf", "vMix guide"],
    ["/documents/rehearsal-guide.pdf", "Rehearsal guide"],
  ]) {
    assert.match(page, new RegExp(`href: "${href}",\\s+title: "${title}"`));
  }

  // Every guide opens in a new tab, from the one link template, and the page
  // is behind the same administrator gate as the rest of /admin.
  assert.match(page, /href=\{guide\.href\}\s+target="_blank"\s+rel="noopener noreferrer"/);
  assert.match(page, /profile\.role !== "admin"/);

  for (const file of ["staff-guide.pdf", "vmix-guide.pdf", "rehearsal-guide.pdf"]) {
    assert.ok(
      existsSync(new URL(`../../../public/documents/${file}`, import.meta.url)),
      `public/documents/${file} is built (npm run build:guide)`
    );
  }
});

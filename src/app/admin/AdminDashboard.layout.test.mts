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

test("the tab bar links the three printed guides in one style, and all three PDFs are built", () => {
  const linkTo = (href: string) => {
    const start = source.indexOf(`href="${href}"`);
    assert.ok(start > 0, `${href} is linked from the tab bar`);
    return source.slice(start, source.indexOf("</a>", start));
  };
  const classOf = (link: string) => link.match(/className="([^"]+)"/)?.[1];

  const staff = linkTo("/documents/staff-guide.pdf");
  const vmix = linkTo("/documents/vmix-guide.pdf");
  const rehearsal = linkTo("/documents/rehearsal-guide.pdf");
  assert.match(staff, />\s*Staff guide \(PDF\)\s*$/);
  assert.match(vmix, />\s*vMix guide \(PDF\)\s*$/);
  assert.match(rehearsal, />\s*Rehearsal guide \(PDF\)\s*$/);

  for (const link of [staff, vmix, rehearsal]) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }

  assert.ok(classOf(staff), "the staff guide link is styled");
  assert.equal(classOf(vmix), classOf(staff));
  assert.equal(classOf(rehearsal), classOf(staff));

  for (const file of ["staff-guide.pdf", "vmix-guide.pdf", "rehearsal-guide.pdf"]) {
    assert.ok(
      existsSync(new URL(`../../../public/documents/${file}`, import.meta.url)),
      `public/documents/${file} is built (npm run build:guide)`
    );
  }
});

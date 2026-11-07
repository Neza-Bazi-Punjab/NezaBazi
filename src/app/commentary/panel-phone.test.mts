// Source-level checks for the commentary panel on a phone: the standings give
// the name the room, keep to one pool behind a "Show all pools" toggle, the
// stacked blocks are reordered with order classes below xl only, and the
// status bar keeps to one line. The xl layout's classes are asserted as they
// were, so the phone work cannot move them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const panel = read("./CommentaryPanel.tsx");

test("standings rows give the name a minmax(0,1fr) column and 26px boxes on a phone", () => {
  assert.match(panel, /\? `22px minmax\(0,1fr\) repeat\(\$\{attempts\},26px\) auto`\s*: "22px minmax\(0,1fr\) 26px auto";/);
  // The desktop columns are unchanged, and apply from sm up.
  assert.match(panel, /\? `22px minmax\(0,1fr\) repeat\(\$\{attempts\},34px\) minmax\(0,130px\)`\s*: "22px minmax\(0,1fr\) 48px minmax\(0,130px\)";/);
  assert.match(
    panel,
    /"grid-cols-\[var\(--standing-cols-phone\)\] gap-1\.5 sm:grid-cols-\[var\(--standing-cols\)\] sm:gap-2"/
  );
  assert.match(panel, /"--standing-cols": standingColumns,\s*"--standing-cols-phone": phoneStandingColumns,/);
  assert.doesNotMatch(panel, /gridTemplateColumns: standingColumns/);

  // Name at 15px on a phone; boxes 26 × 26; a short status tag, full words for
  // screen readers and from sm up.
  assert.match(panel, /truncate text-\[15px\] font-semibold sm:text-\[18px\]/);
  assert.match(panel, /h-\[26px\] items-center justify-center border text-\[13px\] font-semibold sm:h-\[34px\] sm:text-\[15px\]/);
  assert.match(panel, /\["Riding now", "Riding", /);
  assert.match(panel, /\["Still riding", "Next", /);
  assert.match(panel, /<span aria-hidden="true" className="sm:hidden">\s*\{tag\}\s*<\/span>\s*<span className="max-sm:sr-only">\{status\}<\/span>/);
});

test("stacked, the standings keep to one pool with a Show all pools toggle", () => {
  assert.match(panel, /const \[allPools, setAllPools\] = useState\(false\);/);
  assert.match(panel, /const stackedPool = standingsPool \?\? nextBlock\?\.pool \?\? standings\[0\]\?\.pool_label \?\? null;/);
  assert.match(panel, /\$\{hiddenWhenStacked\(row\) \? "max-xl:hidden" : ""\}/);
  assert.match(panel, /aria-expanded=\{allPools\}/);
  assert.match(panel, /aria-controls="standings-rows"/);
  assert.match(panel, /id="standings-rows"/);
  assert.match(panel, /"Show all pools"/);
  // The toggle is a 44px button that never shows at xl.
  const label = panel.lastIndexOf('"Show all pools"');
  const toggle = panel.slice(panel.lastIndexOf("<button", label), label);
  assert.match(toggle, /min-h-11/);
  assert.match(toggle, /xl:hidden/);
});

test("stacked order uses order- classes below xl only, on the existing blocks", () => {
  const block = panel.slice(panel.indexOf("const STACK_ORDER = {"), panel.indexOf("} as const;"));
  for (const [name, order] of [
    ["next", 1],
    ["progress", 2],
    ["recent", 3],
    ["standings", 4],
    ["pools", 5],
    ["practice", 6],
  ] as const) {
    assert.match(block, new RegExp(`${name}: "order-${order} xl:order-none",`));
  }

  // Every order- class in the file is either an order-N reset at xl or in
  // STACK_ORDER; no order class applies at xl.
  for (const match of panel.matchAll(/(?<=[\s"`])((?:[\w-]+:)?)order-([\w-]+)/g)) {
    assert.ok(match[1] === "" || match[1] === "xl:", match[0]);
    if (match[1] === "xl:") {
      assert.equal(match[2], "none", match[0]);
    }
  }

  // The two columns let their blocks join the page's grid below xl only.
  assert.match(panel, /className="flex min-w-0 flex-col gap-3 max-xl:contents xl:overflow-y-auto xl:pb-6"/);
  assert.match(panel, /bg-\[var\(--ledger-side\)\] px-4 pb-6 pt-4 max-xl:contents xl:-mr-9/);
  for (const key of ["next", "progress", "recent", "standings", "pools", "practice"]) {
    assert.ok(panel.includes(`\${STACK_ORDER.${key}}`), key);
  }
  // The page grid's xl columns and gap are as designed.
  assert.match(panel, /className="grid min-h-0 flex-1 gap-3 xl:grid-cols-\[1\.15fr_1fr_320px\] xl:gap-8"/);
});

test("the name is 36px on a phone; the status bar drops Screens on a phone", () => {
  assert.match(panel, /text-\[36px\] font-bold uppercase leading-\[0\.92\] tracking-\[-0\.02em\] sm:text-\[60px\] xl:text-\[72px\]/);
  assert.match(panel, /phoneItems=\{\[round && total > 0 \? `\$\{done\}\/\$\{plural\(total, "run"\)\}` : null\]\}/);
  const phoneItems = panel.slice(panel.indexOf("phoneItems="), panel.indexOf("connection={connection}"));
  assert.doesNotMatch(phoneItems, /screensText/);
});

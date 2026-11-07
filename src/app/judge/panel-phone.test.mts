// Source-level checks for the judges' panel on a phone (375px wide, an
// iPhone SE included): the two-row action layout, the one-line status bar,
// the folding pools and 44px touch targets. The desktop classes (`sm`/`lg`/
// `xl` and up) are asserted as they were, so the phone work cannot move them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const panel = read("./JudgePanel.tsx");
const ledger = read("../../components/scoring/ledger/Ledger.tsx");

/* The JSX of the first <button> whose text is `label`, from its opening tag. */
const buttonFor = (source: string, label: RegExp) => {
  const end = source.search(label);
  assert.ok(end > 0, `button ${label} exists`);
  return source.slice(source.lastIndexOf("<button", end), end);
};

test("phones get Cancel | Confirm, then Skip | Take out; from sm up one row as before", () => {
  // Two columns on a phone; the desktop's columns kept from sm and xl up.
  assert.match(
    panel,
    /className="grid grid-cols-2 items-center gap-3 sm:grid-cols-\[auto_minmax\(0,1fr\)_minmax\(0,1fr\)\] xl:grid-cols-\[auto_minmax\(0,1fr\)_180px_240px\]"/
  );
  // The Skip / Take out pair is a full-width row of halves, ordered after the
  // two big buttons, and goes back to its flex group from sm up.
  assert.match(
    panel,
    /className="order-1 col-span-2 grid grid-cols-2 gap-3 sm:order-none sm:col-span-1 sm:flex sm:gap-2"/
  );

  for (const label of [/>\s*Skip\s*</, />\s*Take out\s*<\/button>\s*<\/div>/]) {
    const button = buttonFor(panel, label);
    assert.match(button, /\bh-12\b/);
    assert.match(button, /sm:h-\[52px\] sm:whitespace-nowrap sm:px-\[18px\]/);
    assert.doesNotMatch(button, /(^|[\s"])whitespace-nowrap/, "no nowrap at the base breakpoint");
  }

  for (const label of [/>\s*Cancel\s*<\/button>\s*<button[^>]*onClick=\{confirmPick\}/, /\{busy && shownSelected \? "Saving…" : "Confirm"\}/]) {
    const button = buttonFor(panel, label);
    assert.match(button, /\bh-14\b/);
    assert.match(button, /text-\[19px\]/);
    assert.doesNotMatch(button, /whitespace-nowrap/);
  }
  assert.match(buttonFor(panel, /\{busy && shownSelected \? "Saving…" : "Confirm"\}/), /bg-\[var\(--ledger-ink\)\]/);
});

test("the rider's name is 38px on a phone and as designed from sm up", () => {
  assert.match(panel, /text-\[38px\] font-bold uppercase leading-\[0\.95\] tracking-\[-0\.02em\] sm:text-\[68px\] xl:text-\[84px\]/);
  // The facts stay 2 × 2 on a phone.
  assert.match(panel, /grid grid-cols-2 border-y border-\[var\(--ledger-rule\)\] bg-\[var\(--ledger-panel\)\] sm:grid-cols-\[1\.6fr_1fr_1fr_1fr\]/);
});

test("StatusBar takes phoneItems: items from sm up, phoneItems below; unchanged without it", () => {
  assert.match(ledger, /phoneItems\?: \(string \| null \| undefined \| false\)\[\];/);
  assert.match(ledger, /const short = phoneItems !== undefined;/);
  assert.match(ledger, /className=\{short \? "hidden sm:inline" : undefined\}/);
  assert.match(ledger, /<span key=\{`short-\$\{item as string\}`\} className="sm:hidden">/);
  // Without phoneItems the bar keeps its classes.
  assert.match(ledger, /short \? "gap-x-3 px-3 sm:gap-x-7 sm:px-5" : "gap-x-7 px-5"/);

  // The judges' panel: "Pool A · 1/10" on a phone, no round name or "Round 1 of 3";
  // "Up next · <name>" while nobody is on course.
  assert.match(
    panel,
    /phoneItems=\{\[\s*currentRun\s*\? phonePlace\(currentRun\)\s*: nextRider\s*\? `Up next · \$\{nextRider\.rider_name\}`\s*: poolName\(calledPool\),\s*\]\}/
  );
  assert.match(panel, /\[poolName\(run\.pool_label\), `\$\{index\}\/\$\{size\}`\]\.filter\(Boolean\)\.join\(" · "\)/);
});

test("PoolList takes collapsible: a 44px aria-expanded button below lg, the plain list from lg up", () => {
  assert.match(ledger, /collapsible\?: boolean;/);
  assert.match(ledger, /aria-expanded=\{expanded\}/);
  assert.match(ledger, /aria-controls=\{ridersId\}/);
  assert.match(ledger, /const expanded = toggled\[summary\.pool\] \?\? summary\.pool === openPool;/);
  assert.match(ledger, /className="flex min-h-11 w-full [^"]*lg:hidden"/);
  // The plain heading is hidden only below lg, and only when collapsible.
  assert.match(ledger, /\$\{collapsible \? "max-lg:hidden" : ""\}/);
  assert.match(ledger, /className=\{`flex flex-col \$\{expanded \? "" : "max-lg:hidden"\}`\}/);
  // Without collapsible the riders render straight into the section.
  assert.match(ledger, /\) : \(\s*riderRows\s*\)\}/);

  // The judges' panel folds its pools; the pool on course (or called) starts open.
  assert.match(
    panel,
    /<PoolList\s+pools=\{poolRows\}\s+rounds=\{manyAttempts\}\s+collapsible\s+openPool=\{currentRun\?\.pool_label \?\? riding\?\.pool \?\? calledPool\}\s+\/>/
  );
});

test("every button a judge taps on a phone is at least 44px tall", () => {
  // Top-strip buttons (shared): 44px on a phone, 32px from sm up.
  const strip = ledger.slice(ledger.indexOf("export function StripButton"), ledger.indexOf("function Clock"));
  assert.match(strip, /className="mono min-h-11 [^"]* sm:h-8 sm:min-h-0"/);

  // Undo last, Change, Back to rider on course, Reset training data, OK.
  assert.match(buttonFor(panel, />\s*Undo last\s*</), /mono h-11 [^"]* sm:h-8"/);
  assert.match(buttonFor(panel, />\s*Change\s*</), /h-11 [^"]* sm:h-7"/);
  assert.match(buttonFor(panel, />\s*Back to rider on course\s*</), /mono h-11 [^"]* sm:h-7"/);
  assert.match(buttonFor(panel, />\s*Reset training data\s*</), /mono h-11 [^"]* sm:h-9"/);
  assert.match(buttonFor(panel, />\s*OK\s*</), /mono min-h-11 [^"]* sm:min-h-10"/);

  // No button left at a phone height under 44px (h-7, h-8, h-9, h-10 only
  // behind sm:).
  for (const match of panel.matchAll(/<button[\s\S]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const classes = match[1] ?? match[2];
    assert.doesNotMatch(classes, /(^|\s)(h-7|h-8|h-9|h-10|min-h-10)(\s|$)/, classes);
  }
});

test("the confirmation sheet keeps its safe-area padding and full-width halves, above the status bar", () => {
  assert.match(panel, /fixed inset-x-0 bottom-0 z-\[60\][^"]*pb-\[max\(1rem,env\(safe-area-inset-bottom\)\)\]/);
  assert.match(panel, /<div className="mt-4 grid grid-cols-2 gap-3">/);
  assert.match(panel, /<div className="sticky bottom-0 z-20">/);
});

test("between riders: the last result stays in view and one big Start <name> button, sent without a question", () => {
  assert.match(panel, /Last: \{lastScored\.rider_name\} — \{RESULT_LABELS\[lastScored\.result\]\}/);
  const start = buttonFor(panel, /\{busy \? "Starting…" : `Start \$\{startRider\.rider_name\}`\}/);
  assert.match(start, /onClick=\{\(\) => tap\(\{ kind: "start", run: startRider \}\)\}/);
  assert.match(start, /min-h-\[88px\] w-full/);
  // Only Start skips the confirm bar; Ride now and Take out still ask.
  const actions = read("./judge-actions.ts");
  assert.match(actions, /export const needsConfirmation = \(action: JudgeAction\) => action\.kind !== "start";/);
  assert.match(panel, /onClick=\{\(\) => arm\(\{ kind: "ride_now", run \}\)\}/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./AdminDashboard.tsx", import.meta.url),
  "utf8"
);

test("registration tables contain long values and usable edit fields", () => {
  assert.match(source, /const adminTableInputClass =[\s\S]*?min-w-0/);
  assert.match(source, /function AdminTableText[\s\S]*?truncate/);
  assert.match(source, /min-w-\[2040px\]/);
  assert.match(source, /min-w-\[1390px\]/);
  assert.match(source, /<colgroup>/);

  for (const label of ["Horse Name", "Emergency Contact", "Emergency Phone"]) {
    assert.match(source, new RegExp(`>\\s*${label}\\s*<`));
  }
});

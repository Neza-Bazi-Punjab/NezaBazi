import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");

test("the root layout enables Vercel analytics and speed insights", () => {
  assert.match(source, /@vercel\/analytics\/next/);
  assert.match(source, /@vercel\/speed-insights\/next/);
  assert.match(source, /<Analytics\s*\/>/);
  assert.match(source, /<SpeedInsights\s*\/>/);
});

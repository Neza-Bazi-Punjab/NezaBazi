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

test("the root layout hides the navbar and footer through SiteChrome only", () => {
  assert.match(source, /import SiteChrome from "@\/components\/SiteChrome";/);
  assert.match(source, /<SiteChrome>\s*<Navbar\s*\/>\s*<\/SiteChrome>/);
  assert.match(source, /<SiteChrome>\s*<Footer\s*\/>\s*<\/SiteChrome>/);
  // The page content itself is never wrapped: only the chrome is hidden.
  assert.match(
    source,
    /<\/SiteChrome>\s*<main className="flex flex-1 flex-col">\{children\}<\/main>\s*<SiteChrome>/
  );
  assert.doesNotMatch(source, /<SiteChrome>\s*<main/);
});

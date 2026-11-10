import assert from "node:assert/strict";
import test from "node:test";
import { footerQuickLinks, site } from "../../lib/site.ts";

test("the footer exposes the production privacy policy URL", () => {
  const privacyLink = footerQuickLinks.find((link) => link.href === "/privacy");

  assert.ok(privacyLink);
  assert.deepEqual(privacyLink, {
    href: "/privacy",
    label: "Privacy Policy",
  });
  assert.equal(
    new URL(privacyLink.href, site.url).href,
    "https://www.nezabazipunjab.com/privacy"
  );
});

test("the policy covers parents' names, paper registration and public results", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(page, /Father&apos;s and mother&apos;s names \(optional\)/);
  assert.match(page, /Paper registration\./);
  assert.match(page, /public\s+live scoreboard/);
  assert.match(page, /parents&apos; names and\s+emergency contacts are never shown publicly/);
});

test("the policy lists the Dal Panth an organiser may record, staff-only", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(page, /Dal Panth \(optional\)\./);
  assert.match(page, /The Dal\s+Panth a rider rides with, where an organiser records it\./);
  assert.match(page, /seen\s+only by event staff and is never shown publicly/);
});

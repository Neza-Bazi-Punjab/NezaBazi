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

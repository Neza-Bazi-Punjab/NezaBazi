import assert from "node:assert/strict";
import test from "node:test";
import { getSafeRedirect } from "./safe-redirect.ts";

test("keeps only same-origin internal redirects", () => {
  assert.equal(getSafeRedirect("/account?tab=team#details"), "/account?tab=team#details");
  assert.equal(getSafeRedirect("//evil.com"), "/");
  assert.equal(
    getSafeRedirect(new URLSearchParams("redirect=/%09/evil.com").get("redirect")),
    "/"
  );
  assert.equal(
    getSafeRedirect(new URLSearchParams("redirect=/%0A/evil.com").get("redirect")),
    "/"
  );
  assert.equal(getSafeRedirect("/\\\\evil.com"), "/");
});

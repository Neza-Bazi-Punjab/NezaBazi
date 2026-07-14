import assert from "node:assert/strict";
import test from "node:test";
import { getPostSignupRedirect, getSafeRedirect } from "./safe-redirect.ts";

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

test("signup returns to the requested internal page and defaults to registration", () => {
  assert.equal(getPostSignupRedirect(null), "/register");
  assert.equal(getPostSignupRedirect("/"), "/register");
  assert.equal(getPostSignupRedirect("/register/solo"), "/register/solo");
  assert.equal(getPostSignupRedirect("/register-team"), "/register-team");
  assert.equal(getPostSignupRedirect("https://evil.example"), "/register");
});

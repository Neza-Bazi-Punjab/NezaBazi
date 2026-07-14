import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("confirmed auth sessions sync existing registration details", () => {
  const confirmRoute = readSource("./confirm/route.ts");
  const syncModule = readSource("../../lib/supabase/sync-registration-profile.ts");

  assert.match(syncModule, /export const syncRegistrationProfileFromUser/);
  assert.match(confirmRoute, /syncRegistrationProfileFromUser\(user\)/);
  assert.match(confirmRoute, /verifyOtp/);
  assert.match(confirmRoute, /exchangeCodeForSession/);
});

test("signup and password recovery require at least eight characters", () => {
  const signupPage = readSource("../signup/page.tsx");
  const resetPage = readSource("../reset-password/page.tsx");

  assert.match(signupPage, /minLength=\{8\}/);
  assert.match(resetPage, /password\.length < 8/);
  assert.equal((resetPage.match(/minLength=\{8\}/g) ?? []).length, 2);
});

test("signup confirmation uses the production site and returns through login", () => {
  const signupPage = readSource("../signup/page.tsx");
  const loginPage = readSource("../login/page.tsx");
  const confirmRoute = readSource("./confirm/route.ts");
  const siteConfig = readSource("../../lib/site.ts");

  assert.match(siteConfig, /url: "https:\/\/www\.nezabazipunjab\.com"/);
  assert.match(signupPage, /new URL\("\/auth\/confirm", site\.url\)/);
  assert.match(signupPage, /signup_redirect: redirectTo/);
  assert.match(loginPage, /\/signup\?redirect=/);
  assert.match(confirmRoute, /getPostSignupRedirect/);
  assert.match(confirmRoute, /supabase\.auth\.signOut\(\)/);
  assert.match(confirmRoute, /new URL\("\/login", request\.url\)/);
});

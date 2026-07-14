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

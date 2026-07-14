import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasConfirmedEmail } from "./email-confirmation.ts";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("only users with an email confirmation timestamp are confirmed", () => {
  assert.equal(hasConfirmedEmail(null), false);
  assert.equal(hasConfirmedEmail({ email_confirmed_at: null }), false);
  assert.equal(hasConfirmedEmail({ email_confirmed_at: "" }), false);
  assert.equal(
    hasConfirmedEmail({ email_confirmed_at: "2026-07-13T12:00:00.000Z" }),
    true
  );
});

test("every registration entry point checks email confirmation", () => {
  const soloPage = readSource("../../app/register/solo/page.tsx");
  const soloForm = readSource("../../app/register/solo/RegisterForm.tsx");
  const teamPage = readSource("../../app/register-team/page.tsx");
  const teamRoute = readSource("../../app/register-team/submit/route.ts");

  assert.match(soloPage, /hasConfirmedEmail\(user\)/);
  assert.match(soloForm, /hasConfirmedEmail\(user\)/);
  assert.match(teamPage, /hasConfirmedEmail\(user\)/);
  assert.match(teamRoute, /hasConfirmedEmail\(user\)/);
  assert.match(teamRoute, /status: 403/);
});

test("logged-out registration screens require login", () => {
  const soloPage = readSource("../../app/register/solo/page.tsx");
  const teamPage = readSource("../../app/register-team/page.tsx");

  assert.match(soloPage, /<SectionHeading>Login Required<\/SectionHeading>/);
  assert.match(soloPage, /You must be logged in to register for the event\./);
  assert.match(teamPage, /<SectionHeading>Login Required<\/SectionHeading>/);
  assert.match(teamPage, /You must be logged in to register for the event\./);
});

test("account information only syncs for confirmed emails", () => {
  const signupPage = readSource("../../app/signup/page.tsx");
  const loginPage = readSource("../../app/login/page.tsx");
  const accountPage = readSource("../../app/account/page.tsx");
  const accountRoute = readSource("../../app/api/account/profile/route.ts");
  const syncModule = readSource("./sync-registration-profile.ts");

  assert.match(signupPage, /data\.session && hasConfirmedEmail\(data\.user\)/);
  assert.match(loginPage, /hasConfirmedEmail\(data\.user\)/);
  assert.match(
    accountPage,
    /user\.email && hasConfirmedEmail\(user\)/
  );
  assert.ok((accountRoute.match(/hasConfirmedEmail\(user\)/g) ?? []).length >= 2);
  assert.match(syncModule, /if \(!hasConfirmedEmail\(user\)\)/);
});

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

test("an unconfirmed account can request a new confirmation email", () => {
  // Supabase treats a repeat signup as a success and sends nothing, so without
  // a resend path a rider who signs up twice waits forever for an email that
  // was never sent. This is what the auth log recorded as user_repeated_signup.
  const resend = readSource("../../components/ResendConfirmation.tsx");
  const successPage = readSource("../signup/success/page.tsx");
  const loginPage = readSource("../login/page.tsx");

  assert.match(resend, /supabase\.auth\.resend\(/);
  assert.match(resend, /type: "signup"/);

  // Offered both straight after signup and on the login failure that sends
  // people looking for the email in the first place.
  assert.match(successPage, /<ResendConfirmation \/>/);
  assert.match(loginPage, /needsConfirmation && \(/);
});

test("the resend box does not reveal whether an account exists", () => {
  const resend = readSource("../../components/ResendConfirmation.tsx");

  // The same wording regardless of outcome. Comments are stripped first: this
  // file explains the rule in prose, and matching that would pass or fail on
  // the explanation rather than on the code.
  const code = resend
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  assert.match(code, /If an account is waiting to be confirmed/);
  assert.doesNotMatch(code, /no account (with|for) that email/i);

  // Repeat presses are rate-limited by Supabase, so the button holds itself
  // shut rather than firing requests that quietly fail.
  assert.match(resend, /COOLDOWN_SECONDS/);
});

test("a pending email address never travels in the URL", () => {
  const signupPage = readSource("../signup/page.tsx");
  const resend = readSource("../../components/ResendConfirmation.tsx");

  // sessionStorage, not a query string: an address in a URL ends up in browser
  // history, server logs and anything the link is pasted into.
  assert.match(signupPage, /sessionStorage\.setItem\(PENDING_EMAIL_KEY/);
  assert.match(resend, /sessionStorage\.getItem\(PENDING_EMAIL_KEY\)/);
  assert.doesNotMatch(signupPage, /success\?[^`"']*email=/);
});

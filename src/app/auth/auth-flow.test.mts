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

test("Google sign-in has its own callback and never borrows the confirmation route", () => {
  const button = readSource("../../components/GoogleSignInButton.tsx");
  const callback = readSource("./callback/route.ts");
  const confirmRoute = readSource("./confirm/route.ts");

  assert.match(button, /signInWithOAuth/);
  assert.match(button, /provider: "google"/);
  assert.match(button, /"\/auth\/callback"/);
  assert.match(callback, /exchangeCodeForSession/);

  // /auth/confirm signs the user straight back out when a code arrives on a
  // first confirmation. Routing OAuth through it would end the session that
  // sign-in just opened, so the two flows stay apart.
  assert.match(confirmRoute, /supabase\.auth\.signOut\(\)/);
  assert.doesNotMatch(callback, /signOut/);
});

test("both entry pages offer Google alongside the password form", () => {
  const loginPage = readSource("../login/page.tsx");
  const signupPage = readSource("../signup/page.tsx");

  assert.match(loginPage, /<GoogleSignInButton/);
  assert.match(signupPage, /<GoogleSignInButton/);
});

test("a Google account completes its profile before it can register", () => {
  // Google returns an email, a name and an avatar — no age, location or phone.
  const callback = readSource("./callback/route.ts");
  const soloPage = readSource("../register/solo/page.tsx");
  const teamPage = readSource("../register-team/page.tsx");

  assert.match(callback, /isAccountProfileComplete/);
  assert.match(callback, /"\/complete-profile"/);

  // Both registration entry points render the rider fields locked and filled
  // from the account, so an incomplete account reaching one would face blank
  // boxes it cannot type into.
  for (const page of [soloPage, teamPage]) {
    assert.match(page, /isAccountProfileComplete\(authMetadata\)/);
    assert.match(page, /redirect\(`\/complete-profile\?next=/);
  }
});

test("the completion step cannot change the address entries are matched on", () => {
  const form = readSource("../complete-profile/CompleteProfileForm.tsx");

  // The email is the identity: solo rows follow the account id, but a team
  // rider is linked to their entry by address alone. It arrives verified from
  // Google and is shown here, never edited.
  assert.match(form, /value=\{email\}\s*readOnly/);
  assert.doesNotMatch(form, /setEmail/);

  // One writer for profile data, shared with the account page.
  assert.match(form, /"\/api\/account\/profile"/);
  assert.match(form, /method: "PATCH"/);
});

test("a complete profile means the same thing to the form and to the sync", () => {
  const accountProfile = readSource("../../lib/account-profile.ts");
  const syncModule = readSource("../../lib/supabase/sync-registration-profile.ts");

  // If these two drifted, an account could read as complete, skip the step, and
  // still be refused by the sync — with no field left to fix it in.
  assert.match(accountProfile, /parsed >= 1 && parsed <= 120/);
  assert.match(syncModule, /min: 1, max: 120/);
});

test("a phone photo is normalised in the browser before upload", () => {
  // Riders register from phones: an iPhone shoots HEIC and a camera file is
  // routinely 8-12 MB. Both are decoded, rotated, downscaled and re-encoded
  // to JPEG client-side, so the bucket only ever receives modest JPEGs and a
  // rider never sees "unsupported format" for their own phone's photo.
  const headshots = readSource("../../lib/headshots.ts");

  assert.match(headshots, /createImageBitmap/);
  assert.match(headshots, /imageOrientation: "from-image"/);
  assert.match(headshots, /canvas\.toBlob/);
  assert.match(headshots, /HEADSHOT_UPLOAD_TYPE = "image\/jpeg"/);

  // `image/*` keeps the camera option on Android and does not refuse HEIC on
  // iOS; `capture` would force the camera and remove the gallery.
  assert.match(headshots, /HEADSHOT_ACCEPT = "image\/\*"/);
  const upload = readSource("../../components/HeadshotUpload.tsx");
  assert.doesNotMatch(upload, /capture=/);
});

test("headshots are private and owner-scoped in storage", () => {
  const migration = readSource(
    "../../../supabase/migrations/20260729020000_rider_headshots.sql"
  );

  // A rider uploading a photo to enter a competition has not agreed to it
  // being served from a permanent public URL.
  assert.match(migration, /'rider-headshots',\s*\n\s*false,/);

  // Every policy pins the first path segment to the caller, so the browser
  // cannot write outside its own folder whatever path it constructs.
  const ownerChecks = migration.match(
    /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g
  );
  assert.ok((ownerChecks ?? []).length >= 5);

  // Admins read every headshot for check-in, but cannot alter one.
  assert.match(migration, /for select\s*\n\s*to authenticated\s*\n\s*using \(bucket_id = 'rider-headshots' and public\.is_admin\(\)\)/);
  assert.doesNotMatch(migration, /is_admin\(\)[\s\S]*for (insert|update|delete)/);
});

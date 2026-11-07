import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isOwnRegistration, normaliseIdentityText } from "../../lib/registration-identity.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const migration = repoFile("supabase/migrations/20261108100000_paper_rider_headshots.sql");
const uploadRoute = repoFile("src/app/api/admin/headshots/route.ts");
const headshotUrls = repoFile("src/lib/admin/headshot-urls.ts");
const sync = repoFile("src/lib/supabase/sync-registration-profile.ts");
const registrationsRoute = repoFile("src/app/api/admin/registrations/route.ts");
const cell = repoFile("src/app/admin/SoloHeadshotCell.tsx");
const nextConfig = repoFile("next.config.ts");
const checkInRoute = repoFile("src/app/api/admin/check-in/route.ts");
const riderDetail = repoFile("src/lib/scoring/rider-detail.ts");
const accountRoute = repoFile("src/app/api/account/profile/route.ts");
const accountLoader = repoFile("src/app/account/page.tsx");
const accountPage = repoFile("src/app/account/AccountPage.tsx");
const dashboard = repoFile("src/app/admin/AdminDashboard.tsx");
const identity = repoFile("src/lib/registration-identity.ts");
const soloPage = repoFile("src/app/register/solo/page.tsx");
const soloForm = repoFile("src/app/register/solo/RegisterForm.tsx");
const soloSuccess = repoFile("src/app/register/solo/success/page.tsx");
const soloCodeRoute = repoFile("src/app/api/registration/confirmation-code/route.ts");

/* The text between a marker and the next top-level declaration. */
const sectionOf = (source: string, marker: string) => {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} exists`);
  const rest = source.slice(start + marker.length);
  const end = rest.search(/\n(export )?(const|async function|function) /);
  return source.slice(start, start + marker.length + (end === -1 ? rest.length : end));
};

test("a registration is the holder's own only when email and full name both match", () => {
  const account = { email: "Rider@Example.com", full_name: "Gurpreet  Singh" };

  // Case, surrounding spaces and runs of spaces don't matter.
  assert.equal(normaliseIdentityText("  Gurpreet \t  Singh\n"), "gurpreet singh");
  assert.equal(
    isOwnRegistration({ email: " rider@example.COM ", full_name: "gurpreet singh" }, account),
    true
  );
  // Same email, another rider's name: a rider the account entered.
  assert.equal(isOwnRegistration({ email: "rider@example.com", full_name: "Harjit Kaur" }, account), false);
  // Same name, another email.
  assert.equal(isOwnRegistration({ email: "other@example.com", full_name: "Gurpreet Singh" }, account), false);
  // Empty or missing values never match, even each other.
  assert.equal(isOwnRegistration({ email: "", full_name: "" }, { email: "", full_name: "" }), false);
  assert.equal(isOwnRegistration({ email: "rider@example.com", full_name: "Gurpreet Singh" }, { email: "rider@example.com" }), false);
  assert.equal(isOwnRegistration({ email: null, full_name: 42 }, account), false);
  // Loadable by the tests on its own: no imports.
  assert.doesNotMatch(identity, /^import /m);
});

test("a no-account rider's photo can only point into its own registration's folder", () => {
  assert.match(migration, /add column if not exists headshot_path text/);
  assert.match(migration, /'\^paper\/' \|\| id::text \|\| '\//);
  assert.match(migration, /grant select \(headshot_path\) on public\.solo_registrations to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update)[^;]*headshot_path/i);
  assert.match(headshotUrls, /export const readPaperHeadshotPath/);
});

test("admins add or replace a photo, and every upload is audited first", () => {
  assert.match(uploadRoute, /verifyAdminRequest\(\)/);
  // A first photo fills an empty slot; a replacement only overwrites the
  // photo the request saw.
  assert.match(uploadRoute, /\.is\("headshot_path", null\)/);
  assert.match(uploadRoute, /update\.eq\("headshot_path", previousPath\)/);
  assert.equal(
    (uploadRoute.match(/action: previousPath \? "replace_headshot" : "add_headshot"/g) ?? []).length,
    2
  );
  assert.match(uploadRoute, /upsert: false/);

  // In both stores: audited before the upload, the old object deleted only
  // after the new one is recorded.
  for (const marker of ["const saveAccountHeadshot", "const saveRegistrationHeadshot"]) {
    const body = sectionOf(uploadRoute, marker);
    const audit = body.indexOf("insertRequiredAuditLog(");
    const upload = body.indexOf(".upload(path");
    const removeOld = body.indexOf(".remove([previousPath])");
    assert.ok(audit !== -1 && audit < upload, `${marker}: audit before upload`);
    assert.ok(upload < removeOld, `${marker}: old photo removed after the new one is stored`);
  }

  assert.match(dashboard, /replace_headshot: "Replace Rider Photo"/);
  assert.match(dashboard, /remove_headshot: "Remove Rider Photo"/);
});

test("an upload goes onto the account only for the holder's own registration", () => {
  // Decided by the registration's profile_id and the rule, never by email.
  assert.doesNotMatch(uploadRoute, /findProfileIdByEmail/);
  assert.doesNotMatch(uploadRoute, /\.ilike\(/);
  const holder = sectionOf(uploadRoute, "const findOwnHolder");
  assert.match(holder, /registration\.profile_id/);
  assert.match(holder, /auth\.admin\.getUserById\(profileId\)/);
  assert.match(holder, /isOwnRegistration\(registration, \{\s*email: data\.user\.email,\s*full_name: metadata\.full_name,/);
  assert.match(holder, /holder: own \? \{ profileId, metadata \} : null/);

  // A photo already on the registration is the one replaced; otherwise the
  // account only for the holder, the registration row for everyone else.
  const post = sectionOf(uploadRoute, "export async function POST");
  assert.match(post, /if \(!registrationPath\) \{[\s\S]*?if \(found\.holder\) \{\s*return saveAccountHeadshot\(/);
  assert.match(post, /return saveRegistrationHeadshot\(/);
});

test("a claimed paper entry's photo moves onto the rider's account", () => {
  assert.match(sync, /movePaperHeadshotToAccount\(serviceSupabase, userId, row\)/);
  assert.match(sync, /\.copy\(paperPath, accountPath\)/);
  // The account's own photo is never replaced.
  assert.match(sync, /metadata\.headshot_path !== ""\) \{\s*return;/);
});

test("deleting a solo entry removes its registration photo", () => {
  assert.match(registrationsRoute, /operation === "delete_solo"[\s\S]*?readPaperHeadshotPath/);
  assert.match(registrationsRoute, /\.remove\(\[paperHeadshotPath\]\)/);
});

test("the add-photo menu offers files and the camera; photos open in a pop-up", () => {
  assert.match(cell, /Choose from files/);
  assert.match(cell, /Take photo/);
  assert.match(cell, /capture="environment"/);
  assert.match(cell, /getUserMedia/);
  assert.doesNotMatch(cell, /target="_blank"/);
  assert.match(cell, /aria-modal="true"/);
});

test("only admin pages may use the camera", () => {
  assert.match(nextConfig, /value: "camera=\(\), microphone=\(\), geolocation=\(\)"/);
  assert.match(nextConfig, /source: "\/admin\/:path\*",\s*headers: \[\{ key: "Permissions-Policy", value: "camera=\(self\)/);
});

test("admins can replace or remove a photo from the pop-up, removal after confirming, audited", () => {
  assert.match(cell, /Replace photo/);
  assert.match(cell, /onReplace=\{replaceFrom\}/);
  assert.match(cell, /replace\("files"\)[\s\S]*?Choose from files/);
  assert.match(cell, /replace\("camera"\)[\s\S]*?Take photo/);
  assert.match(cell, /Remove photo/);
  assert.match(cell, /Remove this photo\?/);
  assert.match(cell, /method: "DELETE"/);
  assert.match(uploadRoute, /export async function DELETE/);
  assert.match(uploadRoute, /DELETE[\s\S]*?verifyAdminRequest\(\)/);
  assert.match(uploadRoute, /action: "remove_headshot"/);
  // The audit record is written before anything is removed.
  assert.ok(
    uploadRoute.indexOf('action: "remove_headshot"') <
      uploadRoute.indexOf("headshot_path: null")
  );
});

test("removing an account photo is allowed only for the holder's own registration", () => {
  const remove = sectionOf(uploadRoute, "export async function DELETE");
  assert.match(remove, /findOwnHolder\(serviceSupabase, registration\)/);
  assert.match(remove, /const accountPath = holder \? readOwnHeadshotPath\(holder\.profileId, holder\.metadata\) : null;/);
  // The registration's own photo goes first, as it is the one shown.
  assert.ok(remove.indexOf("if (registrationPath) {") < remove.indexOf("if (holder && accountPath) {"));
  assert.match(remove, /\.remove\(\[registrationPath\]\)/);
  assert.match(remove, /\.remove\(\[accountPath\]\)/);
});

test("staff screens show the registration's photo first, the account's only for the holder", () => {
  // The Solo riders list.
  const match = sectionOf(headshotUrls, "export const matchSoloHeadshots");
  assert.match(
    match,
    /readPaperHeadshotPath\(registration\.id, registration\.headshot_path\) \?\?\s*\(account && isOwnRegistration\(registration, account\) \? account\.path : null\)/
  );
  assert.doesNotMatch(match, /email\?\.trim\(\)/);

  // The check-in desk and the commentary panel, for solo riders.
  const solo = sectionOf(headshotUrls, "export const getSoloHeadshotUrl");
  assert.ok(solo.indexOf("getPaperHeadshotUrl(") < solo.indexOf("getOwnAccountHeadshotUrl("));
  assert.match(
    sectionOf(headshotUrls, "export const getOwnAccountHeadshotUrl"),
    /url && isOwnRegistration\(registration, account\) \? url : null/
  );
  assert.match(checkInRoute, /getSoloHeadshotUrl\(serviceSupabase, data\)/);
  assert.match(riderDetail, /getSoloHeadshotUrl\(client, solo\)/);

  // Team riders: the email lookup stays, but only an account whose name is
  // the rider's counts.
  const team = sectionOf(headshotUrls, "export const getTeamRiderHeadshotUrl");
  assert.match(team, /findProfileIdByEmail\(client, rider\.email\)/);
  assert.match(team, /getOwnAccountHeadshotUrl\(client, profileId, rider\)/);
  assert.match(checkInRoute, /getTeamRiderHeadshotUrl\(/);
  assert.match(riderDetail, /getTeamRiderHeadshotUrl\(/);
  for (const source of [checkInRoute, riderDetail]) {
    assert.doesNotMatch(source, /findProfileIdByEmail|getHeadshotUrl\b/);
  }
});

test("account edits reach only the holder's own registration rows", () => {
  const body = sectionOf(sync, "export const syncRegistrationProfile = async");
  assert.match(body, /isOwnRegistration\(row, \{ email: address, full_name: previousFullName \}\)/);
  // Solo: the account's rows, filtered by the rule, then only those ids.
  assert.match(body, /\.filter\(isHoldersOwn\)/);
  assert.match(body, /\.update\(soloUpdates\)\s*\.in\("id", ownSoloIds\)\s*\.eq\("profile_id", userId\)/);
  assert.doesNotMatch(body, /\.update\(soloUpdates\)\s*\.eq\("profile_id", userId\)/);
  // Team: found by email, written only for the holder's own row.
  assert.match(body, /if \(isHoldersOwn\(row\)\) \{\s*memberIds\.add\(row\.id\);/);
  assert.match(body, /\.update\(memberUpdates\)\s*\.in\("id", \[\.\.\.memberIds\]\)/);
  assert.doesNotMatch(body, /\.update\(memberUpdates\)\s*\.ilike\(/);

  // The previous name is captured before the account update, like the email.
  assert.ok(accountRoute.indexOf("const previousFullName") < accountRoute.indexOf("supabase.auth.updateUser("));
  assert.match(accountRoute, /previousEmail,\s*previousFullName,\s*registrationEmail,/);
  // A claimed paper photo moves onto the account only for the holder's own entry.
  assert.match(sync, /if \(!isOwnRegistration\(row, \{ email: userData\.user\.email, full_name: metadata\.full_name \}\)\) \{\s*return;/);
});

test("the account page lists every registration the account entered", () => {
  assert.doesNotMatch(
    accountLoader,
    /from\("solo_registrations"\)\s*\.select\([^)]*\)\s*\.eq\("profile_id", user\.id\)\s*\.maybeSingle\(\)/
  );
  assert.match(accountLoader, /\.eq\("profile_id", user\.id\)\s*\.order\("created_at"/);
  assert.match(accountLoader, /isOwnRegistration\(row, \{ email: user\.email, full_name: authMetadata\.full_name \}\)/);
  assert.match(accountLoader, /enteredRegistrations=\{enteredRegistrations\}/);
  assert.match(accountPage, /Registrations You Entered/);
  assert.match(accountPage, /edited by an\s+administrator/);
  assert.match(accountPage, /entry\.confirmation_code/);
});

test("any account may enter several solo riders; later riders start blank, with no photo box", () => {
  // No one-entry gate on the solo page, for anyone.
  assert.doesNotMatch(soloPage, /You have already registered for solo competition/);
  assert.doesNotMatch(soloPage, /!isAdmin && existingRegistration/);
  assert.match(soloPage, /Registering another rider\? Enter their details below\./);
  assert.match(soloPage, /href="\/account"/);
  // Another rider: only email and phone carry over, fields unlocked.
  assert.match(soloPage, /lockProfileFields=\{!isAdmin && !enteringAnotherRider\}/);
  assert.match(soloPage, /\{ email: user\.email, phone: authMetadata\?\.phone \}/);
  // The photo box (the account's own photo) only for the holder's first entry.
  assert.match(soloPage, /showHeadshot=\{!isAdmin && !enteringAnotherRider\}/);
  assert.match(soloForm, /\{showHeadshot && \(\s*<div[^>]*>\s*<HeadshotUpload/);
  assert.match(soloForm, /This rider is already registered with this email or phone\./);
  // Finishing a registration clears the draft, so the next rider starts blank.
  assert.match(soloForm, /await deleteRegistrationDraft\("solo"\);/);
  // Success shows the newest entry and offers another.
  assert.match(soloSuccess, /Register Another Rider/);
  assert.match(soloSuccess, /href="\/register\/solo"/);
  for (const source of [soloSuccess, soloCodeRoute]) {
    assert.match(source, /\.order\("created_at", \{ ascending: false \}\)\s*\.limit\(1\)\s*\.maybeSingle\(\)/);
  }
});

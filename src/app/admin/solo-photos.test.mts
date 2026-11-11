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
const section = repoFile("src/app/admin/AdminDashboardSection.tsx");
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

  // The account's only registration: the email must still match, the name
  // need not (an administrator may have corrected its spelling).
  const only = { onlyRegistration: true };
  assert.equal(isOwnRegistration({ email: "RIDER@example.com", full_name: "Gurpreet Singh Gill" }, account, only), true);
  assert.equal(isOwnRegistration({ email: "rider@example.com", full_name: "" }, account, only), true);
  assert.equal(isOwnRegistration({ email: "other@example.com", full_name: "Gurpreet Singh" }, account, only), false);
  assert.equal(isOwnRegistration({ email: "", full_name: "Gurpreet Singh" }, { email: "", full_name: "Gurpreet Singh" }, only), false);
  // Without the option (several registrations, a team row, or any write)
  // the name counts.
  assert.equal(isOwnRegistration({ email: "rider@example.com", full_name: "Gurpreet Singh Gill" }, account), false);
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
  assert.match(holder, /isOwnRegistration\(\s*registration,\s*\{ email: data\.user\.email, full_name: metadata\.full_name \},\s*\{ onlyRegistration: count === 1 \}/);
  // The count is by profile_id, and a failed count refuses rather than guesses.
  assert.match(holder, /\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("profile_id", profileId\)/);
  assert.match(holder, /if \(countError\) \{\s*return \{ ok: false \};/);
  assert.match(holder, /holder: own \? \{ profileId, metadata \} : null/);

  // A photo already on the registration is the one replaced; otherwise the
  // account only for the holder, the registration row for everyone else.
  const post = sectionOf(uploadRoute, "export async function POST");
  assert.match(post, /if \(kind === "solo" && !registrationPath\) \{[\s\S]*?if \(found\.holder\) \{\s*return saveAccountHeadshot\(/);
  assert.match(post, /return saveRegistrationHeadshot\(/);
});

test("a claimed paper entry's photo moves onto the rider's account", () => {
  assert.match(sync, /movePaperHeadshotToAccount\(serviceSupabase, userId, row\)/);
  assert.match(sync, /\.copy\(paperPath, accountPath\)/);
  // The account's own photo is never replaced.
  assert.match(sync, /metadata\.headshot_path !== ""\) \{\s*return;/);
});

test("deleting a solo entry or a team removes its registration photos", () => {
  assert.match(registrationsRoute, /operation === "delete_solo"[\s\S]*?readPaperHeadshotPath/);
  assert.match(registrationsRoute, /operation === "delete_team"[\s\S]*?from\("team_members"\)[\s\S]*?\.eq\("team_id", targetId\)[\s\S]*?readPaperHeadshotPath\(memberId, member\.headshot_path\)/);
  assert.match(registrationsRoute, /\.remove\(ownHeadshots\.map\(\(headshot\) => headshot\.path\)\)/);
  // Removed only after the database delete succeeded.
  assert.ok(
    registrationsRoute.indexOf('rpc("admin_mutate_registration"') <
      registrationsRoute.indexOf(".remove(ownHeadshots"),
    "photos are removed after the registration is deleted"
  );
});

test("the add-photo menu offers files and the camera; photos open in a pop-up", () => {
  assert.match(cell, /Choose from files/);
  assert.match(cell, /Take photo/);
  assert.match(cell, /capture="environment"/);
  assert.match(cell, /getUserMedia/);
  assert.doesNotMatch(cell, /target="_blank"/);
  assert.match(cell, /aria-modal="true"/);
});

test("only this site's own pages may use the camera, on every page", () => {
  // Site-wide, so an admin who reaches /admin by a link from another page
  // isn't left with that page's policy blocking the camera.
  assert.match(nextConfig, /value: "camera=\(self\), microphone=\(\), geolocation=\(\)"/);
  assert.doesNotMatch(nextConfig, /camera=\(\)/);
  assert.doesNotMatch(nextConfig, /camera=\*/);
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
  assert.match(match, /let path = soloPathOf\(index\.accountById, registration, rowsByProfile\);/);
  assert.match(
    sectionOf(headshotUrls, "const soloPathOf = ("),
    /readPaperHeadshotPath\(registration\.id, registration\.headshot_path\) \?\?\s*\(account &&\s*isOwnRegistration\(registration, account, \{\s*onlyRegistration: rowsByProfile\.get\(registration\.profile_id \?\? ""\) === 1,/
  );
  assert.doesNotMatch(match, /email\?\.trim\(\)/);

  // The check-in desk and the commentary panel, for solo riders.
  const solo = sectionOf(headshotUrls, "export const getSoloHeadshotUrl");
  assert.ok(solo.indexOf("getPaperHeadshotUrl(") < solo.indexOf("getOwnAccountHeadshotUrl("));
  assert.match(
    sectionOf(headshotUrls, "export const getOwnAccountHeadshotUrl"),
    /url && isOwnRegistration\(registration, account, \{ onlyRegistration \}\) \? url : null/
  );
  assert.match(solo, /onlyRegistration: await isOnlySoloRegistration\(client, registration\.profile_id\)/);
  assert.match(checkInRoute, /getSoloHeadshotUrl\(serviceSupabase, data\)/);
  assert.match(riderDetail, /getLinkedSoloHeadshotUrl\(client, solo\)/);

  // Team riders: the email lookup stays, but only an account whose name is
  // the rider's counts.
  const team = sectionOf(headshotUrls, "export const getTeamRiderHeadshotUrl");
  assert.match(team, /findProfileIdByEmail\(client, rider\.email\)/);
  // No onlyRegistration for team riders: they have no account id, so the
  // name is always required.
  assert.match(team, /getOwnAccountHeadshotUrl\(client, profileId, rider\);/);
  assert.match(checkInRoute, /getTeamRiderHeadshotUrl\(/);
  assert.match(riderDetail, /getLinkedTeamRiderHeadshotUrl\(/);
  for (const source of [checkInRoute, riderDetail]) {
    assert.doesNotMatch(source, /findProfileIdByEmail|getHeadshotUrl\b/);
  }
});

test("account edits reach only the holder's own registration rows", () => {
  const body = sectionOf(sync, "export const syncRegistrationProfile = async");
  // Solo: the account's rows, filtered by the rule, then only those ids. A
  // write never relaxes the name, not even for the account's only row.
  assert.match(body, /isOwnRegistration\(row, \{ email: address, full_name: previousFullName \}\)/);
  assert.match(body, /\.filter\(isHoldersOwnSolo\)/);
  assert.doesNotMatch(sync, /onlyRegistration/);
  assert.match(body, /\.update\(soloUpdates\)\s*\.in\("id", ownSoloIds\)\s*\.eq\("profile_id", userId\)/);
  assert.doesNotMatch(body, /\.update\(soloUpdates\)\s*\.eq\("profile_id", userId\)/);
  // Team: found by email, written only for the holder's own row.
  assert.match(body, /if \(isHoldersOwnTeam\(row\)\) \{\s*memberIds\.add\(row\.id\);/);
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
  assert.match(accountLoader, /\{ email: user\.email, full_name: authMetadata\.full_name \},[\s\S]{0,200}\{ onlyRegistration: accountSoloRows\.length === 1 \}/);
  assert.match(accountLoader, /enteredRegistrations=\{enteredRegistrations\}/);
  assert.match(accountPage, /Registrations You Entered/);
  assert.match(accountPage, /edited by an\s+administrator/);
  assert.match(accountPage, /entry\.confirmation_code/);
});

test("any account may enter several solo riders; later riders share the account's contact details, with no photo box", () => {
  // No one-entry gate on the solo page, for anyone.
  assert.doesNotMatch(soloPage, /You have already registered for solo competition/);
  assert.doesNotMatch(soloPage, /!isAdmin && existingRegistration/);
  assert.match(soloPage, /Registering another rider\? Enter their details below\./);
  assert.match(soloPage, /href="\/account"/);
  // Another rider is unlocked, with only the account's email and phone
  // prefilled: riders may share contact details (7 Nov 2026).
  assert.match(soloPage, /lockContactFields=\{!isAdmin && !enteringAnotherRider\}/);
  assert.match(soloPage, /\? \/\/ Another rider: only the contact details carry over\.[\s\S]*?\{ email: user\.email, phone: authMetadata\?\.phone \}\s*: \{/);
  assert.doesNotMatch(soloPage, /ownContactNote/);
  assert.doesNotMatch(soloForm, /ownContactNote|each rider needs their own email/);
  // The photo box (the account's own photo) only for the holder's first entry.
  assert.match(soloPage, /showHeadshot=\{!isAdmin && !enteringAnotherRider\}/);
  assert.match(soloForm, /\{headshotShown && \(\s*<div[^>]*>\s*<HeadshotUpload/);
  assert.match(soloForm, /This rider is already registered with this name and email or phone\./);
  // Finishing a registration clears the draft, so the next rider starts blank.
  assert.match(soloForm, /await deleteRegistrationDraft\("solo"\);/);
  // Success shows the newest entry and offers another.
  assert.match(soloSuccess, /Register Another Rider/);
  assert.match(soloSuccess, /href="\/register\/solo"/);
  assert.match(soloSuccess, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.doesNotMatch(soloSuccess, /\.maybeSingle\(\)/);
});

test("the code email goes only to the account holder's own registration", () => {
  // The holder's own row, chosen by the rule against the verified user, never
  // "the newest": an account can type any name and address into the form.
  assert.doesNotMatch(soloCodeRoute, /\.maybeSingle\(\)|\.limit\(1\)/);
  assert.match(soloCodeRoute, /isOwnRegistration\(\s*row,\s*\{ email: user\.email, full_name: user\.user_metadata\?\.full_name \},\s*\{ onlyRegistration: accountRows\.length === 1 \}/);
  assert.match(soloCodeRoute, /return NextResponse\.json\(\{ sent: false, reason: "shown_on_account" \}\);/);
  assert.ok(
    soloCodeRoute.indexOf('reason: "shown_on_account"') < soloCodeRoute.indexOf("sendEmail("),
    "another rider is answered before anything is sent"
  );
  // The success page says where that rider's code is instead.
  assert.match(soloSuccess, /emailed\s*\?[\s\S]*?: `This rider's code is not emailed\. It is shown on your account page/);
});

test("team rows are found only by confirmed addresses, never the remembered one", () => {
  const body = sectionOf(sync, "export const syncRegistrationProfile = async");
  const teamEmails = body.match(/const teamEmails = ([^;]+);/)?.[1] ?? "";
  assert.match(teamEmails, /previousEmail, syncEmail \? email : null/);
  assert.doesNotMatch(teamEmails, /registrationEmail/);
  assert.match(body, /for \(const address of teamEmails\) \{/);
  assert.doesNotMatch(body, /from\("team_members"\)[\s\S]*?registrationEmail/);
  // The remembered address reaches solo rows only.
  assert.match(body, /const soloEmails = \[previousEmail, registrationEmail\]/);

  // A second pending change keeps the oldest remembered address.
  assert.match(accountRoute, /emailChanging && !registrationEmail\s*\? \{ \[REGISTRATION_EMAIL_KEY\]: previousEmail \}/);
});

test("a first entry starts with the account's details, editable, photo box only for the holder", () => {
  // Name, age and location are prefilled but never locked: a parent may be
  // entering a child. Email and phone still follow the account.
  assert.doesNotMatch(soloForm, /lockProfileFields/);
  for (const field of ["full_name", "age", "location"]) {
    assert.match(soloForm, new RegExp(`restore\\(false, [^\\n]*initialValues\\?\\.${field}`));
  }
  assert.match(soloForm, /restore\(lockContactFields, initialValues\?\.phone/);
  assert.match(soloForm, /restore\(lockContactFields, initialValues\?\.email/);
  assert.match(soloForm, /These are your account details\. Registering someone else\? Change them to the\s+rider&apos;s\./);
  assert.match(soloPage, /holderName=\{\s*!isAdmin && !enteringAnotherRider \? authMetadata\?\.full_name \?\? "" : null\s*\}/);
  // The photo box follows the name as it is typed, normalised.
  assert.match(soloForm, /normaliseIdentityText\(fullName\) === normaliseIdentityText\(holderName\)/);
  assert.match(soloForm, /const headshotShown = showHeadshot && riderIsHolder;/);
});

test("the add button opens a pop-up to drag, take or choose a photo", () => {
  const popup = sectionOf(cell, "function AddPhotoPopup(");
  const picked = sectionOf(cell, "const pickDroppedImage = ");
  // The + opens the pop-up (not a menu, not the picker straight away).
  assert.match(cell, /onClick=\{openAdd\}/);
  assert.match(cell, /<AddPhotoPopup[\s\S]*?onFile=\{upload\}/);
  assert.doesNotMatch(cell, /data-photo-menu/);
  // Three ways in: a drop zone, Take photo, Choose file.
  assert.match(popup, /data-photo-drop/);
  assert.match(popup, /Drag a photo here/);
  assert.match(popup, />\s*Take photo\s*</);
  assert.match(popup, />\s*Choose file\s*</);
  // Only a drag carrying files lights it up; a non-image drop gets a clear message.
  assert.match(popup, /dataTransfer\.types\)\.includes\("Files"\)/);
  assert.match(popup, /pickDroppedImage\(event\.dataTransfer\.files\)/);
  assert.match(picked, /isn't an image\. Drop a photo \(JPG or PNG\) instead\./);
  // It closes once the photo is saved; Esc and a click outside come from Overlay.
  assert.match(popup, /if \(await onFile\(file\)\) \{\s*close\(\);/);
  assert.match(cell, /event\.key === "Escape"/);
  assert.match(cell, /event\.target === event\.currentTarget/);
  // Fits a phone.
  assert.match(popup, /w-\[min\(92vw,420px\)\]/);
  // Phone camera and the file picker both stay.
  assert.match(popup, /capture="environment"/);
  assert.match(popup, /accept=\{HEADSHOT_ACCEPT\}/);
  // The same upload path: same checks, same API, says when it saved.
  assert.match(
    sectionOf(cell, "const upload = async"),
    /validateHeadshotSource\(file\)[\s\S]*fetch\("\/api\/admin\/headshots", \{ method: "POST", body \}\)[\s\S]*return true;/
  );
  // The + button itself still takes a dropped picture.
  assert.match(cell, /onDrop=\{handleDrop\}/);
});

test("a rider's solo entry and team place share one photo, solo first (Form teams)", () => {
  // The Teams list: the solo entry's photo (same code) before the team row's,
  // and a rider with no photo yet gets it added on the solo entry.
  const teams = sectionOf(headshotUrls, "export const matchTeamHeadshots");
  assert.ok(
    teams.indexOf("soloTwinByCode.get(member.confirmation_code)") <
      teams.indexOf("readPaperHeadshotPath(member.id, member.headshot_path)"),
    "solo photo before the team row's"
  );
  assert.match(teams, /result\[member\.id\]\.target = \{ kind: "solo", id: twin\.id \};\s*continue;/);
  assert.match(teams, /\} else if \(twin\) \{[\s\S]*?target = \{ kind: "solo", id: twin\.id \}/);

  // The Solo riders list: the team place's own photo when the entry has none,
  // and Replace / Remove then act on the team place.
  const solo = sectionOf(headshotUrls, "export const matchSoloHeadshots");
  assert.match(solo, /if \(!path\) \{[\s\S]*?teamTwinByCode\.get\(registration\.confirmation_code\)/);
  assert.match(solo, /target = \{ kind: "team", id: twin\.id \}/);

  // The page loads both sides.
  assert.match(section, /\.select\("id, email, profile_id, full_name, headshot_path, confirmation_code"\)/);
  assert.match(section, /\.from\("team_members"\)\s*\.select\("id, confirmation_code, headshot_path"\)/);
  assert.match(section, /countSoloRowsByProfile\(soloRows\)/);

  // The commentary panel: the same rule, by code.
  assert.match(riderDetail, /getLinkedSoloHeadshotUrl\(client, solo\)/);
  assert.match(riderDetail, /full_name, confirmation_code, age/);
  const linkedTeam = sectionOf(headshotUrls, "export const getLinkedTeamRiderHeadshotUrl");
  assert.ok(linkedTeam.indexOf('.from("solo_registrations")') < linkedTeam.indexOf("getTeamRiderHeadshotUrl("));
  const linkedSolo = sectionOf(headshotUrls, "export const getLinkedSoloHeadshotUrl");
  assert.ok(linkedSolo.indexOf("getSoloHeadshotUrl(") < linkedSolo.indexOf('.from("team_members")'));

  // The cell takes the target the list hands it.
  assert.match(cell, /target\?: \{ kind: RiderKind; id: string \};/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeRidersByCode, type RiderMatch } from "./check-in-roster.ts";
import { phoneKey, riderNameKey } from "./paper-registration.ts";
import {
  normaliseIdentityText,
  phoneDigitsKey,
  sameRiderMatch,
} from "./registration-identity.ts";

/* Riders may share an email and a phone (7 Nov 2026). A true duplicate is the
   same full name in the same kind of entry with the same email or phone. */

const repoFile = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migration = repoFile("supabase/migrations/20261108120000_shared_contact_details.sql");
const revert = repoFile("supabase/migrations/revert/20261108120000_shared_contact_details.revert.sql");
const paperMigration = repoFile("supabase/migrations/20261025130000_paper_registrations.sql");
const teamSubmit = repoFile("src/app/register-team/submit/route.ts");
const headshotsRoute = repoFile("src/app/api/admin/headshots/route.ts");
const headshotUrls = repoFile("src/lib/admin/headshot-urls.ts");
const cell = repoFile("src/app/admin/SoloHeadshotCell.tsx");
const dashboard = repoFile("src/app/admin/AdminDashboard.tsx");
const section = repoFile("src/app/admin/AdminDashboardSection.tsx");
const checkInRoute = repoFile("src/app/api/admin/check-in/route.ts");
const riderDetail = repoFile("src/lib/scoring/rider-detail.ts");
const paperPanel = repoFile("src/app/admin/paper/PaperEntryPanel.tsx");
const runbook = repoFile("docs/event-day-runbook.md");

/* The text between `$tag$` pairs, in order. */
const quoted = (source: string, tag: string) =>
  [...source.matchAll(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, "g"))].map(
    (match) => match[1]
  );

const occurrences = (source: string, piece: string) => source.split(piece).length - 1;

// ---------------------------------------------------------------------------
// The migration

test("the four UNIQUE constraints go, constraint first, then any bare index", () => {
  for (const [table, name] of [
    ["solo_registrations", "solo_registrations_email_key"],
    ["solo_registrations", "solo_registrations_phone_key"],
    ["team_members", "team_members_email_key"],
    ["team_members", "team_members_phone_key"],
  ]) {
    const dropConstraint = `alter table public.${table} drop constraint if exists ${name};`;
    const dropIndex = `drop index if exists public.${name};`;
    assert.equal(occurrences(migration, dropConstraint), 1, dropConstraint);
    assert.ok(migration.indexOf(dropConstraint) < migration.indexOf(dropIndex), name);
  }
});

test("each table gets the two same-rider guard indexes and two lookup indexes", () => {
  for (const table of ["solo_registrations", "team_members"]) {
    assert.match(
      migration,
      new RegExp(
        `create unique index if not exists ${table}_same_rider_email_key\\s+on public\\.${table} \\(public\\.rider_name_key\\(full_name\\), lower\\(btrim\\(email\\)\\)\\);`
      )
    );
    assert.match(
      migration,
      new RegExp(
        `create unique index if not exists ${table}_same_rider_phone_key\\s+on public\\.${table} \\(public\\.rider_name_key\\(full_name\\), public\\.phone_digits\\(phone\\)\\)\\s+where public\\.phone_digits\\(phone\\) <> '';`
      )
    );
    assert.match(migration, new RegExp(`${table}_email_lower_idx\\s+on public\\.${table} \\(lower\\(btrim\\(email\\)\\)\\);`));
    assert.match(migration, new RegExp(`${table}_phone_digits_idx\\s+on public\\.${table} \\(public\\.phone_digits\\(phone\\)\\);`));
  }

  // The guard is built before the old constraints go, after the collision check.
  assert.ok(migration.indexOf("$collisions$") < migration.indexOf("same_rider_email_key"));
  assert.ok(migration.indexOf("same_rider_email_key") < migration.indexOf("drop constraint if exists"));
  // The collision check prints counts, never riders.
  const collisions = quoted(migration, "collisions")[0];
  assert.match(collisions, /having count\(\*\) > 1/);
  assert.match(collisions, /raise exception 'Existing registrations already repeat a rider/);
  assert.doesNotMatch(collisions, /raise[^;]*full_name/);
});

test("the index helpers are IMMUTABLE and executable by the role that inserts online", () => {
  for (const name of ["rider_name_key", "phone_digits"]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${name}\\(p_\\w+ text\\)\\s+returns text\\s+language sql\\s+immutable`)
    );
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(text\\) to authenticated, service_role;`));
  }
  // Not the service-role-only paper function: online inserts would fail.
  assert.doesNotMatch(migration, /create (unique )?index[^;]*paper_registration_phone_key/);
  assert.match(migration, /regexp_replace\(coalesce\(p_name, ''\), '\\s\+', ' ', 'g'\)/);
});

test("the helpers in code compare exactly as the database does", () => {
  assert.equal(riderNameKey("  Harpreet \t SINGH "), "harpreet singh");
  assert.equal(normaliseIdentityText("  Harpreet \t SINGH "), "harpreet singh");
  for (const phone of ["98765 43210", "+91-98765-43210", "123", " AbC "]) {
    assert.equal(phoneDigitsKey(phone), phoneKey(phone));
  }
  assert.equal(phoneDigitsKey("98765-43210"), "9876543210");
  assert.equal(phoneDigitsKey("12-3"), "12-3");
});

test("a true duplicate is the same name with the same email or phone; nothing else", () => {
  const rider = { full_name: "Harpreet Singh", email: "family@example.com", phone: "98765 43210" };

  assert.equal(sameRiderMatch(rider, { ...rider, full_name: " harpreet   SINGH" }), "email");
  assert.equal(sameRiderMatch(rider, { ...rider, email: "other@example.com", phone: "98765-43210" }), "phone");
  // A family: one email and one phone, two riders.
  assert.equal(sameRiderMatch(rider, { ...rider, full_name: "Simran Kaur" }), null);
  // Same name, different contact: two people with one name.
  assert.equal(sameRiderMatch(rider, { full_name: "Harpreet Singh", email: "b@example.com", phone: "11111 22222" }), null);
  // Blank values never match.
  assert.equal(sameRiderMatch({ full_name: "", email: "x@y.z" }, { full_name: "", email: "x@y.z" }), null);
  assert.equal(sameRiderMatch({ full_name: "A B", email: "", phone: "" }, { full_name: "A B", email: "", phone: "" }), null);
});

test("a code is reused only when the email and the name both match, in the other table", () => {
  const assignment = migration.slice(
    migration.indexOf("create or replace function public.assign_confirmation_code()"),
    migration.indexOf("-- Trigger-only function")
  );

  assert.match(assignment, /if may_reuse and tg_table_name = 'solo_registrations' then[\s\S]*?from public\.team_members as member/);
  assert.match(assignment, /elsif may_reuse then[\s\S]*?from public\.solo_registrations as solo/);
  assert.equal(occurrences(assignment, "= public.rider_name_key(new.full_name)"), 2);
  // Email alone no longer hands over a code.
  assert.doesNotMatch(assignment, /union all/);
  // The arrival state comes with a reused code; a fresh code starts clear.
  assert.match(assignment, /new\.checked_in_at := existing\.checked_in_at;/);
  assert.match(assignment, /new\.checked_in_at := null;/);
  assert.match(assignment, /security definer\s+set search_path = ''/);
  assert.match(migration, /revoke execute on function public\.assign_confirmation_code\(\) from anon, authenticated;/);

  // A code is handed over only for an insert the database can trust: no
  // token or the service role, an administrator, or an account entering a
  // row under its own email. Any other signed-in account could otherwise
  // insert another rider's name and email and be handed their code.
  assert.match(assignment, /claims jsonb := auth\.jwt\(\);/);
  assert.match(
    assignment,
    /may_reuse := claim_role is null\s+or claim_role = 'service_role'\s+or \(\s+claim_role = 'authenticated'\s+and \(\s+coalesce\(public\.is_admin\(\), false\)\s+or lower\(btrim\(coalesce\(claims ->> 'email', ''\)\)\) = lower\(btrim\(new\.email\)\)\s+\)\s+\);/
  );
  // The record is read only after a lookup ran (an unassigned record raises).
  assert.match(assignment, /found_existing := found;[\s\S]*?found_existing := found;/);
  assert.match(assignment, /if found_existing then\s+if existing\.confirmation_code is not null then/);
  assert.match(migration, /to_regprocedure\('auth\.jwt\(\)'\) is null/);
  assert.match(quoted(migration, "verify")[0], /position\('auth\.jwt\(\)' in trigger_body\) = 0/);
});

test("the paper function's anchors are in its source once and the patch drops the cross-kind phone refusal", () => {
  const anchors = quoted(migration, "anchor");
  const replacements = quoted(migration, "replacement");
  assert.equal(anchors.length, 2);
  assert.equal(replacements.length, 2);

  let body = paperMigration;

  anchors.forEach((anchor, index) => {
    assert.equal(occurrences(body, anchor), 1, `anchor ${index + 1} occurs once`);
    body = body.replace(anchor, replacements[index]);
  });

  assert.doesNotMatch(body, /under a different email/);
  assert.doesNotMatch(body, /already used by another rider on this form/);
  assert.match(body, /where p_type = 'solo'\s+and public\.rider_name_key\(solo\.full_name\) = public\.rider_name_key\(rider ->> 'full_name'\)/);
  assert.match(body, /where p_type = 'team'\s+and public\.rider_name_key\(member\.full_name\) = public\.rider_name_key\(rider ->> 'full_name'\)/);
  assert.match(body, /Same name and email \(%\) as another rider on this form\./);
  assert.match(body, /is already registered with email %s \(%s\)\./);
  // Duplicates still carry the hint the route turns into 409; the lock stays.
  assert.match(body, /hint = 'duplicate_registration'/);
  assert.match(body, /pg_advisory_xact_lock/);

  // A second run finds every replacement and changes nothing.
  for (const replacement of replacements) {
    assert.equal(occurrences(body, replacement), 1);
  }
  assert.match(migration, /if position\(p_replacement in v_original\) > 0 then\s+raise notice/);

  // The revert swaps each replacement back for its anchor.
  const patched = quoted(revert, "patched");
  const original = quoted(revert, "original");
  assert.deepEqual(patched, replacements);
  assert.deepEqual(original, anchors);
});

test("team riders get their own photo column, confined to their own folder", () => {
  assert.match(migration, /alter table public\.team_members\s+add column if not exists headshot_path text;/);
  assert.match(migration, /add constraint team_members_headshot_path_own_folder\s+check \(\s*headshot_path is null\s+or headshot_path ~ \('\^paper\/' \|\| id::text \|\| '\/\[A-Za-z0-9\._-\]\{1,200\}\$'\)/);
  assert.match(migration, /grant select \(headshot_path\) on public\.team_members to authenticated;/);
  assert.doesNotMatch(migration, /grant (insert|update)[^;]*headshot_path/i);
});

test("the migration checks itself and tells PostgREST", () => {
  const verify = quoted(migration, "verify")[0];
  assert.match(verify, /'solo_registrations_email_key',\s*'solo_registrations_phone_key',\s*'team_members_email_key',\s*'team_members_phone_key'/);
  assert.match(verify, /indisunique/);
  assert.match(verify, /position\('rider_name_key' in trigger_body\) = 0/);
  assert.match(verify, /position\('under a different email' in paper_body\) > 0/);
  assert.match(verify, /attname = 'headshot_path'/);
  assert.match(verify, /provolatile = 'i'/);
  assert.ok(migration.trimEnd().endsWith("notify pgrst, 'reload schema';"));
  assert.ok(revert.trimEnd().endsWith("notify pgrst, 'reload schema';"));
  // Sorts after the migrations it builds on.
  assert.ok("20261108120000" > "20261108110000");
  assert.match(migration, /to_regprocedure\('public\.admin_create_paper_registration\(text, jsonb, uuid, text, text\)'\) is null/);
});

// ---------------------------------------------------------------------------
// The online team wizard

test("the team route refuses only the same name with the same email or phone", () => {
  assert.doesNotMatch(teamSubmit, /Each rider must have a unique email address and phone number/);
  assert.doesNotMatch(teamSubmit, /already registered on a team and cannot register another team/);
  assert.match(teamSubmit, /import \{ sameRiderMatch \} from "@\/lib\/registration-identity";/);
  // Within the form, then against every team rider (never solo entries: a
  // rider's own solo entry is fine and shares their code).
  assert.match(teamSubmit, /is entered twice on this team with the same email or phone\./);
  assert.match(teamSubmit, /\$\{rider\.fullName\} is already registered on a team with this \$\{matched\}\./);
  assert.match(teamSubmit, /\.from\("team_members"\)\s*\.select\("full_name, email, phone"\)\s*\.ilike\("full_name", looseNamePattern\(rider\.fullName\)\)/);
  assert.doesNotMatch(teamSubmit, /from\("solo_registrations"\)/);
  assert.match(teamSubmit, /name\.trim\(\)\.split\(\/\\s\+\/\)\.map\(escapeIlikePattern\)\.join\("%"\)/);
  // The unique index is the backstop.
  assert.match(teamSubmit, /already registered on a team with this name and email or phone\./);
});

// ---------------------------------------------------------------------------
// Photos for team riders

test("the photo route takes a kind, solo by default, and keeps team photos on the row", () => {
  assert.match(headshotsRoute, /const readKind = \(value: unknown\): RiderKind \| null =>/);
  assert.match(headshotsRoute, /value === undefined \|\| value === null \|\| value === "solo"\s*\? "solo"/);
  assert.match(headshotsRoute, /kind === "team" \? \("team_members" as const\) : \("solo_registrations" as const\)/);
  assert.match(headshotsRoute, /const kind = readKind\(form\.get\("kind"\)\);/);
  assert.match(headshotsRoute, /const kind = readKind\(fields\.kind\);/);
  assert.equal(occurrences(headshotsRoute, "|| !kind) {"), 2);
  // Only a solo rider's photo can go onto an account.
  assert.match(headshotsRoute, /if \(kind === "solo" && !registrationPath\) \{\s*const found = await findOwnHolder/);
  assert.match(headshotsRoute, /\.from\(tableFor\(kind\)\)\s*\.update\(\{ headshot_path: path \}\)/);
  assert.match(headshotsRoute, /\.from\(tableFor\(kind\)\)\s*\.update\(\{ headshot_path: null \}\)/);
  assert.match(headshotsRoute, /target_table: tableFor\(kind\)/);
  // A team rider's account photo is never removed from here.
  assert.match(headshotsRoute, /if \(kind === "team" && !registrationPath\) \{\s*return fail\(/);
});

test("the cell sends its kind and the Teams list has a Photo column", () => {
  assert.match(cell, /export default function RiderHeadshotCell\(/);
  assert.match(cell, /kind: RiderKind;/);
  assert.match(cell, /body\.append\("kind", kind\);/);
  assert.match(cell, /JSON\.stringify\(\{ registrationId, kind \}\)/);
  // Each list acts on its own row unless the photo shown is the rider's
  // other entry's (see matchSoloHeadshots / matchTeamHeadshots).
  assert.match(dashboard, /<RiderHeadshotCell\s+registrationId=\{soloHeadshots\[registration\.id\]\?\.target\?\.id \?\? registration\.id\}\s+kind=\{soloHeadshots\[registration\.id\]\?\.target\?\.kind \?\? "solo"\}/);
  assert.match(dashboard, /<RiderHeadshotCell\s+registrationId=\{teamHeadshots\[member\.id\]\?\.target\?\.id \?\? member\.id\}\s+kind=\{teamHeadshots\[member\.id\]\?\.target\?\.kind \?\? "team"\}\s+riderName=\{member\.full_name\}\s+initial=\{teamHeadshots\[member\.id\]\}/);
  assert.match(section, /teamHeadshots = await matchTeamHeadshots\(/);
  assert.match(section, /teamHeadshots=\{teamHeadshots\}/);
});

test("a team rider's own photo comes first everywhere, then the account rule", () => {
  const team = headshotUrls.slice(headshotUrls.indexOf("export const getTeamRiderHeadshotUrl"));
  assert.ok(
    team.indexOf('getPaperHeadshotUrl(client, rider.id, "team")') < team.indexOf("getOwnAccountHeadshotUrl("),
    "the row's photo before any account"
  );
  assert.match(headshotUrls, /\.from\(kind === "team" \? "team_members" : "solo_registrations"\)/);

  // The rule lives in chooseTeamHeadshotPaths, shared with the broadcast
  // photo index; matchTeamHeadshots signs what it chooses.
  assert.match(
    headshotUrls.slice(headshotUrls.indexOf("export const matchTeamHeadshots")),
    /chooseTeamHeadshotPaths\(\s*index,\s*members,\s*leaderProfileByTeam,\s*soloProfileByEmail\s*\)/
  );
  const list = headshotUrls.slice(headshotUrls.indexOf("export const chooseTeamHeadshotPaths"));
  assert.match(list, /let path = readPaperHeadshotPath\(member\.id, member\.headshot_path\);\s*if \(!path && index\)/);
  assert.match(list, /isOwnRegistration\(member, account\)/);
  assert.match(list, /index\.confirmedIdByEmail/);
  assert.match(headshotUrls, /user\.email_confirmed_at && !confirmedIdByEmail\.has\(address\)/);

  // The check-in desk and the commentary panel pass the member's id.
  assert.match(checkInRoute, /\{ id: teammate\.id, email, full_name: teammate\.full_name \}/);
  assert.match(riderDetail, /getLinkedTeamRiderHeadshotUrl\(\s*client,\s*member,/);
});

// ---------------------------------------------------------------------------
// The check-in desk

const row = (overrides: Partial<RiderMatch>): RiderMatch => ({
  id: "solo-1",
  source: "solo",
  entries: ["solo"],
  full_name: "Harpreet Singh",
  email: "family@example.com",
  phone: "98765 43210",
  team_name: null,
  team_id: null,
  is_leader: null,
  confirmation_code: "NBP-AAAAAA",
  checked_in_at: null,
  ...overrides,
});

test("the desk merges by code: one rider in both events is one row", () => {
  const merged = mergeRidersByCode([
    row({ id: "member-1", source: "team", entries: ["team"], team_name: "Majha", team_id: "team-1", is_leader: true }),
    row({}),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "solo-1");
  assert.deepEqual(merged[0].entries, ["solo", "team"]);
  assert.equal(merged[0].team_name, "Majha");
  assert.equal(merged[0].team_id, "team-1");
});

test("the desk keeps two riders on one email and phone as two rows", () => {
  const merged = mergeRidersByCode([
    row({}),
    row({ id: "solo-2", full_name: "Simran Kaur", confirmation_code: "NBP-BBBBBB" }),
    // The same row found twice (by name and by email) is still one row.
    row({}),
  ]);

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((rider) => rider.confirmation_code),
    ["NBP-AAAAAA", "NBP-BBBBBB"]
  );
  assert.deepEqual(merged[0].entries, ["solo"]);
  assert.match(checkInRoute, /import \{ mergeRidersByCode, type RiderFact, type RiderMatch \} from "@\/lib\/check-in-roster";/);
});

// ---------------------------------------------------------------------------
// An email alone never decides whose entry a row is

test("a shared email neither claims nor gates another rider's entry", () => {
  const sync = repoFile("src/lib/supabase/sync-registration-profile.ts");
  const teamPage = repoFile("src/app/register-team/page.tsx");

  // The paper claim: every unclaimed paper row under the address is read,
  // only the holder's own (same name) is written, by id.
  const claim = sync.slice(
    sync.indexOf("const claimPaperSoloRegistration"),
    sync.indexOf("const movePaperHeadshotToAccount")
  );
  assert.match(claim, /isOwnRegistration\(row, \{ email: confirmedEmail, full_name: fullName \}\)/);
  assert.match(claim, /\.update\(\{ profile_id: userId \}\)\s*\.in\("id", ownIds\)/);
  assert.doesNotMatch(claim, /\.update\([^)]*\)[\s\S]*?\.ilike\(/);

  // The team page's "already on a team" notice: only the holder's own row,
  // so a parent whose email is on a child's team row can still lead a team.
  assert.match(teamPage, /import \{ isOwnRegistration \} from "@\/lib\/registration-identity";/);
  assert.match(teamPage, /\.select\("team_id, full_name, email"\)\s*\.ilike\("email", escapeIlikePattern\(user\.email\)\)\s*\.eq\("is_leader", false\);/);
  assert.match(teamPage, /isOwnRegistration\(row, \{ email: user\.email, full_name: authMetadata\?\.full_name \}\)/);
  assert.doesNotMatch(teamPage, /\.eq\("is_leader", false\)\s*\.limit\(1\)/);
});

// ---------------------------------------------------------------------------
// Wording

test("the paper desk, the runbook and the change log say what is refused now", () => {
  const changeLog = repoFile("docs/supabase-changes.md");

  assert.match(paperPanel, /Saving still refuses the same name with the\s+same email or phone\./);
  assert.doesNotMatch(runbook, /A paper rider without email can enter only one event/);
  assert.doesNotMatch(runbook, /under a different \(or no\) email/);
  assert.match(runbook, /the same full name is already entered in the same kind of entry/);
  // Migration 20's entry still describes its rules as they were, marked as
  // superseded, so nobody applies the old limitation on the day.
  assert.match(changeLog, /\*Superseded by migration 27:\*/);
  assert.match(changeLog, /\*\*One limitation, lifted by migration 27\.\*\*/);
  assert.doesNotMatch(changeLog, /checks duplicate emails and phones/);
});

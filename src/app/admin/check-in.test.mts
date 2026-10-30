import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const codesMigration = repoFile(
  "supabase/migrations/20260728143000_registration_confirmation_codes.sql"
);
const checkInMigration = repoFile(
  "supabase/migrations/20260728143500_admin_rider_check_in.sql"
);
const oneCodeMigration = repoFile(
  "supabase/migrations/20260728163000_one_confirmation_code_per_rider.sql"
);
const checkInRoute = repoFile("src/app/api/admin/check-in/route.ts");
const soloCodeRoute = repoFile(
  "src/app/api/registration/confirmation-code/route.ts"
);
const teamSubmitRoute = repoFile("src/app/register-team/submit/route.ts");
const resendClient = repoFile("src/lib/email/resend.ts");
const codeEmail = repoFile("src/lib/email/registration-code.ts");

test("confirmation codes are assigned by the database, never by the client", () => {
  // Solo registrations are inserted straight from the browser, so the trigger
  // has to overwrite whatever the client sent rather than trust it.
  assert.match(
    codesMigration,
    /before insert on public\.solo_registrations[\s\S]*?assign_confirmation_code/
  );
  assert.match(
    codesMigration,
    /before insert on public\.team_members[\s\S]*?assign_confirmation_code/
  );
  assert.match(codesMigration, /new\.confirmation_code := candidate;/);
  assert.match(codesMigration, /new\.checked_in_at := null;/);
  assert.match(codesMigration, /new\.checked_in_by := null;/);
});

test("a first-time registration cannot arrive already checked in", () => {
  // Asserted against the current definition: one_confirmation_code_per_rider
  // replaced the function in registration_confirmation_codes, so checking the
  // older file would be testing SQL that no longer runs.
  const assignment = oneCodeMigration.slice(
    oneCodeMigration.indexOf("function public.assign_confirmation_code")
  );

  // A rider with no existing entry gets a fresh code and no arrival state, so
  // a forged insert cannot smuggle in a checked-in registration. A rider who
  // already registered inherits their own real state instead — that branch is
  // covered separately.
  const freshBranch = assignment.slice(assignment.indexOf("loop"));
  assert.match(freshBranch, /new\.checked_in_at := null;/);
  assert.match(freshBranch, /new\.checked_in_by := null;/);
});

test("browsers cannot write confirmation codes or check-in state", () => {
  assert.match(
    codesMigration,
    /revoke update on public\.solo_registrations from authenticated;/
  );
  assert.match(
    codesMigration,
    /revoke update on public\.team_members from authenticated;/
  );

  // Postgres cannot revoke one column from a table-wide grant, so the grant is
  // replaced by an explicit list. These three must never appear in it.
  const grantedColumns = codesMigration.match(/grant update \(([\s\S]*?)\)/g) ?? [];
  assert.equal(grantedColumns.length, 2);

  for (const grant of grantedColumns) {
    assert.doesNotMatch(grant, /confirmation_code/);
    assert.doesNotMatch(grant, /checked_in_at/);
    assert.doesNotMatch(grant, /checked_in_by/);
  }
});

test("codes avoid characters that are misread at a check-in desk", () => {
  const alphabet = codesMigration.match(/alphabet constant text := '([^']+)'/)?.[1];

  assert.ok(alphabet, "the generator must define its alphabet");

  for (const ambiguous of ["O", "0", "I", "1", "U"]) {
    assert.ok(
      !alphabet.includes(ambiguous),
      `${ambiguous} is ambiguous when a code is read aloud`
    );
  }
});

test("a rider registered twice holds one code, not two", () => {
  // A rider can enter solo and also ride on a team. Two codes would mean two
  // things to present at the desk, so the second entry reuses the first code.
  const assignment = oneCodeMigration.slice(
    oneCodeMigration.indexOf("function public.assign_confirmation_code")
  );

  assert.match(assignment, /lower\(btrim\(entry\.email\)\) = lower\(btrim\(new\.email\)\)/);
  assert.match(assignment, /new\.confirmation_code := existing\.confirmation_code;/);

  // The arrival state comes with it, so the two entries cannot disagree about
  // whether the rider is present.
  assert.match(assignment, /new\.checked_in_at := existing\.checked_in_at;/);
  assert.match(assignment, /new\.checked_in_by := existing\.checked_in_by;/);
});

test("one check-in marks every entry the rider holds", () => {
  // Checking in only one row would leave a rider standing at the desk showing
  // as absent on their team roster, holding the whole section out of the
  // brackets.
  const checkIn = oneCodeMigration.slice(
    oneCodeMigration.indexOf("function public.admin_set_check_in")
  );

  assert.match(checkIn, /update public\.solo_registrations/);
  assert.match(checkIn, /update public\.team_members/);

  // Keyed on the code rather than a single row id.
  assert.match(checkIn, /p_code text/);
  assert.doesNotMatch(checkIn, /p_target_id/);
  assert.match(checkInRoute, /p_code: code\.trim\(\)/);
});

test("the desk sees a dual-entry rider once, with both entries", () => {
  const searchBody = checkInRoute.slice(
    checkInRoute.indexOf("const searchRiders")
  );

  // Deduplicated on the shared code, not on the row id.
  assert.match(searchBody, /const byCode = new Map/);
  assert.doesNotMatch(searchBody, /byId\.set/);
  assert.match(checkInRoute, /entries\.find\(/);
});

test("codes are unique across solo riders and team riders together", () => {
  assert.match(
    codesMigration,
    /create unique index if not exists solo_registrations_confirmation_code_key/
  );
  assert.match(
    codesMigration,
    /create unique index if not exists team_members_confirmation_code_key/
  );

  // One code is typed at the desk and both tables are searched, so the
  // generator has to check both before handing a code out.
  const assignmentBody = codesMigration.slice(
    codesMigration.indexOf("function public.assign_confirmation_code")
  );
  assert.match(assignmentBody, /from public\.solo_registrations/);
  assert.match(assignmentBody, /from public\.team_members/);
});

test("check-in is audited with the server-verified actor", () => {
  assert.match(checkInMigration, /insert into public\.admin_audit_log/);
  assert.match(checkInMigration, /'check_in_rider'/);
  assert.match(checkInMigration, /'undo_check_in_rider'/);

  // The route must pass the actor derived from the session, not from the body.
  assert.match(checkInRoute, /p_actor_id: adminCheck\.actor\.id/);
  assert.match(checkInRoute, /p_actor_name: adminCheck\.actor\.name/);
  assert.match(checkInRoute, /p_actor_email: adminCheck\.actor\.email/);
});

test("only administrators can look up or check in a rider", () => {
  const handlers = checkInRoute.match(/export async function (POST|PATCH)/g) ?? [];
  assert.equal(handlers.length, 2);

  const verifications = checkInRoute.match(/await verifyAdminRequest\(\)/g) ?? [];
  assert.equal(verifications.length, 2);
});

test("check-in functions are reachable only by the service role", () => {
  assert.match(
    checkInMigration,
    /revoke execute on function public\.admin_set_check_in[\s\S]*?from public, anon, authenticated;/
  );
  assert.match(
    checkInMigration,
    /revoke execute on function public\.admin_find_rider_by_code[\s\S]*?from public, anon, authenticated;/
  );
  assert.match(
    checkInMigration,
    /grant execute on function public\.admin_set_check_in[\s\S]*?to service_role;/
  );
});

test("re-scanning a checked-in rider fails instead of overwriting the record", () => {
  assert.match(checkInMigration, /already checked in/);
  assert.match(checkInMigration, /is not checked in/);
});

test("a rider can only ever be emailed their own code", () => {
  // The solo route resolves the registration from the session, never from
  // anything the caller sends.
  assert.match(soloCodeRoute, /\.eq\("profile_id", user\.id\)/);
  assert.doesNotMatch(soloCodeRoute, /request\.json\(\)/);
});

test("a failed email never fails a registration that already committed", () => {
  // Sending happens after the response, and a missing key is a skip, not a
  // throw.
  assert.match(teamSubmitRoute, /after\(async \(\) => \{/);
  assert.match(soloCodeRoute, /after\(async \(\) => \{/);
  assert.match(resendClient, /status: "skipped"/);
  assert.doesNotMatch(resendClient, /throw new Error/);
});

test("every team rider is emailed, not just the leader", () => {
  assert.match(teamSubmitRoute, /for \(const member of insertedMembers \?\? \[\]\)/);
  assert.match(teamSubmitRoute, /\.select\("full_name, email, confirmation_code"\)/);
});

test("team emails share rider names but never their contact details", () => {
  // The leader entered their teammates' phone numbers and email addresses;
  // those riders never agreed to have them forwarded to the rest of the team.
  assert.match(teamSubmitRoute, /normalizedRiders\.map\(\(rider\) => rider\.fullName\)/);
  assert.match(codeEmail, /teammateNames/);

  const roster = codeEmail.slice(codeEmail.indexOf("teammateNames.map"));
  assert.doesNotMatch(roster.slice(0, 400), /phone|\bemail\b/i);
});

test("a team rider is told how to reach their own entry", () => {
  assert.match(codeEmail, /\/login/);
  assert.match(codeEmail, /create an account with it if you do not have/);

  // Only team riders get the prompt; a solo rider already has an account.
  assert.match(codeEmail, /const accountLines = isTeamEntry/);
});

test("riders without their code can still be found by name, email or phone", () => {
  assert.match(checkInRoute, /typeof body\.query === "string"/);

  const searchBody = checkInRoute.slice(
    checkInRoute.indexOf("const searchRiders")
  );
  assert.match(searchBody, /"full_name", "email", "phone"/);
  assert.match(searchBody, /from\("solo_registrations"\)/);
  assert.match(searchBody, /from\("team_members"\)/);

  // A name containing a comma or bracket would break a combined PostgREST
  // `or` filter, and LIKE wildcards in the query must stay literal.
  assert.match(searchBody, /escapeIlikePattern\(query\)/);
  assert.doesNotMatch(searchBody, /\.or\(/);
});

test("admins can edit a team rider's horse name", () => {
  const dashboard = repoFile("src/app/admin/AdminDashboard.tsx");
  const route = repoFile("src/app/api/admin/registrations/route.ts");
  const migration = repoFile(
    "supabase/migrations/20260729043000_admin_edit_team_horse_name.sql"
  );

  // The team field list drives both the edit form and the audit diff, so the
  // column has to be in it or a change would save silently unrecorded.
  const teamFields = dashboard.slice(
    dashboard.indexOf("const editableRegistrationFields"),
    dashboard.indexOf("const soloEditableRegistrationFields")
  );
  assert.match(teamFields, /field: "horse_name"/);

  // The migration patches the deployed function rather than retyping it, and
  // must fail loudly if the body is not the shape it expects.
  assert.match(migration, /raise exception 'Could not add horse_name to the team editable field list\.'/);
  assert.match(migration, /raise exception 'Could not add horse_name to the team member UPDATE\.'/);

  // Required on both paths. Neither horse_name column carries a required
  // check, so this route and the dashboard are the only thing enforcing it —
  // and the rider table it drives has a Horse Name column to fill in. (The
  // route does have optional fields — the parents' names — but never this.)
  assert.match(route, /isBoundedString\(value\.horse_name, 200\)/);
  assert.doesNotMatch(route, /isOptionalBoundedString\(value\.horse_name/);
  assert.doesNotMatch(teamFields, /field: "horse_name"[^}]*optional/);
  assert.match(dashboard, />\s*Horse Name\s*</);
});

test("a team carries one emergency contact, not one per rider", () => {
  const wizard = repoFile("src/app/register-team/TeamRegisterForm.tsx");
  const submit = repoFile("src/app/register-team/submit/route.ts");
  const route = repoFile("src/app/api/admin/registrations/route.ts");
  const checkIn = repoFile("src/app/api/admin/check-in/route.ts");
  const migration = repoFile(
    "supabase/migrations/20260731210000_team_emergency_contact.sql"
  );

  // It lives on `teams`. Putting it on team_members would ask a leader for
  // four next-of-kin they may not have.
  assert.match(migration, /alter table public\.teams/);
  assert.doesNotMatch(migration, /alter table public\.team_members/);

  // `teams` uses column-level grants, so new columns need their own or the
  // leader's INSERT at registration silently drops them.
  assert.match(migration, /grant insert \(emergency_contact_name, emergency_contact_phone\)/);

  // Patched in place, and loud if the deployed body is not what it expects.
  assert.match(migration, /raise exception 'Could not add the emergency contact to the team UPDATE\.'/);
  assert.match(migration, /raise exception 'Could not add the emergency contact to the team audit diff\.'/);

  // Required at every write path.
  assert.match(wizard, /emergencyContactName/);
  assert.match(submit, /Please enter an emergency contact name for the team\./);
  assert.match(route, /isBoundedString\(payload\.emergency_contact_name, 200\)/);

  // The reason it is collected: the desk needs a number to call.
  assert.match(checkIn, /teamEmergency/);
});

test("the desk's instant search loads a short rider list, admins only, never cached", () => {
  const listBody = checkInRoute.slice(
    checkInRoute.indexOf("const listRiders"),
    checkInRoute.indexOf("type CheckInRequest")
  );

  // The same few columns as the search results: nothing from the full record
  // (age, address, parents, emergency contacts) until a rider is selected.
  assert.match(listBody, /\.select\("id, full_name, email, phone, confirmation_code, checked_in_at"\)/);
  assert.doesNotMatch(listBody, /location|emergency|father_name|\bage\b/);
  // One row per code, like the search.
  assert.match(listBody, /const byCode = new Map/);

  // Behind the same administrator check as every other request here.
  const post = checkInRoute.slice(checkInRoute.indexOf("export async function POST"));
  assert.ok(post.indexOf("verifyAdminRequest()") < post.indexOf("body.roster === true"));
  assert.match(post, /\{ riders \},\s+\{ headers: \{ "Cache-Control": "private, no-store" \} \}/);

  // The panel filters the list on the device and refreshes it from the server.
  const panel = repoFile("src/app/admin/CheckInPanel.tsx");
  assert.match(panel, /searchRiders\(roster, query\)/);
  assert.match(panel, /const ROSTER_REFRESH_MS = 5_000;/);
  assert.match(panel, /void loadRoster\(\);/);
});

test("the Check-in tab has a desk and a Who's checked in overview, from the same list", () => {
  const panel = repoFile("src/app/admin/CheckInPanel.tsx");
  const status = repoFile("src/app/admin/CheckInStatus.tsx");

  // Two switches; the desk stays the default view.
  assert.match(panel, /useState<"desk" \| "status">\("desk"\)/);
  assert.match(panel, />\s*Check-in desk\s*</);
  assert.match(panel, />\s*Who&apos;s checked in\s*</);
  // The overview reads the desk's own refreshed list, never its own copy.
  assert.match(panel, /<CheckInStatus roster=\{roster\} failed=\{rosterFailed\} onSelect=\{openFromStatus\} \/>/);
  assert.doesNotMatch(status, /fetch\(/);

  // A team is ready only with all four riders registered and checked in,
  // the same rule the start-list draw applies.
  assert.match(status, /const TEAM_SIZE = 4;/);
  assert.match(status, /members\.length === TEAM_SIZE && members\.every\(\(rider\) => rider\.checked_in_at\)/);

  // The rider list carries each team rider's team id so teams can be counted.
  assert.match(checkInRoute, /is_leader, team_id, teams\(team_name\)/);
});

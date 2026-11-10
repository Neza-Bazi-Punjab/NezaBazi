// Dal Panth at the check-in desk, on paper entry and on desk teams. The rule
// these pin: a registration, a check-in lookup, a check-in or a desk team must
// never fail, or report failure, because Dal Panth could not be read or saved
// (docs/superpowers/specs/2026-11-10-dal-panth-and-excel-export.md, Part 4).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeDalPanth } from "../../lib/dal-panth.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const checkInRoute = repoFile("src/app/api/admin/check-in/route.ts");
const checkInPanel = repoFile("src/app/admin/CheckInPanel.tsx");
const paperRoute = repoFile("src/app/api/admin/paper-registration/route.ts");
const paperPanel = repoFile("src/app/admin/paper/PaperEntryPanel.tsx");
const deskTeamsRoute = repoFile("src/app/api/admin/desk-teams/route.ts");
const paperLib = repoFile("src/lib/paper-registration.ts");

const between = (source: string, start: string, end?: string) => {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  const to = end === undefined ? source.length : source.indexOf(end, from + start.length);
  assert.ok(to >= 0, `missing ${end}`);
  return source.slice(from, to);
};

// ---------------------------------------------------------------------------
// Check-in route

test("the check-in lookup reads Dal Panth separately, never in the roster or search selects", () => {
  const search = between(checkInRoute, "const searchRiders", "const ROSTER_LIMIT");
  const roster = between(checkInRoute, "const listRiders", "type CheckInRequest");

  assert.doesNotMatch(search, /dal_panth/i);
  assert.doesNotMatch(roster, /dal_panth/i);

  // Its own small read, by code, solo entry first then the team entry.
  const helper = between(checkInRoute, "const readDalPanth", "const codePattern");
  assert.match(helper, /\["solo_registrations", "team_members"\] as const/);
  assert.match(helper, /\.select\("dal_panth"\)/);
  assert.match(helper, /\.eq\("confirmation_code", riderCode\)/);
});

test("a failed Dal Panth read can never fail the lookup", () => {
  const helper = between(checkInRoute, "const readDalPanth", "const codePattern");

  // Both a returned error and a thrown one become null; nothing is rethrown
  // and no response is built inside the helper.
  assert.match(helper, /try \{/);
  assert.match(helper, /if \(error\) \{\s*logDalPanthFailure\(error\);\s*return null;\s*\}/);
  assert.match(helper, /catch \(failure\) \{\s*logDalPanthFailure\(failure\);\s*return null;\s*\}/);
  assert.doesNotMatch(helper, /throw |NextResponse/);

  // Logged once per distinct failure.
  assert.match(checkInRoute, /if \(!loggedDalPanthFailures\.has\(key\)\)/);
  assert.match(checkInRoute, /console\.error\("Check-in Dal Panth read failed/);

  // Read only after the rider was found, and added to the same 200 response.
  const post = between(checkInRoute, "export async function POST", "export async function PATCH");
  assert.ok(post.indexOf("No rider found for code") < post.indexOf("await readDalPanth("));
  assert.match(post, /const dalPanth: string \| null = await readDalPanth\(/);
  assert.match(post, /teamEmergency,\s+dalPanth,\s+headshotUrl,\s+photoTarget,\s+\}\);/);
});

test("the check-in and undo path does not touch Dal Panth", () => {
  const patch = between(checkInRoute, "export async function PATCH");

  assert.doesNotMatch(patch, /dal_panth|dalPanth|DalPanth/);
});

// ---------------------------------------------------------------------------
// Check-in panel

test("the desk card shows Dal Panth through its own self-saving cell", () => {
  assert.match(checkInPanel, /import DalPanthCell from "\.\/DalPanthCell";/);
  assert.match(checkInPanel, /<DalPanthCell[\s\S]*?variant="card"[\s\S]*?\/>/);
  assert.match(checkInPanel, /code=\{rider\.confirmation_code\}/);
  assert.match(checkInPanel, /value=\{dalPanth\}/);
  assert.match(checkInPanel, /riderName=\{rider\.full_name\}/);
  assert.match(checkInPanel, /onSaved=\{setDalPanth\}/);

  // Set from the lookup, and cleared whenever the card is.
  assert.match(checkInPanel, /setDalPanth\(typeof result\.dalPanth === "string" \? result\.dalPanth : null\);/);
  const clear = between(checkInPanel, "const clearResults", "const applyCard");
  assert.match(clear, /setDalPanth\(null\);/);
});

test("checking a rider in never sends or waits for Dal Panth", () => {
  const checkIn = between(checkInPanel, "const setCheckedIn", "const refreshCard");

  assert.match(checkIn, /JSON\.stringify\(\{ code: rider\.confirmation_code, checkedIn \}\)/);
  assert.doesNotMatch(checkIn, /dal_panth|dalPanth: /);

  // No PATCH body anywhere in the panel carries it.
  for (const body of checkInPanel.match(/JSON\.stringify\(\{[^}]*\}\)/g) ?? []) {
    assert.doesNotMatch(body, /dal/i);
  }
});

// ---------------------------------------------------------------------------
// Paper entry

test("paper entry checks Dal Panth before saving and never puts it in p_payload", () => {
  const post = between(paperRoute, "export async function POST");

  assert.match(paperRoute, /import \{ DAL_PANTH_NOT_SET_UP, normalizeDalPanth \} from "@\/lib\/dal-panth";/);
  assert.match(post, /normalizeDalPanth\(isObject\(rawBody\) \? rawBody\.dal_panth : undefined\)/);
  assert.match(post, /if \(!dalPanth\.ok\) \{\s*return NextResponse\.json\(\{ error: dalPanth\.error \}, \{ status: 400 \}\);/);
  assert.ok(
    post.indexOf("normalizeDalPanth(") < post.indexOf('rpc("admin_create_paper_registration"'),
    "Dal Panth is validated before the registration is saved"
  );

  // The registration payload is the validated form only.
  assert.match(post, /p_payload: validation\.payload,/);
  const create = between(post, 'rpc("admin_create_paper_registration"', "});");
  assert.doesNotMatch(create, /dal/i);
});

test("paper entry saves Dal Panth only after the registration succeeded, one rider at a time", () => {
  const post = between(paperRoute, "export async function POST");
  const parsed = post.indexOf("const created = parsePaperRegistrationResult(data);");
  const unreadable = post.indexOf("its confirmation codes could not be read");
  const setCall = post.indexOf('rpc("admin_set_dal_panth"');

  assert.ok(parsed >= 0 && setCall > parsed && setCall > unreadable);
  assert.equal(post.match(/rpc\("admin_set_dal_panth"/g)?.length, 1);

  const save = between(post, "let dalPanthSaved", "// A rider who wrote an email address");
  assert.match(save, /if \(dalPanth\.value !== null\)/);
  assert.match(save, /for \(const rider of created\.riders\) \{\s*try \{/);
  assert.match(save, /p_code: rider\.confirmation_code,/);
  assert.match(save, /p_actor_id: adminCheck\.actor\.id,/);
  assert.match(save, /catch \(dalPanthThrown\)/);
  // A returned error is handled too (supabase-js does not throw for those).
  assert.match(save, /if \(dalPanthFailure\) \{\s*dalPanthSaved = false;/);
  assert.match(save, /DAL_PANTH_MISSING_CODES\.has\(dalPanthFailure\.code\)/);
  assert.match(paperRoute, /new Set\(\["PGRST202", "42883", "42703"\]\)/);
  assert.doesNotMatch(save, /return NextResponse/);
});

test("the paper success response reports dal_panth_saved and keeps the codes", () => {
  const response = between(paperRoute, "return NextResponse.json({\n    ok: true,");

  assert.match(response, /registration: \{/);
  assert.match(response, /confirmation_code: rider\.confirmation_code,/);
  assert.match(response, /dal_panth_saved: dalPanthSaved,/);
  assert.match(response, /dalPanthSaved === false\s*\? \{ dal_panth_error: dalPanthError \?\? DAL_PANTH_NOT_SAVED \}/);
  assert.match(
    paperRoute,
    /"The registration was saved, but the Dal Panth was not\. Add it from the Solo Riders or Teams list\."/
  );

  // The email is untouched by any of this.
  const email = between(paperRoute, "after(async () => {", "return NextResponse.json({\n    ok: true,");
  assert.doesNotMatch(email, /dal/i);
});

test("the paper panel has its own Dal Panth boxes and shows a save failure", () => {
  assert.match(paperPanel, /label="Dal Panth"/);
  assert.match(paperPanel, /label="Dal Panth for the whole team"/);
  assert.match(paperPanel, /\(optional\)<\/span>/);
  assert.match(paperPanel, /maxLength=\{DAL_PANTH_MAX_LENGTH\}/);

  // Sent as a top-level key next to the registration, only when filled in.
  assert.match(paperPanel, /\.\.\.\(dalPanth\.trim\(\) !== "" \? \{ dal_panth: dalPanth \} : \{\}\)/);

  // Reset with the form.
  const reset = between(paperPanel, "const enterAnother", "if (created)");
  assert.match(reset, /setSoloDalPanth\(""\);/);
  assert.match(reset, /setTeamDalPanth\(""\);/);

  // Shown on the confirmation screen only when it was not saved.
  assert.match(paperPanel, /body\.dal_panth_saved === false/);
  assert.match(paperPanel, /\{dalPanthError && \(/);
});

test("PAPER_RIDER_FIELDS still has no Dal Panth entry", () => {
  const fields = between(paperLib, "export const PAPER_RIDER_FIELDS", "];");

  assert.doesNotMatch(fields, /dal/i);
  assert.doesNotMatch(paperLib, /dal_panth/i);
});

// ---------------------------------------------------------------------------
// Desk teams

test("desk teams sync Dal Panth only after a successful change, best effort", () => {
  const post = between(deskTeamsRoute, "export async function POST");
  const success = post.indexOf('rpc("admin_desk_team"');
  const lastError = post.lastIndexOf("Could not save that change.");
  const sync = post.indexOf('rpc("admin_sync_dal_panth")');

  assert.ok(success >= 0 && sync > success && sync > lastError);
  assert.equal(deskTeamsRoute.match(/admin_sync_dal_panth/g)?.length, 1);

  const block = between(post, "try {", "return NextResponse.json({ ok: true, result: data });");
  assert.match(block, /const \{ error: syncError \} = await serviceSupabase\.rpc\("admin_sync_dal_panth"\);/);
  assert.match(block, /if \(syncError\) \{\s*console\.error\(/);
  assert.match(block, /\} catch \(syncFailure\) \{\s*console\.error\(/);
  assert.doesNotMatch(block, /return |throw /);

  // The response is what it always was.
  assert.match(post, /return NextResponse\.json\(\{ ok: true, result: data \}\);\s*\}\s*$/);
});

test("the value the paper route checks is normalised by the shared contract", () => {
  // Placeholder name only: the site names no Dal Panth anywhere.
  assert.deepEqual(normalizeDalPanth("  Example \t  Dal "), { ok: true, value: "Example Dal" });
  assert.deepEqual(normalizeDalPanth(undefined), { ok: true, value: null });
  assert.deepEqual(normalizeDalPanth("   "), { ok: true, value: null });
  assert.equal(normalizeDalPanth("x".repeat(121)).ok, false);
  assert.equal(normalizeDalPanth(42).ok, false);
});

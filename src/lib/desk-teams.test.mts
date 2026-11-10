import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseDeskTeamRequest } from "./desk-teams.ts";

const repoFile = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const create = (extra: Record<string, unknown> = {}) => ({
  action: "create",
  team_name: "  Desk   Lions ",
  solo_ids: [id(1), id(2), id(3)],
  leader_solo_id: id(2),
  emergency_contact_name: "Contact",
  emergency_contact_phone: "+91 98765 43210",
  ...extra,
});

test("a new team: name tidied, leader listed first, 1 to 4 distinct riders", () => {
  const parsed = parseDeskTeamRequest(create());

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.ok && parsed.request.payload, {
    team_name: "Desk Lions",
    solo_ids: [id(2), id(1), id(3)],
    leader_solo_id: id(2),
    emergency_contact_name: "Contact",
    emergency_contact_phone: "+91 98765 43210",
  });

  assert.equal(parseDeskTeamRequest(create({ solo_ids: [id(1)], leader_solo_id: id(1) })).ok, true);
  assert.equal(parseDeskTeamRequest(create({ solo_ids: [] })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ solo_ids: [id(1), id(2), id(3), id(4), id(5)] })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ solo_ids: [id(1), id(1)] })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ solo_ids: ["nope"] })).ok, false);
});

test("a new team needs a leader on it, a name and a full emergency contact", () => {
  assert.equal(parseDeskTeamRequest(create({ leader_solo_id: id(9) })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ team_name: "   " })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ team_name: "x".repeat(101) })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ emergency_contact_name: "" })).ok, false);
  assert.equal(parseDeskTeamRequest(create({ emergency_contact_phone: "12" })).ok, false);
});

test("add, remove, delete and update need a team; update needs something to change", () => {
  assert.equal(parseDeskTeamRequest({ action: "add", team_id: id(7), solo_ids: [id(1)] }).ok, true);
  assert.equal(parseDeskTeamRequest({ action: "add", solo_ids: [id(1)] }).ok, false);
  assert.equal(parseDeskTeamRequest({ action: "remove", team_id: id(7), team_member_id: id(8) }).ok, true);
  assert.equal(parseDeskTeamRequest({ action: "remove", team_id: id(7) }).ok, false);
  assert.equal(parseDeskTeamRequest({ action: "delete", team_id: id(7) }).ok, true);
  assert.equal(parseDeskTeamRequest({ action: "update", team_id: id(7) }).ok, false);
  assert.equal(parseDeskTeamRequest({ action: "update", team_id: id(7), team_name: "New" }).ok, true);
  assert.equal(
    parseDeskTeamRequest({ action: "update", team_id: id(7), emergency_contact_name: "C" }).ok,
    false,
    "a contact name without a phone is refused"
  );
  assert.equal(parseDeskTeamRequest({ action: "drop", team_id: id(7) }).ok, false);
  assert.equal(parseDeskTeamRequest(null).ok, false);
});

test("the database does the change and its audit record together, desk teams only", () => {
  const migration = repoFile("supabase/migrations/20261109120000_desk_teams.sql");
  const revert = repoFile("supabase/migrations/revert/20261109120000_desk_teams.revert.sql");
  const route = repoFile("src/app/api/admin/desk-teams/route.ts");

  // Service role only; the route verifies the administrator and passes the
  // actor from the session.
  assert.match(migration, /revoke execute on function public\.admin_desk_team\(text, jsonb, uuid, text, text\)\s+from public, anon, authenticated;/);
  assert.match(migration, /profile\.role = 'admin'/);
  assert.match(route, /p_actor_id: adminCheck\.actor\.id/);
  assert.match(route, /verifyAdminRequest\(\)/);

  // Only checked-in solo riders, not already on a team, at most four.
  assert.match(migration, /solo_row\.checked_in_at is null/);
  assert.match(migration, /is already on a team/);
  assert.match(migration, /member_count \+ cardinality\(solo_ids\) > 4/);

  // One rider, one code: the team place must carry the solo entry's code.
  assert.match(migration, /created_code is distinct from solo_row\.confirmation_code/);

  // Online and paper teams are never changed; a drawn team keeps its riders.
  assert.match(migration, /registration_source <> 'desk'/);
  assert.match(migration, /from public\.scoring_runs as run where run\.team_id/);

  // Every action is audited in the same transaction.
  assert.match(migration, /'desk_team_' \|\| p_action/);

  // No email: the riders are standing at the desk.
  assert.doesNotMatch(route, /sendEmail/);

  // The undo refuses while desk teams are left.
  assert.match(revert, /registration_source = 'desk'/);
});

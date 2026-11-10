import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseNextRoundRequest,
  qualifyingPools,
  qualifyingPreview,
  startButtonLabel,
  startConfirmDetail,
  teamsPreview,
  toNextStep,
} from "./next-round.ts";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const ROUND = "0000000A-0000-0000-0000-000000000001";
const migration = repoFile("supabase/migrations/20261110130000_scoring_auto_next_round.sql");
const revert = repoFile("supabase/migrations/revert/20261110130000_scoring_auto_next_round.revert.sql");
const route = repoFile("src/app/api/admin/scoring/next-round/route.ts");
const admin = repoFile("src/app/admin/scoring/ScoringAdmin.tsx");
const qualifying = repoFile("supabase/migrations/20261110140000_scoring_auto_qualifying.sql");
const checkInRoute = repoFile("src/app/api/admin/check-in/route.ts");
const checkInPanel = repoFile("src/app/admin/CheckInPanel.tsx");
const teamsMigration = repoFile("supabase/migrations/20261110150000_scoring_auto_teams.sql");
const teamsRevert = repoFile("supabase/migrations/revert/20261110150000_scoring_auto_teams.revert.sql");

test("start and undo take one round id, lower-cased; nothing else", () => {
  assert.deepEqual(parseNextRoundRequest({ action: "start", round_id: ROUND }), {
    ok: true,
    value: { action: "start", round_id: ROUND.toLowerCase() },
  });
  assert.equal(parseNextRoundRequest({ action: "undo", round_id: ROUND }).ok, true);
  assert.equal(parseNextRoundRequest({ action: "start", round_id: "nope" }).ok, false);
  assert.equal(parseNextRoundRequest({ action: "start" }).ok, false);
  assert.equal(parseNextRoundRequest({ action: "start", round_id: ROUND, extra: 1 }).ok, false);
  assert.equal(parseNextRoundRequest({ action: "delete", round_id: ROUND }).ok, false);
  assert.equal(parseNextRoundRequest(null).ok, false);
  assert.equal(parseNextRoundRequest([]).ok, false);
});

test("the switch takes a boolean only, for Singles unless Teams is named", () => {
  assert.deepEqual(parseNextRoundRequest({ action: "switch", auto_on: false }), {
    ok: true,
    value: { action: "switch", auto_on: false, event_type: "single" },
  });
  assert.deepEqual(parseNextRoundRequest({ action: "switch", auto_on: true, event_type: "section" }), {
    ok: true,
    value: { action: "switch", auto_on: true, event_type: "section" },
  });
  assert.equal(parseNextRoundRequest({ action: "switch", auto_on: true, event_type: "pairs" }).ok, false);
  assert.equal(parseNextRoundRequest({ action: "switch", auto_on: "off" }).ok, false);
  assert.equal(parseNextRoundRequest({ action: "switch" }).ok, false);
});

const readyStep = {
  engine: { auto_on: true, changed_at: null, changed_by: null },
  plan: {
    state: "ready",
    message: "No 4s in Aarhi Round 1, so the riders with 2 go through.",
    round_id: ROUND,
    round_name: "Aarhi Round 1",
    stage: "aarhi",
    rule: "strike",
    through_count: 5,
    entrant_count: 6,
    through: [
      { entrant_key: "solo:a", name: "Rider A", by_override: false },
      { entrant_key: "solo:b", name: "Rider B", by_override: false },
      { bad: true },
    ],
    next_stage: "aarhi",
    next_name: "Aarhi Round 2",
    first_up: "Rider A",
  },
  undo: null,
};

test("the next step payload is read safely", () => {
  const step = toNextStep(readyStep);

  assert.ok(step);
  assert.equal(step.plan.state, "ready");
  assert.equal(step.plan.rule, "strike");
  assert.deepEqual(step.plan.through, [
    { entrant_key: "solo:a", name: "Rider A", total: null },
    { entrant_key: "solo:b", name: "Rider B", total: null },
  ]);
  assert.equal(step.undo, null);
  assert.equal(toNextStep(null), null);
  assert.equal(toNextStep({ engine: { auto_on: true }, plan: { state: "weird" } }), null);
  assert.equal(toNextStep({ engine: {}, plan: { state: "ready" } }), null);

  const withUndo = toNextStep({
    ...readyStep,
    plan: { state: "riding", message: "6 of 6 rides still to go." },
    undo: { round_id: ROUND, round_name: "Aarhi Round 2" },
  });
  assert.deepEqual(withUndo?.undo, { round_id: ROUND, round_name: "Aarhi Round 2" });
  assert.equal(withUndo?.plan.through_count, null);
});

test("the button and confirm say what will happen", () => {
  const step = toNextStep(readyStep);
  assert.ok(step);
  assert.equal(startButtonLabel(step.plan), "Start Aarhi Round 2");
  assert.equal(startButtonLabel({ ...step.plan, next_stage: "final", next_name: "Final" }), "Start the Final");
  const detail = startConfirmDetail(step.plan);
  assert.match(detail, /5 riders ride Aarhi Round 2 once each, in start order, no pools/);
  assert.match(detail, /First up: Rider A/);
  assert.match(detail, /undo it until the first rider has ridden/);
});

test("migration: the next Single round keeps the start order, Section still shuffles", () => {
  assert.match(migration, /Keep the previous round\\'s start order: no shuffle \(20261110130000\)/);
  assert.match(migration, /select min\(prior\.run_order\)/);
  assert.match(migration, /where \(\\'solo:\\' \|\| registration\.id::text\) in \(/);
  assert.doesNotMatch(migration, /team\.id order by/);
  assert.match(migration, /lost its round-by-round renumber/);
  assert.match(revert, /execute replace\(definition, patched, original\)/);
});

test("migration: who goes through and what comes next", () => {
  assert.match(migration, /if v_stage = 'qualifier' then\s+v_rule := 'carry';/);
  assert.match(migration, /v_rule := 'strike';/);
  assert.match(migration, /v_rule := 'all_zero';/);
  assert.match(migration, /if v_through_count = 4 then\s+v_next_stage := 'final';\s+v_next_name := 'Final';/);
  assert.match(migration, /format\('Aarhi Round %s', v_aarhi_number \+ 1\)/);
  assert.match(migration, /if v_through_count < 4 then/);
  assert.match(migration, /'state', 'no_show'/);
  assert.match(migration, /on conflict \(round_id, entrant_key\) do nothing/);
});

test("migration: every function is service-role only and audited", () => {
  for (const signature of [
    "scoring_set_auto_engine(boolean, uuid, text, text)",
    "scoring_next_round_plan(uuid)",
    "scoring_next_step()",
    "scoring_start_next_round(uuid, uuid, text, text)",
    "scoring_undo_next_round(uuid, uuid, text, text)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(migration, new RegExp(`revoke execute on function public\\.${escaped}\\s+from public, anon, authenticated;`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${escaped}\\s+to service_role;`));
  }

  for (const action of ["start_next_round", "undo_next_round", "auto_engine_on", "auto_engine_off"]) {
    assert.match(migration, new RegExp(`'${action}'`));
  }

  assert.match(migration, /revoke all on table public\.scoring_engine_switch from public, anon, authenticated;/);
  assert.match(migration, /The auto engine is off\. Turn it on, or run the next round by hand\./);
  assert.match(migration, /Riding has started in %, so it cannot be undone\./);
});

test("route: administrators only; the card sits on the Scoring page", () => {
  assert.equal((route.match(/verifyRoleRequest\(\["admin"\]\)/g) ?? []).length, 2);
  assert.match(route, /rpc\("scoring_next_step"\)/);
  assert.match(route, /"scoring_start_next_round" : "scoring_undo_next_round"/);
  assert.match(route, /rpc\("scoring_set_auto_engine"/);
  assert.match(admin, /<NextStepCard/);
  assert.match(admin, /\[true, "Automatic"\],\s+\[false, "Manual"\],/);
  assert.match(admin, /if \(!engine\.auto_on\) \{/);
  // The Rounds section is the Manual tab's contents, inside the card.
  assert.match(admin, /\{\/\* Manual tab: every round tool \*\/\}\s+<div className="grid gap-8 lg:grid-cols-\[320px_minmax\(0,1fr\)\]">/);
  assert.match(admin, /<\/NextStepCard>/);
  assert.match(admin, /The highlighted tab already shows the mode\./i);
  assert.match(admin, /in the previous round's start order/);
});

test("Start qualifying takes no other fields", () => {
  assert.deepEqual(parseNextRoundRequest({ action: "start_qualifying" }), {
    ok: true,
    value: { action: "start_qualifying" },
  });
  assert.equal(parseNextRoundRequest({ action: "start_qualifying", round_id: ROUND }).ok, false);
});

test("qualifying pools: about 12, even, the larger first", () => {
  assert.deepEqual(qualifyingPools(0), []);
  assert.deepEqual(qualifyingPools(12), [12]);
  assert.deepEqual(qualifyingPools(13), [7, 6]);
  assert.deepEqual(qualifyingPools(25), [9, 8, 8]);
  assert.equal(qualifyingPools(129).length, 11);
  assert.equal(qualifyingPools(129).reduce((a, b) => a + b, 0), 129);
  assert.equal(qualifyingPreview(129), "129 riders checked in → 11 pools of 11–12, 3 attempts each");
  assert.equal(qualifyingPreview(12), "12 riders checked in → 1 pool of 12, 3 attempts each");
  assert.equal(qualifyingPreview(0), "Nobody has checked in yet.");
});

test("migration: Start qualifying, and check-ins fill the last pool without ever blocking", () => {
  assert.match(qualifying, /'single', 'Qualifying', 0, 3, null,\s+'upcoming', v_sort_order, c_pool_size, 'qualifier', null/);
  assert.match(qualifying, /scoring_build_start_list\(\s+v_new_id, 'all_checked_in'/);
  assert.match(qualifying, /Scoring is in Manual mode\./);
  assert.match(qualifying, /case when v_last_count >= v_round\.pool_size then v_last_index \+ 1 else v_last_index end/);
  assert.match(qualifying, /exception when others then\s+raise warning 'Automatic pools: could not place rider/);
  assert.match(qualifying, /after insert or update of checked_in_at on public\.solo_registrations/);
  assert.match(qualifying, /return 'kept_has_ridden';/);
  assert.match(qualifying, /return 'qualifying_over';/);
  assert.match(qualifying, /v_round\.parent_round_id is null and v_round\.stage is distinct from 'qualifier'/);

  for (const signature of [
    "scoring_start_qualifying(uuid, text, text)",
    "scoring_auto_place_rider(uuid, boolean, uuid)",
    "scoring_desk_pool(text)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(qualifying, new RegExp(`revoke execute on function public\\.${escaped}\\s+from public, anon, authenticated;`));
  }
});

test("the desk says the rider's pool; a failed lookup never fails the check-in", () => {
  assert.match(route, /rpc\("scoring_start_qualifying", actor\)/);
  assert.match(checkInRoute, /pool: checkedIn \? await readDeskPool\(serviceSupabase, code\.trim\(\), data\) : null/);
  assert.match(checkInRoute, /rpc\("scoring_desk_pool", \{ p_code: code \}\)/);
  assert.match(checkInPanel, /Pool given when qualifying starts\./);
  assert.match(checkInPanel, /` Pool \$\{pool\.pool\} · rider \$\{pool\.position\}\.`/);
});

test("Start teams takes no other fields; the preview counts complete teams", () => {
  assert.deepEqual(parseNextRoundRequest({ action: "start_teams" }), {
    ok: true,
    value: { action: "start_teams" },
  });
  assert.equal(parseNextRoundRequest({ action: "start_teams", round_id: ROUND }).ok, false);
  assert.equal(teamsPreview(0), "No team has all 4 riders checked in yet.");
  assert.equal(teamsPreview(1), "1 team with all 4 riders checked in → one queue, Round 1 needs 8 points");
  assert.equal(teamsPreview(9), "9 teams with all 4 riders checked in → one queue, Round 1 needs 8 points");
});

test("teams plan: target rule, totals and the Teams Final", () => {
  const step = toNextStep({
    event_type: "section",
    engine: { auto_on: true, changed_at: null, changed_by: null },
    checked_in_count: 6,
    plan: {
      state: "ready",
      message: "No team reached 16 in Teams Round 3 — the highest total goes through.",
      round_id: ROUND,
      round_name: "Teams Round 3 · Full House",
      stage: "section",
      rule: "highest",
      through_count: 2,
      entrant_count: 5,
      through: [
        { entrant_key: "team:a", name: "Team A", total: 14 },
        { entrant_key: "team:b", name: "Team B", total: 14 },
      ],
      next_stage: "final",
      next_name: "Teams Final",
      target: 16,
      next_target: null,
    },
    undo: null,
  });
  assert.ok(step);
  assert.equal(step.event_type, "section");
  assert.equal(step.plan.rule, "highest");
  assert.equal(step.plan.through[0]?.total, 14);
  assert.equal(startButtonLabel(step.plan), "Start the Teams Final");
});

test("migration: Teams engine rules", () => {
  assert.match(teamsMigration, /add column if not exists teams_auto_on boolean/);
  assert.match(teamsMigration, /'section', 'Teams Round 1', 1, 1, 8,/);
  assert.match(teamsMigration, /Teams are in Manual mode\. Switch Teams to Automatic, or create the round by hand\./);
  assert.match(teamsMigration, /'next_name', 'Teams Final'/);
  assert.match(teamsMigration, /' · Full House'/);
  assert.match(teamsMigration, /Keep the previous round\\'s team order: no shuffle \(20261110150000\)/);
  assert.match(teamsMigration, /after insert or update of checked_in_at on public\.team_members/);
  assert.match(teamsMigration, /exception when others then/);

  for (const signature of [
    "scoring_set_engine_mode(text, boolean, uuid, text, text)",
    "scoring_start_teams(uuid, text, text)",
    "scoring_team_target(integer)",
    "scoring_next_team_round_plan(uuid)",
    "scoring_next_step(text)",
    "scoring_auto_place_team(uuid, uuid)",
  ]) {
    const escaped = signature.replace(/[()]/g, "\\$&");
    assert.match(teamsMigration, new RegExp(`revoke execute on function public\\.${escaped}\\s+from public, anon, authenticated;`));
    assert.match(teamsRevert, new RegExp(`drop function if exists public\\.${escaped};`));
  }

  assert.match(teamsRevert, /drop column if exists teams_auto_on/);
});

test("route and card: Singles and Teams each have their own step and switch", () => {
  assert.match(route, /rpc\("scoring_next_step", \{ p_event_type: event \}\)/);
  assert.match(route, /rpc\("scoring_set_engine_mode", \{/);
  assert.match(route, /rpc\("scoring_start_teams", actor\)/);
  assert.match(route, /searchParams\.get\("event"\)/);
  assert.match(admin, /\["single", "Singles"\],\s+\["section", "Teams"\],/);
  assert.match(admin, /`\/api\/admin\/scoring\/next-round\?event=\$\{event\}`/);
  assert.match(admin, /\{ action: "switch", auto_on: autoOn, event_type: engineEvent \}/);
  assert.match(admin, /\{ action: "start_teams" \}/);
});

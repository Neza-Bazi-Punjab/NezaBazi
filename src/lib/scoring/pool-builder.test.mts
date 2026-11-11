import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  builderAdd,
  builderCanStartPool,
  builderCount,
  builderFromRuns,
  builderHas,
  builderMoveToPool,
  builderPoolLabel,
  builderRemove,
  builderShift,
  builderStartPool,
  builderToSave,
  emptyBuilder,
  parseMovePosition,
  parseSaveStartListRequest,
} from "./pool-builder.ts";

const repoFile = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

const migration = repoFile("supabase/migrations/20261111100000_scoring_pool_builder.sql");
const revert = repoFile("supabase/migrations/revert/20261111100000_scoring_pool_builder.revert.sql");
const draw = repoFile("supabase/migrations/20261025120000_live_scoring.sql");
const route = repoFile("src/app/api/admin/scoring/rounds/[id]/start-list/route.ts");
const admin = repoFile("src/app/admin/scoring/ScoringAdmin.tsx");
const builder = repoFile("src/app/admin/scoring/PoolBuilder.tsx");

const key = (kind: "solo" | "team", n: number) =>
  `${kind}:00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = key("solo", 1);
const B = key("solo", 2);
const C = key("solo", 3);
const D = key("solo", 4);

/* 1. Move to position -------------------------------------------------------- */

test("move to position: a whole number inside the run's pool and pass", () => {
  assert.deepEqual(parseMovePosition("7", 5, 16, 12), { ok: true, value: 7 });
  assert.deepEqual(parseMovePosition(" 16 ", 5, 16, 12), { ok: true, value: 16 });
  assert.deepEqual(parseMovePosition("5", 5, 16, 12), { ok: true, value: 5 });
});

test("move to position: refuses outside the block, the same place, and non-numbers", () => {
  assert.equal(parseMovePosition("4", 5, 16, 12).ok, false);
  assert.equal(parseMovePosition("17", 5, 16, 12).ok, false);
  assert.deepEqual(parseMovePosition("12", 5, 16, 12), { ok: false, error: "Already at position 12." });

  for (const text of ["", "  ", "x", "3.5", "-2", "1e2", "0x10"]) {
    assert.equal(parseMovePosition(text, 1, 20, 3).ok, false, text);
  }

  const outside = parseMovePosition("40", 5, 16, 12);
  assert.equal(outside.ok, false);
  assert.match(outside.ok ? "" : outside.error, /between positions 5 and 16/);
});

test("move to position: the box sits beside ↑/↓ and uses the existing move route", () => {
  assert.match(admin, /<MoveToPosition\s+run=\{run\}\s+first=\{first\}\s+last=\{last\}\s+disabled=\{busy \|\| fixed\}/);
  assert.match(admin, /onMove=\{\(newOrder\) => moveRun\(run, newOrder\)\}/);
  assert.match(admin, /`\/api\/admin\/scoring\/runs\/\$\{run\.id\}\/move`/);
  assert.match(admin, /parseMovePosition\(draft, first, last, run\.run_order\)/);
});

/* 2. The builder's state ----------------------------------------------------- */

test("builder: taps go next in the current pool; a second tap changes nothing", () => {
  let pools = emptyBuilder();
  pools = builderAdd(pools, A);
  pools = builderAdd(pools, B);
  pools = builderAdd(pools, A);
  assert.deepEqual(pools, [[A, B]]);
  assert.equal(builderCount(pools), 2);
  assert.equal(builderHas(pools, B), true);
  assert.equal(builderHas(pools, C), false);
});

test("builder: New pool only after the current pool has someone; sizes can be uneven", () => {
  let pools = emptyBuilder();
  assert.equal(builderCanStartPool(pools), false);
  assert.deepEqual(builderStartPool(pools), [[]]);

  pools = builderAdd(pools, A);
  pools = builderStartPool(pools);
  assert.deepEqual(pools, [[A], []]);
  assert.deepEqual(builderStartPool(pools), [[A], []]);

  pools = builderAdd(builderAdd(builderAdd(pools, B), C), D);
  assert.deepEqual(pools, [[A], [B, C, D]]);
  assert.deepEqual(builderToSave([[A], [B], []]), [[A], [B]]);
});

test("builder: reorder within a pool, never past its ends", () => {
  const pools = [[A, B, C]];
  assert.deepEqual(builderShift(pools, C, -1), [[A, C, B]]);
  assert.deepEqual(builderShift(pools, A, 1), [[B, A, C]]);
  assert.deepEqual(builderShift(pools, A, -1), pools);
  assert.deepEqual(builderShift(pools, C, 1), pools);
  assert.deepEqual(builderShift(pools, D, 1), pools);
});

test("builder: taking out drops an emptied pool but keeps the current one", () => {
  assert.deepEqual(builderRemove([[A], [B, C], [D]], B), [[A], [C], [D]]);
  assert.deepEqual(builderRemove([[A], [B], [D]], B), [[A], [D]]);
  assert.deepEqual(builderRemove([[A], [B]], B), [[A], []]);
  assert.deepEqual(builderRemove([[A]], A), [[]]);
});

test("builder: move to another pool rides last there", () => {
  assert.deepEqual(builderMoveToPool([[A, B], [C]], A, 1), [[B], [C, A]]);
  assert.deepEqual(builderMoveToPool([[A], [B, C]], A, 1), [[B, C, A]]);
  assert.deepEqual(builderMoveToPool([[A], [B]], A, 0), [[A], [B]]);
  assert.deepEqual(builderMoveToPool([[A], [B]], D, 0), [[A], [B]]);
  assert.deepEqual(builderMoveToPool([[A], [B]], A, 5), [[A], [B]]);
});

test("builder: starts from a drawn list laid out round by round", () => {
  // Round 1 for Pools A and B, then Round 2: the order is read from the first run.
  const runs = [
    { entrant_key: B, pool_label: "A", run_order: 1 },
    { entrant_key: A, pool_label: "A", run_order: 2 },
    { entrant_key: C, pool_label: "B", run_order: 3 },
    { entrant_key: A, pool_label: "A", run_order: 5 },
    { entrant_key: B, pool_label: "A", run_order: 4 },
    { entrant_key: C, pool_label: "B", run_order: 6 },
  ];
  assert.deepEqual(builderFromRuns(runs), [[B, A], [C]]);
  assert.deepEqual(builderFromRuns([]), [[]]);
  assert.deepEqual(builderFromRuns([{ entrant_key: D, pool_label: null, run_order: 1 }]), [[D]]);
});

test("builder: pool letters match the database's scoring_pool_label", () => {
  assert.deepEqual([0, 1, 25, 26, 27, 51].map(builderPoolLabel), ["A", "B", "Z", "AA", "AB", "AZ"]);
});

/* The request ---------------------------------------------------------------- */

test("save request: pools of entrant keys, lower-cased, one kind, no repeats", () => {
  assert.deepEqual(
    parseSaveStartListRequest({ pools: [[A, B], ["SOLO:ABCDEF00-0000-0000-0000-000000000003"]] }),
    { ok: true, value: { pools: [[A, B], ["solo:abcdef00-0000-0000-0000-000000000003"]] } }
  );

  for (const body of [
    null,
    [],
    {},
    { pools: [] },
    { pools: [[]] },
    { pools: [[A], []] },
    { pools: [[A, A]] },
    { pools: [[A], [A]] },
    { pools: [["solo:nope"]] },
    { pools: [[1]] },
    { pools: [[A, key("team", 9)]] },
    { pools: "A" },
    { pools: Array.from({ length: 53 }, (_, index) => [key("solo", index + 1)]) },
  ]) {
    assert.equal(parseSaveStartListRequest(body).ok, false, JSON.stringify(body));
  }
});

/* The route and the database function ----------------------------------------- */

test("route: PUT saves through scoring_save_start_list, admins only, actor from the session", () => {
  assert.match(route, /export async function PUT\(request: Request, context: RouteContext\)/);
  assert.match(route, /parseSaveStartListRequest\(body\.body\)/);
  assert.match(route, /\.rpc\("scoring_save_start_list", \{\s+p_round_id: roundId,\s+p_pools: parsed\.value\.pools,/);
  assert.match(route, /readJsonBody\(request, 64 \* 1024\)/);
  assert.match(admin, /"PUT",\s+\{ pools \}/);
});

test("migration: one service-role function, refused once the round has results", () => {
  assert.match(
    migration,
    /create or replace function public\.scoring_save_start_list\(\s+p_round_id uuid,\s+p_pools jsonb,/
  );
  assert.match(migration, /security invoker\s+set search_path = ''/);
  assert.match(
    migration,
    /revoke execute on function public\.scoring_save_start_list\(uuid, jsonb, uuid, text, text\)\s+from public, anon, authenticated;/
  );
  assert.match(
    migration,
    /grant execute on function public\.scoring_save_start_list\(uuid, jsonb, uuid, text, text\)\s+to service_role;/
  );
  assert.match(migration, /run\.status = 'scored'\s+\) then\s+raise exception 'This round already has results\./);
  assert.match(migration, /v_live := public\.scoring_lock_live\(\);/);
  assert.match(migration, /'save_start_list',/);
  // Idempotent: only create-or-replace, no table changes.
  assert.doesNotMatch(migration, /\b(create table|alter table|drop function)\b/i);
  assert.match(revert, /drop function if exists public\.scoring_save_start_list\(uuid, jsonb, uuid, text, text\);/);
});

test("migration: runs are made exactly as the draw makes them", () => {
  // Same insert columns, same team rider order, same renumber at the end.
  const insertSolo = /insert into public\.scoring_runs \(\s+round_id,\s+run_order,\s+attempt_number,\s+pool_label,\s+solo_registration_id,\s+entrant_key,\s+rider_name,\s+horse_name,\s+team_name,\s+rider_location\s+\)/;
  const insertTeam = /insert into public\.scoring_runs \(\s+round_id,\s+run_order,\s+attempt_number,\s+pool_label,\s+team_member_id,\s+team_id,\s+entrant_key,\s+rider_name,\s+horse_name,\s+team_name,\s+rider_location\s+\)/;
  const teamOrder = "order by member.is_leader desc nulls last, member.created_at asc, member.id asc";

  for (const source of [draw, migration]) {
    assert.match(source, insertSolo);
    assert.match(source, insertTeam);
    assert.ok(source.includes(teamOrder));
  }

  assert.match(migration, /for v_attempt in 1 \.\. v_round\.attempts_per_rider loop/);
  assert.match(migration, /else public\.scoring_pool_label\(v_pool_index\)/);
  assert.match(migration, /perform public\.scoring_renumber_round\(p_round_id\);\s+insert into public\.admin_audit_log/);
  assert.match(migration, /if v_round\.pool_size is null and v_pool_count <> 1 then/);
  assert.match(migration, /current_run_id = null,\s+called_pool_label = null,/);
});

test("the builder lists checked-in entrants only and saves through the page's confirm", () => {
  assert.match(builder, /\.filter\(\(entrant\) => entrant\.checkedIn && !builderHas\(pools, entrant\.key\)\)/);
  assert.match(builder, /checkedIn: team\.member_count === 4 && team\.checked_in_count === 4/);
  assert.match(builder, /onClick=\{\(\) => onSave\(toSave, pooled \? labels : \[\]\)\}/);
  assert.match(builder, /disabled=\{busy \|\| scoredCount > 0 \|\| placedCount === 0\}/);
  assert.match(admin, /onSave=\{\(pools, labels\) => saveBuiltStartList\(round, pools, labels\)\}/);
});

test("the builder shows and searches horse names", () => {
  assert.match(builder, /const text = `\$\{entrant\.name\} \$\{entrant\.horse \?\? ""\}`\.toLowerCase\(\);/);
  assert.match(builder, /\{entrant\.horse && \(/);
  const state = repoFile("src/lib/scoring/admin-state.ts");
  assert.match(state, /\.select\("id, full_name, horse_name, checked_in_at"\)/);
  assert.match(state, /\.select\("team_id, horse_name, checked_in_at"\)/);
});

test("builder: a tap can go into any pool, not only the last", () => {
  assert.deepEqual(builderAdd([[A], [B]], C, 0), [[A, C], [B]]);
  assert.deepEqual(builderAdd([[A], [B]], C, 1), [[A], [B, C]]);
  assert.deepEqual(builderAdd([[A], [B]], C, 9), [[A], [B, C]]);
  assert.deepEqual(builderAdd([[A], [B]], A, 1), [[A], [B]]);
  assert.match(builder, /role="group" aria-label="Add to pool"/);
  assert.match(builder, /builderAdd\(pools, entrant\.key, currentIndex\)/);
});

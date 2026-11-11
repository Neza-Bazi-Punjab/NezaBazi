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
  builderStartOver,
  builderWithOpenLast,
  emptyBuilder,
  firstOpenAttempt,
  parseMovePosition,
  startedPoolLabels,
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
  assert.match(builder, /disabled=\{busy \|\| unpooledStarted \|\| placedCount === 0\}/);
  assert.match(admin, /onSave=\{\(pools, labels\) => saveBuiltStartList\(round, pools, labels\)\}/);
});

test("the builder shows and searches horse names", () => {
  // "Find a rider" is the check-in desk's search, with the horse as a detail.
  assert.match(builder, /import \{ searchRiders, type SearchableRider \} from "@\/lib\/check-in-search";/);
  assert.match(builder, /search: searchable\(team\.team_name, team\.horse_names\)/);
  assert.match(builder, /details: rider\.details,/);
  assert.match(admin, /matchRank\(\{ \.\.\.rider, team_name: null \}, query\)/);
  assert.match(builder, /\{entrant\.horse && /);
  const state = repoFile("src/lib/scoring/admin-state.ts");
  assert.match(
    state,
    /"id, full_name, horse_name, checked_in_at, father_name, mother_name, location, email, phone, confirmation_code"/
  );
  assert.match(state, /details: \[row\.father_name, row\.mother_name, row\.location, row\.horse_name\]/);
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

/* Adding pools to a round that is riding (20261111110000) ------------------- */

const keepRidden = repoFile("supabase/migrations/20261111110000_scoring_pool_builder_keep_ridden.sql");
const keepRiddenRevert = repoFile(
  "supabase/migrations/revert/20261111110000_scoring_pool_builder_keep_ridden.revert.sql"
);

test("started pools: any run scored, skipped or on course; new pools ride from the latest pass", () => {
  const runs = [
    { pool_label: "A", status: "scored", attempt_number: 1 },
    { pool_label: "A", status: "pending", attempt_number: 2 },
    { pool_label: "B", status: "on_course", attempt_number: 1 },
    { pool_label: "C", status: "pending", attempt_number: 1 },
    { pool_label: null, status: "void", attempt_number: 1 },
  ];
  assert.deepEqual([...startedPoolLabels(runs)].sort(), ["A", "B"]);
  assert.equal(firstOpenAttempt(runs), 1);
  assert.equal(firstOpenAttempt([...runs, { status: "scored", attempt_number: 2 }]), 2);
  assert.equal(firstOpenAttempt([{ status: "pending", attempt_number: 3 }]), 1);
});

test("builder keeps started pools put: an open pool after them, Start over clears only later pools", () => {
  const lockedA = (index: number) => index === 0;
  assert.deepEqual(builderWithOpenLast([[A, B]], lockedA), [[A, B], []]);
  assert.deepEqual(builderWithOpenLast([[A], [C]], lockedA), [[A], [C]]);
  assert.deepEqual(builderWithOpenLast([], lockedA), [[]]);
  assert.deepEqual(builderStartOver([[A], [B, C], [D]], lockedA), [[A], []]);
  assert.deepEqual(builderStartOver([[A], [B]], () => false), [[]]);
  assert.deepEqual(builderStartOver([[A], [B], [C]], (index) => index === 1), [[A], [B], []]);
});

test("keep-ridden migration: started pools kept unchanged, the rest written, no Round 1 slot behind the riding", () => {
  assert.match(
    keepRidden,
    /create or replace function public\.scoring_save_start_list\(\s+p_round_id uuid,\s+p_pools jsonb,/
  );
  assert.doesNotMatch(keepRidden, /This round already has results/);
  assert.match(keepRidden, /and run\.status <> 'pending'/);
  assert.match(keepRidden, /raise exception 'Pool % has started riding: it must stay as it is\./);
  assert.match(keepRidden, /if v_sent is distinct from v_existing then/);
  assert.match(
    keepRidden,
    /delete from public\.scoring_runs as run\s+where run\.round_id = p_round_id\s+and not coalesce\(run\.pool_label = any\(v_locked\), false\);/
  );
  assert.match(keepRidden, /continue when coalesce\(v_label = any\(v_locked\), false\);/);
  assert.match(keepRidden, /for v_attempt in v_first_attempt \.\. v_round\.attempts_per_rider loop/);
  assert.match(keepRidden, /Riding has started in this round and it has no pools/);
  assert.match(keepRidden, /perform public\.scoring_renumber_round\(p_round_id\);/);
  assert.match(
    keepRidden,
    /revoke execute on function public\.scoring_save_start_list\(uuid, jsonb, uuid, text, text\)\s+from public, anon, authenticated;/
  );
  assert.match(keepRidden, /'pools_kept', to_jsonb\(v_locked\)/);
  assert.doesNotMatch(keepRidden, /\b(create table|alter table|drop function)\b/i);
  assert.match(keepRiddenRevert, /Re-run supabase\/migrations\/20261111100000_scoring_pool_builder\.sql/);
});

test("the builder button stays usable once a round has results", () => {
  assert.match(admin, /disabled=\{busy\}\s+aria-expanded=\{builderRoundId === round\.id\}/);
  assert.match(builder, /started riding: kept exactly as is/);
  assert.match(builder, /disabled=\{busy \|\| locked\}/);
});

test("the builder shows only the pool being added to until asked for all of them", () => {
  assert.match(builder, /const \[showAll, setShowAll\] = useState\(false\);/);
  // Pools that have ridden are left off "Add to" unless every pool is shown.
  assert.match(builder, /if \(locked && !showAll\) \{\s*return null;\s*\}/);
  // The list on the right is the current pool alone by default.
  assert.match(builder, /if \(pooled && !showAll && !isCurrent\) \{\s*return null;\s*\}/);
  assert.match(builder, /showAll \? `Show Only Pool \$\{currentLabel\}` : `Show All \$\{pools\.length\} Pools`/);
});

test("builder search finds every rider, placed or not, and says where they are", () => {
  // Searching covers every entrant, not only the unplaced checked-in ones.
  assert.match(builder, /const everyone = \[\.\.\.entrants\.values\(\)\];/);
  assert.match(builder, /if \(!searching\) \{\s+return \[\.\.\.entrants\.values\(\)\]\s+\.filter\(\(entrant\) => entrant\.checkedIn && !builderHas\(pools, entrant\.key\)\)/);
  assert.match(builder, /`In Pool \$\{builderPoolLabel\(place\.index\)\} · \$\{place\.position\}`/);
  assert.match(builder, /Not checked in/);
  assert.match(builder, /update\(builderMoveToPool\(pools, entrant\.key, currentIndex\)\)/);
  assert.match(builder, /pooled && place\.index !== currentIndex && !isLocked\(place\.index\)/);
});

test("the standings table is laid out pool by pool, in riding order", () => {
  assert.match(admin, /const poolOf = \(label: string \| null\) => \(label \? poolIndex\(label\) : -1\);/);
  assert.match(
    admin,
    /poolOf\(first\.pool_label\) - poolOf\(second\.pool_label\) \|\|\s*\(firstRide\.get\(first\.entrant_key\) \?\? 0\) - \(firstRide\.get\(second\.entrant_key\) \?\? 0\)/
  );
  assert.match(admin, /\{standings\.map\(\(row, index\) => \{/);
  assert.match(admin, /Pool \{row\.pool_label\}/);
});

test("the standings list has no fixed width, so it never scrolls sideways", () => {
  const from = admin.indexOf("{/* Standings and overrides */}");
  const section = admin.slice(from, admin.indexOf("{/* Podium */}", from));

  assert.doesNotMatch(section, /<table|overflow-x-auto|min-w-\[\d/);
  // The row wraps by the room it has; nothing in it refuses to shrink.
  assert.match(section, /className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b/);
  assert.doesNotMatch(section, /shrink-0|grid-cols-/);
});

test("the Aarhi tab lists who is through, in riding order, and starts the next round", () => {
  assert.match(admin, /\["single", "Aarhi", true\],/);
  assert.match(admin, /const through = board\.filter\(\(row\) => row\.advanced === true\);/);
  assert.match(admin, /const board = inRidingOrder\(data\.leaderboards_by_round\[source\.id\] \?\? \[\], sourceRuns\);/);
  // The button is the engine's own Start, offered only when its plan is ready.
  assert.match(admin, /const ready = Boolean\(step\?\.engine\.auto_on && plan\?\.state === "ready"\);/);
  assert.match(admin, /onClick=\{\(\) => startNextRound\(plan\)\}/);
  // A rider can be taken off the list from the tab.
  assert.match(admin, /onClick=\{\(\) => setOverride\(source, row, false\)\}/);
});

test("start list: only the pool riding now is open; a tap or a search opens the rest", () => {
  assert.match(admin, /const \[openPools, setOpenPools\] = useState<Record<string, boolean>>\(\{\}\);/);
  assert.match(admin, /const ridingPoolKey = useMemo\(/);
  assert.match(
    admin,
    /searchingStartList \|\|\s+shownGroups\.length === 1 \|\|\s+\(openPools\[`\$\{round\.id\}:\$\{groupKey\}`\] \?\? ridingNow\)/
  );
  assert.match(admin, /aria-expanded=\{poolOpen\}/);
  assert.match(admin, /\{poolOpen && \(\s+<div id=\{poolBodyId\} className="space-y-4">/);
  // Call Pool stays on the header, usable while the pool is closed.
  assert.match(admin, /<\/h4>\s+\{group\.label && \(\s+<button\s+type="button"\s+onClick=\{\(\) => callPool\(round, group\.label as string\)\}/);
});

test("standings: pools fold like the start list, the pool riding now open", () => {
  const from = admin.indexOf("{/* Standings and overrides */}");
  const section = admin.slice(from, admin.indexOf("{/* Podium */}", from));

  assert.match(admin, /const \[openStandingPools, setOpenStandingPools\] = useState<Record<string, boolean>>\(\{\}\);/);
  assert.match(
    section,
    /row\.pool_label === null \|\|\s+\(openStandingPools\[standingKey\] \?\? row\.pool_label === ridingPoolKey\)/
  );
  assert.match(section, /aria-expanded=\{standingOpen\}/);
  assert.match(section, /\{standingOpen && \(\s+<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b/);
  // The Through / Out / Clear buttons are unchanged.
  assert.match(section, /onClick=\{\(\) => setOverride\(round, row, true\)\}/);
  assert.match(section, /onClick=\{\(\) => setOverride\(round, row, false\)\}/);
  assert.match(section, /onClick=\{\(\) => setOverride\(round, row, null\)\}/);
});

test("team rounds: the judges score a whole team from one card, one result per rider", () => {
  const panel = repoFile("src/app/judge/JudgePanel.tsx");
  const card = repoFile("src/app/judge/TeamCard.tsx");

  // Only in a Section round, for the team that is next, and never while a
  // result is being changed from the log.
  assert.match(
    panel,
    /const teamLead = round\?\.event_type === "section" && !editing \? \(currentRun \?\? startRider\) : null;/
  );
  // Each rider keeps their own result: the card's picks go through the
  // ordinary score action, one after the other.
  assert.match(
    panel,
    /for \(const pick of picks\) \{\s*next = await sendAction\(\s*\{ kind: "score", run: pick\.run, result: pick\.result, override: false, fromMain: false \},/
  );
  // Nothing is saved until every rider has a score.
  assert.match(card, /const complete = picks\.length === runs\.length && runs\.length > 0;/);
  assert.match(card, /disabled=\{busy \|\| !complete\}/);
});

test("a podium place can go to an entrant of any round of the same event", () => {
  assert.match(admin, /\.filter\(\(other\) => other\.event_type === target\.event_type\)/);
  assert.match(admin, /\{podiumChoices\(round\)\.map\(\(row\) => \(/);
});

// Round-by-round riding (20261107100000_scoring_round_first_order.sql): the
// start list falls into (round, pool) blocks, "next" walks those blocks, and
// the called pool follows the riding by where it moved, not by pool letter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  blockPosition,
  calledBlockRidden,
  calledPoolAfter,
  nextPoolBlock,
  poolSummaries,
  ridingPoolBlock,
  runBlocks,
  shownCalledPool,
} from "./blocks.ts";
import { lastRiddenRun, nextToRide, upNextRuns } from "./next-to-ride.ts";
import { sampleCalledPoolAfter } from "./sample-engine.ts";
import type { RunStatus } from "./types.ts";

const repoFile = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

type Run = {
  id: string;
  run_order: number;
  attempt_number: number;
  pool_label: string | null;
  status: RunStatus;
};

/* Three pools of two riders, three rounds, laid out round by round. */
const list = (status: (attempt: number, pool: string, rider: number) => RunStatus = () => "pending") => {
  const runs: Run[] = [];
  let order = 0;

  for (const attempt of [1, 2, 3]) {
    for (const pool of ["A", "B", "C"]) {
      for (const rider of [1, 2]) {
        order += 1;
        runs.push({
          id: `${pool}${rider}-${attempt}`,
          run_order: order,
          attempt_number: attempt,
          pool_label: pool,
          status: status(attempt, pool, rider),
        });
      }
    }
  }

  return runs;
};

test("the start list falls into round-and-pool blocks in riding order", () => {
  const blocks = runBlocks(list());
  assert.deepEqual(
    blocks.map((block) => `R${block.attempt}${block.pool}:${block.runs.length}`),
    ["R1A:2", "R1B:2", "R1C:2", "R2A:2", "R2B:2", "R2C:2", "R3A:2", "R3B:2", "R3C:2"]
  );
});

test("before anything is called, the first pool with riders to go is next", () => {
  assert.deepEqual(nextPoolBlock(list(), null, null), { pool: "A", attempt: 1 });
});

test("after Round 1 · Pool C comes Round 2 · Pool A", () => {
  const runs = list((attempt, pool, rider) =>
    attempt === 1 && (pool !== "C" || rider === 1) ? "scored" : attempt === 1 ? "on_course" : "pending"
  );
  assert.deepEqual(ridingPoolBlock(runs, "C", "C2-1"), { pool: "C", attempt: 1 });
  assert.deepEqual(nextPoolBlock(runs, "C", "C2-1"), { pool: "A", attempt: 2 });
});

test("a pool whose riders have all carried is passed over", () => {
  // Both Pool B riders carried in Round 1: their later attempts are void.
  const runs = list((attempt, pool) =>
    attempt === 1 ? "scored" : pool === "B" ? "void" : attempt === 2 && pool === "A" ? "on_course" : "pending"
  );
  runs.find((run) => run.id === "A2-2")!.status = "pending";
  assert.deepEqual(nextPoolBlock(runs, "A", "A1-2"), { pool: "C", attempt: 2 });
});

test("nothing is next once the last block has ridden", () => {
  const runs = list((attempt, pool, rider) =>
    attempt === 3 && pool === "C" && rider === 2 ? "on_course" : "scored"
  );
  assert.equal(nextPoolBlock(runs, "C", "C2-3"), null);
});

test("a pool called ahead of the riding is the anchor for next", () => {
  // Pool A is still riding Round 1 by hand, but Pool B has been called.
  const runs = list((attempt, pool, rider) =>
    attempt === 1 && pool === "A" && rider === 1 ? "on_course" : "pending"
  );
  assert.deepEqual(nextPoolBlock(runs, "B", "A1-1"), { pool: "C", attempt: 1 });
});

test("the called pool follows the riding across the round boundary", () => {
  const runs = list((attempt) => (attempt === 1 ? "scored" : "pending"));
  const from = runs.find((run) => run.id === "C2-1")!;
  const to = runs.find((run) => run.id === "A1-2")!;

  // Pool C was riding, so "called" moves on to Pool A (Round 2) even though
  // A comes before C in the alphabet.
  assert.equal(calledPoolAfter(runs, "C", from, to), "A");
  // Nothing called yet, or nobody on course: the new rider's pool.
  assert.equal(calledPoolAfter(runs, null, from, to), "A");
  assert.equal(calledPoolAfter(runs, "C", null, to), "A");
  // Nothing new on course: unchanged.
  assert.equal(calledPoolAfter(runs, "C", from, null), "C");
});

test("a pool called ahead stays called while it has riders to go", () => {
  const runs = list((attempt, pool) => (attempt === 1 && pool === "A" ? "scored" : "pending"));
  const from = runs.find((run) => run.id === "A1-1")!;
  const to = runs.find((run) => run.id === "A2-1")!;

  assert.equal(calledPoolAfter(runs, "B", from, to), "B");

  // Once the called pool has nobody left to ride it follows the riding.
  for (const run of runs) {
    if (run.pool_label === "B") {
      run.status = "void";
    }
  }

  assert.equal(calledPoolAfter(runs, "B", from, to), "A");
});

test("the training engine follows the same rule as blocks.ts", () => {
  const cases: [string | null, string | null, string | null][] = [
    ["C", "C", "A"],
    [null, "C", "A"],
    ["C", null, "A"],
    ["B", "A", "A"],
    ["B", "A", null],
  ];
  const runs = list((attempt, pool) => (attempt === 1 && pool !== "B" ? "scored" : "pending"));

  for (const [called, fromPool, toPool] of cases) {
    const from = fromPool ? { pool_label: fromPool } : null;
    const to = toPool ? runs.find((run) => run.pool_label === toPool && run.status === "pending")! : null;
    assert.equal(
      sampleCalledPoolAfter(runs, called, from, to),
      calledPoolAfter(runs, called, from, to),
      `called ${called}, from ${fromPool}, to ${toPool}`
    );
  }
});

test("the migration lays start lists out round by round and keeps called in step", () => {
  const sql = repoFile("supabase/migrations/20261107100000_scoring_round_first_order.sql");
  const renumber = sql.slice(sql.indexOf("create or replace function public.scoring_renumber_round"));

  assert.ok(
    renumber.indexOf("inner_run.attempt_number asc,") <
      renumber.indexOf("public.scoring_pool_index(inner_run.pool_label) asc nulls first,"),
    "renumber orders by attempt before pool"
  );
  assert.match(sql, /perform public\.scoring_renumber_round\(p_round_id\);\\n/);
  assert.match(sql, /create or replace function public\.scoring_called_pool_after\(/);

  for (const name of [
    "scoring_advance_live_pointer(uuid, integer)",
    "scoring_clear_result(uuid, boolean, uuid, text, text)",
    "scoring_set_live(jsonb, uuid, text, text)",
  ]) {
    assert.ok(sql.includes(`to_regprocedure('public.${name}')`), `${name} is patched`);
  }

  // Every anchor it patches is in the original migration exactly once.
  const original = repoFile("supabase/migrations/20261025120000_live_scoring.sql");
  const anchors = [...sql.matchAll(/\$anchor\$([\s\S]*?)\$anchor\$/g)].map((match) => match[1]);
  assert.equal(anchors.length, 3);

  for (const anchor of anchors) {
    assert.equal(original.split(anchor).length - 1, 1);
  }

  assert.equal(original.split("  return v_run_order;\nend;").length - 1, 1);
});

test("a run is numbered within its pool and round, not the whole list", () => {
  const runs = list((attempt, pool, rider) => (attempt === 1 && pool === "B" && rider === 1 ? "void" : "pending"));
  const byId = (id: string) => runs.find((run) => run.id === id)!;

  assert.deepEqual(blockPosition(runs, byId("A1-1")), { index: 1, size: 2 });
  assert.deepEqual(blockPosition(runs, byId("B2-1")), { index: 2, size: 2 }, "a skipped ride still counts");
  assert.deepEqual(blockPosition(runs, byId("C2-3")), { index: 2, size: 2 });
});

/* Between riders (20261107130000_scoring_judge_starts_each_rider.sql): nobody
   is on course until the judge taps Start, and every screen names the rider
   the Start button names. */

const ids = (runs: readonly { id: string }[]) => runs.map((run) => run.id);
const live = (called: string | null, current: string | null = null) => ({
  current_run_id: current,
  called_pool_label: called,
});

test("before anything is scored, the called pool's first rider (or the list's first) rides next", () => {
  assert.equal(nextToRide(list(), live(null))?.id, "A1-1");
  assert.equal(nextToRide(list(), live("B"))?.id, "B1-1", "a pool called before the first result");
  assert.equal(lastRiddenRun(list()), null);
});

test("nobody rides next while a rider is on course", () => {
  const runs = list((attempt, pool, rider) => (attempt === 1 && pool === "A" && rider === 1 ? "on_course" : "pending"));
  assert.equal(nextToRide(runs, live("A", "A1-1")), null);
});

test("between riders, the next rider after the furthest result rides next", () => {
  const runs = list((attempt, pool, rider) => (attempt === 1 && pool === "A" && rider === 1 ? "scored" : "pending"));
  assert.equal(nextToRide(runs, live("A"))?.id, "A2-1");
  assert.deepEqual(ids(upNextRuns(runs, live("A"), 3)), ["A2-1", "B1-1", "B2-1"]);
});

test("a rider passed over earlier in the list is not named up next", () => {
  // A1 was passed over (still pending); A2 has ridden and left the course.
  const runs = list((attempt, pool, rider) => (attempt === 1 && pool === "A" && rider === 2 ? "scored" : "pending"));
  assert.equal(nextToRide(runs, live("A"))?.id, "B1-1");
  assert.deepEqual(ids(upNextRuns(runs, live("A"), 3)), ["B1-1", "B2-1", "C1-1"]);

  // Nobody left after the furthest result: nobody is named, not the rider
  // passed over.
  const end = list((attempt, pool, rider) => (attempt === 1 && pool === "A" && rider === 1 ? "pending" : "scored"));
  assert.equal(nextToRide(end, live("C")), null);
  assert.deepEqual(upNextRuns(end, live("C"), 5), []);
});

test("a pool called ahead rides next from its first rider still to ride", () => {
  // Pool A rode its first rider; Pool B has been called ahead of A2.
  const runs = list((attempt, pool, rider) => (attempt === 1 && pool === "A" && rider === 1 ? "scored" : "pending"));
  assert.equal(nextToRide(runs, live("B"))?.id, "B1-1");
  assert.deepEqual(ids(upNextRuns(runs, live("B"), 3)), ["B1-1", "B2-1", "C1-1"]);
});

test("with a rider on course, up next is unchanged: the riders after them", () => {
  const runs = list((attempt, pool, rider) =>
    attempt === 1 && pool === "A" ? (rider === 1 ? "pending" : "on_course") : "pending"
  );
  const old = runs.filter((run) => run.status === "pending" && run.run_order > 2).slice(0, 5);
  assert.deepEqual(ids(upNextRuns(runs, live("A", "A2-1"), 5)), ids(old));
});

test("once the called pool's block has ridden, Next is the pool after it, not its next round", () => {
  // Round 1 has ridden to the end; Pool C (the last to ride) is still called.
  const runs = list((attempt) => (attempt === 1 ? "scored" : "pending"));
  assert.equal(calledBlockRidden(runs, "C", null), true);
  assert.equal(shownCalledPool(runs, "C", null), null);
  assert.deepEqual(nextPoolBlock(runs, "C", null), { pool: "A", attempt: 2 });
  assert.equal(nextToRide(runs, live("C"))?.id, "A1-2", "the same pool the Start button names");

  // Not while a rider is on course, nor while the called block has riders to go.
  assert.equal(calledBlockRidden(runs, "C", "A1-2"), false);
  const midBlock = list((attempt, pool, rider) => (attempt === 1 && (pool !== "C" || rider === 1) ? "scored" : "pending"));
  assert.equal(calledBlockRidden(midBlock, "C", null), false);
  assert.deepEqual(nextPoolBlock(midBlock, "C", null), { pool: "A", attempt: 2 });
});

test("a rider passed over earlier does not pull Next back to their pool", () => {
  // A1 was passed over in Round 1; the rest of Round 1 has ridden.
  const runs = list((attempt, pool, rider) => (attempt === 1 && !(pool === "A" && rider === 1) ? "scored" : "pending"));
  assert.deepEqual(nextPoolBlock(runs, "C", null), { pool: "A", attempt: 2 });
  assert.deepEqual(nextPoolBlock(runs, null, null), { pool: "A", attempt: 2 }, "the judges' panel passes null");
});

test("the pool list marks the rider Start names as up next, between riders", () => {
  const panel = (runs: Run[]) =>
    runs.map((run) => ({
      ...run,
      entrant_key: `solo:${run.id.split("-")[0]}`,
      rider_name: run.id.split("-")[0],
      team_name: null,
      result: run.status === "scored" ? ("miss" as const) : null,
      points: run.status === "scored" ? 0 : null,
    }));
  const upNextOf = (summaries: ReturnType<typeof poolSummaries>) =>
    summaries.flatMap((pool) => pool.entrants.filter((entrant) => entrant.status === "up_next").map((entrant) => entrant.name));
  const nobodyThrough = new Map<string, boolean | null>();

  // A1 passed over, A2 ridden: B1 is up next, not A1.
  const passed = panel(list((attempt, pool, rider) => (attempt === 1 && pool === "A" && rider === 2 ? "scored" : "pending")));
  assert.deepEqual(upNextOf(poolSummaries(passed, nobodyThrough, "A", null)), ["B1"]);

  // Round 1 done with Pool C still called: Pool A (Round 2) is the "Next" pool.
  const roundDone = panel(list((attempt) => (attempt === 1 ? "scored" : "pending")));
  const summaries = poolSummaries(roundDone, nobodyThrough, "C", null);
  assert.deepEqual(
    summaries.map((pool) => `${pool.pool}:${pool.state.kind}`),
    ["A:up_next", "B:waiting", "C:waiting"]
  );
  assert.deepEqual(upNextOf(summaries), ["A1"]);
});

test("the public state names the same next rider as the judges' Start", () => {
  const server = repoFile("src/lib/scoring/server.ts");
  assert.match(server, /import \{ upNextRuns \} from "@\/lib\/scoring\/next-to-ride";/);
  assert.match(server, /const upNext = upNextRuns\(runs, live, UP_NEXT_LIMIT\);/);
  assert.doesNotMatch(server, /run\.run_order > after/);

  // Loadable by node --test and by the browser panels alike: no imports.
  assert.doesNotMatch(repoFile("src/lib/scoring/next-to-ride.ts"), /^import /m);
});

test("withAttemptMarks: a box per attempt for a Single qualifier, nothing for other rounds", async () => {
  const { withAttemptMarks } = await import("./blocks.ts");
  const run = (
    entrant: string,
    attempt: number,
    status: RunStatus,
    result: "carry" | "strike" | "miss" | null = null
  ) => ({
    id: `${entrant}-${attempt}`,
    run_order: attempt,
    attempt_number: attempt,
    pool_label: "A",
    status,
    entrant_key: entrant,
    rider_name: entrant,
    team_name: null,
    result,
    points: result === "carry" ? 4 : result === "strike" ? 2 : result === "miss" ? 0 : null,
  });
  const runs = [
    run("solo:a", 1, "scored", "miss"),
    run("solo:a", 2, "scored", "carry"),
    run("solo:a", 3, "void"),
    run("solo:b", 1, "scored", "strike"),
    run("solo:b", 2, "on_course"),
    run("solo:b", 3, "pending"),
  ];
  const rows = [{ entrant_key: "solo:a" }, { entrant_key: "solo:b" }, { entrant_key: "solo:c" }];
  const qualifier = { event_type: "single", attempts_per_rider: 3 };

  const marked = withAttemptMarks(rows, runs, qualifier);

  assert.deepEqual(marked[0].attempts, [
    { kind: "result", result: "miss", points: 0 },
    { kind: "result", result: "carry", points: 4 },
    { kind: "not_needed" },
  ]);
  assert.deepEqual(marked[1].attempts, [
    { kind: "result", result: "strike", points: 2 },
    { kind: "on_course" },
    { kind: "to_ride" },
  ]);
  // A row with no runs still gets its three (empty) marks, and the input is
  // not changed.
  assert.deepEqual(marked[2].attempts, [{ kind: "none" }, { kind: "none" }, { kind: "none" }]);
  assert.deepEqual(rows[0], { entrant_key: "solo:a" });

  // One attempt, a team round, or no round: the rows come back as they are.
  assert.equal(withAttemptMarks(rows, runs, { event_type: "single", attempts_per_rider: 1 }), rows);
  assert.equal(withAttemptMarks(rows, runs, { event_type: "section", attempts_per_rider: 3 }), rows);
  assert.equal(withAttemptMarks(rows, runs, null), rows);
});

test("withProvisionalOuts: nobody is shown Out in an Aarhi or team round until somebody is Through", async () => {
  const { withProvisionalOuts } = await import("./blocks.ts");
  const row = (advanced: boolean | null, advanced_overridden = false) => ({ advanced, advanced_overridden });
  const aarhi = { event_type: "single", attempts_per_rider: 1 };
  const qualifier = { event_type: "single", attempts_per_rider: 3 };
  const teams = { event_type: "section", attempts_per_rider: 1 };
  const shown = (rows: ReturnType<typeof row>[]) => rows.map((entry) => entry.advanced);

  // No 4 yet: a rider on 2 (Out by the view) may still go through.
  const noCarry = [row(false), row(false), row(null)];
  assert.deepEqual(shown(withProvisionalOuts(noCarry, aarhi)), [null, null, null]);
  assert.deepEqual(shown(noCarry), [false, false, null], "the input is not changed");

  // Somebody carried: the others really are out.
  const carried = [row(true), row(false), row(null)];
  assert.equal(withProvisionalOuts(carried, aarhi), carried);

  // An administrator's Out stands even with nobody through.
  assert.deepEqual(shown(withProvisionalOuts([row(false, true), row(false)], aarhi)), [false, null]);

  // Teams: the same until a team reaches the target.
  assert.deepEqual(shown(withProvisionalOuts([row(false), row(false)], teams)), [null, null]);
  assert.equal(withProvisionalOuts(carried, teams), carried);

  // The qualifier: only a 4 goes through, so Out is final.
  assert.equal(withProvisionalOuts(noCarry, qualifier), noCarry);
  assert.equal(withProvisionalOuts(noCarry, null), noCarry);
});

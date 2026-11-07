// Round-by-round riding (20261107100000_scoring_round_first_order.sql): the
// start list falls into (round, pool) blocks, "next" walks those blocks, and
// the called pool follows the riding by where it moved, not by pool letter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  blockPosition,
  calledPoolAfter,
  nextPoolBlock,
  ridingPoolBlock,
  runBlocks,
} from "./blocks.ts";
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

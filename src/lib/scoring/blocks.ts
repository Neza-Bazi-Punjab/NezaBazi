// Which pool rides next when a round is ridden round by round.
//
// A Single qualification round gives each rider up to three attempts, which
// the judges and commentators call "Round 1", "Round 2" and "Round 3". They
// are ridden one round at a time across the field (Round 1 for Pool A, B, C,
// then Round 2 for Pool A, B, C …) so every horse rests between its attempts.
// The start list is laid out that way (supabase/migrations/
// 20261107100000_scoring_round_first_order.sql), so the list falls into
// "blocks": runs in a row that share a round (attempt) and a pool.
//
// Pure: no React, no database. The server, the training engine and the panels
// all use these, so "next" means the same thing everywhere.
import { lastRiddenRun, nextToRide } from "./next-to-ride.ts";
import type { ScoringRun } from "@/lib/scoring/types";

type BlockRun = Pick<ScoringRun, "id" | "run_order" | "attempt_number" | "pool_label" | "status">;

export type RunBlock<T extends BlockRun = BlockRun> = {
  /* The attempt number, shown as "Round n". */
  attempt: number;
  pool: string | null;
  runs: T[];
};

export const isOpenRun = (run: Pick<ScoringRun, "status">) =>
  run.status === "pending" || run.status === "on_course";

/* Consecutive runs in start order sharing an attempt and a pool. */
export const runBlocks = <T extends BlockRun>(runs: readonly T[]): RunBlock<T>[] => {
  const blocks: RunBlock<T>[] = [];

  for (const run of [...runs].sort((a, b) => a.run_order - b.run_order)) {
    const last = blocks[blocks.length - 1];

    if (last && last.attempt === run.attempt_number && last.pool === run.pool_label) {
      last.runs.push(run);
    } else {
      blocks.push({ attempt: run.attempt_number, pool: run.pool_label, runs: [run] });
    }
  }

  return blocks;
};

export type PoolBlockRef = { pool: string; attempt: number };

/* Between riders (nobody on course: the judge has not tapped Start yet) the
   called pool stays as it was. Once the block it was riding has been ridden to
   the end — the furthest result is in the called pool and nobody in that pool
   and round is left to ride — the pools are worked out as if nothing were
   called, so "Next" is the pool after it rather than its next round. The
   judges' panel draws its pools the same way. */
export const calledBlockRidden = (
  runs: readonly BlockRun[],
  called: string | null,
  currentRunId: string | null
) => {
  if (called === null || (currentRunId !== null && runs.some((run) => run.id === currentRunId))) {
    return false;
  }

  const last = lastRiddenRun(runs);

  return (
    last !== null &&
    last.pool_label === called &&
    !runs.some(
      (run) =>
        run.pool_label === called && run.attempt_number === last.attempt_number && isOpenRun(run)
    )
  );
};

/* The called pool as the pool lists use it: null once its block has been
   ridden to the end between riders (calledBlockRidden). */
export const shownCalledPool = (
  runs: readonly BlockRun[],
  called: string | null,
  currentRunId: string | null
) => (calledBlockRidden(runs, called, currentRunId) ? null : called);

/* The block the riding is in: the current run's block when the current run
   belongs to the called pool (or nothing is called), otherwise the called
   pool's earliest block that still has riders to go (a pool called ahead).
   -1 when there is no anchor yet. `called` has been through shownCalledPool. */
const anchorIndex = (
  blocks: RunBlock[],
  called: string | null,
  currentRunId: string | null
) => {
  const currentIndex = currentRunId
    ? blocks.findIndex((block) => block.runs.some((run) => run.id === currentRunId))
    : -1;

  if (currentIndex >= 0 && (called === null || blocks[currentIndex].pool === called)) {
    return currentIndex;
  }

  if (called !== null) {
    const open = blocks.findIndex(
      (block) => block.pool === called && block.runs.some(isOpenRun)
    );

    if (open >= 0) {
      return open;
    }

    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index].pool === called) {
        return index;
      }
    }
  }

  return currentIndex;
};

/* The pool (and round) to call next: the first block after the riding one
   that still has riders to go. Before anything is called or ridden it is the
   first block with riders to go — the pool the judge calls first. Between
   riders with nothing (or a finished pool) called, the block of the furthest
   result is the anchor, so a rider passed over earlier in the list does not
   pull "Next" back to their pool. Null when the round is unpooled or every
   later block has ridden. */
export const nextPoolBlock = (
  runs: readonly BlockRun[],
  called: string | null,
  currentRunId: string | null
): PoolBlockRef | null => {
  const blocks = runBlocks(runs);
  let anchor = anchorIndex(blocks, shownCalledPool(runs, called, currentRunId), currentRunId);

  if (anchor < 0) {
    const last = lastRiddenRun(runs);
    anchor = last ? blocks.findIndex((block) => block.runs.some((run) => run.id === last.id)) : -1;
  }

  const next = blocks
    .slice(anchor + 1)
    .find((block) => block.pool !== null && block.runs.some(isOpenRun));

  return next && next.pool !== null ? { pool: next.pool, attempt: next.attempt } : null;
};

/* The block the riding is in, as a pool and round. */
export const ridingPoolBlock = (
  runs: readonly BlockRun[],
  called: string | null,
  currentRunId: string | null
): PoolBlockRef | null => {
  const blocks = runBlocks(runs);
  const anchor = anchorIndex(blocks, shownCalledPool(runs, called, currentRunId), currentRunId);
  const block = anchor >= 0 ? blocks[anchor] : null;
  return block && block.pool !== null ? { pool: block.pool, attempt: block.attempt } : null;
};

/* What "called" becomes when the live pointer moves from one run to another.
   The TypeScript twin of public.scoring_called_pool_after (20261107100000):
   unchanged when nothing new is on course; the new run's pool when nothing
   was called, nobody was on course, the called pool was the one riding, or
   the called pool has nobody left to ride; otherwise a pool called ahead of
   the riding stays called. */
export const calledPoolAfter = (
  runs: readonly BlockRun[],
  called: string | null,
  fromRun: Pick<ScoringRun, "pool_label"> | null,
  toRun: Pick<ScoringRun, "id" | "pool_label"> | null
): string | null => {
  if (!toRun || toRun.pool_label === null) {
    return called;
  }

  if (called === null || called === toRun.pool_label || !fromRun) {
    return toRun.pool_label;
  }

  if (fromRun.pool_label === called) {
    return toRun.pool_label;
  }

  const calledHasRiders = runs.some(
    (run) => run.pool_label === called && run.id !== toRun.id && isOpenRun(run)
  );

  return calledHasRiders ? called : toRun.pool_label;
};

/* Panels ----------------------------------------------------------------------
   What the judges' and commentators' panels draw from the start list. */

type PanelRun = BlockRun &
  Pick<ScoringRun, "entrant_key" | "rider_name" | "team_name" | "result" | "points">;

export type RoundChip = {
  attempt: number;
  /* Runs recorded / runs to ride in this round (skipped and "not needed"
     attempts are left out of both). */
  done: number;
  total: number;
  current: boolean;
  finished: boolean;
};

/* One chip per round ("Round 1 13/16"). Empty when riders have one attempt. */
export const roundChips = (runs: readonly BlockRun[], ridingAttempt: number | null): RoundChip[] => {
  const attempts = Math.max(0, ...runs.map((run) => run.attempt_number));

  if (attempts < 2) {
    return [];
  }

  return Array.from({ length: attempts }, (_, index) => {
    const attempt = index + 1;
    const counted = runs.filter((run) => run.attempt_number === attempt && run.status !== "void");
    const done = counted.filter((run) => run.status === "scored").length;

    return {
      attempt,
      done,
      total: counted.length,
      current: ridingAttempt === attempt,
      finished: counted.length > 0 && done === counted.length,
    };
  });
};

export type PoolRiderStatus = "through" | "out" | "riding" | "up_next" | null;

export type PoolState =
  | { kind: "riding"; attempt: number }
  | { kind: "up_next"; attempt: number }
  | { kind: "waiting"; attempt: number }
  | { kind: "round_done"; attempt: number }
  | { kind: "all_through" }
  | { kind: "done" };

export type PoolSummary = {
  pool: string;
  state: PoolState;
  /* Entrants (riders, or teams in a Section round) through so far / in the pool. */
  through: number;
  size: number;
  entrants: { entrant_key: string; name: string; status: PoolRiderStatus }[];
};

/* Every pool of the round with its state and its entrants' standing, relative
   to the block that is riding. `advanced` comes from the standings
   (LeaderboardRow.advanced: true through, false out, null still riding). */
export const poolSummaries = (
  runs: readonly PanelRun[],
  advanced: ReadonlyMap<string, boolean | null>,
  called: string | null,
  currentRunId: string | null
): PoolSummary[] => {
  const riding = ridingPoolBlock(runs, called, currentRunId);
  const next = nextPoolBlock(runs, called, currentRunId);
  const current = currentRunId ? runs.find((run) => run.id === currentRunId) ?? null : null;
  /* The rider marked "up next": after the rider on course, or, between
     riders, the one the judges' Start button names (next-to-ride.ts). */
  const nextRun = current
    ? ([...runs]
        .sort((a, b) => a.run_order - b.run_order)
        .find(
          (run) =>
            run.status === "pending" && run.id !== current.id && run.run_order > current.run_order
        ) ?? null)
    : nextToRide(runs, { current_run_id: currentRunId, called_pool_label: called });
  const ridingAttempt =
    riding?.attempt ??
    next?.attempt ??
    Math.max(1, ...runs.filter((run) => run.status === "scored").map((run) => run.attempt_number));
  const pools: string[] = [];

  for (const run of [...runs].sort((a, b) => a.run_order - b.run_order)) {
    if (run.pool_label !== null && !pools.includes(run.pool_label)) {
      pools.push(run.pool_label);
    }
  }

  return pools.map((pool) => {
    const poolRuns = runs
      .filter((run) => run.pool_label === pool)
      .sort((a, b) => a.run_order - b.run_order);
    const entrants: PoolSummary["entrants"] = [];

    for (const run of poolRuns) {
      if (entrants.some((entrant) => entrant.entrant_key === run.entrant_key)) {
        continue;
      }

      const verdict = advanced.get(run.entrant_key) ?? null;
      const status: PoolRiderStatus =
        verdict === true
          ? "through"
          : verdict === false
            ? "out"
            : current?.entrant_key === run.entrant_key
              ? "riding"
              : nextRun?.entrant_key === run.entrant_key
                ? "up_next"
                : null;

      entrants.push({
        entrant_key: run.entrant_key,
        name: run.entrant_key.startsWith("team:") ? (run.team_name ?? run.rider_name) : run.rider_name,
        status,
      });
    }

    const open = poolRuns.filter(isOpenRun);
    let state: PoolState;

    if (riding?.pool === pool && current?.pool_label === pool) {
      state = { kind: "riding", attempt: riding.attempt };
    } else if (next?.pool === pool) {
      state = { kind: "up_next", attempt: next.attempt };
    } else if (open.some((run) => run.attempt_number === ridingAttempt)) {
      state = { kind: "waiting", attempt: ridingAttempt };
    } else if (open.length === 0) {
      state =
        entrants.length > 0 && entrants.every((entrant) => entrant.status === "through")
          ? { kind: "all_through" }
          : { kind: "done" };
    } else {
      state = { kind: "round_done", attempt: ridingAttempt };
    }

    return {
      pool,
      state,
      through: entrants.filter((entrant) => entrant.status === "through").length,
      size: entrants.length,
      entrants,
    };
  });
};

export type AttemptMark =
  | { kind: "result"; result: NonNullable<ScoringRun["result"]>; points: number }
  | { kind: "on_course" }
  | { kind: "not_needed" }
  | { kind: "to_ride" }
  | { kind: "none" };

/* One mark per round for a Single rider: the result, on course, not needed
   (skipped after a carry, or skipped), or still to ride. */
export const attemptMarks = (
  runs: readonly PanelRun[],
  entrantKey: string,
  attempts: number
): AttemptMark[] =>
  Array.from({ length: attempts }, (_, index) => {
    const run = runs.find(
      (candidate) => candidate.entrant_key === entrantKey && candidate.attempt_number === index + 1
    );

    if (!run) {
      return { kind: "none" };
    }

    if (run.status === "scored" && run.result) {
      return { kind: "result", result: run.result, points: run.points ?? 0 };
    }

    if (run.status === "on_course") {
      return { kind: "on_course" };
    }

    return run.status === "void" ? { kind: "not_needed" } : { kind: "to_ride" };
  });

/* The standings rows with each rider's attempts attached, for a Single round
   ridden over several attempts (the qualifier). Any other round is returned
   as it is: one attempt needs no boxes, and a team's riders are its
   `members`. */
export const withAttemptMarks = <Row extends { entrant_key: string }>(
  rows: Row[],
  runs: readonly PanelRun[],
  round: { event_type: string; attempts_per_rider: number } | null | undefined
): (Row & { attempts?: AttemptMark[] })[] => {
  const attempts = round?.attempts_per_rider ?? 1;

  if (!round || round.event_type !== "single" || attempts < 2) {
    return rows;
  }

  const byEntrant = new Map<string, PanelRun[]>();

  for (const run of runs) {
    const own = byEntrant.get(run.entrant_key);

    if (own) {
      own.push(run);
    } else {
      byEntrant.set(run.entrant_key, [run]);
    }
  }

  return rows.map((row) => ({
    ...row,
    attempts: attemptMarks(byEntrant.get(row.entrant_key) ?? [], row.entrant_key, attempts),
  }));
};

/* Standings for the public leaderboard, with an "Out" the rules have not
   settled yet shown as undecided.

   The standings view marks an entrant Out the moment their runs are in and
   they have not carried (Single) or reached the target (Section). That is
   final in the qualifier, where only a 4 goes through. In every other round
   it is final only once somebody is Through:

     - Aarhi rounds: the 4s go through; with no 4, the 2s do; with everyone
       on 0, everyone rides again.
     - Team rounds: a team at or over the target goes through; if no team
       reaches it, the highest total does.

   So while nobody in the round is Through, a rule-made Out may still turn
   into Through when the next round is started (the engine records it then),
   and the public must not be told a rider is out before that. An
   administrator's own decision is always shown as it is. */
export const withProvisionalOuts = <
  Row extends { advanced: boolean | null; advanced_overridden: boolean },
>(
  rows: Row[],
  round: { event_type: string; attempts_per_rider: number } | null | undefined
): Row[] => {
  if (!round || (round.event_type === "single" && round.attempts_per_rider > 1)) {
    return rows;
  }

  if (rows.some((row) => row.advanced === true)) {
    return rows;
  }

  return rows.map((row) =>
    row.advanced === false && !row.advanced_overridden ? { ...row, advanced: null } : row
  );
};

/* Where a run sits in its pool and round: "3 / 10" is the third of Pool A's
   ten rides in Round 1. Every ride counts (skipped ones too), so a rider's
   number never shifts while the pool rides. */
export const blockPosition = (
  runs: readonly BlockRun[],
  run: Pick<ScoringRun, "id" | "attempt_number" | "pool_label">
): { index: number; size: number } => {
  const block = runs
    .filter((other) => other.attempt_number === run.attempt_number && other.pool_label === run.pool_label)
    .sort((a, b) => a.run_order - b.run_order);

  return { index: block.findIndex((other) => other.id === run.id) + 1, size: block.length };
};

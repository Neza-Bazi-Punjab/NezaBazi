// The training-mode scoring engine: the judges' Postgres functions
// (scoring_record_result, scoring_clear_result, scoring_set_run_status,
// scoring_set_live, scoring_call_pool) and the scoring_leaderboard view,
// re-done in TypeScript over plain arrays held in memory.
//
// Training mode (SCORING_SAMPLE_MODE=1, ?sample=1) lets judges and
// commentators practise on sample riders without a database or a login. For
// the practice to be worth anything the panels must behave exactly as they
// will on event day, so every rule here mirrors
// supabase/migrations/20261025120000_live_scoring.sql (§4 and §5 of
// docs/superpowers/specs/2026-10-25-live-scoring-design.md), including the
// refusal messages, word for word.
//
// Pure and dependency-free on purpose: only type imports (erased at runtime),
// so `node --test` can load this file directly and the behaviour is tested in
// src/lib/scoring/sample-engine.test.mts. It never reads or writes a database.
import type {
  DisplayMode,
  LeaderboardRow,
  LiveState,
  LiveUpdateRequest,
  RunResult,
  RunStatus,
  ScoringRound,
  ScoringRun,
} from "@/lib/scoring/types";

/* The same table as RESULT_POINTS in types.ts and the generated `points`
   column (a test keeps them equal). Local so this file has no runtime import. */
const POINTS: Record<RunResult, number> = { carry: 4, strike: 2, miss: 0 };
const RESULT_RANK: Record<RunResult, number> = { carry: 3, strike: 2, miss: 1 };
const RESULTS: readonly RunResult[] = ["carry", "strike", "miss"];
const MODES: readonly DisplayMode[] = [
  "scoreboard",
  "leaderboard",
  "rider",
  "pool_call",
  "message",
  "blank",
];
const POOL_LABEL = /^[A-Z]{1,2}$/;
const MESSAGE_MAX = 200;

const RUN_GONE = "That run is no longer in the start list. Refresh and try again.";
const ROUND_GONE = "That round no longer exists.";

/* A refusal the database would raise with errcode P0002 (not found -> 404) or
   22023 (not allowed right now -> 409). The message is written for a judge on
   a phone and is shown as it is. */
export class SampleRefusal extends Error {
  readonly code: "P0002" | "22023";
  readonly status: 404 | 409;

  constructor(code: "P0002" | "22023", message: string) {
    super(message);
    this.name = "SampleRefusal";
    this.code = code;
    this.status = code === "P0002" ? 404 : 409;
  }
}

const notFound = (message: string) => new SampleRefusal("P0002", message);
const notAllowed = (message: string) => new SampleRefusal("22023", message);

/* 'A' -> 0, 'Z' -> 25, 'AA' -> 26: scoring_pool_index. */
export const samplePoolIndex = (label: string) =>
  label.length === 1
    ? label.charCodeAt(0) - 65
    : (label.charCodeAt(0) - 64) * 26 + (label.charCodeAt(1) - 65);

/* True when the riding has moved past `called` into `next` (or nothing has
   been called yet): the called pool then follows the rider. */
const poolIsBehind = (called: string | null, next: string | null) =>
  next !== null && (called === null || samplePoolIndex(called) < samplePoolIndex(next));

const clone = <T>(value: T): T => structuredClone(value);

/* Leaderboard ---------------------------------------------------------------- */

const compareNames = (first: string, second: string) => first.localeCompare(second, "en");

/* One round's standings by the rules of the scoring_leaderboard view (§4):
   points (Single: best run; Section: the team's sum), best result, runs
   scored / total without void runs, advanced (a Single carry is through at
   once; otherwise null until every counted run is scored, then Single: a
   carry, Section: points >= target, null target -> null), rank and pool rank
   by points desc, runs scored asc, name asc (ties share a rank, like rank()),
   and Section members in run order. Training mode has no overrides. */
export const computeSampleLeaderboard = (
  round: ScoringRound,
  roundRuns: readonly ScoringRun[]
): LeaderboardRow[] => {
  const groups = new Map<string, ScoringRun[]>();

  for (const run of [...roundRuns].sort((a, b) => a.run_order - b.run_order)) {
    if (run.round_id !== round.id) {
      continue;
    }

    const group = groups.get(run.entrant_key);

    if (group) {
      group.push(run);
    } else {
      groups.set(run.entrant_key, [run]);
    }
  }

  const section = round.event_type === "section";

  const rows: LeaderboardRow[] = [...groups.entries()].map(([entrantKey, runs]) => {
    const first = runs[0];
    const scored = runs.filter((run) => run.status === "scored");
    const counted = runs.filter((run) => run.status !== "void");
    const scoredPoints = scored.map((run) => run.points ?? 0);
    const points = section
      ? scoredPoints.reduce((sum, value) => sum + value, 0)
      : Math.max(0, ...scoredPoints);
    const best =
      runs
        .map((run) => run.result)
        .filter((result): result is RunResult => result !== null)
        .sort((a, b) => RESULT_RANK[b] - RESULT_RANK[a])[0] ?? null;
    const labels = runs
      .map((run) => run.pool_label)
      .filter((label): label is string => label !== null)
      .sort();
    const advanced =
      !section && best === "carry"
        ? true
        : scored.length < counted.length
          ? null
          : !section
            ? false
            : round.target_points === null
              ? null
              : points >= round.target_points;

    const row: LeaderboardRow = {
      entrant_key: entrantKey,
      rank: 0,
      pool_rank: 0,
      pool_label: labels[0] ?? null,
      name: section ? first.team_name ?? first.rider_name : first.rider_name,
      team_name: first.team_name,
      horse_name: section ? null : first.horse_name,
      location: first.rider_location,
      points,
      best_result: best,
      runs_scored: scored.length,
      runs_total: counted.length,
      advanced,
      advanced_overridden: false,
    };

    if (section) {
      row.members = runs.map((run) => ({
        team_member_id: run.team_member_id,
        rider_name: run.rider_name,
        horse_name: run.horse_name,
        result: run.result,
        points: run.points,
        status: run.status,
      }));
    }

    return row;
  });

  const order = (a: LeaderboardRow, b: LeaderboardRow) =>
    b.points - a.points || a.runs_scored - b.runs_scored || compareNames(a.name, b.name);
  const tied = (a: LeaderboardRow, b: LeaderboardRow) =>
    a.points === b.points && a.runs_scored === b.runs_scored && a.name === b.name;
  const ranked = [...rows].sort(order);

  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    row.rank = previous && tied(previous, row) ? previous.rank : index + 1;
  });

  const pools = new Map<string, LeaderboardRow[]>();

  for (const row of ranked) {
    const key = row.pool_label ?? "";
    pools.set(key, [...(pools.get(key) ?? []), row]);
  }

  for (const poolRows of pools.values()) {
    poolRows.forEach((row, index) => {
      const previous = poolRows[index - 1];
      row.pool_rank = previous && tied(previous, row) ? previous.pool_rank : index + 1;
    });
  }

  return ranked;
};

/* Engine ----------------------------------------------------------------------- */

export type SampleSeed = {
  rounds: ScoringRound[];
  runs: ScoringRun[];
  live: LiveState;
};

export type SampleSnapshot = SampleSeed;

export type SampleEngine = {
  /* scoring_record_result */
  recordResult: (runId: string, result: RunResult, override: boolean) => ScoringRun;
  /* scoring_clear_result (p_make_current = makeCurrent) */
  clearResult: (runId: string, makeCurrent: boolean) => ScoringRun;
  /* scoring_set_run_status */
  setRunStatus: (runId: string, status: "pending" | "void") => ScoringRun;
  /* scoring_set_live: only the keys present are applied. */
  setLive: (payload: LiveUpdateRequest) => LiveState;
  /* scoring_call_pool */
  callPool: (roundId: string, poolLabel: string) => LiveState;
  /* A deep copy of everything, safe to hand to a response. */
  snapshot: () => SampleSnapshot;
};

const isMultiAttemptSingle = (round: ScoringRound | undefined) =>
  round !== undefined && round.event_type === "single" && round.attempts_per_rider > 1;

const latestTimestamp = (seed: SampleSeed) => {
  let latest = 0;
  const consider = (value: string | null) => {
    const parsed = value ? Date.parse(value) : Number.NaN;

    if (Number.isFinite(parsed) && parsed > latest) {
      latest = parsed;
    }
  };

  consider(seed.live.updated_at);

  for (const round of seed.rounds) {
    consider(round.updated_at);
  }

  for (const run of seed.runs) {
    consider(run.updated_at);
    consider(run.scored_at);
  }

  return latest;
};

/* `now` is injectable for tests. Timestamps only ever move forward, so a
   result recorded in training always sorts after the seeded ones. */
export const createSampleEngine = (
  seed: SampleSeed,
  now: () => number = Date.now
): SampleEngine => {
  const rounds = clone(seed.rounds);
  const runs = clone(seed.runs);
  let live = clone(seed.live);
  let lastStamp = latestTimestamp(seed);

  /* auto_voided_by: run id -> the carry that made it unnecessary. Rebuilt
     from the seed the way the database would have written it: in a
     multi-attempt Single round, an entrant's void runs belong to their first
     carry. */
  const autoVoidedBy = new Map<string, string>();

  for (const round of rounds) {
    if (!isMultiAttemptSingle(round)) {
      continue;
    }

    const roundRuns = runs
      .filter((run) => run.round_id === round.id)
      .sort((a, b) => a.run_order - b.run_order);

    for (const run of roundRuns) {
      if (run.status !== "void") {
        continue;
      }

      const carry = roundRuns.find(
        (other) => other.entrant_key === run.entrant_key && other.result === "carry"
      );

      if (carry) {
        autoVoidedBy.set(run.id, carry.id);
      }
    }
  }

  const stamp = () => {
    lastStamp = Math.max(now(), lastStamp + 1);
    return new Date(lastStamp).toISOString();
  };

  const touchRun = (run: ScoringRun, changes: Partial<ScoringRun>) => {
    Object.assign(run, changes, { updated_at: stamp() });
  };

  const setStatus = (run: ScoringRun, status: RunStatus) => {
    if (run.status !== status) {
      touchRun(run, { status });
    }
  };

  const updateLive = (changes: Partial<LiveState>) => {
    live = { ...live, ...changes, updated_at: stamp() };
  };

  const findRun = (runId: string) => runs.find((run) => run.id === runId);
  const findRound = (roundId: string | null) =>
    roundId === null ? undefined : rounds.find((round) => round.id === roundId);
  const runsOfRound = (roundId: string) =>
    runs.filter((run) => run.round_id === roundId).sort((a, b) => a.run_order - b.run_order);

  /* scoring_advance_live_pointer */
  const advanceLivePointer = (roundId: string, afterOrder: number) => {
    const next =
      runsOfRound(roundId).find((run) => run.status === "pending" && run.run_order > afterOrder) ??
      null;

    if (next) {
      setStatus(next, "on_course");
    }

    updateLive({
      current_run_id: next?.id ?? null,
      called_pool_label: poolIsBehind(live.called_pool_label, next?.pool_label ?? null)
        ? (next?.pool_label ?? null)
        : live.called_pool_label,
    });

    return next?.id ?? null;
  };

  /* scoring_restore_auto_voided */
  const restoreAutoVoided = (runId: string) => {
    const run = findRun(runId);

    if (!run) {
      return [];
    }

    const otherCarry = runsOfRound(run.round_id).find(
      (other) =>
        other.entrant_key === run.entrant_key && other.id !== runId && other.result === "carry"
    );

    if (otherCarry) {
      for (const [voidedId, carryId] of autoVoidedBy) {
        if (carryId === runId) {
          autoVoidedBy.set(voidedId, otherCarry.id);
        }
      }

      return [];
    }

    const restored: string[] = [];

    for (const candidate of runsOfRound(run.round_id)) {
      if (autoVoidedBy.get(candidate.id) === runId && candidate.status === "void") {
        setStatus(candidate, "pending");
        autoVoidedBy.delete(candidate.id);
        restored.push(candidate.id);
      }
    }

    return restored;
  };

  const recordResult: SampleEngine["recordResult"] = (runId, result, override) => {
    if (!RESULTS.includes(result)) {
      throw notAllowed("Choose Carried, Struck or Miss.");
    }

    const before = { ...live };
    const run = findRun(runId);

    if (!run) {
      throw notFound(RUN_GONE);
    }

    const multi = isMultiAttemptSingle(findRound(run.round_id));

    if (run.status === "void") {
      throw notAllowed("This run was skipped. Restore it before recording a result.");
    }

    // Two judges cannot both score one run without choosing Change result.
    if (run.status === "scored" && !override) {
      throw notAllowed("This run already has a result. Use Change result to replace it.");
    }

    const previous = run.result;
    const scoredAt = stamp();
    touchRun(run, {
      result,
      points: POINTS[result],
      status: "scored",
      scored_by: null,
      scored_at: scoredAt,
    });

    const autoVoided: string[] = [];

    if (multi) {
      if (result === "carry") {
        // One carry qualifies: the rider's runs still to ride are not needed.
        for (const other of runsOfRound(run.round_id)) {
          if (
            other.entrant_key === run.entrant_key &&
            other.id !== runId &&
            (other.status === "pending" || other.status === "on_course")
          ) {
            setStatus(other, "void");
            autoVoidedBy.set(other.id, runId);
            autoVoided.push(other.id);
          }
        }
      } else if (previous === "carry") {
        restoreAutoVoided(runId);
      }
    }

    if (before.current_run_id === runId) {
      advanceLivePointer(run.round_id, run.run_order);
    } else if (before.current_run_id !== null && autoVoided.includes(before.current_run_id)) {
      // The rider was already on course for a later attempt: move on past it.
      const current = findRun(before.current_run_id);
      advanceLivePointer(run.round_id, current?.run_order ?? run.run_order);
    }

    if (
      previous === null &&
      before.display_mode === "pool_call" &&
      before.current_round_id === run.round_id
    ) {
      updateLive({ display_mode: "scoreboard" });
    }

    return clone(run);
  };

  const clearResult: SampleEngine["clearResult"] = (runId, makeCurrent) => {
    const before = { ...live };
    const run = findRun(runId);

    if (!run) {
      throw notFound(RUN_GONE);
    }

    const multi = isMultiAttemptSingle(findRound(run.round_id));

    if (run.status !== "scored") {
      throw notAllowed("This run has no result to clear.");
    }

    const previous = run.result;

    touchRun(run, {
      result: null,
      points: null,
      status: makeCurrent || before.current_run_id === runId ? "on_course" : "pending",
      scored_by: null,
      scored_at: null,
    });

    if (multi && previous === "carry") {
      restoreAutoVoided(runId);
    }

    if (makeCurrent) {
      // The rider the pointer had moved on to goes back to waiting.
      if (before.current_run_id !== null && before.current_run_id !== runId) {
        const replaced = findRun(before.current_run_id);

        if (replaced?.status === "on_course") {
          setStatus(replaced, "pending");
        }
      }

      for (const other of runsOfRound(run.round_id)) {
        if (other.status === "on_course" && other.id !== runId) {
          setStatus(other, "pending");
        }
      }

      updateLive({
        current_round_id: run.round_id,
        current_run_id: runId,
        called_pool_label:
          live.current_round_id !== run.round_id
            ? run.pool_label
            : poolIsBehind(live.called_pool_label, run.pool_label)
              ? run.pool_label
              : live.called_pool_label,
      });
    }

    return clone(run);
  };

  const setRunStatus: SampleEngine["setRunStatus"] = (runId, status) => {
    if (status !== "pending" && status !== "void") {
      throw notAllowed("A run can only be skipped or restored.");
    }

    const before = { ...live };
    const run = findRun(runId);

    if (!run) {
      throw notFound(RUN_GONE);
    }

    if (run.status === "scored") {
      throw notAllowed("This run has a result. Clear the result first.");
    }

    if (status === "void") {
      if (run.status === "void") {
        throw notAllowed("This run is already skipped.");
      }

      setStatus(run, "void");

      if (before.current_run_id === runId) {
        advanceLivePointer(run.round_id, run.run_order);
      }
    } else {
      if (run.status !== "void") {
        throw notAllowed("Only a skipped run can be restored.");
      }

      // Restoring by hand also undoes an automatic skip after a carry.
      setStatus(run, "pending");
      autoVoidedBy.delete(run.id);
    }

    return clone(run);
  };

  const setLive: SampleEngine["setLive"] = (payload) => {
    const has = (key: keyof LiveUpdateRequest) =>
      Object.prototype.hasOwnProperty.call(payload, key);

    if (
      !has("current_round_id") &&
      !has("current_run_id") &&
      !has("called_pool_label") &&
      !has("display_mode") &&
      !has("message")
    ) {
      throw notAllowed("Nothing to change.");
    }

    const before = { ...live };

    // Round.
    const roundId = has("current_round_id")
      ? (payload.current_round_id ?? null)
      : before.current_round_id;
    const roundChanged = roundId !== before.current_round_id;
    const round = findRound(roundId);

    if (roundId !== null && !round) {
      throw notFound(ROUND_GONE);
    }

    // Run.
    const runId = has("current_run_id")
      ? (payload.current_run_id ?? null)
      : roundChanged
        ? null
        : before.current_run_id;
    let run: ScoringRun | undefined;

    if (runId !== null) {
      if (roundId === null) {
        throw notAllowed("Choose a round before choosing a rider.");
      }

      run = findRun(runId);

      if (!run) {
        throw notFound(RUN_GONE);
      }

      if (run.round_id !== roundId) {
        throw notAllowed("That rider is not in the live round.");
      }

      if (run.status === "scored") {
        throw notAllowed("That run already has a result. Clear it before making it current.");
      }

      if (run.status === "void") {
        throw notAllowed("That run was skipped. Restore it before making it current.");
      }
    }

    // Called pool.
    let called: string | null;

    if (has("called_pool_label")) {
      const requested = payload.called_pool_label ?? null;

      if (requested === null) {
        called = null;
      } else {
        if (!POOL_LABEL.test(requested)) {
          throw notAllowed("Choose a pool by its letter.");
        }

        if (
          roundId === null ||
          !runs.some((other) => other.round_id === roundId && other.pool_label === requested)
        ) {
          throw notAllowed(`Pool ${requested} is not in the live round.`);
        }

        called = requested;
      }
    } else if (roundChanged) {
      called = run?.pool_label ?? null;
    } else {
      called = poolIsBehind(before.called_pool_label, run?.pool_label ?? null)
        ? (run?.pool_label ?? null)
        : before.called_pool_label;
    }

    // Display mode.
    let mode: DisplayMode;

    if (has("display_mode")) {
      const requested = payload.display_mode;

      if (requested === undefined || !MODES.includes(requested)) {
        throw notAllowed("Unknown display mode.");
      }

      if (requested === "pool_call" && called === null) {
        throw notAllowed("Call a pool before showing the pool call screen.");
      }

      mode = requested;
    } else {
      mode = before.display_mode === "pool_call" && called === null ? "scoreboard" : before.display_mode;
    }

    // Message.
    let message: string | null;

    if (has("message")) {
      const requested = payload.message ?? null;

      if (requested !== null && typeof requested !== "string") {
        throw notAllowed("The message must be text.");
      }

      message = requested === null ? null : requested.trim() || null;

      if (message !== null && message.length > MESSAGE_MAX) {
        throw notAllowed("Keep the message to 200 characters.");
      }
    } else {
      message = before.message;
    }

    // The rider leaving the course goes back to waiting.
    if (before.current_run_id !== null && before.current_run_id !== runId) {
      const leaving = findRun(before.current_run_id);

      if (leaving?.status === "on_course") {
        setStatus(leaving, "pending");
      }
    }

    if (roundId !== null) {
      for (const other of runsOfRound(roundId)) {
        if (other.status === "on_course" && (runId === null || other.id !== runId)) {
          setStatus(other, "pending");
        }
      }
    }

    if (run && run.status === "pending") {
      setStatus(run, "on_course");
    }

    if (roundChanged && round && round.status === "upcoming") {
      Object.assign(round, { status: "live", updated_at: stamp() });
    }

    updateLive({
      current_round_id: roundId,
      current_run_id: runId,
      called_pool_label: called,
      display_mode: mode,
      message,
    });

    return clone(live);
  };

  const callPool: SampleEngine["callPool"] = (roundId, poolLabel) => {
    if (typeof poolLabel !== "string" || !POOL_LABEL.test(poolLabel)) {
      throw notAllowed("Choose a pool to call.");
    }

    const before = { ...live };
    const round = findRound(roundId);

    if (!round) {
      throw notFound(ROUND_GONE);
    }

    const roundRuns = runsOfRound(roundId);

    if (!roundRuns.some((run) => run.pool_label === poolLabel)) {
      throw notFound(`Pool ${poolLabel} is not in ${round.name}.`);
    }

    // A rider already on course counts, so calling twice skips nobody.
    const first = roundRuns.find(
      (run) =>
        run.pool_label === poolLabel && (run.status === "pending" || run.status === "on_course")
    );

    if (!first) {
      throw notAllowed(`Every rider in Pool ${poolLabel} has already ridden.`);
    }

    if (before.current_run_id !== null && before.current_run_id !== first.id) {
      const leaving = findRun(before.current_run_id);

      if (leaving?.status === "on_course") {
        setStatus(leaving, "pending");
      }
    }

    for (const other of roundRuns) {
      if (other.status === "on_course" && other.id !== first.id) {
        setStatus(other, "pending");
      }
    }

    if (first.status === "pending") {
      setStatus(first, "on_course");
    }

    if (round.status === "upcoming") {
      Object.assign(round, { status: "live", updated_at: stamp() });
    }

    updateLive({
      current_round_id: roundId,
      current_run_id: first.id,
      called_pool_label: poolLabel,
      display_mode: "pool_call",
    });

    return clone(live);
  };

  return {
    recordResult,
    clearResult,
    setRunStatus,
    setLive,
    callPool,
    snapshot: () => ({ rounds: clone(rounds), runs: clone(runs), live: clone(live) }),
  };
};

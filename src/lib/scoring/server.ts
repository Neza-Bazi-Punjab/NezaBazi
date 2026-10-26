// The one place that assembles the live scoring state.
//
// PublicLiveState is built here from the scoring_* tables and the
// scoring_leaderboard view only — never a registration table — and the judge
// and commentary states extend it. The public route reads through an
// anonymous client, so even a bug here could not read anything RLS does not
// already show to an anonymous visitor; the staff routes read through the
// service role. Rider background for the commentators (parents, age,
// experience, headshot) lives in rider-detail.ts, the only scoring module that
// touches registration data.
//
// When the scoring migration has not been applied yet, PostgREST answers with
// PGRST205 (table not in the schema cache) or Postgres 42P01; every builder
// here turns that into `configured: false` so each panel can show a calm
// "live scoring begins on event day" state instead of an error.
import "server-only";

import { createClient } from "@supabase/supabase-js";
import { createServiceRoleClient, type ServiceRoleClient } from "@/lib/admin/server";
import { loadRiderDetails } from "@/lib/scoring/rider-detail";
import {
  toPublicLeaderboardRow,
  toPublicLiveState,
  toPublicRun,
  type CommentaryState,
  type JudgeState,
  type LeaderboardRow,
  type LiveState,
  type PoolRosterEntry,
  type PublicLiveState,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";

export type ScoringDbClient = ServiceRoleClient;

export type DbError =
  | {
      code?: string | null;
      message?: string | null;
    }
  | null
  | undefined;

/* "The scoring tables (or functions) do not exist yet." PGRST205 / 42P01 for a
   missing table or view; PGRST202 / 42883 for a missing function on a write. */
const NOT_CONFIGURED_CODES = new Set(["PGRST205", "42P01", "PGRST202", "42883"]);

export const isScoringNotConfiguredError = (error: DbError) =>
  typeof error?.code === "string" && NOT_CONFIGURED_CODES.has(error.code);

export class ScoringReadError extends Error {
  readonly code: string | null;

  constructor(context: string, error: DbError) {
    super(`Unable to read ${context}.`);
    this.name = "ScoringReadError";
    this.code = error?.code ?? null;
  }
}

/* No session, no cookies: the anonymous role, exactly what a spectator's
   browser has. */
export const createPublicScoringClient = (): ScoringDbClient =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

/* Column lists ---------------------------------------------------------------- */

export const ROUND_COLUMNS =
  "id, event_type, name, round_number, attempts_per_rider, target_points, status, sort_order, pool_size, podium, created_at, updated_at";

export const RUN_COLUMNS =
  "id, round_id, run_order, attempt_number, pool_label, entrant_key, solo_registration_id, team_member_id, team_id, rider_name, horse_name, team_name, rider_location, status, result, points, scored_by, scored_at, created_at, updated_at";

export const LIVE_COLUMNS =
  "current_round_id, current_run_id, called_pool_label, display_mode, message, updated_at";

export const LEADERBOARD_COLUMNS =
  "round_id, entrant_key, rank, pool_rank, pool_label, name, team_name, horse_name, location, points, best_result, runs_scored, runs_total, advanced, advanced_overridden, members";

/* Paging ------------------------------------------------------------------------ */

/* PostgREST caps a response at 1000 rows on Supabase. A qualification round of
   150+ riders with three attempts each is fine, but the admin and commentary
   views read every round, so they page. */
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

type PageResult<T> = { data: T[] | null; error: DbError };

export const fetchAllRows = async <T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<{ rows: T[]; error: DbError }> => {
  const rows: T[] = [];

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);

    if (error) {
      return { rows, error };
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return { rows, error: null };
};

/* Shapes --------------------------------------------------------------------- */

/* Pools ride in draw order: A … Z, then AA, AB … (plain string order would put
   "AA" between "A" and "B"). */
export const comparePoolLabels = (first: string, second: string) =>
  first.length - second.length || (first < second ? -1 : first > second ? 1 : 0);

type LeaderboardViewRow = Omit<LeaderboardRow, "members"> & {
  round_id: string;
  members: LeaderboardRow["members"] | null;
};

export const toLeaderboardRow = (row: LeaderboardViewRow): LeaderboardRow => {
  const mapped: LeaderboardRow = {
    entrant_key: row.entrant_key,
    rank: row.rank,
    pool_rank: row.pool_rank,
    pool_label: row.pool_label,
    name: row.name,
    team_name: row.team_name,
    horse_name: row.horse_name,
    location: row.location,
    points: row.points ?? 0,
    best_result: row.best_result,
    runs_scored: row.runs_scored,
    runs_total: row.runs_total,
    advanced: row.advanced,
    advanced_overridden: row.advanced_overridden === true,
  };

  if (Array.isArray(row.members)) {
    mapped.members = row.members;
  }

  return mapped;
};

/* Groups leaderboard view rows by round, keeping the view's ordering. */
export const groupLeaderboards = (rows: LeaderboardViewRow[]) => {
  const byRound: Record<string, LeaderboardRow[]> = {};

  for (const row of rows) {
    (byRound[row.round_id] ??= []).push(toLeaderboardRow(row));
  }

  for (const board of Object.values(byRound)) {
    board.sort((first, second) => first.rank - second.rank);
  }

  return byRound;
};

export const loadAllLeaderboards = async (client: ScoringDbClient) => {
  const { rows, error } = await fetchAllRows<LeaderboardViewRow>((from, to) =>
    client
      .from("scoring_leaderboard")
      .select(LEADERBOARD_COLUMNS)
      .order("round_id", { ascending: true })
      .order("rank", { ascending: true })
      .order("entrant_key", { ascending: true })
      .range(from, to)
  );

  return { leaderboards: groupLeaderboards(rows), error };
};

const isTeamEntrant = (entrantKey: string) => entrantKey.startsWith("team:");

/* One entry per entrant per pool, in start order. A Section entry lists its
   riders in riding order (the order of their first runs). Unpooled rounds use
   the key "". */
export const buildPoolRosters = (runs: ScoringRun[]) => {
  const rosters: Record<string, PoolRosterEntry[]> = {};
  const entries = new Map<string, PoolRosterEntry>();
  const seenRiders = new Map<string, Set<string>>();

  for (const run of runs) {
    let entry = entries.get(run.entrant_key);

    if (!entry) {
      const team = isTeamEntrant(run.entrant_key);
      entry = {
        entrant_key: run.entrant_key,
        name: team ? run.team_name ?? run.rider_name : run.rider_name,
        team_name: run.team_name,
        horse_name: team ? null : run.horse_name,
      };

      if (team) {
        entry.members = [];
      }

      entries.set(run.entrant_key, entry);
      seenRiders.set(run.entrant_key, new Set());
      (rosters[run.pool_label ?? ""] ??= []).push(entry);
    }

    if (entry.members) {
      const riderKey = run.team_member_id ?? run.rider_name;
      const seen = seenRiders.get(run.entrant_key);

      if (seen && !seen.has(riderKey)) {
        seen.add(riderKey);
        entry.members.push(run.rider_name);
      }
    }
  }

  return rosters;
};

export const listPools = (runs: ScoringRun[]) =>
  [
    ...new Set(
      runs
        .map((run) => run.pool_label)
        .filter((label): label is string => typeof label === "string")
    ),
  ].sort(comparePoolLabels);

/* The pool after the called one. Before any pool is called, the first pool is
   "next" — that is the one the judge will call first. */
export const nextPoolLabel = (pools: string[], called: string | null) => {
  if (pools.length === 0) {
    return null;
  }

  if (!called) {
    return pools[0];
  }

  const index = pools.indexOf(called);
  return index >= 0 && index < pools.length - 1 ? pools[index + 1] : null;
};

export const emptyPublicLiveState = (configured: boolean): PublicLiveState => ({
  configured,
  generated_at: new Date().toISOString(),
  live: null,
  current_round: null,
  current_run: null,
  last_scored_run: null,
  recent_results: [],
  up_next: [],
  leaderboard: [],
  pools: [],
  pool_rosters: {},
  next_pool_label: null,
  rounds: [],
});

/* Assembly ------------------------------------------------------------------------ */

export type LiveSnapshot = {
  state: PublicLiveState;
  /* Every run of the current round in start order (the judge's start list). */
  runs: ScoringRun[];
};

const UP_NEXT_LIMIT = 5;
const RECENT_RESULTS_LIMIT = 8;

/* The current round's latest results, newest first, from the runs already
   read for the round — no extra query. */
export const recentResults = (runs: ScoringRun[], limit = RECENT_RESULTS_LIMIT) =>
  runs
    .filter(
      (run): run is ScoringRun & { scored_at: string } =>
        run.status === "scored" && typeof run.scored_at === "string"
    )
    .sort(
      (first, second) =>
        Date.parse(second.scored_at) - Date.parse(first.scored_at) ||
        second.run_order - first.run_order
    )
    .slice(0, limit);

export const loadLiveSnapshot = async (client: ScoringDbClient): Promise<LiveSnapshot> => {
  const [liveResult, roundsResult, lastScoredResult] = await Promise.all([
    client.from("scoring_live_state").select(LIVE_COLUMNS).eq("id", true).maybeSingle(),
    client
      .from("scoring_rounds")
      .select(ROUND_COLUMNS)
      .order("sort_order", { ascending: true }),
    client
      .from("scoring_runs")
      .select(RUN_COLUMNS)
      .eq("status", "scored")
      .not("scored_at", "is", null)
      .order("scored_at", { ascending: false })
      .limit(1),
  ]);

  const firstError = liveResult.error ?? roundsResult.error ?? lastScoredResult.error;

  if (firstError) {
    if (isScoringNotConfiguredError(firstError)) {
      return { state: emptyPublicLiveState(false), runs: [] };
    }

    throw new ScoringReadError("the live state", firstError);
  }

  const live = (liveResult.data ?? null) as LiveState | null;
  const rounds = (roundsResult.data ?? []) as ScoringRound[];
  const lastScored = ((lastScoredResult.data ?? []) as ScoringRun[])[0] ?? null;
  const currentRound = live?.current_round_id
    ? rounds.find((round) => round.id === live.current_round_id) ?? null
    : null;

  let runs: ScoringRun[] = [];
  let leaderboard: LeaderboardRow[] = [];

  if (currentRound) {
    const [runsResult, boardResult] = await Promise.all([
      fetchAllRows<ScoringRun>((from, to) =>
        client
          .from("scoring_runs")
          .select(RUN_COLUMNS)
          .eq("round_id", currentRound.id)
          .order("run_order", { ascending: true })
          .range(from, to)
      ),
      fetchAllRows<LeaderboardViewRow>((from, to) =>
        client
          .from("scoring_leaderboard")
          .select(LEADERBOARD_COLUMNS)
          .eq("round_id", currentRound.id)
          .order("rank", { ascending: true })
          .order("entrant_key", { ascending: true })
          .range(from, to)
      ),
    ]);

    const roundError = runsResult.error ?? boardResult.error;

    if (roundError) {
      if (isScoringNotConfiguredError(roundError)) {
        return { state: emptyPublicLiveState(false), runs: [] };
      }

      throw new ScoringReadError("the current round", roundError);
    }

    runs = runsResult.rows;
    leaderboard = boardResult.rows.map(toLeaderboardRow);
  }

  const currentRun = live?.current_run_id
    ? runs.find((run) => run.id === live.current_run_id) ?? null
    : null;
  const after = currentRun ? currentRun.run_order : 0;
  const upNext = runs
    .filter((run) => run.status === "pending" && run.run_order > after)
    .slice(0, UP_NEXT_LIMIT);
  const pools = listPools(runs);

  return {
    runs,
    state: {
      configured: true,
      generated_at: new Date().toISOString(),
      live,
      current_round: currentRound,
      current_run: currentRun,
      last_scored_run: lastScored,
      recent_results: recentResults(runs),
      up_next: upNext,
      leaderboard,
      pools,
      pool_rosters: buildPoolRosters(runs),
      next_pool_label: nextPoolLabel(pools, live?.called_pool_label ?? null),
      rounds,
    },
  };
};

/* GET /api/live/state and the vMix data sources. `runCount` is the size of the
   current round's start list, from the same read. Every public builder hands
   back its runs and standings through toPublicRun / toPublicLeaderboardRow
   (types.ts): no judge id, and a rider's district and state only — never the
   village they registered with. */
export const buildPublicLiveSnapshot = async (
  client: ScoringDbClient = createPublicScoringClient()
) => {
  const snapshot = await loadLiveSnapshot(client);
  return { state: toPublicLiveState(snapshot.state), runCount: snapshot.runs.length };
};

export const buildPublicLiveState = async (
  client: ScoringDbClient = createPublicScoringClient()
): Promise<PublicLiveState> => (await buildPublicLiveSnapshot(client)).state;

/* One round's start list and standings, for the vMix entrants feed. */
export type PublicRoundFeed = {
  configured: boolean;
  round: ScoringRound | null;
  runs: ScoringRun[];
  leaderboard: LeaderboardRow[];
};

/* GET /api/live/vmix/entrants. `roundId` null means the live round (from the
   same snapshot every other feed reads); otherwise that round, read through
   the anonymous role from the scoring_* tables and view only. */
export const buildPublicRoundFeed = async (
  roundId: string | null,
  client: ScoringDbClient = createPublicScoringClient()
): Promise<PublicRoundFeed> => {
  if (roundId === null) {
    const snapshot = await loadLiveSnapshot(client);
    return {
      configured: snapshot.state.configured,
      round: snapshot.state.current_round,
      runs: snapshot.runs.map(toPublicRun),
      leaderboard: snapshot.state.leaderboard.map(toPublicLeaderboardRow),
    };
  }

  const [roundResult, runsResult, boardResult] = await Promise.all([
    client.from("scoring_rounds").select(ROUND_COLUMNS).eq("id", roundId).maybeSingle(),
    fetchAllRows<ScoringRun>((from, to) =>
      client
        .from("scoring_runs")
        .select(RUN_COLUMNS)
        .eq("round_id", roundId)
        .order("run_order", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<LeaderboardViewRow>((from, to) =>
      client
        .from("scoring_leaderboard")
        .select(LEADERBOARD_COLUMNS)
        .eq("round_id", roundId)
        .order("rank", { ascending: true })
        .order("entrant_key", { ascending: true })
        .range(from, to)
    ),
  ]);

  const firstError = roundResult.error ?? runsResult.error ?? boardResult.error;

  if (firstError) {
    if (isScoringNotConfiguredError(firstError)) {
      return { configured: false, round: null, runs: [], leaderboard: [] };
    }

    throw new ScoringReadError("the round", firstError);
  }

  const round = (roundResult.data ?? null) as ScoringRound | null;

  return {
    configured: true,
    round,
    runs: round ? runsResult.rows.map(toPublicRun) : [],
    leaderboard: round
      ? boardResult.rows.map((row) => toPublicLeaderboardRow(toLeaderboardRow(row)))
      : [],
  };
};

/* The few run columns the rounds feed counts with. */
export type RoundRunSummary = Pick<ScoringRun, "round_id" | "entrant_key" | "status" | "pool_label">;

export type PublicRoundsFeed = {
  configured: boolean;
  rounds: ScoringRound[];
  runs: RoundRunSummary[];
  liveRoundId: string | null;
};

/* GET /api/live/vmix/rounds: every round in running order with the runs to
   count, from the scoring_* tables only. */
export const buildPublicRoundsFeed = async (
  client: ScoringDbClient = createPublicScoringClient()
): Promise<PublicRoundsFeed> => {
  const [liveResult, roundsResult, runsResult] = await Promise.all([
    client.from("scoring_live_state").select("current_round_id").eq("id", true).maybeSingle(),
    client.from("scoring_rounds").select(ROUND_COLUMNS).order("sort_order", { ascending: true }),
    fetchAllRows<RoundRunSummary>((from, to) =>
      client
        .from("scoring_runs")
        .select("round_id, entrant_key, status, pool_label")
        .order("round_id", { ascending: true })
        .order("run_order", { ascending: true })
        .range(from, to)
    ),
  ]);

  const firstError = liveResult.error ?? roundsResult.error ?? runsResult.error;

  if (firstError) {
    if (isScoringNotConfiguredError(firstError)) {
      return { configured: false, rounds: [], runs: [], liveRoundId: null };
    }

    throw new ScoringReadError("the rounds", firstError);
  }

  const live = (liveResult.data ?? null) as { current_round_id: string | null } | null;

  return {
    configured: true,
    rounds: (roundsResult.data ?? []) as ScoringRound[],
    runs: runsResult.rows,
    liveRoundId: live?.current_round_id ?? null,
  };
};

/* GET /api/judge/state, and the reconciliation payload every judge write
   returns. */
export const buildJudgeState = async (
  client: ScoringDbClient = createServiceRoleClient()
): Promise<JudgeState> => {
  const snapshot = await loadLiveSnapshot(client);
  return { ...snapshot.state, runs: snapshot.runs };
};

/* After a successful write the change has committed; a failure to rebuild the
   state must not turn that into an error the judge would retry. The panel
   refetches when `state` is null. */
export const buildJudgeStateAfterWrite = async (client: ScoringDbClient) => {
  try {
    return await buildJudgeState(client);
  } catch (error) {
    console.error("[scoring] rebuilding the judge state after a write failed", error);
    return null;
  }
};

const UP_NEXT_RIDERS = 3;

/* GET /api/commentary/state. */
export const buildCommentaryState = async (
  client: ScoringDbClient = createServiceRoleClient()
): Promise<CommentaryState> => {
  const snapshot = await loadLiveSnapshot(client);
  const { state } = snapshot;

  if (!state.configured) {
    return { ...state, current_rider: null, up_next_riders: [], leaderboards_by_round: {} };
  }

  const { leaderboards, error } = await loadAllLeaderboards(client);

  if (error) {
    throw new ScoringReadError("the standings", error);
  }

  const nextRuns = state.up_next.slice(0, UP_NEXT_RIDERS);
  const subjects = state.current_run ? [state.current_run, ...nextRuns] : nextRuns;
  const details = await loadRiderDetails(client, subjects, state.rounds);

  return {
    ...state,
    current_rider: state.current_run ? details.get(state.current_run.id) ?? null : null,
    up_next_riders: nextRuns.flatMap((run) => {
      const rider = details.get(run.id);
      return rider ? [{ ...run, rider }] : [];
    }),
    leaderboards_by_round: leaderboards,
  };
};

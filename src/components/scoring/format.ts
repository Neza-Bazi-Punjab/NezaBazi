// Pure helpers shared by the live scoring surfaces: wording, grouping and
// defensive normalisation of the API payloads. No React, no DOM.
import {
  RESULT_LABELS,
  RESULT_POINTS,
  isRunResult,
  type CommentaryState,
  type DisplayMode,
  type EventType,
  type JudgeState,
  type LeaderboardRow,
  type PoolRosterEntry,
  type PublicLiveState,
  type RunResult,
  type RunStatus,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";

export const LIVE_STATE_URL = "/api/live/state";

/* The Screens controls (judges' panel and /admin/scoring): what each display
   mode puts on /live and the stream overlays. */
export const DISPLAY_MODE_CHOICES: readonly { mode: DisplayMode; label: string; hint: string }[] = [
  { mode: "scoreboard", label: "Scoreboard", hint: "Rider on course, last result, standings" },
  { mode: "leaderboard", label: "Standings", hint: "Standings first; scorebug and lower third hidden" },
  { mode: "rider", label: "Rider", hint: "The rider on course alone; standings hidden" },
  { mode: "pool_call", label: "Pool call-up", hint: "The called pool's roster, get ready" },
  { mode: "message", label: "Message only", hint: "Only the message bar" },
  { mode: "blank", label: "Blank", hint: "Every stream graphic hidden" },
];

/* Single rounds with more than one attempt: one carry qualifies a rider, and
   the database voids their remaining attempts. The entrants who have carried,
   so a voided attempt of theirs can say why. */
export const ALREADY_QUALIFIED_NOTE = "Already qualified — attempt not needed";

export const carriedEntrantKeys = (
  runs: readonly Pick<ScoringRun, "entrant_key" | "result">[],
  round: Pick<ScoringRound, "event_type" | "attempts_per_rider"> | null | undefined
) =>
  new Set(
    round && round.event_type === "single" && round.attempts_per_rider > 1
      ? runs.filter((run) => run.result === "carry").map((run) => run.entrant_key)
      : []
  );

export const poolName = (label: string | null | undefined) =>
  label ? `Pool ${label}` : null;

export const resultText = (result: RunResult) =>
  `${RESULT_LABELS[result]} ${RESULT_POINTS[result]}`;

export const eventTypeName = (eventType: EventType | null | undefined) =>
  eventType === "section"
    ? "Section Tent Pegging"
    : eventType === "single"
      ? "Single Tent Pegging"
      : null;

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  pending: "Waiting",
  on_course: "On course",
  scored: "Scored",
  void: "Skipped",
};

/* "Team Sher-e-Punjab · Toofan": the team (Section) and the horse. */
export const runSubtitle = (run: Pick<ScoringRun, "team_name" | "horse_name">) =>
  [run.team_name, run.horse_name].filter(Boolean).join(" · ");

export const attemptText = (
  run: Pick<ScoringRun, "attempt_number">,
  round: Pick<ScoringRound, "attempts_per_rider"> | null | undefined
) => {
  const total = round?.attempts_per_rider ?? null;
  return total ? `Attempt ${run.attempt_number} of ${total}` : `Attempt ${run.attempt_number}`;
};

/* Only worth saying when a rider has more than one attempt in the round. */
export const attemptTextIfMany = (
  run: Pick<ScoringRun, "attempt_number">,
  round: Pick<ScoringRound, "attempts_per_rider"> | null | undefined
) => ((round?.attempts_per_rider ?? 1) > 1 ? attemptText(run, round) : null);

/* Which pool is riding and which is next.
   Riding: the pool of the rider on course, or the called pool when nobody is
   on course yet. Next: the called pool when it has been called ahead of the
   riding one ("Call Pool C" while Pool B finishes), otherwise the pool after
   it as computed by the server. */
export const nowAndNextPools = (
  state: Pick<PublicLiveState, "live" | "current_run" | "next_pool_label" | "pools">
) => {
  const called = state.live?.called_pool_label ?? null;
  const riding = state.current_run?.pool_label ?? called;
  const ridingIndex = riding ? state.pools.indexOf(riding) : -1;
  const calledIndex = called ? state.pools.indexOf(called) : -1;
  let next: string | null = null;

  if (riding && riding === called) {
    next =
      state.next_pool_label ?? (ridingIndex >= 0 ? state.pools[ridingIndex + 1] : null) ?? null;
  } else if (called && ridingIndex >= 0 && calledIndex > ridingIndex) {
    next = called;
  } else if (ridingIndex >= 0) {
    next = state.pools[ridingIndex + 1] ?? null;
  }

  return { riding, next };
};

export const nowNextText = (
  riding: string | null,
  next: string | null,
  nowWord = "Now riding"
) => {
  if (!riding && !next) {
    return null;
  }

  return [
    riding ? `${nowWord}: Pool ${riding}` : null,
    next ? `Next: Pool ${next}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
};

/* Runs in start order, grouped by pool label in order of first appearance. */
export const groupRunsByPool = (runs: ScoringRun[]) => {
  const groups: { label: string | null; runs: ScoringRun[] }[] = [];
  const sorted = [...runs].sort((a, b) => a.run_order - b.run_order);

  for (const run of sorted) {
    const last = groups[groups.length - 1];

    if (last && last.label === run.pool_label) {
      last.runs.push(run);
    } else {
      const existing = groups.find((group) => group.label === run.pool_label);

      if (existing) {
        existing.runs.push(run);
      } else {
        groups.push({ label: run.pool_label, runs: [run] });
      }
    }
  }

  return groups;
};

/* Standings for one pool sorted by pool rank, or the whole round by rank. */
export const standingsFor = (rows: LeaderboardRow[], pool: string | null) =>
  pool === null
    ? [...rows].sort((a, b) => a.rank - b.rank)
    : rows
        .filter((row) => row.pool_label === pool)
        .sort((a, b) => a.pool_rank - b.pool_rank);

/* Round progress from the standings: runs recorded over runs to ride (void
   runs are excluded from both by the view). */
export const roundProgress = (rows: LeaderboardRow[]) => {
  let scored = 0;
  let total = 0;

  for (const row of rows) {
    scored += Number.isFinite(row.runs_scored) ? row.runs_scored : 0;
    total += Number.isFinite(row.runs_total) ? row.runs_total : 0;
  }

  return { scored, total, percent: total > 0 ? Math.round((scored / total) * 100) : 0 };
};

export const rosterFor = (
  rosters: Record<string, PoolRosterEntry[]>,
  label: string | null | undefined
) => rosters[label ?? ""] ?? [];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const asRecord = <T,>(value: unknown): Record<string, T> =>
  isRecord(value) ? (value as Record<string, T>) : {};

/* The API is built in parallel and can be half-deployed on the day, so every
   panel reads the payload through these: missing arrays become empty and
   missing objects null, so a render never trips over an undefined field. */
export const normalizePublicState = <T extends PublicLiveState>(raw: T | null): T | null => {
  if (!isRecord(raw)) {
    return null;
  }

  return {
    ...raw,
    configured: raw.configured !== false,
    live: isRecord(raw.live) ? raw.live : null,
    current_round: isRecord(raw.current_round) ? raw.current_round : null,
    current_run: isRecord(raw.current_run) ? raw.current_run : null,
    last_scored_run: isRecord(raw.last_scored_run) ? raw.last_scored_run : null,
    up_next: asArray<ScoringRun>(raw.up_next),
    leaderboard: asArray<LeaderboardRow>(raw.leaderboard),
    pools: asArray<string>(raw.pools).filter((label) => typeof label === "string"),
    pool_rosters: asRecord<PoolRosterEntry[]>(raw.pool_rosters),
    next_pool_label: typeof raw.next_pool_label === "string" ? raw.next_pool_label : null,
    rounds: asArray<ScoringRound>(raw.rounds),
  };
};

export const normalizeJudgeState = (raw: JudgeState | null): JudgeState | null => {
  const base = normalizePublicState(raw);
  return base ? { ...base, runs: asArray<ScoringRun>(base.runs) } : null;
};

export const normalizeCommentaryState = (
  raw: CommentaryState | null
): CommentaryState | null => {
  const base = normalizePublicState(raw);

  if (!base) {
    return null;
  }

  return {
    ...base,
    current_rider: isRecord(base.current_rider) ? base.current_rider : null,
    up_next_riders: asArray<CommentaryState["up_next_riders"][number]>(base.up_next_riders),
    leaderboards_by_round: asRecord<LeaderboardRow[]>(base.leaderboards_by_round),
  };
};

const asString = (value: unknown) => (typeof value === "string" ? value : null);
const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/* Rows read straight from the public `scoring_leaderboard` view (completed
   rounds on /live). Picks only the known LeaderboardRow fields, so nothing
   else the view might carry ever reaches the page. */
export const parseLeaderboardRows = (value: unknown): LeaderboardRow[] =>
  asArray<unknown>(value).flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const entrantKey = asString(item.entrant_key);
    const name = asString(item.name);

    if (!entrantKey || !name) {
      return [];
    }

    const members = Array.isArray(item.members)
      ? item.members.filter(isRecord).map((member) => ({
          team_member_id: asString(member.team_member_id),
          rider_name: asString(member.rider_name) ?? "",
          horse_name: asString(member.horse_name),
          result: isRunResult(member.result) ? member.result : null,
          points: typeof member.points === "number" ? member.points : null,
          status: (["pending", "on_course", "scored", "void"].includes(String(member.status))
            ? member.status
            : "pending") as RunStatus,
        }))
      : undefined;

    const rank = asNumber(item.rank);

    return [
      {
        entrant_key: entrantKey,
        rank,
        pool_rank: asNumber(item.pool_rank, rank),
        pool_label: asString(item.pool_label),
        name,
        team_name: asString(item.team_name),
        horse_name: asString(item.horse_name),
        location: asString(item.location),
        points: asNumber(item.points),
        best_result: isRunResult(item.best_result) ? item.best_result : null,
        runs_scored: asNumber(item.runs_scored),
        runs_total: asNumber(item.runs_total),
        advanced: typeof item.advanced === "boolean" ? item.advanced : null,
        advanced_overridden: item.advanced_overridden === true,
        ...(members ? { members } : {}),
      },
    ];
  });

/* "Through" / "Out" wording for the advance column. */
export const advanceText = (row: Pick<LeaderboardRow, "advanced">) =>
  row.advanced === true ? "Through" : row.advanced === false ? "Out" : null;

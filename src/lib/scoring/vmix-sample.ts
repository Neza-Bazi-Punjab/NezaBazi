// Rehearsal data for the vMix feeds (?sample=1).
//
// The scoring tables stay empty until event day, but the graphics team builds
// and tests its titles now. With ?sample=1 every vMix endpoint answers from
// the fixed data below instead of the database: the same row shapes, with
// sample = "Yes" on every row so a title can show a SAMPLE badge. Nothing here
// reads the database, and the data is deterministic (fixed ids, fixed
// timestamps on event day) so a title looks the same on every refresh.
//
// Two rounds:
//   Qualification  Single, three attempts, Pools A and B, live. Pool A has
//                  ridden; Pool B is on its second pass with a rider on course.
//                  A carry makes the rider's remaining attempts void, as the
//                  database does.
//   Section 1      Section, target 8, complete: two sides of four riders.
// Fetch ?sample=1&round=<SAMPLE_SECTION_ROUND_ID> on /entrants to see a Section
// entrant with its four riders in `members`.
import "server-only";

import {
  buildPoolRosters,
  comparePoolLabels,
  listPools,
  nextPoolLabel,
  recentResults,
} from "@/lib/scoring/server";
import {
  RESULT_POINTS,
  type LeaderboardRow,
  type PublicLiveState,
  type RunResult,
  type RunStatus,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import {
  VMIX_SAMPLE_QUALIFICATION_ROUND_ID,
  VMIX_SAMPLE_SECTION_ROUND_ID,
} from "@/lib/scoring/vmix-columns";

export const SAMPLE_QUALIFICATION_ROUND_ID = VMIX_SAMPLE_QUALIFICATION_ROUND_ID;
export const SAMPLE_SECTION_ROUND_ID = VMIX_SAMPLE_SECTION_ROUND_ID;

const EVENT_DAY = Date.parse("2026-11-11T04:30:00.000Z"); // 10:00 in Amritsar
const at = (minutes: number) => new Date(EVENT_DAY + minutes * 60_000).toISOString();
const sampleId = (prefix: string, index: number) =>
  `5a3b1e00-0000-4000-${prefix}-${String(index).padStart(12, "0")}`;

const ROUNDS: ScoringRound[] = [
  {
    id: SAMPLE_QUALIFICATION_ROUND_ID,
    event_type: "single",
    name: "Qualification",
    round_number: 0,
    attempts_per_rider: 3,
    target_points: null,
    status: "live",
    sort_order: 1,
    pool_size: 4,
    podium: null,
    created_at: at(-600),
    updated_at: at(95),
  },
  {
    id: SAMPLE_SECTION_ROUND_ID,
    event_type: "section",
    name: "Section 1",
    round_number: 1,
    attempts_per_rider: 1,
    target_points: 8,
    status: "complete",
    sort_order: 2,
    pool_size: null,
    podium: null,
    created_at: at(-600),
    updated_at: at(40),
  },
];

type SoloSpec = {
  name: string;
  horse: string;
  location: string;
  pool: "A" | "B";
  /* One entry per attempt: a result, "on" (on course), "wait" (pending) or
     "void" (not needed after a carry). */
  attempts: (RunResult | "on" | "wait" | "void")[];
};

const SOLO: SoloSpec[] = [
  { name: "Harpreet Singh Sandhu", horse: "Toofan", location: "Ladhewali, Jalandhar, Punjab, India", pool: "A", attempts: ["carry", "void", "void"] },
  { name: "Gurjeet Singh Brar", horse: "Badal", location: "Kotkapura, Faridkot, Punjab, India", pool: "A", attempts: ["strike", "carry", "void"] },
  { name: "Manpreet Kaur Gill", horse: "Sultan", location: "Jagraon, Ludhiana, Punjab, India", pool: "A", attempts: ["miss", "strike", "strike"] },
  { name: "Jaswinder Singh Dhillon", horse: "Heera", location: "Patti, Tarn Taran, Punjab, India", pool: "A", attempts: ["miss", "miss", "miss"] },
  { name: "Amandeep Singh Randhawa", horse: "Chetak", location: "Batala, Gurdaspur, Punjab, India", pool: "B", attempts: ["strike", "on", "wait"] },
  { name: "Kulwant Singh Virk", horse: "Raja", location: "Nabha, Patiala, Punjab, India", pool: "B", attempts: ["carry", "void", "void"] },
  { name: "Balraj Singh Sidhu", horse: "Moti", location: "Dharamkot, Moga, Punjab, India", pool: "B", attempts: ["miss", "wait", "wait"] },
  { name: "Navjot Singh Grewal", horse: "Shera", location: "Samrala, Ludhiana, Punjab, India", pool: "B", attempts: ["strike", "wait", "wait"] },
];

type SideSpec = {
  name: string;
  location: string;
  riders: { name: string; horse: string; result: RunResult }[];
};

const SIDES: SideSpec[] = [
  {
    name: "Sher-e-Punjab",
    location: "Dharamkot, Moga, Punjab, India",
    riders: [
      { name: "Gurpreet Singh Bains", horse: "Kesari", result: "carry" },
      { name: "Ravinder Singh Johal", horse: "Bijli", result: "strike" },
      { name: "Sukhwinder Singh Sekhon", horse: "Arjun", result: "carry" },
      { name: "Lakhwinder Singh Aulakh", horse: "Pawan", result: "miss" },
    ],
  },
  {
    name: "Doaba Riders",
    location: "Phagwara, Kapurthala, Punjab, India",
    riders: [
      { name: "Parminder Singh Bal", horse: "Noor", result: "strike" },
      { name: "Daljit Singh Kang", horse: "Sikandar", result: "miss" },
      { name: "Tejinder Singh Sahota", horse: "Chandni", result: "strike" },
      { name: "Hardeep Singh Mann", horse: "Rustam", result: "strike" },
    ],
  },
];

const baseRun = (
  round: ScoringRound,
  id: string,
  order: number,
  overrides: Partial<ScoringRun> & Pick<ScoringRun, "entrant_key" | "rider_name">
): ScoringRun => ({
  id,
  round_id: round.id,
  run_order: order,
  attempt_number: 1,
  pool_label: null,
  solo_registration_id: null,
  team_member_id: null,
  team_id: null,
  horse_name: null,
  team_name: null,
  rider_location: null,
  status: "pending",
  result: null,
  points: null,
  scored_by: null,
  scored_at: null,
  created_at: round.created_at,
  updated_at: round.updated_at,
  ...overrides,
});

const statusOf = (attempt: SoloSpec["attempts"][number]): RunStatus =>
  attempt === "on" ? "on_course" : attempt === "wait" ? "pending" : attempt === "void" ? "void" : "scored";

/* Pool A's passes, then Pool B's; within a pool attempt 1 for everyone, then
   attempt 2, then attempt 3 — the database's layout. */
const qualificationRuns = (): ScoringRun[] => {
  const round = ROUNDS[0];
  const runs: ScoringRun[] = [];
  let order = 0;
  let minute = 0;

  for (const pool of ["A", "B"] as const) {
    const riders = SOLO.map((spec, index) => ({ spec, index })).filter(({ spec }) => spec.pool === pool);

    for (let attempt = 0; attempt < round.attempts_per_rider; attempt += 1) {
      for (const { spec, index } of riders) {
        order += 1;
        const outcome = spec.attempts[attempt];
        const status = statusOf(outcome);
        const result = status === "scored" ? (outcome as RunResult) : null;
        const registrationId = sampleId("8001", index + 1);

        if (result) {
          minute += 2;
        }

        runs.push(
          baseRun(round, sampleId("8101", order), order, {
            attempt_number: attempt + 1,
            pool_label: pool,
            entrant_key: `solo:${registrationId}`,
            solo_registration_id: registrationId,
            rider_name: spec.name,
            horse_name: spec.horse,
            rider_location: spec.location,
            status,
            result,
            points: result ? RESULT_POINTS[result] : null,
            scored_at: result ? at(minute) : null,
          })
        );
      }
    }
  }

  return runs;
};

const sectionRuns = (): ScoringRun[] => {
  const round = ROUNDS[1];
  const runs: ScoringRun[] = [];
  let order = 0;

  SIDES.forEach((side, sideIndex) => {
    const sideId = sampleId("8002", sideIndex + 1);

    side.riders.forEach((rider, riderIndex) => {
      order += 1;
      runs.push(
        baseRun(round, sampleId("8102", order), order, {
          entrant_key: `team:${sideId}`,
          team_id: sideId,
          team_member_id: sampleId("8003", sideIndex * 4 + riderIndex + 1),
          rider_name: rider.name,
          horse_name: rider.horse,
          team_name: side.name,
          rider_location: side.location,
          status: "scored",
          result: rider.result,
          points: RESULT_POINTS[rider.result],
          scored_at: at(-60 + order),
        })
      );
    });
  });

  return runs;
};

const RESULT_RANK: Record<RunResult, number> = { carry: 3, strike: 2, miss: 1 };

/* The same rules as the scoring_leaderboard view. */
const leaderboardFor = (round: ScoringRound, runs: ScoringRun[]): LeaderboardRow[] => {
  const groups = new Map<string, ScoringRun[]>();

  for (const run of [...runs].sort((a, b) => a.run_order - b.run_order)) {
    groups.set(run.entrant_key, [...(groups.get(run.entrant_key) ?? []), run]);
  }

  const rows: LeaderboardRow[] = [...groups.entries()].map(([entrantKey, entrantRuns]) => {
    const first = entrantRuns[0];
    const scored = entrantRuns.filter((run) => run.status === "scored");
    const counted = entrantRuns.filter((run) => run.status !== "void");
    const points =
      round.event_type === "single"
        ? Math.max(0, ...scored.map((run) => run.points ?? 0))
        : scored.reduce((sum, run) => sum + (run.points ?? 0), 0);
    const best = scored
      .map((run) => run.result)
      .filter((result): result is RunResult => result !== null)
      .sort((a, b) => RESULT_RANK[b] - RESULT_RANK[a])[0] ?? null;
    const advanced =
      round.event_type === "single" && best === "carry"
        ? true
        : scored.length < counted.length
          ? null
          : round.event_type === "single"
            ? false
            : round.target_points === null
              ? null
              : points >= round.target_points;

    return {
      entrant_key: entrantKey,
      rank: 0,
      pool_rank: 0,
      pool_label: first.pool_label,
      name: round.event_type === "section" ? first.team_name ?? first.rider_name : first.rider_name,
      team_name: first.team_name,
      horse_name: round.event_type === "single" ? first.horse_name : null,
      location: first.rider_location,
      points,
      best_result: best,
      runs_scored: scored.length,
      runs_total: counted.length,
      advanced,
      advanced_overridden: false,
      ...(round.event_type === "section"
        ? {
            members: entrantRuns.map((run) => ({
              team_member_id: run.team_member_id,
              rider_name: run.rider_name,
              horse_name: run.horse_name,
              result: run.result,
              points: run.points,
              status: run.status,
            })),
          }
        : {}),
    };
  });

  const order = (a: LeaderboardRow, b: LeaderboardRow) =>
    b.points - a.points || a.runs_scored - b.runs_scored || a.name.localeCompare(b.name);
  const ranked = [...rows].sort(order);

  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    row.rank = previous && order(previous, row) === 0 ? previous.rank : index + 1;
  });

  const pools = new Map<string, LeaderboardRow[]>();

  for (const row of ranked) {
    pools.set(row.pool_label ?? "", [...(pools.get(row.pool_label ?? "") ?? []), row]);
  }

  for (const poolRows of pools.values()) {
    poolRows.forEach((row, index) => {
      const previous = poolRows[index - 1];
      row.pool_rank = previous && order(previous, row) === 0 ? previous.pool_rank : index + 1;
    });
  }

  return ranked;
};

/* Built once: the data never changes. */
const RUNS_BY_ROUND: Record<string, ScoringRun[]> = {
  [SAMPLE_QUALIFICATION_ROUND_ID]: qualificationRuns(),
  [SAMPLE_SECTION_ROUND_ID]: sectionRuns(),
};

const LEADERBOARDS: Record<string, LeaderboardRow[]> = Object.fromEntries(
  ROUNDS.map((round) => [round.id, leaderboardFor(round, RUNS_BY_ROUND[round.id])])
);

export const sampleRounds = (): ScoringRound[] => ROUNDS.map((round) => ({ ...round }));

export const sampleRunsForRound = (roundId: string): ScoringRun[] =>
  (RUNS_BY_ROUND[roundId] ?? []).map((run) => ({ ...run }));

export const sampleLeaderboardForRound = (roundId: string): LeaderboardRow[] =>
  (LEADERBOARDS[roundId] ?? []).map((row) => ({ ...row }));

export const sampleAllRuns = (): ScoringRun[] => Object.values(RUNS_BY_ROUND).flat();

/* The public live state as it would read mid-qualification. */
export const samplePublicLiveState = (): PublicLiveState => {
  const round = ROUNDS[0];
  const runs = RUNS_BY_ROUND[round.id];
  const current = runs.find((run) => run.status === "on_course") ?? null;
  const pools = listPools(runs).sort(comparePoolLabels);
  const recent = recentResults(runs);
  /* The pointer moved on half a minute after the last result. */
  const lastChange = recent[0]?.scored_at
    ? new Date(Date.parse(recent[0].scored_at) + 30_000).toISOString()
    : at(0);

  return {
    configured: true,
    generated_at: lastChange,
    live: {
      current_round_id: round.id,
      current_run_id: current?.id ?? null,
      called_pool_label: current?.pool_label ?? null,
      display_mode: "scoreboard",
      message: "Sample data for rehearsal — not real results",
      updated_at: lastChange,
    },
    current_round: { ...round },
    current_run: current ? { ...current } : null,
    last_scored_run: recent[0] ? { ...recent[0] } : null,
    recent_results: recent.map((run) => ({ ...run })),
    up_next: runs
      .filter((run) => run.status === "pending" && run.run_order > (current?.run_order ?? 0))
      .slice(0, 5)
      .map((run) => ({ ...run })),
    leaderboard: sampleLeaderboardForRound(round.id),
    pools,
    pool_rosters: buildPoolRosters(runs),
    next_pool_label: nextPoolLabel(pools, current?.pool_label ?? null),
    rounds: sampleRounds(),
  };
};

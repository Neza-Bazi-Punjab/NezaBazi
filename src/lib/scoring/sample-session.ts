// Training mode: in-memory scoring sessions on sample riders.
//
// /judge/demo and /commentary/demo (and the scoring APIs with ?sample=1) work
// against a practice session here instead of the database, so judges and
// commentators can practise before event day. Who gets which session is
// decided in sample-mode.ts: a laptop running with SCORING_SAMPLE_MODE=1
// shares one session (LOCAL_TRAINING_SESSION) between everyone, no login
// needed; on the live site each signed-in judge, commentator or administrator
// gets their own (personalTrainingSession(userId)), so two people practising
// at once never see each other's taps. Every judge write goes through
// sample-engine.ts, which re-implements the database functions' rules, and
// every read is assembled here in the same shapes as server.ts builds from
// the database.
//
// It never touches the database and never returns real data: the riders,
// results and the commentators' background facts below are invented, seeded
// from the rehearsal data in vmix-sample.ts. The only imports are the scoring
// types, the sample data, the pure engine and the pure pool helpers from
// server.ts (the same ones vmix-sample.ts uses); no database client is
// created or called anywhere in this file.
//
// Sessions live in this server process's memory (on globalThis, so every
// route shares one store and a dev-server hot reload keeps it), bounded by
// training-store.ts: at most MAX_TRAINING_SESSIONS (the least recently used
// is dropped to make room) and none kept after TRAINING_IDLE_MS without use.
// "Reset training data" restarts only the caller's session. A server restart
// — or, on a host that runs several instances, landing on another instance —
// starts a session again from the sample data; the practice banner says so.
import "server-only";

import {
  createSampleEngine,
  computeSampleLeaderboard,
  type SampleEngine,
  type SampleSeed,
} from "@/lib/scoring/sample-engine";
import { createTrainingStore, type TrainingStore } from "@/lib/scoring/training-store";
import {
  buildPoolRosters,
  listPools,
  nextPoolLabel,
  recentResults,
} from "@/lib/scoring/server";
import {
  toPublicLiveState,
  type CommentaryState,
  type JudgeState,
  type LeaderboardRow,
  type LiveState,
  type LiveUpdateRequest,
  type PublicLiveState,
  type RiderDetail,
  type RunResult,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import {
  sampleAllRuns,
  samplePublicLiveState as rehearsalLiveState,
  sampleRounds,
} from "@/lib/scoring/vmix-sample";

export { SampleRefusal } from "@/lib/scoring/sample-engine";

/* Seed --------------------------------------------------------------------------- */

const MINUTE = 60_000;

/* The rehearsal data is stamped on event day; training shifts it so the last
   seeded result happened two minutes before the session started, and every
   result recorded in training is newer than all of it. */
const shiftIso = (value: string, offset: number) =>
  new Date(Date.parse(value) + offset).toISOString();

const buildSeed = (): SampleSeed => {
  const rounds = sampleRounds();
  const runs = sampleAllRuns().map((run) => ({ ...run }));
  const live: LiveState = rehearsalLiveState().live ?? {
    current_round_id: null,
    current_run_id: null,
    called_pool_label: null,
    display_mode: "scoreboard",
    message: null,
    updated_at: new Date().toISOString(),
  };
  const latest = Math.max(
    Date.parse(live.updated_at),
    ...runs.map((run) => (run.scored_at ? Date.parse(run.scored_at) : 0))
  );
  const offset = Date.now() - 2 * MINUTE - latest;

  return structuredClone({
    rounds: rounds.map((round) => ({
      ...round,
      created_at: shiftIso(round.created_at, offset),
      updated_at: shiftIso(round.updated_at, offset),
    })),
    runs: runs.map((run) => ({
      ...run,
      created_at: shiftIso(run.created_at, offset),
      updated_at: shiftIso(run.updated_at, offset),
      scored_at: run.scored_at ? shiftIso(run.scored_at, offset) : null,
    })),
    live: {
      ...live,
      message: "Training mode — sample riders, not real results",
      updated_at: shiftIso(live.updated_at, offset),
    },
  });
};

/* Sessions ----------------------------------------------------------------------- */

/* The one session of a laptop running with SCORING_SAMPLE_MODE=1. */
export const LOCAL_TRAINING_SESSION = "local";

/* A signed-in staff member's own session on the live site. */
export const personalTrainingSession = (userId: string) => `user:${userId}`;

export const MAX_TRAINING_SESSIONS = 200;
export const TRAINING_IDLE_MS = 6 * 60 * 60 * 1000;

const globalStore = globalThis as typeof globalThis & {
  __nezaBaziTrainingSessions?: TrainingStore<SampleEngine>;
};

const sessions = (): TrainingStore<SampleEngine> =>
  (globalStore.__nezaBaziTrainingSessions ??= createTrainingStore(
    () => createSampleEngine(buildSeed()),
    { max: MAX_TRAINING_SESSIONS, idleMs: TRAINING_IDLE_MS }
  ));

const session = (key: string): SampleEngine => sessions().get(key);

/* Judge writes on one session (same semantics as the database functions;
   refusals throw a SampleRefusal carrying the database's own message and
   404 / 409) ---------------------------------------------------------------------- */

export const recordResult = (key: string, runId: string, result: RunResult, override: boolean) =>
  session(key).recordResult(runId, result, override);

export const clearResult = (key: string, runId: string, makeCurrent: boolean) =>
  session(key).clearResult(runId, makeCurrent);

export const setRunStatus = (key: string, runId: string, status: "pending" | "void") =>
  session(key).setRunStatus(runId, status);

export const setLive = (key: string, payload: LiveUpdateRequest) =>
  session(key).setLive(payload);

export const callPool = (key: string, roundId: string, poolLabel: string) =>
  session(key).callPool(roundId, poolLabel);

/* Back to the start for this session only: the rehearsal state,
   mid-qualification. */
export const reset = (key: string) => {
  sessions().reset(key);
};

/* Reads (the shapes server.ts builds from the database) --------------------------- */

const UP_NEXT_LIMIT = 5;
const UP_NEXT_RIDERS = 3;

type Assembled = { state: PublicLiveState; runs: ScoringRun[]; all: SampleSeed };

/* loadLiveSnapshot, over a session instead of the tables. */
const assemble = (key: string): Assembled => {
  const all = session(key).snapshot();
  const { live } = all;
  const rounds = [...all.rounds].sort((a, b) => a.sort_order - b.sort_order);
  const currentRound = rounds.find((round) => round.id === live.current_round_id) ?? null;
  const runs = currentRound
    ? all.runs
        .filter((run) => run.round_id === currentRound.id)
        .sort((a, b) => a.run_order - b.run_order)
    : [];
  const lastScored =
    all.runs
      .filter(
        (run): run is ScoringRun & { scored_at: string } =>
          run.status === "scored" && typeof run.scored_at === "string"
      )
      .sort((a, b) => Date.parse(b.scored_at) - Date.parse(a.scored_at))[0] ?? null;
  const currentRun = runs.find((run) => run.id === live.current_run_id) ?? null;
  const after = currentRun ? currentRun.run_order : 0;
  const pools = listPools(runs);

  return {
    all,
    runs,
    state: {
      configured: true,
      generated_at: new Date().toISOString(),
      live,
      current_round: currentRound,
      current_run: currentRun,
      last_scored_run: lastScored,
      recent_results: recentResults(runs),
      up_next: runs
        .filter((run) => run.status === "pending" && run.run_order > after)
        .slice(0, UP_NEXT_LIMIT),
      leaderboard: currentRound ? computeSampleLeaderboard(currentRound, runs) : [],
      pools,
      pool_rosters: buildPoolRosters(runs),
      next_pool_label: nextPoolLabel(pools, live.called_pool_label),
      rounds,
    },
  };
};

/* GET /api/live/state?sample=1 on a SCORING_SAMPLE_MODE=1 laptop — what
   /live?sample=1 and the overlays show. The same public shape as the real
   route (district and state only, no judge id), so rehearsals show what the
   public will see. */
export const samplePublicLiveState = (key: string = LOCAL_TRAINING_SESSION): PublicLiveState =>
  toPublicLiveState(assemble(key).state);

/* GET /api/judge/state?sample=1, and the `state` every sample write returns. */
export const sampleJudgeState = (key: string): JudgeState => {
  const { state, runs } = assemble(key);
  return { ...state, runs };
};

/* Commentators' background facts for the sample riders. Invented, like the
   riders themselves: nothing here is a real person. */
type SampleFacts = Pick<
  RiderDetail,
  "father_name" | "mother_name" | "age" | "years_experience" | "horse_breed" | "horse_age"
> & { is_leader?: boolean };

const SAMPLE_FACTS: Record<string, SampleFacts> = {
  // Qualification (Single)
  "Harpreet Singh Sandhu": { father_name: "Gurmail Singh Sandhu", mother_name: "Baljit Kaur", age: 27, years_experience: 9, horse_breed: "Marwari", horse_age: 8 },
  "Gurjeet Singh Brar": { father_name: "Jagdev Singh Brar", mother_name: "Surinder Kaur", age: 31, years_experience: 12, horse_breed: "Kathiawari", horse_age: 10 },
  "Manpreet Kaur Gill": { father_name: "Jagtar Singh Gill", mother_name: "Paramjit Kaur", age: 24, years_experience: 6, horse_breed: "Thoroughbred cross", horse_age: 7 },
  "Jaswinder Singh Dhillon": { father_name: "Harbhajan Singh Dhillon", mother_name: "Gurmeet Kaur", age: 35, years_experience: 15, horse_breed: "Marwari", horse_age: 11 },
  "Amandeep Singh Randhawa": { father_name: "Kuldip Singh Randhawa", mother_name: "Rajwinder Kaur", age: 22, years_experience: 4, horse_breed: "Kathiawari", horse_age: 6 },
  "Kulwant Singh Virk": { father_name: "Mohinder Singh Virk", mother_name: "Charanjit Kaur", age: 29, years_experience: 10, horse_breed: "Indian Thoroughbred", horse_age: 9 },
  "Balraj Singh Sidhu": { father_name: "Darshan Singh Sidhu", mother_name: "Manjit Kaur", age: 26, years_experience: 7, horse_breed: "Marwari", horse_age: 8 },
  "Navjot Singh Grewal": { father_name: "Avtar Singh Grewal", mother_name: "Kulwinder Kaur", age: 33, years_experience: 13, horse_breed: "Sindhi", horse_age: 12 },
  // Section 1: Sher-e-Punjab
  "Gurpreet Singh Bains": { father_name: "Nirmal Singh Bains", mother_name: "Harjit Kaur", age: 34, years_experience: 14, horse_breed: "Marwari", horse_age: 10, is_leader: true },
  "Ravinder Singh Johal": { father_name: "Sarwan Singh Johal", mother_name: "Amarjit Kaur", age: 28, years_experience: 8, horse_breed: "Kathiawari", horse_age: 7 },
  "Sukhwinder Singh Sekhon": { father_name: "Joginder Singh Sekhon", mother_name: "Narinder Kaur", age: 30, years_experience: 11, horse_breed: "Marwari", horse_age: 9 },
  "Lakhwinder Singh Aulakh": { father_name: "Bachittar Singh Aulakh", mother_name: "Jasvir Kaur", age: 25, years_experience: 5, horse_breed: "Indian Thoroughbred", horse_age: 6 },
  // Section 1: Doaba Riders
  "Parminder Singh Bal": { father_name: "Gurdev Singh Bal", mother_name: "Ranjit Kaur", age: 36, years_experience: 16, horse_breed: "Kathiawari", horse_age: 12, is_leader: true },
  "Daljit Singh Kang": { father_name: "Piara Singh Kang", mother_name: "Satwant Kaur", age: 27, years_experience: 7, horse_breed: "Marwari", horse_age: 8 },
  "Tejinder Singh Sahota": { father_name: "Karnail Singh Sahota", mother_name: "Davinder Kaur", age: 23, years_experience: 4, horse_breed: "Marwari", horse_age: 6 },
  "Hardeep Singh Mann": { father_name: "Mukhtiar Singh Mann", mother_name: "Balwinder Kaur", age: 32, years_experience: 12, horse_breed: "Sindhi", horse_age: 11 },
};

/* loadRiderDetails over the session: the run's own snapshot plus the facts
   above, and every run this rider has in the session as `today`. */
const riderDetail = (run: ScoringRun, all: SampleSeed): RiderDetail => {
  const facts = SAMPLE_FACTS[run.rider_name];
  const roundsById = new Map<string, ScoringRound>(all.rounds.map((round) => [round.id, round]));
  const sameRider = (other: ScoringRun) =>
    run.solo_registration_id !== null
      ? other.solo_registration_id === run.solo_registration_id
      : run.team_member_id !== null && other.team_member_id === run.team_member_id;
  const today = all.runs.filter(sameRider).sort((first, second) => {
    const firstRound = roundsById.get(first.round_id)?.sort_order ?? 0;
    const secondRound = roundsById.get(second.round_id)?.sort_order ?? 0;
    return (
      firstRound - secondRound ||
      first.attempt_number - second.attempt_number ||
      first.run_order - second.run_order
    );
  });

  return {
    full_name: run.rider_name,
    father_name: facts?.father_name ?? null,
    mother_name: facts?.mother_name ?? null,
    age: facts?.age ?? null,
    location: run.rider_location,
    years_experience: facts?.years_experience ?? null,
    horse_name: run.horse_name,
    horse_age: facts?.horse_age ?? null,
    horse_breed: facts?.horse_breed ?? null,
    team_name: run.team_name,
    is_leader: run.team_member_id !== null ? facts?.is_leader === true : null,
    headshot_url: null,
    today: today.map((other) => ({
      round_name: roundsById.get(other.round_id)?.name ?? "Round",
      attempt_number: other.attempt_number,
      result: other.result,
      points: other.points,
      status: other.status,
    })),
    total_points_today: today.reduce(
      (total, other) => total + (other.status === "scored" ? (other.points ?? 0) : 0),
      0
    ),
  };
};

/* GET /api/commentary/state?sample=1. */
export const sampleCommentaryState = (key: string): CommentaryState => {
  const { state, all } = assemble(key);
  const nextRuns = state.up_next.slice(0, UP_NEXT_RIDERS);
  const leaderboards: Record<string, LeaderboardRow[]> = {};

  for (const round of all.rounds) {
    leaderboards[round.id] = computeSampleLeaderboard(
      round,
      all.runs.filter((run) => run.round_id === round.id)
    );
  }

  return {
    ...state,
    current_rider: state.current_run ? riderDetail(state.current_run, all) : null,
    up_next_riders: nextRuns.map((run) => ({ ...run, rider: riderDetail(run, all) })),
    leaderboards_by_round: leaderboards,
  };
};

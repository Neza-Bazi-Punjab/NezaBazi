// Training mode: practice scoring sessions on sample riders.
//
// /judge/demo and /commentary/demo (and the scoring APIs with ?sample=1) work
// against a practice session here instead of the real scoring tables, so
// judges and commentators can practise before event day. Who gets which
// session is decided in sample-mode.ts:
//   - a laptop running with SCORING_SAMPLE_MODE=1: one session
//     (LOCAL_TRAINING_SESSION) for everyone using it, no login, kept in this
//     server process's memory exactly as before;
//   - the live site: every signed-in judge, commentator or administrator on
//     ONE shared session (SHARED_TRAINING_SESSION, the organisers' demo),
//     stored as a row of scoring_training_sessions (training-db.ts), so every
//     device and every server instance sees the same demo. ?sample=demo on the
//     vMix feeds, /api/live/state, /live and the overlays follows it too.
// Every judge write goes through sample-engine.ts, which re-implements the
// database functions' rules, and every read is assembled here in the same
// shapes as server.ts builds from the database.
//
// One helper, withSession(key, act), is the only way in. For the local key it
// hands `act` the in-memory engine. For any other key it loads the row (the
// sample seed when there is none yet), rebuilds the engine with
// createSampleEngine, runs `act`, and, for a write, saves
// { ...engine.snapshot(), progression } with the version it loaded. A lost
// race (someone else saved in between) reloads and re-applies the action
// once, then refuses with a 409 SampleRefusal. Reads never save.
//
// Before the migration is applied (the table missing: TrainingNotConfigured)
// the shared key falls back to the in-memory store, one session per server
// instance, and the demo pages show the "unshared" banner of training.ts,
// "(not yet shared between devices)". Nothing breaks.
//
// It never touches the scoring or registration tables and never returns real
// data: the 30 riders and the commentators' background facts below are
// invented. A session starts at the top of Qualification (Pools A, B and C of
// ten, three attempts, ridden round by round) with nobody ridden yet, and the
// engine builds each Aarhi round from the riders who carried, through to the
// Final (SampleProgression in sample-engine.ts), so a practice runs the whole
// day. The only imports are the scoring types, the pure engine, the pure pool
// helpers from server.ts, the in-memory store and training-db.ts (the
// practice row, through the service role); no client is created in this file.
//
// The in-memory store lives on globalThis (every route shares it and a
// dev-server hot reload keeps it), bounded by training-store.ts: at most
// MAX_TRAINING_SESSIONS (the least recently used is dropped to make room) and
// none kept after TRAINING_IDLE_MS without use.
import "server-only";

import {
  SampleRefusal,
  createSampleEngine,
  computeSampleLeaderboard,
  overridesFor,
  sampleCalledPoolAfter,
  type SampleEngine,
  type SampleSeed,
} from "@/lib/scoring/sample-engine";
import {
  SHARED_TRAINING_SESSION,
  TrainingNotConfigured,
  deleteTrainingState,
  loadTrainingState,
  openTrainingDatabase,
  saveTrainingState,
  type TrainingDatabase,
} from "@/lib/scoring/training-db";
import { createTrainingStore, type TrainingStore } from "@/lib/scoring/training-store";
import { withAttemptMarks } from "@/lib/scoring/blocks";
import { upNextRuns } from "@/lib/scoring/next-to-ride";
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
  type LiveUpdateRequest,
  type PublicLiveState,
  type RiderDetail,
  type RunResult,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import { justRodeRun } from "@/lib/scoring/types";

export { SampleRefusal } from "@/lib/scoring/sample-engine";
export { SHARED_TRAINING_SESSION } from "@/lib/scoring/training-db";

/* Seed --------------------------------------------------------------------------- */

/* Commentators' background facts for the sample riders. Invented, like the
   riders themselves: nothing here is a real person. */
type SampleFacts = Pick<
  RiderDetail,
  "father_name" | "mother_name" | "age" | "years_experience" | "horse_breed" | "horse_age"
>;

type TrainingRider = {
  name: string;
  horse: string;
  location: string;
  facts: SampleFacts;
};

const rider = (
  name: string,
  horse: string,
  location: string,
  father_name: string,
  mother_name: string,
  age: number,
  years_experience: number,
  horse_breed: string,
  horse_age: number
): TrainingRider => ({
  name,
  horse,
  location: `${location}, Punjab, India`,
  facts: { father_name, mother_name, age, years_experience, horse_breed, horse_age },
});

/* Ten per pool, in start order: Pool A, then B, then C. */
export const TRAINING_RIDERS: readonly TrainingRider[] = [
  rider("Harpreet Singh Sandhu", "Toofan", "Ladhewali, Jalandhar", "Gurmail Singh Sandhu", "Baljit Kaur", 27, 9, "Marwari", 8),
  rider("Gurjeet Singh Brar", "Badal", "Kotkapura, Faridkot", "Jagdev Singh Brar", "Surinder Kaur", 31, 12, "Kathiawari", 10),
  rider("Manpreet Kaur Gill", "Sultan", "Jagraon, Ludhiana", "Jagtar Singh Gill", "Paramjit Kaur", 24, 6, "Thoroughbred cross", 7),
  rider("Jaswinder Singh Dhillon", "Heera", "Patti, Tarn Taran", "Harbhajan Singh Dhillon", "Gurmeet Kaur", 35, 15, "Marwari", 11),
  rider("Amandeep Singh Randhawa", "Chetak", "Batala, Gurdaspur", "Kuldip Singh Randhawa", "Rajwinder Kaur", 22, 4, "Kathiawari", 6),
  rider("Kulwant Singh Virk", "Raja", "Nabha, Patiala", "Mohinder Singh Virk", "Charanjit Kaur", 29, 10, "Indian Thoroughbred", 9),
  rider("Balraj Singh Sidhu", "Moti", "Dharamkot, Moga", "Darshan Singh Sidhu", "Manjit Kaur", 26, 7, "Marwari", 8),
  rider("Navjot Singh Grewal", "Shera", "Samrala, Ludhiana", "Avtar Singh Grewal", "Kulwinder Kaur", 33, 13, "Sindhi", 12),
  rider("Gurpreet Singh Bains", "Kesari", "Mehal Kalan, Barnala", "Nirmal Singh Bains", "Harjit Kaur", 34, 14, "Marwari", 10),
  rider("Ravinder Singh Johal", "Bijli", "Nakodar, Jalandhar", "Sarwan Singh Johal", "Amarjit Kaur", 28, 8, "Kathiawari", 7),
  rider("Sukhwinder Singh Sekhon", "Arjun", "Malerkotla, Sangrur", "Joginder Singh Sekhon", "Narinder Kaur", 30, 11, "Marwari", 9),
  rider("Lakhwinder Singh Aulakh", "Pawan", "Ajnala, Amritsar", "Bachittar Singh Aulakh", "Jasvir Kaur", 25, 5, "Indian Thoroughbred", 6),
  rider("Parminder Singh Bal", "Noor", "Phagwara, Kapurthala", "Gurdev Singh Bal", "Ranjit Kaur", 36, 16, "Kathiawari", 12),
  rider("Daljit Singh Kang", "Sikandar", "Banga, Nawanshahr", "Piara Singh Kang", "Satwant Kaur", 27, 7, "Marwari", 8),
  rider("Tejinder Singh Sahota", "Chandni", "Garhshankar, Hoshiarpur", "Karnail Singh Sahota", "Davinder Kaur", 23, 4, "Marwari", 6),
  rider("Hardeep Singh Mann", "Rustam", "Dhuri, Sangrur", "Mukhtiar Singh Mann", "Balwinder Kaur", 32, 12, "Sindhi", 11),
  rider("Simranjit Kaur Bajwa", "Heer", "Qadian, Gurdaspur", "Charanjit Singh Bajwa", "Harpreet Kaur", 21, 5, "Kathiawari", 7),
  rider("Arshdeep Singh Cheema", "Shahbaz", "Rayya, Amritsar", "Lakhbir Singh Cheema", "Sukhwinder Kaur", 25, 9, "Nukra", 8),
  rider("Taranjit Singh Pannu", "Kesar", "Khadoor Sahib, Tarn Taran", "Joginder Singh Pannu", "Narinder Kaur", 30, 13, "Marwari", 11),
  rider("Lovepreet Singh Kahlon", "Sher", "Dera Baba Nanak, Gurdaspur", "Darshan Singh Kahlon", "Rajinder Kaur", 20, 4, "Thoroughbred cross", 6),
  rider("Inderjit Singh Toor", "Babbar", "Jandiala Guru, Amritsar", "Major Singh Toor", "Parminder Kaur", 37, 18, "Marwari", 13),
  rider("Kirandeep Kaur Dhaliwal", "Noori", "Rampura Phul, Bathinda", "Tarsem Singh Dhaliwal", "Baljit Kaur", 23, 6, "Kathiawari", 7),
  rider("Jasmeet Singh Bhullar", "Shamsher", "Zira, Ferozepur", "Gurnam Singh Bhullar", "Amarjit Kaur", 28, 11, "Nukra", 10),
  rider("Sukhpreet Singh Chahal", "Hawa", "Samana, Patiala", "Avtar Singh Chahal", "Kamaljit Kaur", 26, 8, "Marwari", 9),
  rider("Gurwinder Singh Hundal", "Raftar", "Baba Bakala, Amritsar", "Balkar Singh Hundal", "Gurmeet Kaur", 33, 15, "Indian Thoroughbred", 10),
  rider("Rajbir Singh Dhindsa", "Toofani", "Sunam, Sangrur", "Surjit Singh Dhindsa", "Manjit Kaur", 29, 10, "Marwari", 8),
  rider("Harjot Singh Sangha", "Moti Lal", "Moga, Moga", "Kashmir Singh Sangha", "Paramjit Kaur", 24, 7, "Kathiawari", 7),
  rider("Bikramjit Singh Ghuman", "Sardar", "Fatehgarh Churian, Gurdaspur", "Jaswant Singh Ghuman", "Surjit Kaur", 31, 12, "Sindhi", 12),
  rider("Prabhjot Kaur Mangat", "Rani", "Raikot, Ludhiana", "Harnek Singh Mangat", "Kuldeep Kaur", 22, 5, "Marwari", 6),
  rider("Satnam Singh Deol", "Pahalwan", "Sri Hargobindpur, Gurdaspur", "Gurbachan Singh Deol", "Jagir Kaur", 35, 17, "Nukra", 11),
];

const POOL_SIZE = 10;
/* Three or fewer riders through: the next round is the Final. */
const FINAL_AT = 3;

/* How the engine builds each Aarhi round of a practice session. */
const TRAINING_PROGRESSION = { poolSize: POOL_SIZE, finalAt: FINAL_AT };

const trainingId = (prefix: string, index: number) =>
  `5a3b1e00-0000-4000-${prefix}-${String(index).padStart(12, "0")}`;

export const TRAINING_QUALIFICATION_ROUND_ID = trainingId("7001", 1);

/* The top of the day: Qualification live, three attempts, Pools A, B and C of
   ten laid out round by round (Round 1 for A, B, C, then Round 2, then
   Round 3, as the database lays it out: 20261107100000), nobody ridden and
   nobody on course — the judge starts with "Call next pool". */
const buildSeed = (): SampleSeed => {
  const createdAt = new Date(Date.now() - 60 * 60_000).toISOString();
  const qualification: ScoringRound = {
    id: TRAINING_QUALIFICATION_ROUND_ID,
    event_type: "single",
    name: "Qualification",
    round_number: 0,
    attempts_per_rider: 3,
    target_points: null,
    status: "live",
    sort_order: 1,
    pool_size: POOL_SIZE,
    podium: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const runs: ScoringRun[] = [];

  for (let attempt = 1; attempt <= qualification.attempts_per_rider; attempt += 1) {
    TRAINING_RIDERS.forEach((entry, index) => {
      const registrationId = trainingId("7002", index + 1);

      runs.push({
        id: trainingId("7003", runs.length + 1),
        round_id: qualification.id,
        run_order: runs.length + 1,
        attempt_number: attempt,
        pool_label: String.fromCharCode(65 + Math.floor(index / POOL_SIZE)),
        entrant_key: `solo:${registrationId}`,
        solo_registration_id: registrationId,
        team_member_id: null,
        team_id: null,
        rider_name: entry.name,
        horse_name: entry.horse,
        team_name: null,
        rider_location: entry.location,
        status: "pending",
        result: null,
        points: null,
        scored_by: null,
        scored_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      });
    });
  }

  return {
    rounds: [qualification],
    runs,
    live: {
      current_round_id: qualification.id,
      current_run_id: null,
      called_pool_label: null,
      display_mode: "scoreboard",
      message: "Training mode — sample riders, not real results",
      updated_at: createdAt,
    },
    progression: TRAINING_PROGRESSION,
  };
};

/* Sessions ----------------------------------------------------------------------- */

/* The one session of a laptop running with SCORING_SAMPLE_MODE=1. */
export const LOCAL_TRAINING_SESSION = "local";

/* The session ?sample=demo follows (the vMix feeds, /api/live/state, /live
   and the overlays): the laptop's own on a SCORING_SAMPLE_MODE=1 laptop
   (that is where its judges practise), the shared demo everywhere else. */
export const demoTrainingSession = () =>
  process.env.SCORING_SAMPLE_MODE === "1" ? LOCAL_TRAINING_SESSION : SHARED_TRAINING_SESSION;

export const MAX_TRAINING_SESSIONS = 200;
export const TRAINING_IDLE_MS = 6 * 60 * 60 * 1000;

type DemoCacheEntry = {
  value: SampleSeed | null;
  readAt: number;
  pending: Promise<SampleSeed> | null;
};

const globalStore = globalThis as typeof globalThis & {
  __nezaBaziTrainingSessions?: TrainingStore<SampleEngine>;
  __nezaBaziTrainingVersion?: string;
  __nezaBaziTrainingFallbackLogged?: boolean;
  __nezaBaziDemoSnapshots?: Map<string, DemoCacheEntry>;
};

/* The store outlives a hot reload (it sits on globalThis), and with it the
   seed and the engine it was built with. In development, when the sample
   riders or the engine's rules change on disk, start a fresh store so
   practice runs on the new code. Compared by content, not by identity: the
   dev server can evaluate this module once per route bundle, and those must
   keep sharing one store. In production nothing changes while the process
   runs, so this never fires. */
const storeVersion = () =>
  process.env.NODE_ENV === "production"
    ? "production"
    : [String(createSampleEngine), String(sampleCalledPoolAfter), String(buildSeed), JSON.stringify(TRAINING_RIDERS)].join("\n");

const version = storeVersion();

if (globalStore.__nezaBaziTrainingVersion !== version) {
  globalStore.__nezaBaziTrainingSessions = undefined;
  globalStore.__nezaBaziTrainingVersion = version;
}

/* The in-memory sessions: the laptop's, and the shared demo's fallback until
   the migration is applied. */
const sessions = (): TrainingStore<SampleEngine> =>
  (globalStore.__nezaBaziTrainingSessions ??= createTrainingStore(
    () => createSampleEngine(buildSeed()),
    { max: MAX_TRAINING_SESSIONS, idleMs: TRAINING_IDLE_MS }
  ));

/* Said once per server instance, so the logs show why the demo is not shared. */
const noteFallback = () => {
  if (!globalStore.__nezaBaziTrainingFallbackLogged) {
    globalStore.__nezaBaziTrainingFallbackLogged = true;
    console.warn(
      "[scoring] scoring_training_sessions is missing; practice runs in memory on this instance (apply 20261107120000_scoring_training_sessions.sql)"
    );
  }
};

/* The 409 after a lost race and one retry. */
export const LOST_RACE_MESSAGE =
  "Someone else just changed the practice. It has refreshed; try again.";

/* A write: who made it, for the row's updated_by (diagnostics only). */
type Write = { by: string | null };

/* One read or write on the database row: load (or seed), rebuild the engine,
   act on it, and for a write save with the version check, retrying once. */
const withStoredSession = async <T>(
  client: TrainingDatabase,
  key: string,
  act: (engine: SampleEngine) => T,
  write: Write | null
): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    const stored = await loadTrainingState(client, key);
    const seed = stored?.state ?? buildSeed();
    const engine = createSampleEngine(seed);
    // A refusal (already scored, not found...) throws here, before any save.
    const result = act(engine);

    if (!write) {
      return result;
    }

    const saved = await saveTrainingState(
      client,
      key,
      { ...engine.snapshot(), progression: seed.progression ?? TRAINING_PROGRESSION },
      stored?.version ?? null,
      write.by
    );

    if (saved) {
      return result;
    }

    if (attempt >= 2) {
      throw new SampleRefusal("22023", LOST_RACE_MESSAGE);
    }
  }
};

/* The only way into a session. `write` null: a read, which never saves. */
const withSession = async <T>(
  key: string,
  act: (engine: SampleEngine) => T,
  write: Write | null = null
): Promise<T> => {
  if (key === LOCAL_TRAINING_SESSION) {
    return act(sessions().get(key));
  }

  try {
    return await withStoredSession(openTrainingDatabase(), key, act, write);
  } catch (caught) {
    if (!(caught instanceof TrainingNotConfigured)) {
      throw caught;
    }

    noteFallback();
    return act(sessions().get(key));
  }
};

/* Whether the live site's demo is really shared between devices yet, for the
   demo pages' banner: "unshared" only while the table is missing. Any other
   failure reads as "shared" (the panel's own request will say what went
   wrong). */
export const sharedTrainingScope = async (): Promise<"shared" | "unshared"> => {
  try {
    await loadTrainingState(openTrainingDatabase(), SHARED_TRAINING_SESSION);
    return "shared";
  } catch (caught) {
    if (caught instanceof TrainingNotConfigured) {
      noteFallback();
      return "unshared";
    }

    console.error("[scoring] checking the shared practice session failed", caught);
    return "shared";
  }
};

/* Judge writes on one session (same semantics as the database functions;
   refusals throw a SampleRefusal carrying the database's own message and
   404 / 409). `by`: the signed-in staff member, when there is one. */

export const recordResult = async (
  key: string,
  runId: string,
  result: RunResult,
  override: boolean,
  by: string | null = null
) => withSession(key, (engine) => engine.recordResult(runId, result, override), { by });

export const clearResult = async (
  key: string,
  runId: string,
  makeCurrent: boolean,
  by: string | null = null
) => withSession(key, (engine) => engine.clearResult(runId, makeCurrent), { by });

export const setRunStatus = async (
  key: string,
  runId: string,
  status: "pending" | "void",
  by: string | null = null
) => withSession(key, (engine) => engine.setRunStatus(runId, status), { by });

export const setLive = async (key: string, payload: LiveUpdateRequest, by: string | null = null) =>
  withSession(key, (engine) => engine.setLive(payload), { by });

export const callPool = async (
  key: string,
  roundId: string,
  poolLabel: string,
  by: string | null = null
) => withSession(key, (engine) => engine.callPool(roundId, poolLabel), { by });

export const takeOut = async (
  key: string,
  roundId: string,
  entrantKey: string,
  out: boolean,
  by: string | null = null
) => withSession(key, (engine) => engine.takeOut(roundId, entrantKey, out), { by });

/* Back to the start: the top of Qualification. On the live site that is the
   shared demo, so it restarts for everyone, on every device: the row is
   deleted and the next read seeds afresh. */
export const reset = async (key: string) => {
  if (key !== LOCAL_TRAINING_SESSION) {
    try {
      await deleteTrainingState(openTrainingDatabase(), key);
      globalStore.__nezaBaziDemoSnapshots?.delete(key);
      return;
    } catch (caught) {
      if (!(caught instanceof TrainingNotConfigured)) {
        throw caught;
      }

      noteFallback();
    }
  }

  sessions().reset(key);
};

/* Reads (the shapes server.ts builds from the database) --------------------------- */

const UP_NEXT_LIMIT = 5;
const UP_NEXT_RIDERS = 3;

type Assembled = { state: PublicLiveState; runs: ScoringRun[]; all: SampleSeed };

/* loadLiveSnapshot, over a session instead of the tables. */
const assemble = (key: string): Promise<Assembled> =>
  withSession(key, (engine) => assembleSnapshot(engine.snapshot()));

/* How long a public demo read is reused on one server instance. */
const DEMO_CACHE_MS = 1_000;

/* The session's state for the public demo addresses (?sample=demo on the
   vMix feeds and /api/live/state): at most one database read a second per
   server instance, however many feeds and viewers poll; requests in the same
   second share it. The local key is in memory and never cached. */
export const readDemoSnapshot = async (
  key: string = SHARED_TRAINING_SESSION,
  now: number = Date.now()
): Promise<SampleSeed> => {
  const read = () => withSession(key, (engine): SampleSeed => engine.snapshot());

  if (key === LOCAL_TRAINING_SESSION) {
    return read();
  }

  const cache = (globalStore.__nezaBaziDemoSnapshots ??= new Map<string, DemoCacheEntry>());
  let entry = cache.get(key);

  if (!entry) {
    entry = { value: null, readAt: 0, pending: null };
    cache.set(key, entry);
  }

  if (entry.value && now - entry.readAt < DEMO_CACHE_MS) {
    return entry.value;
  }

  const current = entry;
  current.pending ??= read()
    .then((value) => {
      current.value = value;
      current.readAt = Date.now();
      return value;
    })
    .finally(() => {
      current.pending = null;
    });

  return current.pending;
};

/* The same assembly over any engine snapshot (the moving vMix sample in
   vmix-sample-live.ts replays its own engine and reads it through this). */
export const assembleSnapshot = (all: SampleSeed): Assembled => {
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
      // Between riders this names the rider the judges' Start button offers,
      // never a rider passed over earlier (next-to-ride.ts).
      up_next: upNextRuns(runs, live, UP_NEXT_LIMIT),
      leaderboard: currentRound
        ? withAttemptMarks(
            computeSampleLeaderboard(currentRound, runs, overridesFor(all.overrides, currentRound.id)),
            runs,
            currentRound
          )
        : [],
      pools,
      pool_rosters: buildPoolRosters(runs),
      next_pool_label: nextPoolLabel(runs, live.called_pool_label, live.current_run_id),
      rounds,
    },
  };
};

/* GET /api/live/state?sample=1 on a SCORING_SAMPLE_MODE=1 laptop, and
   ?sample=demo (the shared demo) — what /live and the overlays show with
   those flags. The same public shape as the real route (district and state
   only, no judge id), so rehearsals show what the public will see. */
export const samplePublicLiveState = async (
  key: string = LOCAL_TRAINING_SESSION
): Promise<PublicLiveState> => toPublicLiveState(assembleSnapshot(await readDemoSnapshot(key)).state);

/* GET /api/judge/state?sample=1, and the `state` every sample write returns. */
export const sampleJudgeState = async (key: string): Promise<JudgeState> => {
  const { state, runs } = await assemble(key);
  return { ...state, runs };
};

const SAMPLE_FACTS: Record<string, SampleFacts & { is_leader?: boolean }> = Object.fromEntries(
  TRAINING_RIDERS.map((entry) => [entry.name, entry.facts])
);

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
export const sampleCommentaryState = async (key: string): Promise<CommentaryState> => {
  const { state, all, runs } = await assemble(key);
  const nextRuns = state.up_next.slice(0, UP_NEXT_RIDERS);
  const leaderboards: Record<string, LeaderboardRow[]> = {};

  for (const round of all.rounds) {
    leaderboards[round.id] = computeSampleLeaderboard(
      round,
      all.runs.filter((run) => run.round_id === round.id),
      overridesFor(all.overrides, round.id)
    );
  }

  return {
    ...state,
    current_rider: state.current_run ? riderDetail(state.current_run, all) : null,
    last_rider: justRodeRun(state) ? riderDetail(justRodeRun(state) as ScoringRun, all) : null,
    up_next_riders: nextRuns.map((run) => ({ ...run, rider: riderDetail(run, all) })),
    leaderboards_by_round: leaderboards,
    runs,
  };
};

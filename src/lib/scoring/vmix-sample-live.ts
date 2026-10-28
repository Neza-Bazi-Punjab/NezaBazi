// Moving rehearsal data for the vMix feeds (?sample=solo).
//
// ?sample=1 is a frozen snapshot: the graphics team can bind every column to
// it, but nothing on screen ever changes. ?sample=solo plays a scripted
// qualification on a loop instead, so titles can be tested against data that
// moves like event day: Pool A is called, riders come on course, results come
// in (carries skip the rider's later attempts), the standings re-rank, a
// result is changed, one is undone, a run is skipped, the screens switch to
// the standings, a message and blank, Pool B is called, and so on. One step
// every STEP_MS; the whole loop takes about four minutes, then starts again.
//
// Same rules as the real scoring: every step is a call on the training engine
// (sample-engine.ts, the database functions re-done in TypeScript), and the
// rows are assembled by the same code as the judges' practice
// (assembleSnapshot in sample-session.ts) and shaped by the same row builders
// as the live feeds. Every row has sample = "Yes".
//
// Stateless on purpose: the step on screen is worked out from the clock, and
// the engine is replayed from a fresh seed up to that step on every request.
// Every server instance, and every viewer, sees the same moment of the loop,
// with real timestamps, and nothing is kept between requests. It never reads
// or writes the database; the riders are the invented ones of vmix-sample.ts.
//
// On/off: the "Graphics rehearsal feed" card on /admin/scoring (rehearsal.ts),
// off by default. Off, ?sample=solo answers exactly like ?sample=1 (the frozen
// snapshot, still sample = "Yes"), so an address keeps its bindings but stops
// moving. The name leaves room for a team (Section) loop, ?sample=team.
// See docs/vmix-data-feed.md.
import "server-only";

import {
  computeSampleLeaderboard,
  createSampleEngine,
  type SampleEngine,
  type SampleSeed,
} from "@/lib/scoring/sample-engine";
import { isSoloSampleOn } from "@/lib/scoring/rehearsal";
import { assembleSnapshot } from "@/lib/scoring/sample-session";
import {
  toPublicLiveState,
  type DisplayMode,
  type LeaderboardRow,
  type PublicLiveState,
  type RunResult,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import {
  SAMPLE_QUALIFICATION_ROUND_ID,
  sampleAllRuns,
  sampleLeaderboardForRound,
  samplePublicLiveState,
  sampleRounds,
  sampleRunsForRound,
} from "@/lib/scoring/vmix-sample";

/* One step of the loop every 8 seconds: slower than real judging at its
   quickest, quick enough to watch a whole pool in a minute or two. */
export const MOVING_SAMPLE_STEP_MS = 8_000;

export const MOVING_SAMPLE_MESSAGE = "Moving sample data for rehearsal — not real results";

/* Each rider's result on attempt 1, 2 and 3 — only as far as they ride: a
   carry skips the rest, as on the day. */
const SCRIPT: Record<string, RunResult[]> = {
  // Pool A
  "Harpreet Singh Sandhu": ["carry"],
  "Gurjeet Singh Brar": ["strike", "carry"],
  "Manpreet Kaur Gill": ["miss", "strike", "strike"],
  "Jaswinder Singh Dhillon": ["miss", "miss", "miss"],
  // Pool B
  "Amandeep Singh Randhawa": ["strike", "carry"],
  "Kulwant Singh Virk": ["carry"],
  "Balraj Singh Sidhu": ["miss", "strike"], // attempt 3 is skipped
  "Navjot Singh Grewal": ["strike", "miss", "carry"],
};

type Step =
  /* "Call Pool X" on the judges' panel. */
  | { kind: "call"; pool: string }
  /* The rider on course gets their scripted result. */
  | { kind: "score" }
  /* The rider on course gets a wrong result, put right by a later step. */
  | { kind: "wrong"; result: RunResult }
  /* "Change result" on the last wrong one, while the next rider is on course. */
  | { kind: "change" }
  /* "Undo last result" on the last wrong one: that rider back on course. */
  | { kind: "undo" }
  /* "Skip run" on the rider on course. */
  | { kind: "skip" }
  /* "Screens" on the judges' panel. */
  | { kind: "screens"; mode: DisplayMode; message?: string };

const STEPS: readonly Step[] = [
  { kind: "call", pool: "A" },
  { kind: "score" }, // Harpreet carries: attempts 2 and 3 skipped
  { kind: "wrong", result: "miss" }, // Gurjeet recorded as a miss...
  { kind: "change" }, // ...changed to Struck while Manpreet is on course
  { kind: "score" }, // Manpreet
  { kind: "score" }, // Jaswinder
  { kind: "screens", mode: "message", message: "Short break — the pegs are being reset" },
  { kind: "screens", mode: "scoreboard", message: MOVING_SAMPLE_MESSAGE },
  { kind: "score" }, // Gurjeet carries on attempt 2
  { kind: "score" },
  { kind: "score" },
  { kind: "score" },
  { kind: "score" }, // Pool A finished
  { kind: "screens", mode: "leaderboard" },
  { kind: "call", pool: "B" },
  { kind: "score" },
  { kind: "score" }, // Kulwant carries
  { kind: "score" },
  { kind: "score" },
  { kind: "score" }, // Amandeep carries on attempt 2
  { kind: "score" },
  { kind: "wrong", result: "carry" }, // Navjot recorded as a carry (skips attempt 3)...
  { kind: "undo" }, // ...undone: Navjot back on course, attempt 3 back
  { kind: "score" }, // Navjot misses
  { kind: "skip" }, // Balraj's attempt 3 skipped
  { kind: "score" }, // Navjot carries on attempt 3: Pool B finished
  { kind: "screens", mode: "leaderboard" },
  { kind: "screens", mode: "message", message: "Qualification complete — the sample starts again shortly" },
  { kind: "screens", mode: "blank" },
];

export const MOVING_SAMPLE_LOOP_MS = STEPS.length * MOVING_SAMPLE_STEP_MS;

/* The qualification with nobody ridden yet, Section 1 as the fixed sample has
   it (complete), every timestamp moved to just before this loop started. */
const seedFor = (loopStart: number): SampleSeed => {
  const seededAt = new Date(loopStart - 10 * 60_000).toISOString();
  const fixed = sampleAllRuns();
  const latestFixed = Math.max(...fixed.map((run) => (run.scored_at ? Date.parse(run.scored_at) : 0)));
  const shift = (value: string | null) =>
    value === null ? null : new Date(Date.parse(value) - latestFixed + loopStart - 15 * 60_000).toISOString();

  return {
    rounds: sampleRounds().map((round) => ({ ...round, created_at: seededAt, updated_at: seededAt })),
    runs: fixed.map((run): ScoringRun =>
      run.round_id === SAMPLE_QUALIFICATION_ROUND_ID
        ? {
            ...run,
            status: "pending",
            result: null,
            points: null,
            scored_by: null,
            scored_at: null,
            created_at: seededAt,
            updated_at: seededAt,
          }
        : { ...run, scored_at: shift(run.scored_at), created_at: seededAt, updated_at: seededAt }
    ),
    live: {
      current_round_id: SAMPLE_QUALIFICATION_ROUND_ID,
      current_run_id: null,
      called_pool_label: null,
      display_mode: "scoreboard",
      message: MOVING_SAMPLE_MESSAGE,
      updated_at: seededAt,
    },
  };
};

const scriptedResult = (run: ScoringRun): RunResult =>
  SCRIPT[run.rider_name]?.[run.attempt_number - 1] ?? "miss";

const apply = (engine: SampleEngine, step: Step, memory: { wrongRunId: string | null }) => {
  const { live, runs } = engine.snapshot();
  const current = runs.find((run) => run.id === live.current_run_id) ?? null;

  switch (step.kind) {
    case "call":
      engine.callPool(SAMPLE_QUALIFICATION_ROUND_ID, step.pool);
      return;
    case "score":
      if (current) {
        engine.recordResult(current.id, scriptedResult(current), false);
      }
      return;
    case "wrong":
      if (current) {
        engine.recordResult(current.id, step.result, false);
        memory.wrongRunId = current.id;
      }
      return;
    case "change": {
      const wrong = runs.find((run) => run.id === memory.wrongRunId);

      if (wrong) {
        engine.recordResult(wrong.id, scriptedResult(wrong), true);
      }
      return;
    }
    case "undo":
      if (memory.wrongRunId) {
        engine.clearResult(memory.wrongRunId, true);
      }
      return;
    case "skip":
      if (current) {
        engine.setRunStatus(current.id, "void");
      }
      return;
    case "screens":
      engine.setLive(
        step.message === undefined
          ? { display_mode: step.mode }
          : { display_mode: step.mode, message: step.message }
      );
      return;
  }
};

/* The engine as it stands `now`: replayed from a fresh seed up to the step
   the clock is on, each step stamped at the moment it "happened". */
export const movingSampleSnapshot = (now: number = Date.now()): SampleSeed => {
  const tick = Math.floor(now / MOVING_SAMPLE_STEP_MS);
  const stepIndex = tick % STEPS.length;
  const loopStart = (tick - stepIndex) * MOVING_SAMPLE_STEP_MS;
  let clock = loopStart;
  const engine = createSampleEngine(seedFor(loopStart), () => clock);
  const memory = { wrongRunId: null as string | null };

  for (let index = 0; index <= stepIndex; index += 1) {
    clock = loopStart + index * MOVING_SAMPLE_STEP_MS;
    apply(engine, STEPS[index], memory);
  }

  return engine.snapshot();
};

/* What the four vMix feeds need from the sample, frozen or moving. */
export type VmixSampleSource = {
  liveRoundId: string;
  state: () => PublicLiveState;
  rounds: () => ScoringRound[];
  allRuns: () => ScoringRun[];
  runsForRound: (roundId: string) => ScoringRun[];
  leaderboardForRound: (roundId: string) => LeaderboardRow[];
};

const FIXED_SAMPLE: VmixSampleSource = {
  liveRoundId: SAMPLE_QUALIFICATION_ROUND_ID,
  state: samplePublicLiveState,
  rounds: sampleRounds,
  allRuns: sampleAllRuns,
  runsForRound: sampleRunsForRound,
  leaderboardForRound: sampleLeaderboardForRound,
};

const movingSample = (now: number): VmixSampleSource => {
  const all = movingSampleSnapshot(now);
  const rounds = [...all.rounds].sort((a, b) => a.sort_order - b.sort_order);
  const runsForRound = (roundId: string) =>
    all.runs.filter((run) => run.round_id === roundId).sort((a, b) => a.run_order - b.run_order);

  return {
    liveRoundId: SAMPLE_QUALIFICATION_ROUND_ID,
    state: () => toPublicLiveState(assembleSnapshot(all).state),
    rounds: () => rounds,
    allRuns: () => all.runs,
    runsForRound,
    leaderboardForRound: (roundId) => {
      const round = rounds.find((candidate) => candidate.id === roundId);
      return round ? computeSampleLeaderboard(round, runsForRound(roundId)) : [];
    },
  };
};

/* ?sample=solo: the moving loop while the switch is on; any other sample
   request, or the switch off: the frozen snapshot. The switch is read only
   for ?sample=solo, so ?sample=1 never touches the database. */
export const wantsSoloSample = (url: URL) =>
  url.searchParams.get("sample")?.trim().toLowerCase() === "solo";

export const vmixSampleSource = async (
  url: URL,
  now: number = Date.now()
): Promise<VmixSampleSource> =>
  wantsSoloSample(url) && (await isSoloSampleOn()) ? movingSample(now) : FIXED_SAMPLE;

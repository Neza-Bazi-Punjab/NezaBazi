// Words and flags shared by the training (practice) panels, /judge/demo and
// /commentary/demo. Browser-safe and import-free.

/* Which practice the panel is on, for its banner and its reset prompt.
   "shared": one demo for everyone — on the live site the organisers' shared
   session, stored in the database so every device sees the same thing; on a
   laptop running with SCORING_SAMPLE_MODE=1 the laptop's one session, which
   every device using that laptop shares. "unshared": the live site before the
   scoring_training_sessions migration is applied, when each server instance
   keeps its own copy in memory, so two devices may not see the same demo
   (sample-session.ts falls back to the in-memory store; the demo pages ask
   sharedTrainingScope() which one applies). Personal sessions are gone: the
   demo is the organisers' rehearsal, not private practice. */
export type TrainingScope = "shared" | "unshared";

export const TRAINING_LABEL = "TRAINING MODE";

export const TRAINING_BANNER: Record<TrainingScope, string> = {
  shared: "Practice data — one demo shared by everyone, on every device; nothing is recorded.",
  unshared:
    "Practice data — one demo shared by everyone (not yet shared between devices); nothing is recorded.",
};

/* The confirm prompt for "Reset training data". */
export const TRAINING_RESET_QUESTION: Record<TrainingScope, string> = {
  shared:
    "Reset the practice data? Every result recorded in practice is wiped and the demo starts again with the riders registered right now, in a new random draw. This restarts the demo for everyone, on every device.",
  unshared:
    "Reset the practice data? Every result recorded in practice is wiped and the sample riders start again. This restarts the demo for everyone practising on this server (not yet shared between devices).",
};

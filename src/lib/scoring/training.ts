// Words and flags shared by the training (practice) panels, /judge/demo and
// /commentary/demo. Browser-safe and import-free.

/* "shared": a laptop running with SCORING_SAMPLE_MODE=1 — no login, one
   practice session for everyone using that server. "personal": the live site
   — a signed-in judge, commentator or administrator practising on their own
   session, which nobody else sees. */
export type TrainingScope = "shared" | "personal";

export const TRAINING_LABEL = "TRAINING MODE";

export const TRAINING_BANNER: Record<TrainingScope, string> = {
  personal: "Practice data — yours only, nothing is recorded; it may reset after a while.",
  shared: "Practice data — shared by everyone practising on this server, nothing is recorded.",
};

/* The confirm prompt for "Reset training data". */
export const TRAINING_RESET_QUESTION: Record<TrainingScope, string> = {
  personal:
    "Reset your practice data? Every result you recorded in practice is wiped and the sample riders start again. Nobody else is affected.",
  shared:
    "Reset the practice data? Every result recorded in practice is wiped and the sample riders start again, for everyone practising on this server.",
};

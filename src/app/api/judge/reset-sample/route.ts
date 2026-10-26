// POST /api/judge/reset-sample — "Reset training data" on /judge/demo.
//
// Training mode only (?sample=1, allowed on a laptop with
// SCORING_SAMPLE_MODE=1 or for a signed-in judge, commentator or
// administrator): puts the caller's own practice session back to its
// starting state — the shared one on a SCORING_SAMPLE_MODE=1 laptop — and
// returns the fresh judge state. Any other request gets 404, as if the route
// did not exist. It never reads or writes the scoring or registration tables
// and never returns real data: the only thing it can change is a practice
// session in memory.
import { jsonError } from "@/lib/scoring/http";
import { resolveSampleAccess, sampleResponse } from "@/lib/scoring/sample-mode";
import { reset, sampleJudgeState } from "@/lib/scoring/sample-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const training = await resolveSampleAccess(request);

  if (training.kind !== "training") {
    return jsonError("Not found.", 404);
  }

  return sampleResponse(() => {
    reset(training.session);
    return { state: sampleJudgeState(training.session) };
  });
}

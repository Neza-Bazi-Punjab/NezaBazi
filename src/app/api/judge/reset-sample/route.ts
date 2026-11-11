// POST /api/judge/reset-sample — "Reset training data" on /judge/demo.
//
// Training mode only (?sample=1, allowed on a laptop with
// SCORING_SAMPLE_MODE=1 or for a signed-in judge, commentator or
// administrator): puts the caller's practice session back to its starting
// state — on the live site that is the one shared demo, so it restarts for
// everyone, on every device; on a SCORING_SAMPLE_MODE=1 laptop the laptop's
// session — and returns the fresh judge state. Any other request gets 404, as
// if the route did not exist. On the live site the fresh demo is a copy of the
// registered solo riders, drawn anew (sample-session.ts; read only, and the
// sample riders when they cannot be read). It never reads or writes the
// scoring tables, never writes a registration and never returns a real
// result: the only thing it can change is the practice session (the
// scoring_training_sessions row, or the in-memory copy).
import { jsonError } from "@/lib/scoring/http";
import { resolveSampleAccess, sampleResponse } from "@/lib/scoring/sample-mode";
import { reset, sampleJudgeState } from "@/lib/scoring/sample-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const training = await resolveSampleAccess(request);

  if (training.kind !== "training") {
    return jsonError("Not found.", 404);
  }

  return sampleResponse(async () => {
    await reset(training.session);
    return { state: await sampleJudgeState(training.session) };
  });
}

// GET /api/judge/state — the judges' panel: the public state plus the current
// round's full start list. Judges and administrators only; never cached.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import { jsonNoStore, unexpectedErrorResponse } from "@/lib/scoring/http";
import { resolveSampleAccess, sampleResponse } from "@/lib/scoring/sample-mode";
import { sampleJudgeState } from "@/lib/scoring/sample-session";
import { buildJudgeState } from "@/lib/scoring/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Training mode (?sample=1): answered from a practice session in memory,
  // before and instead of the role check below. Allowed on a laptop with
  // SCORING_SAMPLE_MODE=1 (anyone, one shared session) or for a signed-in
  // judge, commentator or administrator (their own session); anyone else gets
  // the same 401/403 as the real route. This branch never reads or writes the
  // scoring or registration tables and never returns real data.
  const training = await resolveSampleAccess(request);

  if (training.kind === "refused") {
    return training.response;
  }

  if (training.kind === "training") {
    return sampleResponse(() => sampleJudgeState(training.session));
  }

  const access = await verifyRoleRequest(["judge", "admin"]);

  if (!access.ok) {
    return access.response;
  }

  try {
    return jsonNoStore(await buildJudgeState(createServiceRoleClient()));
  } catch (error) {
    return unexpectedErrorResponse(error, "judge state");
  }
}

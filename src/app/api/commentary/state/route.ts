// GET /api/commentary/state — the commentary panel's data.
//
// Judges, commentators and administrators only. Extends the public state with
// the rider's background for the announcer (parents' names, age, home,
// experience, horse, headshot) read from the registration tables through the
// service role, so it must never be cached anywhere.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import { jsonNoStore, unexpectedErrorResponse } from "@/lib/scoring/http";
import { resolveSampleAccess, sampleResponse } from "@/lib/scoring/sample-mode";
import { sampleCommentaryState } from "@/lib/scoring/sample-session";
import { buildCommentaryState } from "@/lib/scoring/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Training mode (?sample=1): answered from a practice session in memory,
  // before and instead of the role check below. Allowed on a laptop with
  // SCORING_SAMPLE_MODE=1 (anyone, one shared session) or for a signed-in
  // judge, commentator or administrator (their own session); anyone else gets
  // the same 401/403 as the real route. This branch never reads or writes the
  // scoring or registration tables and never returns real data (the riders and
  // their background are invented).
  const training = await resolveSampleAccess(request);

  if (training.kind === "refused") {
    return training.response;
  }

  if (training.kind === "training") {
    return sampleResponse(() => sampleCommentaryState(training.session));
  }

  const access = await verifyRoleRequest(["judge", "commentator", "admin"]);

  if (!access.ok) {
    return access.response;
  }

  try {
    return jsonNoStore(await buildCommentaryState(createServiceRoleClient()));
  } catch (error) {
    return unexpectedErrorResponse(error, "commentary state");
  }
}

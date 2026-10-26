// POST /api/judge/clear — remove a recorded result. Judges and administrators
// only.
//
// With `make_current: true` (the panel's "Undo last result") the same
// transaction also puts this rider back on course and moves the live pointer
// to them, so it never stays on the next rider while this result is gone.
// Returns the run and the fresh judge state.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { resolveSampleAccess, sampleWriteResponse } from "@/lib/scoring/sample-mode";
import { clearResult, sampleJudgeState } from "@/lib/scoring/sample-session";
import { buildJudgeStateAfterWrite } from "@/lib/scoring/server";
import type { ScoringRun } from "@/lib/scoring/types";
import { parseClearScoreRequest } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
    return sampleWriteResponse(request, parseClearScoreRequest, (value) => ({
      run: clearResult(training.session, value.run_id, value.make_current === true),
      state: sampleJudgeState(training.session),
    }));
  }

  const access = await verifyRoleRequest(["judge", "admin"]);

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parseClearScoreRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_clear_result", {
    p_run_id: parsed.value.run_id,
    p_make_current: parsed.value.make_current === true,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "clear result");
  }

  return jsonNoStore({
    run: data as ScoringRun,
    state: await buildJudgeStateAfterWrite(serviceSupabase),
  });
}

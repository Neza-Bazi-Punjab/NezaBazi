// POST /api/judge/score — record a run's result (Carried 4 / Struck 2 /
// Miss 0). Judges and administrators only.
//
// The database computes points from the result; the browser never sends
// them. A run that already has a result is refused unless `override` is true
// (the panel's "Change result"), so two judges cannot both score one run by
// accident. Returns the scored run and the fresh judge state, so the panel
// reconciles without waiting for realtime.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { resolveSampleAccess, sampleWriteResponse } from "@/lib/scoring/sample-mode";
import { recordResult, sampleJudgeState } from "@/lib/scoring/sample-session";
import { buildJudgeStateAfterWrite } from "@/lib/scoring/server";
import type { ScoringRun } from "@/lib/scoring/types";
import { parseScoreRequest } from "@/lib/scoring/validation";

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
    return sampleWriteResponse(request, parseScoreRequest, (value) => ({
      run: recordResult(training.session, value.run_id, value.result, value.override === true),
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

  const parsed = parseScoreRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  // The audit actor comes from the verified session, never from the body.
  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_record_result", {
    p_run_id: parsed.value.run_id,
    p_result: parsed.value.result,
    p_override: parsed.value.override === true,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "record result");
  }

  return jsonNoStore({
    run: data as ScoringRun,
    state: await buildJudgeStateAfterWrite(serviceSupabase),
  });
}

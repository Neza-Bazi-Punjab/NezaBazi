// POST /api/judge/call-pool — "Call Pool B": bring a pool to the start.
// Judges and administrators only.
//
// Makes the round live, points the live run at the pool's first rider still
// to ride, records the pool as called and switches every screen to the pool
// roster ("Pool B — get ready"). The first result recorded afterwards returns
// the screens to the scoreboard. Returns the new live state and the fresh
// judge state.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { resolveSampleAccess, sampleWriteResponse } from "@/lib/scoring/sample-mode";
import { callPool, sampleJudgeState } from "@/lib/scoring/sample-session";
import { buildJudgeStateAfterWrite } from "@/lib/scoring/server";
import type { LiveState } from "@/lib/scoring/types";
import { parseCallPoolRequest } from "@/lib/scoring/validation";

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
    return sampleWriteResponse(request, parseCallPoolRequest, (value) => ({
      live: callPool(training.session, value.round_id, value.pool_label),
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

  const parsed = parseCallPoolRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_call_pool", {
    p_round_id: parsed.value.round_id,
    p_pool_label: parsed.value.pool_label,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "call pool");
  }

  return jsonNoStore({
    live: data as LiveState,
    state: await buildJudgeStateAfterWrite(serviceSupabase),
  });
}

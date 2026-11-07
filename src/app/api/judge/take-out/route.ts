// POST /api/judge/take-out — "Take out" a rider for the rest of the round
// (an injured horse, a disqualification) or "Bring back" a judge's Take out.
// Judges and administrators only. Taking out skips the rider's rides still to
// come and records them as out; if they were on course the next rider comes
// on. Bringing back undoes both. Returns the fresh judge state.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { resolveSampleAccess, sampleWriteResponse } from "@/lib/scoring/sample-mode";
import { takeOut, sampleJudgeState } from "@/lib/scoring/sample-session";
import { buildJudgeStateAfterWrite } from "@/lib/scoring/server";
import { parseTakeOutRequest } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Training mode (?sample=1): answered from the practice session, before and
  // instead of the role check below. Allowed on a laptop with
  // SCORING_SAMPLE_MODE=1 (anyone, the laptop's session in memory) or for a
  // signed-in judge, commentator or administrator (the one shared demo, the
  // same on every device); anyone else gets
  // the same 401/403 as the real route. This branch never reads or writes the
  // scoring or registration tables and never returns real data.
  const training = await resolveSampleAccess(request);

  if (training.kind === "refused") {
    return training.response;
  }

  if (training.kind === "training") {
    return sampleWriteResponse(request, parseTakeOutRequest, async (value) => ({
      result: await takeOut(
        training.session,
        value.round_id,
        value.entrant_key,
        value.out,
        training.actor ?? null
      ),
      state: await sampleJudgeState(training.session),
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

  const parsed = parseTakeOutRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_take_out", {
    p_round_id: parsed.value.round_id,
    p_entrant_key: parsed.value.entrant_key,
    p_out: parsed.value.out,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "take out");
  }

  return jsonNoStore({
    result: data,
    state: await buildJudgeStateAfterWrite(serviceSupabase),
  });
}

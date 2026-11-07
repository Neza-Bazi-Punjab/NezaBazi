// POST /api/judge/live — move the live pointer or change what the screens
// show. Judges and administrators only; what the screens show
// (display_mode, message) is for administrators — the stream team and the
// admin page control the screens, not the judges' panel.
//
// A partial update: only the keys present (current_round_id, current_run_id,
// called_pool_label, display_mode, message) are applied, and the database
// checks that a run belongs to the live round and is still to ride. Returns
// the new live state and the fresh judge state.
import { createServiceRoleClient } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { resolveSampleAccess, sampleWriteResponse } from "@/lib/scoring/sample-mode";
import { setLive, sampleJudgeState } from "@/lib/scoring/sample-session";
import { buildJudgeStateAfterWrite } from "@/lib/scoring/server";
import type { LiveState, LiveUpdateRequest } from "@/lib/scoring/types";
import { parseLiveUpdateRequest } from "@/lib/scoring/validation";

const JUDGE_SCREENS_REFUSAL =
  "The screens are controlled by the stream team, not the judges' panel.";

const changesScreens = (value: LiveUpdateRequest) =>
  Object.prototype.hasOwnProperty.call(value, "display_mode") ||
  Object.prototype.hasOwnProperty.call(value, "message");

/* Training is the judges' panel only, so it never changes the screens. */
const parseJudgeLiveUpdate = (raw: unknown) => {
  const parsed = parseLiveUpdateRequest(raw);
  return parsed.ok && changesScreens(parsed.value)
    ? { ok: false as const, error: JUDGE_SCREENS_REFUSAL }
    : parsed;
};

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
    return sampleWriteResponse(request, parseJudgeLiveUpdate, async (value) => ({
      live: await setLive(training.session, value, training.actor ?? null),
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

  const parsed = parseLiveUpdateRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  if (access.role !== "admin" && changesScreens(parsed.value)) {
    return jsonError(JUDGE_SCREENS_REFUSAL, 403);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_set_live", {
    p_payload: parsed.value,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "set live");
  }

  return jsonNoStore({
    live: data as LiveState,
    state: await buildJudgeStateAfterWrite(serviceSupabase),
  });
}

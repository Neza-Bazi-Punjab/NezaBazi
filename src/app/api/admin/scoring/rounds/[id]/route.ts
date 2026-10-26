// /api/admin/scoring/rounds/[id] — administrators only.
//
// PATCH  edit a round (RoundPatch: any of name, event, round number,
//        attempts, target, sort order, pool size, status, podium)
//        -> { round, admin }. Event, attempts and pool size are frozen once
//        the round has a start list.
// DELETE delete a round and its runs -> { ok, runs_deleted, results_deleted,
//        admin }. Refused while results are recorded unless ?force=1.
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import type { ScoringRound } from "@/lib/scoring/types";
import {
  isRecord,
  parseRoundPatch,
  readForceFlag,
  readUuidSegment,
} from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  const roundId = readUuidSegment((await context.params).id);

  if (!roundId) {
    return jsonError("That round does not exist.", 404);
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parseRoundPatch(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_upsert_round", {
    p_round_id: roundId,
    p_payload: parsed.value,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "edit round");
  }

  return jsonNoStore({
    round: data as ScoringRound,
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  const roundId = readUuidSegment((await context.params).id);

  if (!roundId) {
    return jsonError("That round does not exist.", 404);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_delete_round", {
    p_round_id: roundId,
    p_force: readForceFlag(request),
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "delete round");
  }

  const counts: Record<string, unknown> = isRecord(data) ? data : {};

  return jsonNoStore({
    ok: true,
    runs_deleted: typeof counts.runs_deleted === "number" ? counts.runs_deleted : 0,
    results_deleted: typeof counts.results_deleted === "number" ? counts.results_deleted : 0,
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

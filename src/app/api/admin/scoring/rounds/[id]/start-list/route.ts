// /api/admin/scoring/rounds/[id]/start-list — administrators only.
//
// POST   draw the start list (StartListRequest: "all_checked_in" or
//        "advanced"), shuffled and split into balanced pools
//        -> { runs_created, runs, admin }. Refused once results exist.
// DELETE clear the start list -> { runs_deleted, admin }. Refused while
//        results are recorded unless ?force=1.
import { createServiceRoleClient } from "@/lib/admin/server";
import {
  buildAdminScoringStateAfterWrite,
  readRoundRuns,
} from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import {
  parseStartListRequest,
  readForceFlag,
  readUuidSegment,
} from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
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

  const parsed = parseStartListRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_build_start_list", {
    p_round_id: roundId,
    p_mode: parsed.value.mode,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "draw start list");
  }

  return jsonNoStore({
    runs_created: typeof data === "number" ? data : 0,
    runs: await readRoundRuns(serviceSupabase, roundId),
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
  const { data, error } = await serviceSupabase.rpc("scoring_clear_start_list", {
    p_round_id: roundId,
    p_force: readForceFlag(request),
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "clear start list");
  }

  return jsonNoStore({
    runs_deleted: typeof data === "number" ? data : 0,
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

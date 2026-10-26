// DELETE /api/admin/scoring/rounds/[id]/entrants/[entrantKey] — remove an
// entrant (every run they have in the round). Administrators only. Refused
// when any of those runs has a result. -> { runs_deleted, admin }.
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import { databaseErrorResponse, jsonError, jsonNoStore } from "@/lib/scoring/http";
import { readEntrantKeySegment, readUuidSegment } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; entrantKey: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  const params = await context.params;
  const roundId = readUuidSegment(params.id);
  const entrantKey = readEntrantKeySegment(params.entrantKey);

  if (!roundId || !entrantKey) {
    return jsonError("That entrant is not in this round.", 404);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_remove_entrant", {
    p_round_id: roundId,
    p_entrant_key: entrantKey,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "remove entrant");
  }

  return jsonNoStore({
    runs_deleted: typeof data === "number" ? data : 0,
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

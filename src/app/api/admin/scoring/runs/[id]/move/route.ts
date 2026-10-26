// POST /api/admin/scoring/runs/[id]/move — move one run to another position
// in its round's start list. Administrators only.
//
// Body: { run_order }. Only within the run's own pool and attempt pass, and
// never a run that has a result; the round is renumbered contiguously.
// -> { runs, admin } (runs: the whole round, in order).
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import type { ScoringRun } from "@/lib/scoring/types";
import { parseMoveRunRequest, readUuidSegment } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  const runId = readUuidSegment((await context.params).id);

  if (!runId) {
    return jsonError("That run is no longer in the start list.", 404);
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parseMoveRunRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_move_run", {
    p_run_id: runId,
    p_new_order: parsed.value.run_order,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "move run");
  }

  return jsonNoStore({
    runs: (Array.isArray(data) ? data : []) as ScoringRun[],
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

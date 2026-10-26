// POST /api/admin/scoring/pool — move an entrant (all their runs) to another
// pool. Administrators only.
//
// Body: PoolMoveRequest { round_id, entrant_key, pool_label }. The pool must
// already exist in the round or be the next new letter; the entrant rides
// last in their new pool, and the whole round is renumbered. Refused when any
// of the entrant's runs has a result. -> { moved, runs, admin }.
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
import { parsePoolMoveRequest } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parsePoolMoveRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_set_entrant_pool", {
    p_round_id: parsed.value.round_id,
    p_entrant_key: parsed.value.entrant_key,
    p_pool_label: parsed.value.pool_label,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "move entrant to pool");
  }

  return jsonNoStore({
    moved: typeof data === "number" ? data : 0,
    runs: await readRoundRuns(serviceSupabase, parsed.value.round_id),
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

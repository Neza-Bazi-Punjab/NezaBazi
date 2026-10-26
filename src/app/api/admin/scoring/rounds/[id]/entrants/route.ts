// POST /api/admin/scoring/rounds/[id]/entrants — add a late entrant after the
// draw. Administrators only.
//
// Body: exactly one of { solo_registration_id } or { team_id }. The entrant
// joins the smallest pool and rides last in it. Check-in is not required —
// the administrator is overriding, and the audit row records whether they had
// checked in. -> { runs, admin }.
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
import { parseAddEntrantRequest, readUuidSegment } from "@/lib/scoring/validation";

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

  const parsed = parseAddEntrantRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_add_entrant", {
    p_round_id: roundId,
    p_solo_registration_id: parsed.value.solo_registration_id,
    p_team_id: parsed.value.team_id,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "add entrant");
  }

  return jsonNoStore({
    runs: (Array.isArray(data) ? data : []) as ScoringRun[],
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

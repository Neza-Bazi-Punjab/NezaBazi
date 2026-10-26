// POST /api/admin/scoring/advance — record, change or remove an
// administrator's decision on whether an entrant goes through (after a
// disqualification or a re-run ordered by the chief judge). Administrators
// only.
//
// Body: AdvanceOverrideRequest { round_id, entrant_key, advanced, note? };
// `advanced: null` removes the override and the round's rule applies again.
// -> { leaderboard, admin } (leaderboard: that round's standings).
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { parseAdvanceOverrideRequest } from "@/lib/scoring/validation";

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

  const parsed = parseAdvanceOverrideRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { error } = await serviceSupabase.rpc("scoring_set_advance_override", {
    p_round_id: parsed.value.round_id,
    p_entrant_key: parsed.value.entrant_key,
    p_advanced: parsed.value.advanced,
    p_note: parsed.value.note ?? null,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "advance override");
  }

  const admin = await buildAdminScoringStateAfterWrite(serviceSupabase);

  return jsonNoStore({
    leaderboard: admin?.leaderboards_by_round[parsed.value.round_id] ?? [],
    admin,
  });
}

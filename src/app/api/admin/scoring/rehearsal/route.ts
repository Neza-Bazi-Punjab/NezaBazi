// POST /api/admin/scoring/rehearsal — switch the graphics rehearsal feed (the
// moving vMix sample, ?sample=solo) on or off. Administrators only.
//
// Body: RehearsalSampleRequest { sample: "solo", enabled }.
// -> { rehearsal, admin }. The feeds follow within a second or two.
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
} from "@/lib/scoring/http";
import { parseRehearsalSampleRequest } from "@/lib/scoring/validation";

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

  const parsed = parseRehearsalSampleRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_set_rehearsal_sample", {
    p_sample: parsed.value.sample,
    p_enabled: parsed.value.enabled,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "rehearsal feed switch");
  }

  const admin = await buildAdminScoringStateAfterWrite(serviceSupabase);

  return jsonNoStore({ rehearsal: data, admin });
}

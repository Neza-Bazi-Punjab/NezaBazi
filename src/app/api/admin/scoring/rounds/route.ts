// /api/admin/scoring/rounds — administrators only.
//
// GET  everything /admin/scoring needs: rounds, every round's runs and
//      standings, the live state, overrides (with notes) and the riders and
//      teams that can be drawn or added.
// POST create a round (RoundInput) -> { round, admin }.
//
// Every write returns the fresh admin payload as `admin` (null if it could not
// be rebuilt; the panel then refetches).
import { createServiceRoleClient } from "@/lib/admin/server";
import {
  buildAdminScoringState,
  buildAdminScoringStateAfterWrite,
} from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import {
  databaseErrorResponse,
  jsonError,
  jsonNoStore,
  readJsonBody,
  unexpectedErrorResponse,
} from "@/lib/scoring/http";
import type { ScoringRound } from "@/lib/scoring/types";
import { parseRoundInput } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  try {
    return jsonNoStore(await buildAdminScoringState(createServiceRoleClient()));
  } catch (error) {
    return unexpectedErrorResponse(error, "admin scoring state");
  }
}

export async function POST(request: Request) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  const body = await readJsonBody(request);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parseRoundInput(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("scoring_upsert_round", {
    p_round_id: null,
    p_payload: parsed.value,
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  });

  if (error) {
    return databaseErrorResponse(error, "create round");
  }

  return jsonNoStore({
    round: data as ScoringRound,
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

// /api/admin/scoring/next-round — the auto engine's Next step card on
// /admin/scoring. Administrators only. Single tent pegging only.
//
// GET  -> { step }: the Auto engine switch, what happens after the latest
//      Single round (who goes through, the next round's name, or why not
//      yet) and the round Undo would remove. step is null until
//      20261110130000_scoring_auto_next_round.sql is applied.
// POST { action: "start_qualifying" }  make the qualifying round and shuffle
//      every checked-in rider into pools of about 12 (later check-ins join
//      the last pool on their own).
//      { action: "start", round_id }  start the next round from round_id:
//      writes the "Auto:" overrides, creates the round and draws it in start
//      order, in one transaction with its audit rows.
//      { action: "undo", round_id }   remove a round the engine started,
//      while nobody in it has ridden.
//      { action: "switch", auto_on }  Automatic (true) or Manual (false).
//      -> { result, step, admin }.
// The database checks every rule again; a refusal comes back as 409 with
// its own message.
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import { databaseErrorResponse, jsonError, jsonNoStore, readJsonBody } from "@/lib/scoring/http";
import { parseNextRoundRequest, toNextStep } from "@/lib/scoring/next-round";

export const dynamic = "force-dynamic";

const NOT_SET_UP =
  "Automatic mode is not set up yet: apply 20261110130000_scoring_auto_next_round.sql and 20261110140000_scoring_auto_qualifying.sql in Supabase.";

/* Function missing (migration not applied yet). */
const isMissingFunction = (code: unknown) => code === "PGRST202" || code === "42883";

const readStep = async (client: ReturnType<typeof createServiceRoleClient>) => {
  const { data, error } = await client.rpc("scoring_next_step");

  if (error) {
    if (!isMissingFunction(error.code)) {
      console.error("[scoring] reading the next step failed", { code: error.code ?? null });
    }

    return null;
  }

  return toNextStep(data);
};

export async function GET() {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  return jsonNoStore({ step: await readStep(createServiceRoleClient()) });
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

  const parsed = parseNextRoundRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const actor = {
    p_actor_id: access.actor.id,
    p_actor_name: access.actor.name,
    p_actor_email: access.actor.email,
  };
  const action = parsed.value;

  const { data, error } =
    action.action === "switch"
      ? await serviceSupabase.rpc("scoring_set_auto_engine", { p_on: action.auto_on, ...actor })
      : action.action === "start_qualifying"
        ? await serviceSupabase.rpc("scoring_start_qualifying", actor)
        : await serviceSupabase.rpc(
          action.action === "start" ? "scoring_start_next_round" : "scoring_undo_next_round",
          { p_round_id: action.round_id, ...actor }
        );

  if (error) {
    if (isMissingFunction(error.code)) {
      return jsonError(NOT_SET_UP, 503);
    }

    return databaseErrorResponse(error, `next round ${action.action}`);
  }

  return jsonNoStore({
    result: data ?? null,
    step: await readStep(serviceSupabase),
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

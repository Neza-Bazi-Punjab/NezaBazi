// /api/admin/scoring/next-round — the auto engine's Next step card on
// /admin/scoring. Administrators only. Single tent pegging only.
//
// GET ?event=single|section -> { step }: that event's Automatic / Manual
//      switch, what happens after its latest round (who goes through, the
//      next round's name, or why not yet) and the round Undo would remove.
//      step is null until the migrations are applied (Teams need
//      20261110150000_scoring_auto_teams.sql).
// POST { action: "start_teams" }  Teams Round 1 (target 8): every team with
//      all 4 checked in, shuffled once into one queue.
//      { action: "start_qualifying" }  make the qualifying round and shuffle
//      every checked-in rider into pools of about 12 (later check-ins join
//      the last pool on their own).
//      { action: "start", round_id }  start the next round from round_id:
//      writes the "Auto:" overrides, creates the round and draws it in start
//      order, in one transaction with its audit rows.
//      { action: "undo", round_id }   remove a round the engine started,
//      while nobody in it has ridden.
//      { action: "switch", auto_on, event_type }  Automatic (true) or
//      Manual (false), for Singles or Teams.
//      -> { result, step, admin }.
// The database checks every rule again; a refusal comes back as 409 with
// its own message.
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringStateAfterWrite } from "@/lib/scoring/admin-state";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import { databaseErrorResponse, jsonError, jsonNoStore, readJsonBody } from "@/lib/scoring/http";
import {
  isEngineEvent,
  parseNextRoundRequest,
  toNextStep,
  type EngineEvent,
} from "@/lib/scoring/next-round";

export const dynamic = "force-dynamic";

const NOT_SET_UP =
  "Automatic mode is not set up yet: apply 20261110130000_scoring_auto_next_round.sql, 20261110140000_scoring_auto_qualifying.sql and 20261110150000_scoring_auto_teams.sql in Supabase.";

/* Function missing (migration not applied yet). */
const isMissingFunction = (code: unknown) => code === "PGRST202" || code === "42883";

/* One event's next step. Before the Teams migration only the Singles
   (no-argument) version exists: Singles fall back to it, Teams read null. */
const readStep = async (client: ReturnType<typeof createServiceRoleClient>, event: EngineEvent) => {
  let { data, error } = await client.rpc("scoring_next_step", { p_event_type: event });

  if (error && isMissingFunction(error.code) && event === "single") {
    ({ data, error } = await client.rpc("scoring_next_step"));
  }

  if (error) {
    if (!isMissingFunction(error.code)) {
      console.error("[scoring] reading the next step failed", { code: error.code ?? null });
    }

    return null;
  }

  return toNextStep(data);
};

const eventFrom = (request: Request): EngineEvent => {
  const value = new URL(request.url).searchParams.get("event");
  return isEngineEvent(value) ? value : "single";
};

export async function GET(request: Request) {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  return jsonNoStore({ step: await readStep(createServiceRoleClient(), eventFrom(request)) });
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

  const run = async () => {
    switch (action.action) {
      case "switch": {
        const result = await serviceSupabase.rpc("scoring_set_engine_mode", {
          p_event_type: action.event_type,
          p_on: action.auto_on,
          ...actor,
        });

        // Before the Teams migration: the Singles-only switch.
        if (result.error && isMissingFunction(result.error.code) && action.event_type === "single") {
          return serviceSupabase.rpc("scoring_set_auto_engine", { p_on: action.auto_on, ...actor });
        }

        return result;
      }
      case "start_qualifying":
        return serviceSupabase.rpc("scoring_start_qualifying", actor);
      case "start_teams":
        return serviceSupabase.rpc("scoring_start_teams", actor);
      default:
        return serviceSupabase.rpc(
          action.action === "start" ? "scoring_start_next_round" : "scoring_undo_next_round",
          { p_round_id: action.round_id, ...actor }
        );
    }
  };

  const { data, error } = await run();

  if (error) {
    if (isMissingFunction(error.code)) {
      return jsonError(NOT_SET_UP, 503);
    }

    return databaseErrorResponse(error, `next round ${action.action}`);
  }

  const result = (data ?? null) as { event_type?: unknown } | null;
  const event: EngineEvent =
    action.action === "switch"
      ? action.event_type
      : action.action === "start_teams" || result?.event_type === "section"
        ? "section"
        : "single";

  return jsonNoStore({
    result,
    step: await readStep(serviceSupabase, event),
    admin: await buildAdminScoringStateAfterWrite(serviceSupabase),
  });
}

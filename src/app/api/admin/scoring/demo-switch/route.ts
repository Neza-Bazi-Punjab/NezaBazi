// GET / POST /api/admin/scoring/demo-switch — "Close demo" / "Open demo" on
// the Graphics Rehearsal Feed card. Administrators only.
//
// GET -> { demo }: the switch (null until the migration is applied, which
// reads as open). POST { closed } closes or opens the shared practice demo
// for everyone: closed, the demo pages say "Demo closed for the event", the
// practice APIs refuse, and ?sample=demo answers with the frozen sample rows
// (training-switch.ts). The audit row (close_demo / open_demo) is written
// first, so the switch never changes without one. -> { demo }.
import { createServiceRoleClient, insertRequiredAuditLog } from "@/lib/admin/server";
import { verifyRoleRequest } from "@/lib/scoring/auth";
import { databaseErrorResponse, jsonError, jsonNoStore, readJsonBody } from "@/lib/scoring/http";
import {
  TRAINING_SWITCH_TABLE,
  readDemoSwitch,
  writeDemoSwitch,
} from "@/lib/scoring/training-switch";
import type { Parsed } from "@/lib/scoring/validation";

export const dynamic = "force-dynamic";

const NOT_SET_UP = "The demo switch is not set up yet: apply 20261107120000_scoring_training_sessions.sql.";

/* { closed: boolean }, nothing else. */
const parseDemoSwitchRequest = (raw: unknown): Parsed<{ closed: boolean }> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Send { closed: true } or { closed: false }." };
  }

  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length !== 1 || keys[0] !== "closed" || typeof record.closed !== "boolean") {
    return { ok: false, error: "Send { closed: true } or { closed: false }." };
  }

  return { ok: true, value: { closed: record.closed } };
};

export async function GET() {
  const access = await verifyRoleRequest(["admin"]);

  if (!access.ok) {
    return access.response;
  }

  return jsonNoStore({ demo: await readDemoSwitch(createServiceRoleClient()) });
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

  const parsed = parseDemoSwitchRequest(body.body);

  if (!parsed.ok) {
    return jsonError(parsed.error, 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const before = await readDemoSwitch(serviceSupabase);

  if (!before) {
    return jsonError(NOT_SET_UP, 503);
  }

  if (before.demo_closed === parsed.value.closed) {
    return jsonError(parsed.value.closed ? "The demo is already closed." : "The demo is already open.", 409);
  }

  try {
    await insertRequiredAuditLog(serviceSupabase, access.actor, {
      action: parsed.value.closed ? "close_demo" : "open_demo",
      target_table: TRAINING_SWITCH_TABLE,
      target_id: "demo",
      details: { before: before.demo_closed, after: parsed.value.closed },
    });
  } catch (caught) {
    console.error("[scoring] demo switch audit failed", caught);
    return jsonError("The change could not be recorded in the audit log, so the demo was not changed.", 500);
  }

  const written = await writeDemoSwitch(serviceSupabase, parsed.value.closed, access.actor.id);

  if (!written.ok) {
    return databaseErrorResponse({ code: written.code }, "demo switch");
  }

  return jsonNoStore({ demo: written.value });
}

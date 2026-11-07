// The "Close the demo" switch: whether an administrator has closed the shared
// practice demo for the event, so a forgotten /judge/demo page or ?sample=demo
// address can never confuse event day.
//
// One row in scoring_training_switch
// (supabase/migrations/20261107120000_scoring_training_sessions.sql), service
// role only, changed from the "Follows the demo" block on /admin/scoring
// through POST /api/admin/scoring/demo-switch, which writes the audit row.
// Closed:
//   - resolveSampleAccess (sample-mode.ts) refuses practice requests with 409
//     DEMO_CLOSED_MESSAGE;
//   - /judge/demo and /commentary/demo show "Demo closed for the event";
//   - ?sample=demo on the vMix feeds and /api/live/state answers with the
//     frozen ?sample=1 rows (still sample = "Yes"), never anything live.
// It governs the live site's shared demo only: a SCORING_SAMPLE_MODE=1
// laptop's own session is never closed.
//
// Each server instance keeps the answer for one second, like the rehearsal
// switch (rehearsal.ts), so the feeds cost about one read a second. Anything
// unexpected — the migration not applied yet, a network error — reads as
// OPEN, so the demo keeps working before the migration is applied.
import "server-only";

import type { ServiceRoleClient } from "@/lib/admin/server";
import { openTrainingDatabase } from "@/lib/scoring/training-db";

export const TRAINING_SWITCH_TABLE = "scoring_training_switch";

export const DEMO_CLOSED_MESSAGE = "The demo is closed for the event. Open the live panel.";

export type DemoSwitch = {
  demo_closed: boolean;
  changed_at: string | null;
  changed_by: string | null;
};

const SWITCH_CACHE_MS = 1_000;

const globalSwitch = globalThis as typeof globalThis & {
  __nezaBaziDemoClosed?: { value: boolean; readAt: number; pending: Promise<boolean> | null };
};

/* The row with when and by whom it last changed. Null when the table is
   missing or the read fails (read as open). */
export const readDemoSwitch = async (client: ServiceRoleClient): Promise<DemoSwitch | null> => {
  try {
    const { data, error } = await client
      .from(TRAINING_SWITCH_TABLE)
      .select("demo_closed, changed_at, changed_by")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      if (error.code !== "PGRST205" && error.code !== "42P01") {
        console.error("[scoring] reading the demo switch failed", { code: error.code ?? null });
      }

      return null;
    }

    return data ? (data as DemoSwitch) : null;
  } catch (caught) {
    console.error("[scoring] reading the demo switch failed", caught);
    return null;
  }
};

/* Is the shared demo closed? At most one database read a second per server
   instance; requests in the same second share it. Errors read as open. */
export const isDemoClosed = async (now: number = Date.now()): Promise<boolean> => {
  const cached = (globalSwitch.__nezaBaziDemoClosed ??= { value: false, readAt: 0, pending: null });

  if (now - cached.readAt < SWITCH_CACHE_MS) {
    return cached.value;
  }

  cached.pending ??= (async () => {
    let value = false;

    try {
      value = (await readDemoSwitch(openTrainingDatabase()))?.demo_closed === true;
    } catch (caught) {
      console.error("[scoring] reading the demo switch failed", caught);
    }

    cached.value = value;
    cached.readAt = Date.now();
    cached.pending = null;
    return value;
  })();

  return cached.pending;
};

/* After an administrator changes it, this instance sees the change at once. */
export const forgetDemoSwitch = () => {
  globalSwitch.__nezaBaziDemoClosed = undefined;
};

/* Closes or opens the demo (the route has verified the administrator and
   written the audit row). Returns the row, or the database error code. */
export const writeDemoSwitch = async (
  client: ServiceRoleClient,
  closed: boolean,
  changedBy: string
): Promise<{ ok: true; value: DemoSwitch } | { ok: false; code: string | null }> => {
  const { data, error } = await client
    .from(TRAINING_SWITCH_TABLE)
    .upsert(
      { id: true, demo_closed: closed, changed_at: new Date().toISOString(), changed_by: changedBy },
      { onConflict: "id" }
    )
    .select("demo_closed, changed_at, changed_by")
    .single();

  if (error || !data) {
    return { ok: false, code: error?.code ?? null };
  }

  forgetDemoSwitch();
  return { ok: true, value: data as DemoSwitch };
};

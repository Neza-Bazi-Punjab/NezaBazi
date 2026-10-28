// The "Graphics rehearsal feed" switch: whether ?sample=solo on the vMix feeds
// plays the moving sample (vmix-sample-live.ts) or answers like the frozen
// ?sample=1. One row in scoring_rehearsal, switched from /admin/scoring
// through scoring_set_rehearsal_sample()
// (supabase/migrations/20261028120000_scoring_rehearsal_feed.sql).
//
// The feeds read it as the anonymous role, which sees only the switch and
// when it changed. Each server instance keeps the answer for one second, so
// however many feeds and options the graphics team polls, the database is
// read about once a second; a change shows on the feeds within a second or
// two. Anything unexpected — the migration not applied yet, a network error —
// reads as off.
import "server-only";

import type { ServiceRoleClient } from "@/lib/admin/server";
import type { RehearsalSwitch } from "@/lib/scoring/admin-types";
import { createPublicScoringClient, isScoringNotConfiguredError } from "@/lib/scoring/server";

const SWITCH_CACHE_MS = 1_000;

const globalSwitch = globalThis as typeof globalThis & {
  __nezaBaziSoloSample?: { value: boolean; readAt: number; pending: Promise<boolean> | null };
};

const readSoloSampleFromDatabase = async (): Promise<boolean> => {
  try {
    const { data, error } = await createPublicScoringClient()
      .from("scoring_rehearsal")
      .select("solo_sample_enabled")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      if (!isScoringNotConfiguredError(error)) {
        console.error("[scoring] reading the rehearsal switch failed", error);
      }

      return false;
    }

    return data?.solo_sample_enabled === true;
  } catch (error) {
    console.error("[scoring] reading the rehearsal switch failed", error);
    return false;
  }
};

/* Is the moving solo sample switched on? At most one database read a second
   per server instance; requests in the same second share it. */
export const isSoloSampleOn = async (now: number = Date.now()): Promise<boolean> => {
  const cached = (globalSwitch.__nezaBaziSoloSample ??= { value: false, readAt: 0, pending: null });

  if (now - cached.readAt < SWITCH_CACHE_MS) {
    return cached.value;
  }

  cached.pending ??= readSoloSampleFromDatabase().then((value) => {
    cached.value = value;
    cached.readAt = Date.now();
    cached.pending = null;
    return value;
  });

  return cached.pending;
};

/* The switch with who changed it, for the admin card (service role). Null
   until the migration has been applied. */
export const readRehearsalSwitch = async (
  client: ServiceRoleClient
): Promise<RehearsalSwitch | null> => {
  const { data, error } = await client
    .from("scoring_rehearsal")
    .select("solo_sample_enabled, updated_at, updated_by_name")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if (!isScoringNotConfiguredError(error)) {
      console.error("[scoring] reading the rehearsal switch failed", error);
    }

    return null;
  }

  return data ? (data as RehearsalSwitch) : null;
};

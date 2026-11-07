// The shared practice session's row in scoring_training_sessions: load, save
// with a version check, delete.
//
// The practice engine's state is plain data (SampleSeed), so the organisers'
// one demo lives in a single jsonb row and every request rebuilds the engine
// from it (sample-session.ts). That way every device, and every server
// instance, sees the same demo, and nothing is lost when an instance changes.
//
// Service role only, from server code only: the table has row level security
// on and no policies, and every browser role is revoked
// (supabase/migrations/20261107120000_scoring_training_sessions.sql). It holds
// the invented sample riders only, never a registration or a real result, so
// the public demo addresses (?sample=demo) may read it.
//
// Saves are optimistic: each one says which version it loaded, and only
// succeeds when the row is still at that version (or, for a first save, when
// no row exists yet). A lost race returns false; sample-session.ts reloads,
// re-applies the action once, then refuses with a 409.
import "server-only";

import { createServiceRoleClient, type ServiceRoleClient } from "@/lib/admin/server";
import type { SampleSeed } from "@/lib/scoring/sample-engine";

/* The one session on the live site: the organisers' demo, for everyone. */
export const SHARED_TRAINING_SESSION = "shared";

export const TRAINING_TABLE = "scoring_training_sessions";

export type TrainingDatabase = ServiceRoleClient;

export type StoredTraining = { state: SampleSeed; version: number };

/* The table does not exist yet (the migration has not been applied):
   PostgREST's PGRST205, or Postgres's own 42P01. The caller falls back to the
   in-memory store. */
export class TrainingNotConfigured extends Error {
  constructor() {
    super("The shared practice session table is not set up yet.");
    this.name = "TrainingNotConfigured";
  }
}

type DbError = { code?: string | null; message?: string | null } | null | undefined;

const NOT_CONFIGURED_CODES = new Set(["PGRST205", "42P01"]);

const isNotConfigured = (error: DbError) =>
  typeof error?.code === "string" && NOT_CONFIGURED_CODES.has(error.code);

/* Another request inserted the first row a moment before this one. */
const UNIQUE_VIOLATION = "23505";

const fail = (action: string, error: DbError): never => {
  if (isNotConfigured(error)) {
    throw new TrainingNotConfigured();
  }

  throw new Error(`Unable to ${action} the practice session: ${error?.message ?? "unknown error"}`);
};

/* The client every call below takes: the service role, created per use like
   the scoring routes do. Kept here so sample-session.ts never names a
   database client itself. */
export const openTrainingDatabase = (): TrainingDatabase => createServiceRoleClient();

/* A stored state the engine can rebuild from: rounds, runs and live state at
   least. Anything else (a hand edit gone wrong) is refused rather than fed to
   the engine; "Reset training data" deletes the row and fixes it. */
const isSeed = (value: unknown): value is SampleSeed => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const seed = value as Record<string, unknown>;
  return (
    Array.isArray(seed.rounds) &&
    Array.isArray(seed.runs) &&
    !!seed.live &&
    typeof seed.live === "object" &&
    (seed.overrides === undefined || Array.isArray(seed.overrides))
  );
};

/* The session's state and version. null = no row yet (start from the sample
   seed). Throws TrainingNotConfigured when the table is missing. */
export const loadTrainingState = async (
  client: TrainingDatabase,
  key: string
): Promise<StoredTraining | null> => {
  const { data, error } = await client
    .from(TRAINING_TABLE)
    .select("state, version")
    .eq("id", key)
    .maybeSingle();

  if (error) {
    return fail("read", error);
  }

  if (!data) {
    return null;
  }

  const row = data as { state: unknown; version: number | string };
  const version = Number(row.version);

  if (!isSeed(row.state) || !Number.isSafeInteger(version)) {
    throw new Error("The practice session row is unreadable. Reset training data to start it again.");
  }

  return { state: row.state, version };
};

/* Insert when expectedVersion is null (no row was loaded), else update where
   version = expectedVersion, bumping it. Returns false on a lost race: the
   row changed (or appeared, or was reset) since it was loaded. */
export const saveTrainingState = async (
  client: TrainingDatabase,
  key: string,
  state: SampleSeed,
  expectedVersion: number | null,
  updatedBy: string | null
): Promise<boolean> => {
  const updatedAt = new Date().toISOString();

  if (expectedVersion === null) {
    const { error } = await client
      .from(TRAINING_TABLE)
      .insert({ id: key, state, version: 1, updated_at: updatedAt, updated_by: updatedBy });

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return false;
      }

      return fail("save", error);
    }

    return true;
  }

  const { data, error } = await client
    .from(TRAINING_TABLE)
    .update({ state, version: expectedVersion + 1, updated_at: updatedAt, updated_by: updatedBy })
    .eq("id", key)
    .eq("version", expectedVersion)
    .select("version");

  if (error) {
    return fail("save", error);
  }

  return Array.isArray(data) && data.length === 1;
};

/* "Reset training data": delete the row, so the next load seeds afresh. */
export const deleteTrainingState = async (client: TrainingDatabase, key: string): Promise<void> => {
  const { error } = await client.from(TRAINING_TABLE).delete().eq("id", key);

  if (error) {
    fail("reset", error);
  }
};

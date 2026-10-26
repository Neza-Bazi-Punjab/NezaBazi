export type VerifiedAuditActor = {
  id: string;
  name: string | null;
  email: string | null;
};

export type AuditEntryInput = {
  action: string;
  target_table: string;
  target_id: string;
  details: unknown;
  batch_id?: string | null;
};

export const buildAuditRecord = (
  actor: VerifiedAuditActor,
  entry: AuditEntryInput
) => ({
  ...entry,
  actor_id: actor.id,
  actor_name: actor.name,
  actor_email: actor.email,
});

export const requireAuditSuccess = (error: unknown) => {
  if (error) {
    throw new Error("Unable to record the admin action.");
  }
};

export const AUDIT_DELETE_MAX_IDS = 500;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditDeleteRequest =
  | { ok: true; all: true }
  | { ok: true; all: false; ids: string[] }
  | { ok: false; error: string };

/* The body is either `{ all: true }` (clear the whole log) or `{ ids: [...] }`
   (delete specific entries). Anything else is rejected, so a malformed request
   can never fall through to a wider delete than the admin asked for. */
export const parseAuditDeleteRequest = (body: unknown): AuditDeleteRequest => {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid request." };
  }

  const { all, ids } = body as { all?: unknown; ids?: unknown };

  if (all === true && ids === undefined) {
    return { ok: true, all: true };
  }

  if (all !== undefined || !Array.isArray(ids)) {
    return { ok: false, error: "Invalid request." };
  }

  if (ids.length === 0 || ids.length > AUDIT_DELETE_MAX_IDS) {
    return {
      ok: false,
      error: `Choose between 1 and ${AUDIT_DELETE_MAX_IDS} audit entries.`,
    };
  }

  if (!ids.every((id) => typeof id === "string" && uuidPattern.test(id))) {
    return { ok: false, error: "Invalid audit entry id." };
  }

  return { ok: true, all: false, ids: Array.from(new Set(ids as string[])) };
};

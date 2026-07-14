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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAuditRecord, requireAuditSuccess } from "./audit.ts";

test("the verified actor overrides forged audit identity fields", () => {
  const record = buildAuditRecord(
    {
      id: "verified-admin",
      name: "Verified Admin",
      email: "verified@example.com",
    },
    {
      actor_id: "forged-admin",
      actor_name: "Forged Admin",
      actor_email: "forged@example.com",
      action: "edit_team",
      target_table: "teams",
      target_id: "team-1",
      details: {},
    } as never
  );

  assert.equal(record.actor_id, "verified-admin");
  assert.equal(record.actor_name, "Verified Admin");
  assert.equal(record.actor_email, "verified@example.com");
});

test("an audit database error stops the requested operation", () => {
  assert.throws(
    () => requireAuditSuccess({ message: "insert denied" }),
    /Unable to record the admin action/
  );
});

test("the audit migration preserves history and removes browser writes", async () => {
  const migration = await readFile(
    new URL("../../../supabase/migrations/20260714005451_harden_admin_audit_log.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /on delete set null/i);
  assert.match(
    migration,
    /revoke\s+insert\s*,\s*update\s*,\s*delete[\s\S]*from\s+anon\s*,\s*authenticated/i
  );
  assert.match(migration, /grant\s+select[\s\S]*to\s+authenticated/i);
  assert.match(migration, /revoke\s+execute[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  assert.match(migration, /grant\s+execute[\s\S]*to\s+service_role/i);
});

test("admins cannot bypass auditing with direct registration table writes", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260714005818_lock_admin_registration_write_paths.sql",
      import.meta.url
    ),
    "utf8"
  );

  for (const table of ["solo registrations", "teams", "team members"]) {
    assert.match(migration, new RegExp(`drop policy.*Admins can update all ${table}`, "is"));
    assert.match(migration, new RegExp(`drop policy.*Admins can delete all ${table}`, "is"));
  }
});

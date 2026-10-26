// Deleting audit log entries from the admin dashboard.
//
// Administrators have no direct write access to admin_audit_log, so deletes go
// through the service role. A delete never destroys an entry: the database
// function moves it to admin_audit_log_archive, stamped with who removed it,
// in the same transaction. There is no way back out of the archive.
import { NextResponse } from "next/server";
import { parseAuditDeleteRequest } from "@/lib/admin/audit";
import { createServiceRoleClient, verifyAdminRequest } from "@/lib/admin/server";

export async function DELETE(request: Request) {
  const admin = await verifyAdminRequest();

  if (!admin.ok) {
    return admin.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseAuditDeleteRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("admin_archive_audit_entries", {
    p_ids: parsed.all ? null : parsed.ids,
    p_all: parsed.all,
    p_actor_id: admin.actor.id,
    p_actor_name: admin.actor.name,
    p_actor_email: admin.actor.email,
  });

  if (error) {
    console.error("Unable to archive audit entries", error);
    return NextResponse.json(
      { error: "Unable to delete the audit entries." },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: typeof data === "number" ? data : 0 });
}

// Deleting audit log entries from the admin dashboard.
//
// Administrators have no direct write access to admin_audit_log, so deletes go
// through the service role. Every delete leaves one new entry behind saying who
// removed how many, so the log cannot be emptied without a trace.
import { NextResponse } from "next/server";
import { parseAuditDeleteRequest } from "@/lib/admin/audit";
import {
  createServiceRoleClient,
  insertRequiredAuditLog,
  verifyAdminRequest,
} from "@/lib/admin/server";

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
  const query = serviceSupabase
    .from("admin_audit_log")
    .delete({ count: "exact" });
  const { error, count } = await (parsed.all
    ? query.not("id", "is", null)
    : query.in("id", parsed.ids));

  if (error) {
    return NextResponse.json(
      { error: "Unable to delete the audit entries." },
      { status: 500 }
    );
  }

  const deleted = count ?? 0;

  try {
    await insertRequiredAuditLog(serviceSupabase, admin.actor, {
      action: "delete_audit_entries",
      target_table: "admin_audit_log",
      target_id: "bulk",
      details: { deleted_count: deleted, scope: parsed.all ? "all" : "selected" },
    });
  } catch (auditError) {
    console.error("Unable to record audit log deletion", auditError);
    return NextResponse.json(
      {
        error:
          "The entries were deleted, but the deletion could not be recorded in the log.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted });
}

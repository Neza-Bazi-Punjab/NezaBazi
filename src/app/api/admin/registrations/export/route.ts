// GET /api/admin/registrations/export?list=solo|teams â€” "Export to Excel"
// under Solo Riders and under Teams. Administrators only.
//
// Every rider in the list as an .xlsx workbook, for the organisers: it
// carries contact details (phone, email, address, age, parents, emergency
// contact), so it is never cached and every download is written to the audit
// log first; if that record cannot be written the export is not made. It
// carries no confirmation code and no internal ids: the columns are the fixed
// lists in src/lib/admin/rider-export.ts and the selects name only what those
// rows need.
//
// Dal Panth: the select names dal_panth; before its migration is applied the
// database answers 42703 and the list is read once more without it (the
// column is exported blank).
import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  insertRequiredAuditLog,
  verifyAdminRequest,
} from "@/lib/admin/server";
import {
  SOLO_EXPORT_COLUMNS,
  TEAM_EXPORT_COLUMNS,
  buildSoloExportRows,
  buildTeamExportRows,
  parseRiderExportList,
  readWithDalPanthFallback,
  riderExportFilename,
  riderExportSheetName,
  soloExportSelect,
  teamExportSelect,
  todayInIndia,
  type SoloExportSource,
  type TeamMemberExportSource,
} from "@/lib/admin/rider-export";
import { fetchAllRows } from "@/lib/scoring/server";
import { XLSX_CONTENT_TYPE, buildXlsx, type XlsxCell } from "@/lib/xlsx/write-xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = "private, no-store";

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": NO_STORE } });

export async function GET(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    adminCheck.response.headers.set("Cache-Control", NO_STORE);
    return adminCheck.response;
  }

  const list = parseRiderExportList(new URL(request.url).searchParams.get("list"));

  if (!list) {
    return jsonError("Choose which list to export: list=solo or list=teams.", 400);
  }

  const serviceSupabase = createServiceRoleClient();

  // Paged in a fixed order (created_at, then id) so no row is read twice or
  // missed between pages; the file is sorted afterwards.
  let rows: XlsxCell[][];

  if (list === "solo") {
    const result = await readWithDalPanthFallback<SoloExportSource>(
      (select) =>
        fetchAllRows<SoloExportSource>((from, to) =>
          serviceSupabase
            .from("solo_registrations")
            .select(select)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
            .overrideTypes<SoloExportSource[], { merge: false }>()
        ),
      soloExportSelect
    );

    if (result.error) {
      console.error("[admin] rider export (solo) read failed", result.error);
      return jsonError("The rider list could not be read. Try again.", 500);
    }

    rows = buildSoloExportRows(result.rows);
  } else {
    const result = await readWithDalPanthFallback<TeamMemberExportSource>(
      (select) =>
        fetchAllRows<TeamMemberExportSource>((from, to) =>
          serviceSupabase
            .from("team_members")
            .select(select)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(from, to)
            .overrideTypes<TeamMemberExportSource[], { merge: false }>()
        ),
      teamExportSelect
    );

    if (result.error) {
      console.error("[admin] rider export (teams) read failed", result.error);
      return jsonError("The rider list could not be read. Try again.", 500);
    }

    rows = buildTeamExportRows(result.rows);
  }

  let bytes: Uint8Array<ArrayBuffer>;

  try {
    bytes = buildXlsx({
      sheetName: riderExportSheetName(list),
      columns: [...(list === "solo" ? SOLO_EXPORT_COLUMNS : TEAM_EXPORT_COLUMNS)],
      rows,
    });
  } catch (caught) {
    console.error("[admin] rider export could not be written", caught);
    return jsonError("The export could not be made. Try again.", 500);
  }

  // The audit record comes before the bytes leave: no record, no file.
  try {
    await insertRequiredAuditLog(serviceSupabase, adminCheck.actor, {
      action: "export_riders",
      target_table: list === "solo" ? "solo_registrations" : "team_members",
      target_id: list,
      details: { list, rows: rows.length, format: "xlsx", includes_contact_details: true },
    });
  } catch (caught) {
    console.error("[admin] rider export audit failed", caught);
    return jsonError("The export could not be recorded, so it was not made. Try again.", 500);
  }

  const filename = riderExportFilename(list, todayInIndia());

  return new NextResponse(new Blob([bytes], { type: XLSX_CONTENT_TYPE }), {
    status: 200,
    headers: {
      "Cache-Control": NO_STORE,
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

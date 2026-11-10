import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  RIDER_EXPORT_API,
  RIDER_EXPORT_CONTENT_TYPE,
  SOLO_EXPORT_COLUMNS,
  TEAM_EXPORT_COLUMNS,
  UNDEFINED_COLUMN,
  buildSoloExportRows,
  buildTeamExportRows,
  filenameFromContentDisposition,
  formatIndiaDateTime,
  parseRiderExportList,
  readWithDalPanthFallback,
  riderExportFilename,
  soloExportSelect,
  teamExportSelect,
  todayInIndia,
  type SoloExportSource,
  type TeamMemberExportSource,
} from "../../lib/admin/rider-export.ts";
import { XLSX_CONTENT_TYPE } from "../../lib/xlsx/write-xlsx.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const routeSource = read("../api/admin/registrations/export/route.ts");
const buttonSource = read("./ExportRidersButton.tsx");
const exportSource = read("../../lib/admin/rider-export.ts");

/* Comments stripped, so a pin on code is not satisfied by a comment. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const headers = (columns: readonly { header: string }[]) => columns.map((column) => column.header);

const RIDER_DETAILS = [
  "Father's name",
  "Mother's name",
  "Age",
  "Dal Panth",
  "Horse",
  "Horse breed",
  "Horse age",
  "District and state",
  "Full address",
  "Phone",
  "Email",
  "Experience (years)",
];

test("solo columns, in order", () => {
  assert.deepEqual(headers(SOLO_EXPORT_COLUMNS), [
    "No.",
    "Rider",
    ...RIDER_DETAILS,
    "Emergency contact",
    "Emergency phone",
    "Registered",
    "Registered on",
    "Checked in",
    "Checked in at",
  ]);
});

test("team columns, in order", () => {
  assert.deepEqual(headers(TEAM_EXPORT_COLUMNS), [
    "No.",
    "Team",
    "Team leader",
    "Rider",
    ...RIDER_DETAILS,
    "Team emergency contact",
    "Team emergency phone",
    "Registered",
    "Registered on",
    "Checked in",
    "Checked in at",
  ]);
});

test("only counts are number columns; phones are always text", () => {
  for (const columns of [SOLO_EXPORT_COLUMNS, TEAM_EXPORT_COLUMNS]) {
    assert.deepEqual(
      columns.filter((column) => column.kind === "number").map((column) => column.header),
      ["No.", "Age", "Horse age", "Experience (years)"]
    );
  }
});

const CODE = "NBP-7Q4K2M";
const ID = "3f2b9c1e-5a6d-4e8f-9b0a-1c2d3e4f5a6b";

/* What a row from the database might hold, extra columns included: none of
   the extras may reach the file. */
const soloRow = (overrides: Partial<SoloExportSource> = {}) =>
  ({
    id: ID,
    profile_id: ID,
    confirmation_code: CODE,
    checked_in_by: ID,
    entered_by: ID,
    headshot_path: `paper/${ID}.jpg`,
    full_name: "Harpreet Singh",
    father_name: "Gurdev Singh",
    mother_name: "Jaswinder Kaur",
    age: 27,
    dal_panth: "Example Dal",
    horse_name: "Toofan",
    horse_breed: "Marwari",
    horse_age: 7,
    location: "Village Khera, Ludhiana, Punjab, India",
    phone: "09876543210",
    email: "harpreet@example.com",
    years_experience: 6,
    emergency_contact_name: "Gurdev Singh",
    emergency_contact_phone: "+91 98765 43211",
    registration_source: "online",
    created_at: "2026-11-10T14:05:00Z",
    checked_in_at: null,
    ...overrides,
  }) as SoloExportSource;

test("a solo row, cell by cell", () => {
  const [row] = buildSoloExportRows([
    soloRow({ checked_in_at: "2026-11-11T03:30:00.000Z", registration_source: "paper" }),
  ]);

  assert.deepEqual(row, [
    1,
    "Harpreet Singh",
    "Gurdev Singh",
    "Jaswinder Kaur",
    27,
    "Example Dal",
    "Toofan",
    "Marwari",
    7,
    "Ludhiana, Punjab",
    "Village Khera, Ludhiana, Punjab, India",
    "09876543210",
    "harpreet@example.com",
    6,
    "Gurdev Singh",
    "+91 98765 43211",
    "Paper",
    "10 Nov 2026 19:35",
    "Yes",
    "11 Nov 2026 09:00",
  ]);
  assert.equal(row.length, SOLO_EXPORT_COLUMNS.length);
});

test("blanks: no Dal Panth, no numbers, no location, not checked in", () => {
  const [row] = buildSoloExportRows([
    soloRow({
      dal_panth: undefined,
      age: null,
      horse_age: null,
      years_experience: null,
      location: null,
      phone: null,
      registration_source: null,
    }),
  ]);

  assert.equal(row[5], "");
  assert.equal(row[4], null);
  assert.equal(row[8], null);
  assert.equal(row[13], null);
  assert.equal(row[9], "");
  assert.equal(row[10], "");
  assert.equal(row[11], "");
  assert.equal(row[16], "Online");
  assert.equal(row[18], "No");
  assert.equal(row[19], "");
});

test("a paper entry's placeholder email is written blank", () => {
  const rows = buildSoloExportRows([
    soloRow({ email: "paper-7q4k2m@paper.nezabazipunjab.com" }),
    soloRow({ full_name: "Zorawar Singh", email: "x@sub.paper.nezabazipunjab.com" }),
  ]);

  assert.equal(rows[0][12], "");
  assert.equal(rows[1][12], "");
});

test("solo rows keep the list's order: newest registration first, and numbered", () => {
  const rows = buildSoloExportRows([
    soloRow({ full_name: "Zorawar Singh", created_at: "2026-11-01T00:00:00Z" }),
    soloRow({ full_name: "Amandeep Kaur", created_at: "2026-11-05T00:00:00Z" }),
    soloRow({ full_name: "Baljit Singh", created_at: "2026-11-02T00:00:00Z" }),
  ]);

  assert.deepEqual(
    rows.map((row) => [row[0], row[1]]),
    [
      [1, "Amandeep Kaur"],
      [2, "Baljit Singh"],
      [3, "Zorawar Singh"],
    ]
  );
});

const member = (
  name: string,
  team: string,
  leader: boolean,
  overrides: Partial<TeamMemberExportSource> = {}
) =>
  ({
    ...soloRow({ full_name: name }),
    is_leader: leader,
    team_id: ID,
    teams: {
      team_name: team,
      emergency_contact_name: `${team} contact`,
      emergency_contact_phone: "01234567890",
      registration_source: "desk",
      created_at: "2026-11-09T10:00:00Z",
    },
    ...overrides,
  }) as TeamMemberExportSource;

test("team rows keep the list's order: newest team first, riders as entered", () => {
  const older = { team_name: "Khalsa Riders", registration_source: "paper", created_at: "2026-11-08T10:00:00Z" };
  const rows = buildTeamExportRows([
    member("Baljit Singh", "Khalsa Riders", false, { teams: [older], created_at: "2026-11-08T10:00:02Z" }),
    member("Zorawar Singh", "Sher-e-Punjab", false, { created_at: "2026-11-09T10:00:01Z" }),
    member("Kuldeep Singh", "Khalsa Riders", true, { teams: [older], created_at: "2026-11-08T10:00:01Z" }),
    member("Amar Singh", "Sher-e-Punjab", true, { created_at: "2026-11-09T10:00:02Z" }),
  ]);

  assert.deepEqual(
    rows.map((row) => [row[0], row[1], row[2], row[3]]),
    [
      [1, "Sher-e-Punjab", "No", "Zorawar Singh"],
      [2, "Sher-e-Punjab", "Yes", "Amar Singh"],
      [3, "Khalsa Riders", "Yes", "Kuldeep Singh"],
      [4, "Khalsa Riders", "No", "Baljit Singh"],
    ]
  );
  // The array form of the embedded team is read too.
  assert.equal(rows[2][18], "Paper");
  assert.equal(rows[0][18], "Desk");
});

test("a team row, cell by cell", () => {
  const [row] = buildTeamExportRows([member("Mandeep Singh", "Sher-e-Punjab", true)]);

  assert.deepEqual(row, [
    1,
    "Sher-e-Punjab",
    "Yes",
    "Mandeep Singh",
    "Gurdev Singh",
    "Jaswinder Kaur",
    27,
    "Example Dal",
    "Toofan",
    "Marwari",
    7,
    "Ludhiana, Punjab",
    "Village Khera, Ludhiana, Punjab, India",
    "09876543210",
    "harpreet@example.com",
    6,
    "Sher-e-Punjab contact",
    "01234567890",
    "Desk",
    "10 Nov 2026 19:35",
    "No",
    "",
  ]);
  assert.equal(row.length, TEAM_EXPORT_COLUMNS.length);
});

test("two teams with the same name never interleave", () => {
  const early = { team_name: "Riders", created_at: "2026-11-01T00:00:00Z" };
  const late = { team_name: "Riders", created_at: "2026-11-02T00:00:00Z" };
  const rows = buildTeamExportRows([
    member("B late", "x", false, { teams: late }),
    member("A early", "x", false, { teams: early }),
    member("C late leader", "x", true, { teams: late }),
    member("D early leader", "x", true, { teams: early }),
  ]);

  assert.deepEqual(rows.map((row) => row[3]), ["B late", "C late leader", "A early", "D early leader"]);
});

test("no confirmation code, id or staff field ever reaches a row", () => {
  const rows = [
    ...buildSoloExportRows([soloRow(), soloRow({ full_name: "Second" })]),
    ...buildTeamExportRows([member("Mandeep Singh", "Sher-e-Punjab", true)]),
  ];
  const everything = JSON.stringify(rows);

  assert.doesNotMatch(everything, /NBP-/);
  assert.ok(!everything.includes(ID));
  assert.doesNotMatch(everything, /paper\//);

  for (const columns of [SOLO_EXPORT_COLUMNS, TEAM_EXPORT_COLUMNS]) {
    assert.doesNotMatch(JSON.stringify(headers(columns)), /code|\bid\b|profile|headshot|entered|checked_in_by/i);
  }
});

test("times are India time, written as text", () => {
  assert.equal(formatIndiaDateTime("2026-11-10T14:05:00Z"), "10 Nov 2026 19:35");
  assert.equal(formatIndiaDateTime("2026-11-10T18:30:00Z"), "11 Nov 2026 00:00");
  assert.equal(formatIndiaDateTime("2026-09-05T00:00:00+00:00"), "5 Sep 2026 05:30");
  assert.equal(formatIndiaDateTime(null), "");
  assert.equal(formatIndiaDateTime("not a date"), "");
  assert.equal(todayInIndia(new Date("2026-11-10T19:00:00Z")), "2026-11-11");
});

test("the list parameter, the file name and the download name", () => {
  assert.equal(parseRiderExportList("solo"), "solo");
  assert.equal(parseRiderExportList("teams"), "teams");
  for (const value of [null, undefined, "", "Solo", "team", "all", "solo "]) {
    assert.equal(parseRiderExportList(value), null);
  }

  assert.equal(riderExportFilename("solo", "2026-11-10"), "nezabazi-solo-riders-2026-11-10.xlsx");
  assert.equal(riderExportFilename("teams", "2026-11-10"), "nezabazi-team-riders-2026-11-10.xlsx");

  const fallback = "fallback.xlsx";
  assert.equal(
    filenameFromContentDisposition('attachment; filename="nezabazi-solo-riders-2026-11-10.xlsx"', fallback),
    "nezabazi-solo-riders-2026-11-10.xlsx"
  );
  assert.equal(filenameFromContentDisposition(null, fallback), fallback);
  assert.equal(filenameFromContentDisposition('attachment; filename="../../evil.xlsx"', fallback), fallback);
  assert.equal(filenameFromContentDisposition('attachment; filename="list.exe"', fallback), fallback);

  assert.equal(RIDER_EXPORT_CONTENT_TYPE, XLSX_CONTENT_TYPE);
});

test("selects name columns, include dal_panth, and nothing private", () => {
  for (const select of [soloExportSelect(true), soloExportSelect(false), teamExportSelect(true), teamExportSelect(false)]) {
    assert.doesNotMatch(select, /\*/);
    assert.doesNotMatch(select, /confirmation_code|profile_id|checked_in_by|entered_by|headshot_path|(^|[\s,(])id\b|team_id/);
  }

  assert.match(soloExportSelect(true), /, dal_panth$/);
  assert.doesNotMatch(soloExportSelect(false), /dal_panth/);
  assert.match(teamExportSelect(true), /, dal_panth, teams\(/);
  assert.doesNotMatch(teamExportSelect(false), /dal_panth/);
  // Without it, the select is otherwise identical.
  assert.equal(soloExportSelect(true).replace(", dal_panth", ""), soloExportSelect(false));
  assert.equal(teamExportSelect(true).replace(", dal_panth", ""), teamExportSelect(false));
});

test("the 42703 fallback reads once more without dal_panth, and only for 42703", async () => {
  const calls: string[] = [];
  const reader = (errors: Array<{ code: string } | null>) => async (select: string) => {
    calls.push(select);
    const error = errors.shift() ?? null;
    return { rows: error ? [] : [{ select }], error };
  };

  calls.length = 0;
  const missing = await readWithDalPanthFallback(reader([{ code: UNDEFINED_COLUMN }, null]), soloExportSelect);
  assert.deepEqual(calls, [soloExportSelect(true), soloExportSelect(false)]);
  assert.equal(missing.error, null);
  assert.equal(missing.dalPanthAvailable, false);
  assert.equal(missing.rows.length, 1);

  calls.length = 0;
  const present = await readWithDalPanthFallback(reader([null]), soloExportSelect);
  assert.deepEqual(calls, [soloExportSelect(true)]);
  assert.equal(present.dalPanthAvailable, true);

  calls.length = 0;
  const otherError = await readWithDalPanthFallback(reader([{ code: "57014" }]), teamExportSelect);
  assert.deepEqual(calls, [teamExportSelect(true)]);
  assert.deepEqual(otherError.error, { code: "57014" });

  // Never more than one retry, even if the second read says 42703 too.
  calls.length = 0;
  const twice = await readWithDalPanthFallback(
    reader([{ code: UNDEFINED_COLUMN }, { code: UNDEFINED_COLUMN }]),
    teamExportSelect
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(twice.error, { code: UNDEFINED_COLUMN });
});

test("export route: admin check before any read, then named columns, audit, bytes", () => {
  const route = code(routeSource);

  assert.match(route, /export const dynamic = "force-dynamic";/);
  assert.match(route, /export const runtime = "nodejs";/);

  const adminCheck = route.indexOf("await verifyAdminRequest()");
  const firstRead = route.indexOf("createServiceRoleClient()");
  const audit = route.indexOf("insertRequiredAuditLog(");
  const bytes = route.indexOf("new NextResponse(");

  assert.ok(adminCheck > 0, "admin check");
  assert.ok(adminCheck < firstRead, "admin check before the service-role client");
  assert.ok(firstRead < audit && audit < bytes, "audit row before the file is returned");

  assert.doesNotMatch(route, /select\(\s*["'`]\*/);
  assert.doesNotMatch(route, /confirmation_code|profile_id|checked_in_by|entered_by|headshot_path/);
  assert.match(route, /\.select\(select\)/);
  assert.match(route, /readWithDalPanthFallback<SoloExportSource>\([\s\S]*?soloExportSelect\s*\)/);
  assert.match(route, /readWithDalPanthFallback<TeamMemberExportSource>\([\s\S]*?teamExportSelect\s*\)/);
  assert.match(route, /fetchAllRows</);
  assert.match(route, /"The rider list could not be read\. Try again\."/);
});

test("export route: the audit row and its refusal", () => {
  const route = code(routeSource);

  assert.match(route, /action: "export_riders"/);
  assert.match(route, /target_table: list === "solo" \? "solo_registrations" : "team_members"/);
  assert.match(route, /target_id: list/);
  assert.match(route, /details: \{ list, rows: rows\.length, format: "xlsx", includes_contact_details: true \}/);
  assert.match(
    route,
    /catch \(caught\) \{[\s\S]*?return jsonError\("The export could not be recorded, so it was not made\. Try again\.", 500\);/
  );
});

test("export route: headers and status codes", () => {
  const route = code(routeSource);

  assert.match(route, /const NO_STORE = "private, no-store";/);
  assert.match(route, /NextResponse\.json\(\{ error \}, \{ status, headers: \{ "Cache-Control": NO_STORE \} \}\)/);
  assert.match(route, /adminCheck\.response\.headers\.set\("Cache-Control", NO_STORE\)/);
  assert.match(route, /"Cache-Control": NO_STORE,\s*"Content-Type": XLSX_CONTENT_TYPE,/);
  assert.match(route, /"Content-Disposition": `attachment; filename="\$\{filename\}"`/);
  assert.match(route, /riderExportFilename\(list, todayInIndia\(\)\)/);
  assert.match(route, /jsonError\("Choose which list to export: list=solo or list=teams\.", 400\)/);
  // The only success response is the file.
  assert.equal((route.match(/new NextResponse\(/g) ?? []).length, 1);
  assert.doesNotMatch(route, /NextResponse\.json\((?!\{ error \})/);
});

test("export module stays loadable by Node and the browser", () => {
  const imports = [...exportSource.matchAll(/^import (?:type )?.* from "([^"]+)";$/gm)].map((match) => match[1]);

  assert.deepEqual(imports, ["../paper-registration.ts", "../scoring/types.ts", "../xlsx/write-xlsx.ts"]);
  assert.match(exportSource, /^import type \{ XlsxCell, XlsxColumn \} from "\.\.\/xlsx\/write-xlsx\.ts";$/m);
  assert.doesNotMatch(code(exportSource), /server-only|"@\//);
});

test("Export to Excel button: only an OK spreadsheet becomes a download", () => {
  const button = code(buttonSource);

  assert.match(buttonSource, /^"use client";/);
  assert.match(button, /export default function ExportRidersButton\(\{\s*list,\s*className,\s*\}: \{\s*list: "solo" \| "teams";\s*className\?: string;\s*\}\)/);
  assert.match(button, /fetch\(`\$\{RIDER_EXPORT_API\}\?list=\$\{list\}`/);
  assert.equal(RIDER_EXPORT_API, "/api/admin/registrations/export");

  const notOk = button.indexOf("if (!response.ok)");
  const blob = button.indexOf("response.blob()");
  const objectUrl = button.indexOf("URL.createObjectURL(");
  assert.ok(notOk > 0 && notOk < blob && blob < objectUrl, "the error branch returns before any blob");
  assert.match(button.slice(notOk, blob), /return;/);
  assert.match(button, /startsWith\(RIDER_EXPORT_CONTENT_TYPE\)/);
  assert.match(button, /URL\.revokeObjectURL\(url\)/);
  assert.match(button, /filenameFromContentDisposition\(/);

  // Double clicks.
  assert.match(button, /if \(busyRef\.current\) \{\s*return;\s*\}/);
  assert.match(button, /disabled=\{busy\}/);
  assert.match(button, /\{busy \? "Preparing…" : "Export to Excel"\}/);

  // Errors beside the button.
  assert.match(button, /role="alert"/);
  assert.match(button, /body\.error/);
  assert.match(button, /"Could not reach the server\. Check the connection and retry\."/);
  // No note under the button.
  assert.doesNotMatch(buttonSource, /RIDER_EXPORT_NOTE|For organisers only/);

  // The writer (and node:zlib) never reaches the browser bundle.
  assert.doesNotMatch(buttonSource, /write-xlsx|node:zlib/);
});

test("no organisation is named in the export code", () => {
  for (const source of [routeSource, buttonSource, exportSource]) {
    assert.doesNotMatch(source, /Example Dal/);
  }
});

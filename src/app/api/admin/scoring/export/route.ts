// GET /api/admin/scoring/export — the rider list for the graphics team.
//
// Administrators only. Every registered rider, solo entrants and team riders,
// with what a graphics team needs to prepare name straps and start lists:
// name, team, leader flag, horse (name, breed, age), home district and state
// (what the announcer says — not the village address), experience, check-in,
// and the pool and round of the most recent round (by running order) whose
// start list includes them.
//
// This file leaves the building, so it carries NO contact or personal
// details: no phone, email, age, parents' names, emergency contacts or full
// address. It also carries no confirmation code — that is the rider's
// check-in credential, and a list of codes would let anyone check in as
// anyone. The column list below is the whole of what is selected and written.
//   ?format=csv   (default) CSV with a header row, as a download
//   ?format=json  the same rows as a JSON array, as a download
import { NextResponse } from "next/server";
import { createServiceRoleClient, verifyAdminRequest } from "@/lib/admin/server";
import { toCsv } from "@/lib/scoring/csv";
import { fetchAllRows, isScoringNotConfiguredError } from "@/lib/scoring/server";
import { shortLocation } from "@/lib/scoring/types";

export const dynamic = "force-dynamic";

const RIDER_EXPORT_COLUMNS = [
  "source",
  "full_name",
  "team_name",
  "is_leader",
  "horse_name",
  "horse_breed",
  "horse_age",
  "location_short",
  "years_experience",
  "checked_in",
  "pool_label",
  "round_name",
] as const;

type ExportRow = Record<(typeof RIDER_EXPORT_COLUMNS)[number], string | number>;

/* Exactly the columns read from each table. */
const SOLO_SELECT =
  "id, full_name, horse_name, horse_breed, horse_age, location, years_experience, checked_in_at";
const MEMBER_SELECT =
  "id, full_name, is_leader, horse_name, horse_breed, horse_age, location, years_experience, checked_in_at, team_id, teams(team_name)";

type SoloRow = {
  id: string;
  full_name: string;
  horse_name: string | null;
  horse_breed: string | null;
  horse_age: number | null;
  location: string | null;
  years_experience: number | null;
  checked_in_at: string | null;
};

type MemberRow = SoloRow & {
  is_leader: boolean | null;
  team_id: string;
  teams: { team_name: string | null } | { team_name: string | null }[] | null;
};

type StartListRun = {
  round_id: string;
  pool_label: string | null;
  solo_registration_id: string | null;
  team_member_id: string | null;
};

type RoundRow = { id: string; name: string; sort_order: number };

const teamNameOf = (value: MemberRow["teams"]) => {
  const team = Array.isArray(value) ? value[0] : value;
  return team?.team_name ?? "";
};

const NO_STORE = "private, no-store";
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/* YYYY-MM-DD in Punjab, for the file name. */
const todayInIndia = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export async function GET(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const format =
    new URL(request.url).searchParams.get("format")?.trim().toLowerCase() === "json"
      ? "json"
      : "csv";
  const serviceSupabase = createServiceRoleClient();

  const [soloResult, memberResult] = await Promise.all([
    fetchAllRows<SoloRow>((from, to) =>
      serviceSupabase
        .from("solo_registrations")
        .select(SOLO_SELECT)
        .order("full_name", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows<MemberRow>((from, to) =>
      serviceSupabase
        .from("team_members")
        .select(MEMBER_SELECT)
        .order("team_id", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
  ]);

  const registrationError = soloResult.error ?? memberResult.error;

  if (registrationError) {
    console.error("[scoring] rider export failed", registrationError);
    return NextResponse.json(
      { error: "The rider list could not be read. Try again." },
      { status: 500, headers: { "Cache-Control": NO_STORE } }
    );
  }

  // Start lists. Missing scoring tables (not set up yet) just mean no pools.
  const [runsResult, roundsResult] = await Promise.all([
    fetchAllRows<StartListRun>((from, to) =>
      serviceSupabase
        .from("scoring_runs")
        .select("round_id, pool_label, solo_registration_id, team_member_id")
        .range(from, to)
    ),
    serviceSupabase.from("scoring_rounds").select("id, name, sort_order"),
  ]);

  const scoringError = runsResult.error ?? roundsResult.error;

  if (scoringError && !isScoringNotConfiguredError(scoringError)) {
    console.error("[scoring] rider export start lists failed", scoringError);
    return NextResponse.json(
      { error: "The start lists could not be read. Try again." },
      { status: 500, headers: { "Cache-Control": NO_STORE } }
    );
  }

  const rounds = new Map(
    ((scoringError ? [] : roundsResult.data ?? []) as RoundRow[]).map((round) => [round.id, round])
  );

  /* The most recent round (highest running order) each rider is drawn in. */
  const latestStart = new Map<string, { round: RoundRow; pool: string | null }>();

  for (const run of scoringError ? [] : runsResult.rows) {
    const round = rounds.get(run.round_id);
    const riderKey = run.solo_registration_id
      ? `solo:${run.solo_registration_id}`
      : run.team_member_id
        ? `team:${run.team_member_id}`
        : null;

    if (!round || !riderKey) {
      continue;
    }

    const known = latestStart.get(riderKey);

    if (!known || known.round.sort_order < round.sort_order) {
      latestStart.set(riderKey, { round, pool: run.pool_label });
    }
  }

  const startOf = (riderKey: string) => {
    const start = latestStart.get(riderKey);
    return { pool_label: start?.pool ?? "", round_name: start?.round.name ?? "" };
  };

  const common = (row: SoloRow) => ({
    full_name: row.full_name,
    horse_name: row.horse_name ?? "",
    horse_breed: row.horse_breed ?? "",
    horse_age: row.horse_age ?? "",
    location_short: shortLocation(row.location) ?? "",
    years_experience: row.years_experience ?? "",
    checked_in: row.checked_in_at ? "Yes" : "No",
  });

  const rows: ExportRow[] = [
    ...soloResult.rows.map((row) => ({
      source: "solo",
      team_name: "",
      is_leader: "",
      ...common(row),
      ...startOf(`solo:${row.id}`),
    })),
    ...memberResult.rows
      .map((row) => ({
        source: "team",
        team_name: teamNameOf(row.teams),
        is_leader: row.is_leader ? "Yes" : "No",
        ...common(row),
        ...startOf(`team:${row.id}`),
      }))
      .sort(
        (first, second) =>
          String(first.team_name).localeCompare(String(second.team_name)) ||
          (first.is_leader === second.is_leader ? 0 : first.is_leader === "Yes" ? -1 : 1)
      ),
  ];

  // Written column by column from the fixed list, so nothing else can leak in.
  const ordered = rows.map((row) =>
    Object.fromEntries(RIDER_EXPORT_COLUMNS.map((column) => [column, row[column]]))
  );
  const filename = `nezabazi-rider-list-${todayInIndia()}.${format}`;
  const headers = {
    "Cache-Control": NO_STORE,
    "Content-Disposition": `attachment; filename="${filename}"`,
  };

  if (format === "json") {
    return NextResponse.json(ordered, { headers });
  }

  // The byte-order mark lets Excel read Punjabi names as UTF-8.
  return new NextResponse(`${BYTE_ORDER_MARK}${toCsv(RIDER_EXPORT_COLUMNS, ordered)}`, {
    headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
  });
}

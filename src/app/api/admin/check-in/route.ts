// Rider check-in desk, the day before the event.
//
// POST looks a rider up by the confirmation code they present; PATCH records
// that they arrived (or undoes it). Both go through the service role because
// administrators have no direct write access to the registration tables — the
// database function writes the change and its audit record together.
import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  type ServiceRoleClient,
} from "@/lib/admin/server";
import { verifyAdminRequest } from "@/lib/admin/server";
import { escapeIlikePattern } from "@/lib/supabase/query";

type LookupRequest = { code?: unknown; query?: unknown };

type RiderMatch = {
  id: string;
  source: "solo" | "team";
  /* Every entry this one code covers — a rider can be both a solo entrant and
     a team rider. */
  entries: Array<"solo" | "team">;
  full_name: string;
  email: string;
  phone: string;
  team_name: string | null;
  is_leader: boolean | null;
  confirmation_code: string;
  checked_in_at: string | null;
};

const MATCH_LIMIT = 25;

/* Fallback lookup for a rider who turns up without their code -- they never
   got the email, or cannot find it. Each column is queried separately rather
   than through a single PostgREST `or` filter, because a name containing a
   comma or bracket would otherwise break the filter syntax. */
const searchRiders = async (
  serviceSupabase: ServiceRoleClient,
  query: string
): Promise<{ matches: RiderMatch[]; error: string | null }> => {
  const pattern = `%${escapeIlikePattern(query)}%`;
  const columns = ["full_name", "email", "phone"] as const;

  const soloLookups = columns.map((column) =>
    serviceSupabase
      .from("solo_registrations")
      .select("id, full_name, email, phone, confirmation_code, checked_in_at")
      .ilike(column, pattern)
      .limit(MATCH_LIMIT)
  );

  const teamLookups = columns.map((column) =>
    serviceSupabase
      .from("team_members")
      .select(
        "id, full_name, email, phone, confirmation_code, checked_in_at, is_leader, teams(team_name)"
      )
      .ilike(column, pattern)
      .limit(MATCH_LIMIT)
  );

  const [soloResults, teamResults] = await Promise.all([
    Promise.all(soloLookups),
    Promise.all(teamLookups),
  ]);

  const failure = [...soloResults, ...teamResults].find((result) => result.error);

  if (failure?.error) {
    return { matches: [], error: failure.error.message };
  }

  // Keyed on the code, not the row: a rider with both a solo entry and a team
  // place shares one code, and must appear once in the results rather than
  // twice.
  const byCode = new Map<string, RiderMatch>();

  const addEntry = (code: string, match: RiderMatch) => {
    const existing = byCode.get(code);

    if (!existing) {
      byCode.set(code, match);
      return;
    }

    existing.entries = [...new Set([...existing.entries, ...match.entries])];
    // Prefer the team label, which carries the team name.
    existing.team_name = existing.team_name ?? match.team_name;
    existing.is_leader = existing.is_leader ?? match.is_leader;
  };

  for (const result of soloResults) {
    for (const row of result.data ?? []) {
      addEntry(row.confirmation_code, {
        id: row.id,
        source: "solo",
        entries: ["solo"],
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        team_name: null,
        is_leader: null,
        confirmation_code: row.confirmation_code,
        checked_in_at: row.checked_in_at,
      });
    }
  }

  for (const result of teamResults) {
    for (const row of result.data ?? []) {
      // PostgREST returns an embedded relation as an array unless it can prove
      // the join is one-to-one, so accept either shape.
      const relation = row.teams as unknown as
        | { team_name: string }
        | { team_name: string }[]
        | null;
      const team = Array.isArray(relation) ? relation[0] ?? null : relation;

      addEntry(row.confirmation_code, {
        id: row.id,
        source: "team",
        entries: ["team"],
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        team_name: team?.team_name ?? null,
        is_leader: row.is_leader,
        confirmation_code: row.confirmation_code,
        checked_in_at: row.checked_in_at,
      });
    }
  }

  const matches = [...byCode.values()]
    .sort((first, second) => first.full_name.localeCompare(second.full_name))
    .slice(0, MATCH_LIMIT);

  return { matches, error: null };
};
type CheckInRequest = {
  code?: unknown;
  checkedIn?: unknown;
};

// Generated codes are NBP- plus six characters, but stay lenient about case,
// spacing and a missing prefix so a hurried desk entry still resolves.
const codePattern = /^[A-Z0-9-]{4,24}$/i;

export async function POST(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let body: LookupRequest;

  try {
    body = (await request.json()) as LookupRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleClient();

  // Second path: the rider has no code, so find them by name, email or phone
  // and let the administrator pick from the matches.
  if (typeof body.query === "string") {
    const query = body.query.trim();

    if (query.length < 2) {
      return NextResponse.json(
        { error: "Enter at least two characters to search." },
        { status: 400 }
      );
    }

    const { matches, error: searchError } = await searchRiders(
      serviceSupabase,
      query
    );

    if (searchError) {
      return NextResponse.json({ error: searchError }, { status: 400 });
    }

    return NextResponse.json({ matches });
  }

  const rawCode = typeof body.code === "string" ? body.code.trim() : "";

  if (!codePattern.test(rawCode)) {
    return NextResponse.json(
      { error: "Enter a confirmation code." },
      { status: 400 }
    );
  }

  const code = rawCode.toUpperCase().startsWith("NBP-")
    ? rawCode
    : `NBP-${rawCode}`;
  const { data, error } = await serviceSupabase.rpc("admin_find_rider_by_code", {
    p_code: code,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // A rider may hold two entries — a solo registration and a place on a team —
  // and they share one code, so this returns every entry that code covers.
  const entries = data ?? [];
  const rider = entries[0] ?? null;

  if (!rider) {
    return NextResponse.json(
      { error: `No rider found for code ${code}.` },
      { status: 404 }
    );
  }

  // A team only enters the brackets when all four riders have checked in, so
  // the desk needs to see the rest of the roster alongside this rider.
  let teammates: Array<{
    id: string;
    full_name: string;
    is_leader: boolean;
    checked_in_at: string | null;
  }> = [];

  const teamEntry = entries.find(
    (entry: { source: string; team_id: string | null }) =>
      entry.source === "team" && entry.team_id
  );

  if (teamEntry) {
    const { data: teamRows, error: teamError } = await serviceSupabase
      .from("team_members")
      .select("id, full_name, is_leader, checked_in_at")
      .eq("team_id", teamEntry.team_id)
      .order("is_leader", { ascending: false });

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 400 });
    }

    teammates = teamRows ?? [];
  }

  return NextResponse.json({ rider, entries, teammates });
}

export async function PATCH(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let body: CheckInRequest;

  try {
    body = (await request.json()) as CheckInRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { code, checkedIn } = body;

  if (
    typeof code !== "string" ||
    !codePattern.test(code.trim()) ||
    typeof checkedIn !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Please provide a valid check-in update." },
      { status: 400 }
    );
  }

  // Check-in is keyed on the code rather than a row id: one scan marks every
  // entry the rider holds, so a solo rider on a team can never be counted
  // present for one and absent for the other.
  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("admin_set_check_in", {
    p_code: code.trim(),
    p_checked_in: checkedIn,
    p_actor_id: adminCheck.actor.id,
    p_actor_name: adminCheck.actor.name,
    p_actor_email: adminCheck.actor.email,
  });

  if (error) {
    const status = error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, rider: data });
}

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

type LookupRequest = { code?: unknown; query?: unknown; roster?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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
  /* The team this rider rides for, so the desk can count a team's riders. */
  team_id: string | null;
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
        "id, full_name, email, phone, confirmation_code, checked_in_at, is_leader, team_id, teams(team_name)"
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
    existing.team_id = existing.team_id ?? match.team_id;
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
        team_id: null,
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
        team_id: row.team_id,
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
/* Every rider at once, for the desk's instant search: the panel keeps this
   short list (name, email, phone, team, code, check-in status) and filters it
   as the administrator types, refreshing it every few seconds and after each
   check-in. A rider's full record is still loaded fresh, by code, when they
   are selected. ~150 riders today; ROSTER_LIMIT is far above any real field. */
const ROSTER_LIMIT = 5000;

const listRiders = async (
  serviceSupabase: ServiceRoleClient
): Promise<{ riders: RiderMatch[]; error: string | null }> => {
  const [solo, team] = await Promise.all([
    serviceSupabase
      .from("solo_registrations")
      .select("id, full_name, email, phone, confirmation_code, checked_in_at")
      .limit(ROSTER_LIMIT),
    serviceSupabase
      .from("team_members")
      .select(
        "id, full_name, email, phone, confirmation_code, checked_in_at, is_leader, team_id, teams(team_name)"
      )
      .limit(ROSTER_LIMIT),
  ]);

  const failure = solo.error ?? team.error;

  if (failure) {
    return { riders: [], error: failure.message };
  }

  // One row per code, as in searchRiders: a rider with a solo entry and a
  // team place shares one code and is listed once, with both entries.
  const byCode = new Map<string, RiderMatch>();

  for (const row of solo.data ?? []) {
    byCode.set(row.confirmation_code, {
      id: row.id,
      source: "solo",
      entries: ["solo"],
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      team_name: null,
      team_id: null,
      is_leader: null,
      confirmation_code: row.confirmation_code,
      checked_in_at: row.checked_in_at,
    });
  }

  for (const row of team.data ?? []) {
    const relation = row.teams as unknown as
      | { team_name: string }
      | { team_name: string }[]
      | null;
    const teamName = (Array.isArray(relation) ? relation[0] ?? null : relation)?.team_name ?? null;
    const existing = byCode.get(row.confirmation_code);

    if (existing) {
      existing.entries = [...new Set([...existing.entries, "team" as const])];
      existing.team_name = existing.team_name ?? teamName;
      existing.team_id = existing.team_id ?? row.team_id;
      existing.is_leader = existing.is_leader ?? row.is_leader;
      continue;
    }

    byCode.set(row.confirmation_code, {
      id: row.id,
      source: "team",
      entries: ["team"],
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      team_name: teamName,
      team_id: row.team_id,
      is_leader: row.is_leader,
      confirmation_code: row.confirmation_code,
      checked_in_at: row.checked_in_at,
    });
  }

  return {
    riders: [...byCode.values()].sort((first, second) =>
      first.full_name.localeCompare(second.full_name)
    ),
    error: null,
  };
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
    const rawBody: unknown = await request.json();
    body = isRecord(rawBody)
      ? { code: rawBody.code, query: rawBody.query, roster: rawBody.roster }
      : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleClient();

  // The whole rider list, for the desk's instant search.
  if (body.roster === true) {
    const { riders, error: rosterError } = await listRiders(serviceSupabase);

    if (rosterError) {
      return NextResponse.json({ error: rosterError }, { status: 400 });
    }

    return NextResponse.json(
      { riders },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

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
  // Rows go to the desk as the function returns them — every rider field,
  // including father_name and mother_name (optional, so often null).
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

  /* A team's emergency contact is one per team, so it is read from `teams`
     rather than coming back on the rider row. This is the reason the desk has
     it at all: if a rider goes down, whoever is at the desk needs a number to
     call without going hunting for the team leader. */
  let teamEmergency: {
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
  } | null = null;

  if (teamEntry) {
    const [{ data: teamRows, error: teamError }, { data: teamRow, error: contactError }] =
      await Promise.all([
        serviceSupabase
          .from("team_members")
          .select("id, full_name, is_leader, checked_in_at")
          .eq("team_id", teamEntry.team_id)
          .order("is_leader", { ascending: false }),
        serviceSupabase
          .from("teams")
          .select("emergency_contact_name, emergency_contact_phone")
          .eq("id", teamEntry.team_id)
          .maybeSingle(),
      ]);

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 400 });
    }

    if (contactError) {
      return NextResponse.json({ error: contactError.message }, { status: 400 });
    }

    teammates = teamRows ?? [];
    teamEmergency = teamRow ?? null;
  }

  return NextResponse.json({ rider, entries, teammates, teamEmergency });
}

export async function PATCH(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  let body: CheckInRequest;

  try {
    const rawBody: unknown = await request.json();
    body = isRecord(rawBody)
      ? { code: rawBody.code, checkedIn: rawBody.checkedIn }
      : {};
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

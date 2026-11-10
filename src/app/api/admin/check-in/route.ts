// Rider check-in desk, the day before the event.
//
// POST looks a rider up by the confirmation code they present, with their
// headshot and their team's; PATCH records that they arrived (or undoes it),
// for one rider or a whole team at once. Both go through the service role because
// administrators have no direct write access to the registration tables — the
// database function writes the change and its audit record together.
import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  type ServiceRoleClient,
} from "@/lib/admin/server";
import { verifyAdminRequest } from "@/lib/admin/server";
import {
  getSoloHeadshotUrl,
  getTeamRiderHeadshotUrl,
} from "@/lib/admin/headshot-urls";
import { mergeRidersByCode, type RiderMatch } from "@/lib/check-in-roster";
import { escapeIlikePattern } from "@/lib/supabase/query";

type LookupRequest = { code?: unknown; query?: unknown; roster?: unknown };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

  // One row per code (mergeRidersByCode): the same rider's solo entry and
  // team place share one code and appear once; two riders sharing an email
  // or phone have their own codes and appear as two rows.
  const rows: RiderMatch[] = [];

  for (const result of soloResults) {
    for (const row of result.data ?? []) {
      rows.push({
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

      rows.push({
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

  const matches = mergeRidersByCode(rows).slice(0, MATCH_LIMIT);

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

  // One row per code, as in searchRiders.
  const rows: RiderMatch[] = [];

  for (const row of solo.data ?? []) {
    rows.push({
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

    rows.push({
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

  return { riders: mergeRidersByCode(rows), error: null };
};

type CheckInRequest = {
  code?: unknown;
  teamId?: unknown;
  checkedIn?: unknown;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* A photo is a help to the desk, never a requirement: any failure here leaves
   the rider without one rather than failing the lookup. */
const soloHeadshot = async (serviceSupabase: ServiceRoleClient, registrationId: string) => {
  const { data } = await serviceSupabase
    .from("solo_registrations")
    .select("id, profile_id, email, full_name")
    .eq("id", registrationId)
    .maybeSingle();

  // The registration's own photo first; the account's only when this is the
  // account holder's own registration (an account may have entered others).
  return data ? getSoloHeadshotUrl(serviceSupabase, data) : null;
};

/* Where the desk's Add / Replace / Remove photo goes for one rider, so it
   always acts on the photo on screen: the solo entry's when that is the one
   shown, the team row's when that is, and, with no photo yet, the solo entry
   if the rider has one (a rider with both entries shows their solo photo
   first, everywhere). `id` is the row /api/admin/headshots expects. */
type PhotoTarget = { kind: "solo" | "team"; id: string };

const pickPhotoTarget = (
  soloId: string | null,
  soloUrl: string | null,
  teamId: string | null,
  teamUrl: string | null
): PhotoTarget | null => {
  if (soloId && (soloUrl || !teamUrl)) {
    return { kind: "solo", id: soloId };
  }

  return teamId ? { kind: "team", id: teamId } : null;
};

/* The rider's Dal Panth, for the desk card (staff-only, see
   src/lib/dal-panth.ts). Read on its own, after the lookup has succeeded and
   never in the roster or search selects, so a failure of any kind (the
   column not added yet included) only means the card shows a dash: it
   returns null, never throws, and never changes the lookup's status. The
   solo entry's value first, otherwise the team entry's. Each distinct
   failure is logged once. */
const loggedDalPanthFailures = new Set<string>();

const logDalPanthFailure = (failure: unknown) => {
  const key =
    typeof failure === "object" && failure !== null
      ? `${String((failure as { code?: unknown }).code ?? "")}:${String((failure as { message?: unknown }).message ?? "")}`
      : String(failure);

  if (!loggedDalPanthFailures.has(key)) {
    loggedDalPanthFailures.add(key);
    console.error("Check-in Dal Panth read failed; the card shows none", failure);
  }
};

const readDalPanth = async (
  serviceSupabase: ServiceRoleClient,
  riderCode: string
): Promise<string | null> => {
  try {
    for (const table of ["solo_registrations", "team_members"] as const) {
      const { data, error } = await serviceSupabase
        .from(table)
        .select("dal_panth")
        .eq("confirmation_code", riderCode)
        .not("dal_panth", "is", null)
        .limit(1);

      if (error) {
        logDalPanthFailure(error);
        return null;
      }

      const value: unknown = data?.[0]?.dal_panth;

      if (typeof value === "string" && value.trim() !== "") {
        return value;
      }
    }

    return null;
  } catch (failure) {
    logDalPanthFailure(failure);
    return null;
  }
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
    confirmation_code: string;
    checked_in_at: string | null;
    headshot_url: string | null;
    photo_target: PhotoTarget | null;
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
          .select("id, full_name, email, is_leader, confirmation_code, checked_in_at")
          .eq("team_id", teamEntry.team_id)
          .order("is_leader", { ascending: false })
          .order("full_name"),
        serviceSupabase
          .from("teams")
          .select("emergency_contact_name, emergency_contact_phone, leader_profile_id")
          .eq("id", teamEntry.team_id)
          .maybeSingle(),
      ]);

    if (teamError) {
      return NextResponse.json({ error: teamError.message }, { status: 400 });
    }

    if (contactError) {
      return NextResponse.json({ error: contactError.message }, { status: 400 });
    }

    // A teammate who also holds a solo entry shares its code. Their solo
    // photo is shown first, exactly as on their own card, so a photo added
    // from either place shows in both. A failed read only means no solo
    // photo; the team photo below still applies.
    const teammateCodes = (teamRows ?? []).map((row) => row.confirmation_code);
    const { data: teammateSolos } = teammateCodes.length
      ? await serviceSupabase
          .from("solo_registrations")
          .select("id, profile_id, email, full_name, confirmation_code")
          .in("confirmation_code", teammateCodes)
      : { data: [] };
    const soloByCode = new Map(
      (teammateSolos ?? []).map((solo) => [solo.confirmation_code as string, solo])
    );

    // The rider's own photo on the row first. Then: the leader registered
    // the team, so the team's account may be theirs; anyone else is found by
    // email: a solo entry, or their own confirmed account. Either way only an
    // account with the rider's own email and name counts.
    teammates = await Promise.all(
      (teamRows ?? []).map(async ({ email, ...teammate }) => {
        const solo = soloByCode.get(teammate.confirmation_code) ?? null;
        let soloUrl: string | null = null;
        let teamUrl: string | null = null;

        try {
          soloUrl = solo ? await getSoloHeadshotUrl(serviceSupabase, solo) : null;
        } catch {
          soloUrl = null;
        }

        try {
          teamUrl = soloUrl
            ? null
            : await getTeamRiderHeadshotUrl(
                serviceSupabase,
                { id: teammate.id, email, full_name: teammate.full_name },
                teammate.is_leader ? ((teamRow?.leader_profile_id as string | null) ?? null) : null
              );
        } catch {
          teamUrl = null;
        }

        return {
          ...teammate,
          headshot_url: soloUrl ?? teamUrl,
          photo_target: pickPhotoTarget(solo?.id ?? null, soloUrl, teammate.id, teamUrl),
        };
      })
    );
    teamEmergency = teamRow
      ? {
          emergency_contact_name: teamRow.emergency_contact_name,
          emergency_contact_phone: teamRow.emergency_contact_phone,
        }
      : null;
  }

  // The rider's own photo: through the solo entry if they have one (its own
  // photo, or the account's for the holder's own entry), otherwise the one
  // already found for their place on the team.
  const soloEntry = entries.find((entry: { source: string }) => entry.source === "solo");
  let headshotUrl: string | null = null;

  try {
    headshotUrl = soloEntry
      ? await soloHeadshot(serviceSupabase, soloEntry.id)
      : null;
  } catch {
    headshotUrl = null;
  }

  const soloUrl = headshotUrl;

  if (!headshotUrl && teamEntry) {
    headshotUrl =
      teammates.find((teammate) => teammate.id === teamEntry.id)?.headshot_url ?? null;
  }

  const photoTarget = pickPhotoTarget(
    soloEntry?.id ?? null,
    soloUrl,
    (teamEntry?.id as string | undefined) ?? null,
    soloUrl ? null : headshotUrl
  );

  // Never fails the lookup: null on any error (see readDalPanth).
  const dalPanth: string | null = await readDalPanth(
    serviceSupabase,
    typeof rider.confirmation_code === "string" ? rider.confirmation_code : code
  );

  return NextResponse.json({
    rider,
    entries,
    teammates,
    teamEmergency,
    dalPanth,
    headshotUrl,
    photoTarget,
  });
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
      ? { code: rawBody.code, teamId: rawBody.teamId, checkedIn: rawBody.checkedIn }
      : {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { code, teamId, checkedIn } = body;

  // The whole team at once: every rider not already in that state, one at a
  // time through the same function as a single check-in, so each rider gets
  // their own audit record exactly as if checked in one by one.
  if (teamId !== undefined) {
    if (typeof teamId !== "string" || !uuidPattern.test(teamId) || typeof checkedIn !== "boolean") {
      return NextResponse.json(
        { error: "Please provide a valid check-in update." },
        { status: 400 }
      );
    }

    const serviceSupabase = createServiceRoleClient();
    const { data: members, error: membersError } = await serviceSupabase
      .from("team_members")
      .select("full_name, confirmation_code, checked_in_at")
      .eq("team_id", teamId);

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 400 });
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ error: "No riders found for that team." }, { status: 404 });
    }

    const toChange = members.filter((member) => (member.checked_in_at !== null) !== checkedIn);
    const failed: string[] = [];

    for (const member of toChange) {
      const { error } = await serviceSupabase.rpc("admin_set_check_in", {
        p_code: member.confirmation_code,
        p_checked_in: checkedIn,
        p_actor_id: adminCheck.actor.id,
        p_actor_name: adminCheck.actor.name,
        p_actor_email: adminCheck.actor.email,
      });

      if (error) {
        failed.push(member.full_name);
      }
    }

    return NextResponse.json(
      { ok: failed.length === 0, changed: toChange.length - failed.length, failed },
      { status: failed.length === 0 ? 200 : 207 }
    );
  }

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

  return NextResponse.json({
    ok: true,
    rider: data,
    pool: checkedIn ? await readDeskPool(serviceSupabase, code.trim(), data) : null,
  });
}

/* The qualifying pool a solo rider is in now, for the desk to tell them
   (supabase/migrations/20261110140000_scoring_auto_qualifying.sql): null for a
   team-only rider, before that migration, or on any error — the check-in has
   already been saved either way. */
const readDeskPool = async (
  serviceSupabase: ServiceRoleClient,
  code: string,
  rider: unknown
): Promise<{ started: boolean; pool: string | null; position: number | null } | null> => {
  if (!isRecord(rider) || typeof rider.solo_entries !== "number" || rider.solo_entries < 1) {
    return null;
  }

  try {
    const { data, error } = await serviceSupabase.rpc("scoring_desk_pool", { p_code: code });

    if (error || !isRecord(data) || typeof data.started !== "boolean") {
      return null;
    }

    return {
      started: data.started,
      pool: typeof data.pool === "string" ? data.pool : null,
      position: typeof data.position === "number" ? data.position : null,
    };
  } catch {
    return null;
  }
};

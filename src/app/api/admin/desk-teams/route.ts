// Form teams (/admin/form-teams).
//
// GET lists what the page needs: every solo rider not on a team yet, checked
// in or not, and every team formed here with its riders.
// POST creates a team, adds or removes a rider, renames a team, changes its
// leader or emergency contact, or deletes it.
//
// The administrator is verified from the session and becomes the audit
// actor; nothing in the body can name one. The body is checked here
// (src/lib/desk-teams.ts) and again by the service-role-only database
// function admin_desk_team, which does the change and writes its audit
// record in one transaction. No email is sent.
import { NextResponse } from "next/server";
import { createServiceRoleClient, verifyAdminRequest } from "@/lib/admin/server";
import { parseDeskTeamRequest } from "@/lib/desk-teams";
import { displayEmail } from "@/lib/paper-registration";
import { readJsonBody } from "@/lib/scoring/http";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

/* The migration has not been applied yet. */
const MISSING_FUNCTION_CODES = new Set(["PGRST202", "42883"]);

/* Far above any real field (~150 riders). */
const LIST_LIMIT = 5000;

const NO_STORE = { "Cache-Control": "private, no-store" };

export type DeskTeamRider = {
  id: string;
  full_name: string;
  confirmation_code: string;
  phone: string;
  email: string;
  location: string;
  horse_name: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  /* Null until the rider checks in at the desk. */
  checked_in_at: string | null;
};

export type DeskTeamMember = {
  id: string;
  full_name: string;
  confirmation_code: string;
  is_leader: boolean;
  checked_in_at: string | null;
};

export type DeskTeam = {
  id: string;
  team_name: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  /* Drawn into a scoring round: riders can no longer be added or removed. */
  drawn: boolean;
  members: DeskTeamMember[];
};

export async function GET() {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const serviceSupabase = createServiceRoleClient();
  const [solo, members, teams, drawn] = await Promise.all([
    serviceSupabase
      .from("solo_registrations")
      .select(
        "id, full_name, confirmation_code, phone, email, location, horse_name, emergency_contact_name, emergency_contact_phone, checked_in_at"
      )
      .order("full_name")
      .limit(LIST_LIMIT),
    serviceSupabase
      .from("team_members")
      .select("id, team_id, full_name, confirmation_code, is_leader, checked_in_at, created_at")
      .order("created_at")
      .limit(LIST_LIMIT),
    serviceSupabase
      .from("teams")
      .select("id, team_name, emergency_contact_name, emergency_contact_phone, created_at")
      .eq("registration_source", "desk")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT),
    serviceSupabase.from("scoring_runs").select("team_id").not("team_id", "is", null).limit(LIST_LIMIT),
  ]);

  const failure = solo.error ?? members.error ?? teams.error ?? drawn.error;

  if (failure) {
    console.error("Form teams list failed", failure);
    return NextResponse.json(
      { error: "Could not load riders and teams. Try again." },
      { status: 500, headers: NO_STORE }
    );
  }

  // A rider already on any team (online, paper or desk) shares their code
  // with that team place, so they are left out of the list to choose from.
  const onTeam = new Set((members.data ?? []).map((member) => member.confirmation_code));
  const drawnTeams = new Set((drawn.data ?? []).map((run) => run.team_id as string));

  const riders: DeskTeamRider[] = (solo.data ?? [])
    .filter((rider) => !onTeam.has(rider.confirmation_code))
    .map((rider) => ({ ...rider, email: displayEmail(rider.email) }) as DeskTeamRider);

  const deskTeams: DeskTeam[] = (teams.data ?? []).map((team) => ({
    id: team.id,
    team_name: team.team_name,
    emergency_contact_name: team.emergency_contact_name,
    emergency_contact_phone: team.emergency_contact_phone,
    drawn: drawnTeams.has(team.id),
    members: (members.data ?? [])
      .filter((member) => member.team_id === team.id)
      .sort((first, second) => Number(second.is_leader) - Number(first.is_leader))
      .map(({ id, full_name, confirmation_code, is_leader, checked_in_at }) => ({
        id,
        full_name,
        confirmation_code,
        is_leader,
        checked_in_at,
      })),
  }));

  return NextResponse.json({ riders, teams: deskTeams }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const adminCheck = await verifyAdminRequest();

  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES);

  if (!body.ok) {
    return body.response;
  }

  const parsed = parseDeskTeamRequest(body.body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const serviceSupabase = createServiceRoleClient();
  const { data, error } = await serviceSupabase.rpc("admin_desk_team", {
    p_action: parsed.request.action,
    p_payload: parsed.request.payload,
    p_actor_id: adminCheck.actor.id,
    p_actor_name: adminCheck.actor.name,
    p_actor_email: adminCheck.actor.email,
  });

  if (error) {
    // The database still has the first version of admin_desk_team, which
    // takes checked-in riders only: say which update is missing.
    if (error.code === "22023" && /has not checked in yet/.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "Form teams needs a database update to use riders who have not checked in (supabase/migrations/20261110120000_desk_teams_any_solo.sql).",
        },
        { status: 503 }
      );
    }

    if (error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error.code === "42501") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    if (MISSING_FUNCTION_CODES.has(error.code)) {
      return NextResponse.json(
        {
          error:
            "Form teams needs a database update first (supabase/migrations/20261109120000_desk_teams.sql).",
        },
        { status: 503 }
      );
    }

    console.error("Form teams change failed", error);
    return NextResponse.json(
      { error: "Could not save that change. Nothing was saved. Try again." },
      { status: 500 }
    );
  }

  // admin_desk_team copies a solo entry onto the team without its Dal Panth,
  // so copy it across now. Best effort only: a failure (the function not
  // there yet included) is logged and never changes this response.
  try {
    const { error: syncError } = await serviceSupabase.rpc("admin_sync_dal_panth");

    if (syncError) {
      console.error("Dal Panth sync after a desk team change failed", syncError);
    }
  } catch (syncFailure) {
    console.error("Dal Panth sync after a desk team change failed", syncFailure);
  }

  return NextResponse.json({ ok: true, result: data });
}

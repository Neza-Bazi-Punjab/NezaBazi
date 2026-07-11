import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RiderInput = {
  fullName: string;
  age: string;
  location: string;
  phone: string;
  email: string;
  yearsExperience: string;
  horseAge: string;
  horseBreed: string;
};

type RegisterTeamRequest = {
  teamName: string;
  existingTeamId?: string;
  riders: RiderInput[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to register a team." },
      { status: 401 }
    );
  }

  const body = (await request.json()) as RegisterTeamRequest;
  const { teamName, existingTeamId, riders } = body;

  if (!teamName || riders.length !== 4) {
    return NextResponse.json(
      { error: "Please submit a team name and exactly 4 riders." },
      { status: 400 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  const isAdmin = profile?.role === "admin";
  let teamId = isAdmin ? undefined : existingTeamId;

  if (teamId) {
    const { data: existingTeam, error: existingTeamError } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("leader_profile_id", user.id)
      .maybeSingle();

    if (existingTeamError) {
      return NextResponse.json({ error: existingTeamError.message }, { status: 400 });
    }

    if (!existingTeam) {
      return NextResponse.json(
        { error: "This saved team does not belong to the current login session." },
        { status: 403 }
      );
    }
  } else {
    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .insert({ team_name: teamName, leader_profile_id: user.id })
      .select("id")
      .single();

    if (teamError) {
      const message =
        teamError.code === "23505" ? "You have already registered a team." : teamError.message;

      return NextResponse.json({ error: message }, { status: 400 });
    }

    teamId = teamData.id;
  }

  const { error: membersError } = await supabase.from("team_members").insert(
    riders.map((rider, index) => ({
      team_id: teamId,
      full_name: rider.fullName,
      age: Number(rider.age),
      location: rider.location,
      phone: rider.phone,
      email: rider.email,
      years_experience: Number(rider.yearsExperience),
      horse_age: Number(rider.horseAge),
      horse_breed: rider.horseBreed,
      is_leader: index === 0,
    }))
  );

  if (membersError) {
    const message =
      membersError.code === "23505"
        ? "One or more riders are already registered on another team (duplicate email or phone)."
        : membersError.message;

    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

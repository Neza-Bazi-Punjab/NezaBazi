import { NextResponse, after } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { buildRegistrationCodeEmail } from "@/lib/email/registration-code";
import { sendEmail } from "@/lib/email/resend";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { escapeIlikePattern } from "@/lib/supabase/query";
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseBoundedInt = (
  value: string,
  { min, max }: { min: number; max: number }
) => {
  const trimmed = (value ?? "").trim();

  if (trimmed === "" || !/^-?\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }

  return parsed;
};

const validateRider = (rider: RiderInput, label: string) => {
  const requiredText: Array<[keyof RiderInput, string]> = [
    ["fullName", "full name"],
    ["location", "location"],
    ["phone", "phone number"],
    ["email", "email"],
    ["horseBreed", "horse breed"],
  ];

  for (const [field, fieldLabel] of requiredText) {
    if (!rider[field] || rider[field].trim() === "") {
      return `${label}: ${fieldLabel} is required.`;
    }
  }

  if (!emailPattern.test(rider.email.trim())) {
    return `${label}: please enter a valid email address.`;
  }

  if (parseBoundedInt(rider.age, { min: 1, max: 120 }) === null) {
    return `${label}: please enter a valid age.`;
  }

  if (parseBoundedInt(rider.yearsExperience, { min: 0, max: 100 }) === null) {
    return `${label}: please enter valid years of experience.`;
  }

  if (parseBoundedInt(rider.horseAge, { min: 0, max: 60 }) === null) {
    return `${label}: please enter a valid horse age.`;
  }

  return null;
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

  if (!hasConfirmedEmail(user)) {
    return NextResponse.json(
      { error: "Confirm your email address before registering a team." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as RegisterTeamRequest;
  const { teamName, existingTeamId, riders } = body;

  if (!teamName || teamName.trim() === "" || !Array.isArray(riders) || riders.length !== 4) {
    return NextResponse.json(
      { error: "Please submit a team name and exactly 4 riders." },
      { status: 400 }
    );
  }

  for (let index = 0; index < riders.length; index += 1) {
    const label = index === 0 ? "Rider 1 (Team Leader)" : `Rider ${index + 1}`;
    const riderError = validateRider(riders[index], label);

    if (riderError) {
      return NextResponse.json({ error: riderError }, { status: 400 });
    }
  }

  const normalizedRiders = riders.map((rider) => ({
    fullName: rider.fullName.trim(),
    age: rider.age.trim(),
    location: rider.location.trim(),
    phone: rider.phone.trim(),
    email: rider.email.trim().toLowerCase(),
    yearsExperience: rider.yearsExperience.trim(),
    horseAge: rider.horseAge.trim(),
    horseBreed: rider.horseBreed.trim(),
  }));
  const riderEmails = normalizedRiders.map((rider) => rider.email);
  const riderPhones = normalizedRiders.map((rider) => rider.phone);

  if (
    new Set(riderEmails).size !== riderEmails.length ||
    new Set(riderPhones).size !== riderPhones.length
  ) {
    return NextResponse.json(
      { error: "Each rider must have a unique email address and phone number." },
      { status: 409 }
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

  if (
    !isAdmin &&
    (!user.email || normalizedRiders[0].email !== user.email.trim().toLowerCase())
  ) {
    return NextResponse.json(
      { error: "The team leader email must match your account email." },
      { status: 400 }
    );
  }

  const serviceSupabase = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (!isAdmin && user.email) {
    const { data: currentMembership, error: membershipError } = await serviceSupabase
      .from("team_members")
      .select("id")
      .ilike("email", escapeIlikePattern(user.email))
      .eq("is_leader", false)
      .limit(1);

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 });
    }

    if ((currentMembership ?? []).length > 0) {
      return NextResponse.json(
        { error: "You are already registered on a team and cannot register another team." },
        { status: 409 }
      );
    }
  }

  const [emailLookups, phoneLookup] = await Promise.all([
    Promise.all(
      riderEmails.map((email) =>
        serviceSupabase
          .from("team_members")
          .select("id")
          .ilike("email", escapeIlikePattern(email))
          .limit(1)
      )
    ),
    serviceSupabase.from("team_members").select("id").in("phone", riderPhones).limit(1),
  ]);
  const emailLookupError = emailLookups.find((lookup) => lookup.error)?.error;

  if (emailLookupError) {
    return NextResponse.json({ error: emailLookupError.message }, { status: 400 });
  }

  if (phoneLookup.error) {
    return NextResponse.json({ error: phoneLookup.error.message }, { status: 400 });
  }

  if (
    emailLookups.some((lookup) => (lookup.data ?? []).length > 0) ||
    (phoneLookup.data ?? []).length > 0
  ) {
    return NextResponse.json(
      { error: "One or more riders are already registered on another team." },
      { status: 409 }
    );
  }

  let teamId = isAdmin ? undefined : existingTeamId;
  let createdTeam = false;

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

    const { count: existingMemberCount, error: memberCountError } = await supabase
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId);

    if (memberCountError) {
      return NextResponse.json({ error: memberCountError.message }, { status: 400 });
    }

    if ((existingMemberCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "This team already has its riders registered." },
        { status: 409 }
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
    createdTeam = true;
  }

  const { data: insertedMembers, error: membersError } = await supabase
    .from("team_members")
    .insert(
      normalizedRiders.map((rider, index) => ({
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
    )
    .select("full_name, email, confirmation_code");

  if (membersError) {
    if (createdTeam && teamId) {
      const { error: cleanupError } = await supabase.from("teams").delete().eq("id", teamId);

      if (cleanupError) {
        console.error("Failed to clean up an incomplete team registration", cleanupError);
      }
    }

    const message =
      membersError.code === "23505"
        ? "One or more riders are already registered on another team (duplicate email or phone)."
        : membersError.message;

    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Every rider gets their own code, including the three who have no account
  // and can only receive it by email. Sent after the response so a slow or
  // failing Resend call never holds up a registration that already committed;
  // the leader also sees all four codes on the success page as a fallback.
  after(async () => {
    // Names only. Riders 2-4 never agreed to have their phone number or email
    // forwarded to the rest of the roster.
    const teammateNames = normalizedRiders.map((rider) => rider.fullName);

    for (const member of insertedMembers ?? []) {
      if (!member.confirmation_code) {
        continue;
      }

      const { subject, html, text } = buildRegistrationCodeEmail({
        fullName: member.full_name,
        confirmationCode: member.confirmation_code,
        registrationType: "team",
        teamName: teamName.trim(),
        teammateNames,
      });

      await sendEmail({ to: member.email, subject, html, text });
    }
  });

  return NextResponse.json({ ok: true });
}

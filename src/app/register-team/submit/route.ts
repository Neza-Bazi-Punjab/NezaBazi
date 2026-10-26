import { NextResponse, after } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { isValidEmail } from "@/lib/email-address";
import { buildRegistrationCodeEmail } from "@/lib/email/registration-code";
import { sendEmail } from "@/lib/email/resend";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { escapeIlikePattern } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

type RiderInput = {
  fullName: string;
  /* Optional. A blank box arrives as "" and is stored as null; a tab opened
     before these fields existed sends neither key, which reads the same. */
  fatherName: string;
  motherName: string;
  age: string;
  location: string;
  phone: string;
  email: string;
  yearsExperience: string;
  horseName: string;
  horseAge: string;
  horseBreed: string;
};

type RegisterTeamRequest = {
  teamName: string;
  existingTeamId?: string;
  // One contact for the whole section, held on `teams`.
  emergencyContactName: string;
  emergencyContactPhone: string;
  riders: RiderInput[];
};

const PARENT_NAME_MAX_LENGTH = 200;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown) => (typeof value === "string" ? value : null);

/* Absent and null both mean "left blank"; anything else that is not a string
   is a malformed request. */
const optionalString = (value: unknown) =>
  value === undefined || value === null ? "" : stringOrNull(value);

/* Every wizard field is a string. A rider that is not shaped like one is a
   malformed request rather than something to explain field by field. */
const parseRider = (value: unknown): RiderInput | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rider = {
    fullName: stringOrNull(value.fullName),
    fatherName: optionalString(value.fatherName),
    motherName: optionalString(value.motherName),
    age: stringOrNull(value.age),
    location: stringOrNull(value.location),
    phone: stringOrNull(value.phone),
    email: stringOrNull(value.email),
    yearsExperience: stringOrNull(value.yearsExperience),
    horseName: stringOrNull(value.horseName),
    horseAge: stringOrNull(value.horseAge),
    horseBreed: stringOrNull(value.horseBreed),
  };

  if (
    rider.fullName === null ||
    rider.fatherName === null ||
    rider.motherName === null ||
    rider.age === null ||
    rider.location === null ||
    rider.phone === null ||
    rider.email === null ||
    rider.yearsExperience === null ||
    rider.horseName === null ||
    rider.horseAge === null ||
    rider.horseBreed === null
  ) {
    return null;
  }

  return {
    fullName: rider.fullName,
    fatherName: rider.fatherName,
    motherName: rider.motherName,
    age: rider.age,
    location: rider.location,
    phone: rider.phone,
    email: rider.email,
    yearsExperience: rider.yearsExperience,
    horseName: rider.horseName,
    horseAge: rider.horseAge,
    horseBreed: rider.horseBreed,
  };
};

const parseRequest = (value: unknown): RegisterTeamRequest | null => {
  if (!isRecord(value) || !Array.isArray(value.riders)) {
    return null;
  }

  const teamName = stringOrNull(value.teamName);
  const emergencyContactName = optionalString(value.emergencyContactName);
  const emergencyContactPhone = optionalString(value.emergencyContactPhone);
  const existingTeamId =
    value.existingTeamId === undefined || value.existingTeamId === null
      ? undefined
      : stringOrNull(value.existingTeamId);
  const riders = value.riders.map(parseRider);

  if (
    teamName === null ||
    emergencyContactName === null ||
    emergencyContactPhone === null ||
    existingTeamId === null ||
    (existingTeamId !== undefined && !uuidPattern.test(existingTeamId))
  ) {
    return null;
  }

  const validRiders: RiderInput[] = [];

  for (const rider of riders) {
    if (!rider) {
      return null;
    }

    validRiders.push(rider);
  }

  return {
    teamName,
    existingTeamId,
    emergencyContactName,
    emergencyContactPhone,
    riders: validRiders,
  };
};


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
    ["horseName", "horse name"],
    ["horseBreed", "horse breed"],
  ];

  for (const [field, fieldLabel] of requiredText) {
    if (!rider[field] || rider[field].trim() === "") {
      return `${label}: ${fieldLabel} is required.`;
    }
  }

  if (!isValidEmail(rider.email)) {
    return `${label}: please enter a valid email address.`;
  }

  if (rider.fatherName.trim().length > PARENT_NAME_MAX_LENGTH) {
    return `${label}: father's name must be ${PARENT_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (rider.motherName.trim().length > PARENT_NAME_MAX_LENGTH) {
    return `${label}: mother's name must be ${PARENT_NAME_MAX_LENGTH} characters or fewer.`;
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

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = parseRequest(rawBody);

  if (!body) {
    return NextResponse.json(
      { error: "Please provide a valid team registration." },
      { status: 400 }
    );
  }

  const { teamName, existingTeamId, riders } = body;
  const emergencyContactName = body.emergencyContactName.trim();
  const emergencyContactPhone = body.emergencyContactPhone.trim();

  if (teamName.trim() === "" || riders.length !== 4) {
    return NextResponse.json(
      { error: "Please submit a team name and exactly 4 riders." },
      { status: 400 }
    );
  }

  if (emergencyContactName === "" || emergencyContactName.length > 200) {
    return NextResponse.json(
      { error: "Please enter an emergency contact name for the team." },
      { status: 400 }
    );
  }

  if (emergencyContactPhone === "" || emergencyContactPhone.length > 30) {
    return NextResponse.json(
      { error: "Please enter an emergency contact phone number for the team." },
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
    fatherName: rider.fatherName.trim(),
    motherName: rider.motherName.trim(),
    age: rider.age.trim(),
    location: rider.location.trim(),
    phone: rider.phone.trim(),
    email: rider.email.trim().toLowerCase(),
    yearsExperience: rider.yearsExperience.trim(),
    horseName: rider.horseName.trim(),
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

    // The saved team predates this field, or the leader has just changed it —
    // either way the roster is being submitted now, so store what they typed.
    const { error: contactError } = await supabase
      .from("teams")
      .update({
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
      })
      .eq("id", teamId);

    if (contactError) {
      return NextResponse.json({ error: contactError.message }, { status: 400 });
    }
  } else {
    const { data: teamData, error: teamError } = await supabase
      .from("teams")
      .insert({
        team_name: teamName,
        leader_profile_id: user.id,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
      })
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
        father_name: rider.fatherName || null,
        mother_name: rider.motherName || null,
        age: Number(rider.age),
        location: rider.location,
        phone: rider.phone,
        email: rider.email,
        years_experience: Number(rider.yearsExperience),
        horse_name: rider.horseName,
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

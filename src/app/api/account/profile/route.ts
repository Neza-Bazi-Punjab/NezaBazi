import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { syncRegistrationProfile } from "@/lib/supabase/sync-registration-profile";

type UpdateProfileRequest = {
  fullName?: string;
  age?: string;
  location?: string;
  phone?: string;
  email?: string;
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

const getAuthEmailErrorMessage = (message: string) => {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already") ||
    normalized.includes("exists") ||
    normalized.includes("duplicate") ||
    normalized.includes("registered")
  ) {
    return "This email is already in use by another account.";
  }

  return message || "Unable to update this email.";
};

const parseOptionalBoundedInt = (
  value: unknown,
  bounds: { min: number; max: number }
) => {
  if (value == null || value === "") {
    return null;
  }

  return parseBoundedInt(String(value), bounds);
};

type AccountMetadata = {
  full_name?: unknown;
  age?: unknown;
  location?: unknown;
  phone?: unknown;
  years_experience?: unknown;
  horse_age?: unknown;
  horse_breed?: unknown;
};

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json(
      { error: "You must be logged in to sync your registration details." },
      { status: 401 }
    );
  }

  const metadata = user.user_metadata as AccountMetadata;
  const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const location = typeof metadata.location === "string" ? metadata.location.trim() : "";
  const phone = typeof metadata.phone === "string" ? metadata.phone.trim() : "";
  const age = parseOptionalBoundedInt(metadata.age, { min: 1, max: 120 });

  if (!fullName || !location || !phone || age == null) {
    return NextResponse.json(
      { error: "Your account profile is incomplete and could not be synced." },
      { status: 400 }
    );
  }

  const result = await syncRegistrationProfile({
    userId: user.id,
    previousEmail: user.email,
    email: user.email.trim().toLowerCase(),
    fullName,
    age,
    location,
    phone,
    yearsExperience: parseOptionalBoundedInt(metadata.years_experience, {
      min: 0,
      max: 100,
    }),
    horseAge: parseOptionalBoundedInt(metadata.horse_age, { min: 0, max: 60 }),
    horseBreed:
      typeof metadata.horse_breed === "string" ? metadata.horse_breed.trim() : null,
  });

  return NextResponse.json({ ok: true, ...result });
}

export async function PATCH(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "You must be logged in to update your account." },
      { status: 401 }
    );
  }

  const body = (await request.json()) as UpdateProfileRequest;
  const fullName = (body.fullName ?? "").trim();
  const location = (body.location ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const email = (body.email ?? "").trim();
  const age = parseBoundedInt(body.age ?? "", { min: 1, max: 120 });

  if (fullName === "" || fullName.length > 200) {
    return NextResponse.json({ error: "Please enter a valid full name." }, { status: 400 });
  }

  if (location === "" || location.length > 200) {
    return NextResponse.json({ error: "Please enter a valid location." }, { status: 400 });
  }

  if (phone === "" || phone.length > 30) {
    return NextResponse.json(
      { error: "Please enter a valid phone number." },
      { status: 400 }
    );
  }

  if (!emailPattern.test(email) || email.length > 254) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  if (age === null) {
    return NextResponse.json({ error: "Please enter a valid age." }, { status: 400 });
  }

  // Captured before the auth update — this is what registration rows still hold.
  const previousEmail = user.email ?? "";

  // Update auth through the user's own session (not the service role) so the
  // secure email-change/confirmation flow still applies once it is enabled.
  const { data: updateData, error: updateError } = await supabase.auth.updateUser({
    email,
    data: {
      ...(user.user_metadata ?? {}),
      full_name: fullName,
      age,
      location,
      phone,
    },
  });

  if (updateError) {
    return NextResponse.json(
      { error: getAuthEmailErrorMessage(updateError.message) },
      { status: 400 }
    );
  }

  const emailRequiresConfirmation =
    email !== previousEmail && updateData.user?.email !== email;

  const { syncedCount, warnings } = await syncRegistrationProfile({
    userId: user.id,
    previousEmail,
    email: email.toLowerCase(),
    fullName,
    age,
    location,
    phone,
    yearsExperience: parseOptionalBoundedInt(user.user_metadata?.years_experience, {
      min: 0,
      max: 100,
    }),
    horseAge: parseOptionalBoundedInt(user.user_metadata?.horse_age, {
      min: 0,
      max: 60,
    }),
    horseBreed:
      typeof user.user_metadata?.horse_breed === "string"
        ? user.user_metadata.horse_breed.trim()
        : null,
  });

  return NextResponse.json({
    ok: true,
    emailRequiresConfirmation,
    syncedCount,
    warnings,
  });
}

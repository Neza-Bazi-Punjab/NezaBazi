import "server-only";

import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { escapeIlikePattern } from "@/lib/supabase/query";

type RegistrationProfile = {
  userId: string;
  previousEmail: string;
  email: string;
  fullName: string;
  age: number;
  location: string;
  phone: string;
  yearsExperience?: number | null;
  horseAge?: number | null;
  horseBreed?: string | null;
};

const getRegistrationConflictMessage = (error: {
  code?: string;
  message?: string;
  details?: string;
}) => {
  const errorText = [error.code, error.message, error.details]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const isConflict =
    error.code === "23505" ||
    errorText.includes("duplicate") ||
    errorText.includes("unique");

  if (isConflict && errorText.includes("email")) {
    return "this email is already registered to someone else.";
  }

  if (isConflict && errorText.includes("phone")) {
    return "this phone number is already registered to someone else.";
  }

  return error.message ?? "the update was rejected.";
};

export const syncRegistrationProfile = async ({
  userId,
  previousEmail,
  email,
  fullName,
  age,
  location,
  phone,
  yearsExperience,
  horseAge,
  horseBreed,
}: RegistrationProfile) => {
  const serviceSupabase = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const profileUpdates: Record<string, string | number> = {
    full_name: fullName,
    age,
    location,
    phone,
  };

  if (yearsExperience != null) {
    profileUpdates.years_experience = yearsExperience;
  }

  if (horseAge != null) {
    profileUpdates.horse_age = horseAge;
  }

  if (horseBreed != null && horseBreed !== "") {
    profileUpdates.horse_breed = horseBreed;
  }

  const warnings: string[] = [];
  let syncedCount = 0;
  const { data: soloRows, error: soloError } = await serviceSupabase
    .from("solo_registrations")
    .update(profileUpdates)
    .eq("profile_id", userId)
    .select("id");

  if (soloError) {
    warnings.push(
      `Your solo registration could not be updated: ${getRegistrationConflictMessage(soloError)}`
    );
  } else {
    syncedCount += (soloRows ?? []).length;
  }

  if (email !== previousEmail && previousEmail !== "") {
    const { error: soloEmailError } = await serviceSupabase
      .from("solo_registrations")
      .update({ email })
      .eq("profile_id", userId)
      .ilike("email", escapeIlikePattern(previousEmail));

    if (soloEmailError) {
      warnings.push(
        `Your solo registration email could not be updated: ${getRegistrationConflictMessage(soloEmailError)}`
      );
    }
  }

  if (previousEmail !== "") {
    const { data: memberRows, error: memberError } = await serviceSupabase
      .from("team_members")
      .update({ ...profileUpdates, email })
      .ilike("email", escapeIlikePattern(previousEmail))
      .select("id");

    if (memberError) {
      warnings.push(
        `Your team rider entry could not be updated: ${getRegistrationConflictMessage(memberError)}`
      );
    } else {
      syncedCount += (memberRows ?? []).length;
    }
  }

  return { syncedCount, warnings };
};

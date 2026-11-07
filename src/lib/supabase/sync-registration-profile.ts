import "server-only";

import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { escapeIlikePattern } from "@/lib/supabase/query";
import { HEADSHOT_BUCKET, PAPER_HEADSHOT_FOLDER, buildHeadshotPath } from "@/lib/headshots";

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
  // When false, only non-email fields are written to registration rows. Used
  // while an email change is awaiting confirmation, so an unconfirmed address
  // is never propagated onto registrations.
  syncEmail?: boolean;
  // The address Supabase Auth has confirmed for this user. Both callers check
  // hasConfirmedEmail first. Used only to claim a paper entry (below); never
  // pass an address the user has not confirmed.
  confirmedEmail?: string | null;
};

/* A paper entry (keyed in from the printed form at /admin/paper) has no
   account, so solo_registrations.profile_id is null and the update by
   profile_id below never reaches it. Once an administrator has replaced the
   placeholder with the rider's real address and the rider signs up and
   confirms that address, the row is claimed by it — the same email-identity
   rule that links team riders. Paper rows only (an online row always has its
   owner), only while unclaimed, and only when the user has no solo entry yet,
   so nobody ends up holding two. Best effort: a failure (including the paper
   migration not being applied yet) is logged and the sync carries on. */
const claimPaperSoloRegistration = async (
  serviceSupabase: SupabaseClient,
  userId: string,
  confirmedEmail: string
) => {
  const { count, error: countError } = await serviceSupabase
    .from("solo_registrations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", userId);

  if (countError || (count ?? 0) > 0) {
    return;
  }

  // `*` rather than naming headshot_path, so claiming still works on a
  // database where the paper-photo migration has not been run.
  const { data: claimed, error } = await serviceSupabase
    .from("solo_registrations")
    .update({ profile_id: userId })
    .is("profile_id", null)
    .eq("registration_source", "paper")
    .ilike("email", escapeIlikePattern(confirmedEmail))
    .select("*");

  if (error) {
    console.warn("Could not link a paper registration to the account", error.code);
    return;
  }

  for (const row of (claimed ?? []) as Array<Record<string, unknown>>) {
    await movePaperHeadshotToAccount(serviceSupabase, userId, row);
  }
};

/* A photo an administrator took for a rider with no account sits on the
   registration (`paper/<registration_id>/...`). Once the rider's account has
   claimed that entry, the photo becomes theirs like any other: copied into
   their own folder, recorded in their Auth metadata (so their account page,
   the check-in desk and the commentary panel all find it), and removed from
   the registration. If the account already has a photo of its own, that one
   wins and the registration's copy is left where it is. Best effort: on any
   failure the photo stays on the registration, where it is still shown. */
const movePaperHeadshotToAccount = async (
  serviceSupabase: SupabaseClient,
  userId: string,
  row: Record<string, unknown>
) => {
  const registrationId = typeof row.id === "string" ? row.id : null;
  const paperPath = typeof row.headshot_path === "string" ? row.headshot_path : null;

  if (!registrationId || !paperPath?.startsWith(`${PAPER_HEADSHOT_FOLDER}/${registrationId}/`)) {
    return;
  }

  try {
    const { data: userData, error: userError } =
      await serviceSupabase.auth.admin.getUserById(userId);

    if (userError || !userData?.user) {
      return;
    }

    const metadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;

    if (typeof metadata.headshot_path === "string" && metadata.headshot_path !== "") {
      return;
    }

    const accountPath = buildHeadshotPath(userId);
    const { error: copyError } = await serviceSupabase.storage
      .from(HEADSHOT_BUCKET)
      .copy(paperPath, accountPath);

    if (copyError) {
      console.warn("Could not copy a paper headshot to the account", copyError.message);
      return;
    }

    const { error: metadataError } = await serviceSupabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...metadata, headshot_path: accountPath },
    });

    if (metadataError) {
      await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([accountPath]);
      console.warn("Could not record the moved headshot on the account", metadataError.message);
      return;
    }

    await serviceSupabase
      .from("solo_registrations")
      .update({ headshot_path: null })
      .eq("id", registrationId);
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([paperPath]);
  } catch (moveError) {
    console.warn("Could not move a paper headshot to the account", moveError);
  }
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

const parseOptionalBoundedInt = (
  value: unknown,
  { min, max }: { min: number; max: number }
) => {
  if (value == null || value === "") {
    return null;
  }

  const normalized = String(value).trim();

  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
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
  syncEmail = true,
  confirmedEmail = null,
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

  if (confirmedEmail && confirmedEmail.trim() !== "") {
    await claimPaperSoloRegistration(serviceSupabase, userId, confirmedEmail.trim());
  }

  // The solo row belongs to this user (profile_id), so writing the current
  // confirmed email onto it is always safe and self-heals it after an email
  // change is confirmed. Skipped while a change is still pending confirmation.
  const soloUpdates = syncEmail ? { ...profileUpdates, email } : profileUpdates;
  const { data: soloRows, error: soloError } = await serviceSupabase
    .from("solo_registrations")
    .update(soloUpdates)
    .eq("profile_id", userId)
    .select("id");

  if (soloError) {
    warnings.push(
      `Your solo registration could not be updated: ${getRegistrationConflictMessage(soloError)}`
    );
  } else {
    syncedCount += (soloRows ?? []).length;
  }

  // Rider rows on any team are linked only by email, so they are matched by the
  // email the rows currently hold (previousEmail). The email column is only
  // rewritten once the new address is confirmed.
  if (previousEmail !== "") {
    const memberUpdates = syncEmail ? { ...profileUpdates, email } : profileUpdates;
    const { data: memberRows, error: memberError } = await serviceSupabase
      .from("team_members")
      .update(memberUpdates)
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

export const syncRegistrationProfileFromUser = async (user: User) => {
  if (!hasConfirmedEmail(user)) {
    return { error: "Confirm your email address before syncing registration details." } as const;
  }

  if (!user.email) {
    return { error: "Your account does not have an email address." } as const;
  }

  const metadata = user.user_metadata as AccountMetadata;
  const fullName =
    typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const location =
    typeof metadata.location === "string" ? metadata.location.trim() : "";
  const phone = typeof metadata.phone === "string" ? metadata.phone.trim() : "";
  const age = parseOptionalBoundedInt(metadata.age, { min: 1, max: 120 });

  if (!fullName || !location || !phone || age == null) {
    return {
      error: "Your account profile is incomplete and could not be synced.",
    } as const;
  }

  return syncRegistrationProfile({
    userId: user.id,
    previousEmail: user.email,
    email: user.email.trim().toLowerCase(),
    // hasConfirmedEmail(user) was checked above.
    confirmedEmail: user.email,
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
};

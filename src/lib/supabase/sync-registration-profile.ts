import "server-only";

import {
  createClient as createSupabaseAdminClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import { hasConfirmedEmail } from "@/lib/supabase/email-confirmation";
import { escapeIlikePattern } from "@/lib/supabase/query";
import { HEADSHOT_BUCKET, PAPER_HEADSHOT_FOLDER, buildHeadshotPath } from "@/lib/headshots";
import { isOwnRegistration, type RiderIdentity } from "@/lib/registration-identity";

/* A registration is a rider; the account is whoever entered it, and one
   account may have entered several riders. Account edits therefore reach only
   the account holder's own registration: the row whose email and full name
   were the account's before this edit (src/lib/registration-identity.ts).
   Never the other riders the account entered; an administrator edits those. */

/* While an email change waits for confirmation the holder's own rows keep the
   old address, so it is remembered in the account's metadata under this key
   (set by PATCH /api/account/profile). Once the new address is confirmed, the
   next sync still recognises the rows by it, moves them to the new address,
   and clears it. */
export const REGISTRATION_EMAIL_KEY = "registration_email";

type RegistrationProfile = {
  userId: string;
  // The account's current address as Supabase Auth holds it. Both callers
  // pass the verified user's email after checking hasConfirmedEmail, so it is
  // the only address trusted to find team rows (see below).
  previousEmail: string;
  // The account's full name before this edit: with previousEmail, what the
  // holder's own registration rows still hold.
  previousFullName: string;
  // The older address the holder's own rows may still hold after an email
  // change (REGISTRATION_EMAIL_KEY above), or null. It lives in user_metadata,
  // which the user can write from the browser, so it is used only for solo
  // rows, where `profile_id` already limits it to rows this account entered.
  registrationEmail?: string | null;
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
   owner), only while unclaimed, and only when the user has no solo entry of
   their own yet (riders they entered for others don't count), so nobody ends
   up holding two. Best effort: a failure (including the paper migration not
   being applied yet) is logged and the sync carries on. */
const claimPaperSoloRegistration = async (
  serviceSupabase: SupabaseClient,
  userId: string,
  confirmedEmail: string,
  fullName: string
) => {
  const { data: accountRows, error: readError } = await serviceSupabase
    .from("solo_registrations")
    .select("id, email, full_name")
    .eq("profile_id", userId);

  // A write decision, so the name must match too (registration-identity.ts).
  if (
    readError ||
    ((accountRows ?? []) as RiderIdentity[]).some((row) =>
      isOwnRegistration(row, { email: confirmedEmail, full_name: fullName })
    )
  ) {
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
   the registration. Only for the account holder's own entry (same email and
   full name as the account): a rider who is not the holder keeps the photo
   on their registration. If the account already has a photo of its own, that
   one wins and the registration's copy is left where it is. Best effort: on
   any failure the photo stays on the registration, where it is still shown. */
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

    if (!isOwnRegistration(row, { email: userData.user.email, full_name: metadata.full_name })) {
      return;
    }

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
  previousFullName,
  registrationEmail = null,
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
    await claimPaperSoloRegistration(serviceSupabase, userId, confirmedEmail.trim(), previousFullName);
  }

  const present = (address: string | null | undefined): address is string =>
    typeof address === "string" && address.trim() !== "";

  // Solo rows: the account's confirmed address or the remembered older one,
  // each with the name the account had before this edit. Safe for the
  // remembered address only because every solo row read here already belongs
  // to this account (profile_id).
  const soloEmails = [previousEmail, registrationEmail].filter(present);
  // Writes never relax the name, not even for the account's only row: that
  // row may be a child entered under a parent's email (registration-identity.ts).
  const isHoldersOwnSolo = (row: RiderIdentity) =>
    soloEmails.some((address) =>
      isOwnRegistration(row, { email: address, full_name: previousFullName })
    );

  // Team rows have no account id, so the email is all that ties them to a
  // person. Only addresses Supabase Auth has confirmed for this account may
  // find them, never the remembered registration_email: that is user-writable
  // metadata, and with it anyone who knew a rider's email and name could have
  // that rider's team row rewritten with their own details.
  const teamEmails = [...new Set([previousEmail, syncEmail ? email : null].filter(present))];
  const isHoldersOwnTeam = (row: RiderIdentity) =>
    teamEmails.some((address) =>
      isOwnRegistration(row, { email: address, full_name: previousFullName })
    );

  // Only the holder's own solo row, among the rows this account entered
  // (profile_id). Writing the current confirmed email onto it is safe and
  // self-heals it after an email change is confirmed. Skipped while a change
  // is still pending confirmation.
  const soloUpdates = syncEmail ? { ...profileUpdates, email } : profileUpdates;
  const { data: accountRows, error: accountRowsError } = await serviceSupabase
    .from("solo_registrations")
    .select("id, email, full_name")
    .eq("profile_id", userId);
  const ownSoloIds = ((accountRows ?? []) as Array<RiderIdentity & { id: string }>)
    .filter(isHoldersOwnSolo)
    .map((row) => row.id);

  if (accountRowsError) {
    warnings.push(
      `Your solo registration could not be updated: ${getRegistrationConflictMessage(accountRowsError)}`
    );
  } else if (ownSoloIds.length > 0) {
    const { data: soloRows, error: soloError } = await serviceSupabase
      .from("solo_registrations")
      .update(soloUpdates)
      .in("id", ownSoloIds)
      .eq("profile_id", userId)
      .select("id");

    if (soloError) {
      warnings.push(
        `Your solo registration could not be updated: ${getRegistrationConflictMessage(soloError)}`
      );
    } else {
      syncedCount += (soloRows ?? []).length;
    }
  }

  // Rider rows on any team are linked only by email, so they are found by the
  // email the rows currently hold (previousEmail), and only the holder's own
  // row (same name too) is written. The email column is only rewritten once
  // the new address is confirmed.
  const memberIds = new Set<string>();

  for (const address of teamEmails) {
    const { data: candidates, error: candidatesError } = await serviceSupabase
      .from("team_members")
      .select("id, email, full_name")
      .ilike("email", escapeIlikePattern(address));

    if (candidatesError) {
      warnings.push(
        `Your team rider entry could not be updated: ${getRegistrationConflictMessage(candidatesError)}`
      );
      continue;
    }

    for (const row of (candidates ?? []) as Array<RiderIdentity & { id: string }>) {
      if (isHoldersOwnTeam(row)) {
        memberIds.add(row.id);
      }
    }
  }

  if (memberIds.size > 0) {
    const memberUpdates = syncEmail ? { ...profileUpdates, email } : profileUpdates;
    const { data: memberRows, error: memberError } = await serviceSupabase
      .from("team_members")
      .update(memberUpdates)
      .in("id", [...memberIds])
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

/* After a confirmed email change has been carried onto the holder's own
   rows, the remembered old address is no longer needed. Best effort. */
const forgetRegistrationEmail = async (user: User) => {
  try {
    const serviceSupabase = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    await serviceSupabase.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata ?? {}), [REGISTRATION_EMAIL_KEY]: null },
    });
  } catch {
    console.warn("Could not clear the remembered registration email");
  }
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

  const registrationEmail =
    typeof user.user_metadata?.[REGISTRATION_EMAIL_KEY] === "string"
      ? (user.user_metadata[REGISTRATION_EMAIL_KEY] as string)
      : null;

  // Nothing in the account has changed here, so the holder's own rows are the
  // ones with the account's current name and email (or the remembered older
  // address, after an email change was confirmed).
  const result = await syncRegistrationProfile({
    userId: user.id,
    previousEmail: user.email,
    previousFullName: fullName,
    registrationEmail,
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

  if (registrationEmail && result.warnings.length === 0) {
    await forgetRegistrationEmail(user);
  }

  return result;
};

// An administrator adds, replaces or removes a rider's photo from the Solo
// riders list or the Teams list. `kind` says which: "solo" (the default, for
// a solo registration) or "team" (a team rider's row in team_members).
//
// A registration is a rider; its account is whoever entered it, and one
// account may have entered several riders. So where a photo goes is decided
// by one rule (src/lib/registration-identity.ts): only when the registration
// is the account holder's own (same email and full name as the account found
// by its profile_id) does the photo go onto the account, in their own folder
// and Auth metadata, exactly where their own upload would put it. Every other
// registration keeps its own photo on the row (`headshot_path`, under
// `paper/<registration_id>/`), so a photo of one rider can never appear on
// another. An account is never looked up by email to decide this.
//
// The registration's own photo is what staff screens show first, so a
// registration that already has one always has it replaced or removed there.
//
// Team riders have no account id on the row, so an administrator's photo for
// a team rider always goes onto the row (`team_members.headshot_path`, under
// `paper/<team_member_id>/`). A team rider's own account photo, shown when
// the row has none, is theirs to change under My Account; it is never
// removed from here.
//
// POST adds a first photo (audited `add_headshot`) or replaces the existing
// one (`replace_headshot`; the old object is deleted once the new one is
// recorded). DELETE removes the photo shown (`remove_headshot`). Every change
// is audited before anything is written.
import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  insertRequiredAuditLog,
  verifyAdminRequest,
} from "@/lib/admin/server";
import {
  forgetHeadshotUrl,
  forgetPaperHeadshotUrl,
  readOwnHeadshotPath,
  readPaperHeadshotPath,
} from "@/lib/admin/headshot-urls";
import {
  HEADSHOT_BUCKET,
  HEADSHOT_SIGNED_URL_SECONDS,
  HEADSHOT_UPLOAD_TYPE,
  buildHeadshotPath,
  buildPaperHeadshotPath,
} from "@/lib/headshots";
import { isOwnRegistration } from "@/lib/registration-identity";

export const dynamic = "force-dynamic";

/* Matches the bucket's own limit. The browser has already downscaled and
   re-encoded the photo, so a real upload is far below this. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

type ServiceClient = ReturnType<typeof createServiceRoleClient>;
type Actor = Parameters<typeof insertRequiredAuditLog>[1];
type Registration = Record<string, unknown>;

/* Which list the photo is for, and the table its row lives in. */
type RiderKind = "solo" | "team";

const tableFor = (kind: RiderKind) =>
  kind === "team" ? ("team_members" as const) : ("solo_registrations" as const);

/* Absent means solo, as before team photos existed. Anything else but the
   two kinds is a malformed request. */
const readKind = (value: unknown): RiderKind | null =>
  value === undefined || value === null || value === "solo"
    ? "solo"
    : value === "team"
      ? "team"
      : null;

/* The account holder, only when this registration is their own. `null` when
   the registration has no account or is a rider the account entered for
   someone else. A failed account read is an error, never a guess. */
type Holder = { profileId: string; metadata: Record<string, unknown> };

const findOwnHolder = async (
  serviceSupabase: ServiceClient,
  registration: Registration
): Promise<{ ok: true; holder: Holder | null } | { ok: false }> => {
  const profileId = typeof registration.profile_id === "string" ? registration.profile_id : null;

  if (!profileId) {
    return { ok: true, holder: null };
  }

  const { data, error } = await serviceSupabase.auth.admin.getUserById(profileId);

  if (error || !data?.user) {
    return { ok: false };
  }

  const metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  // An account that entered exactly one registration can only hold its own,
  // so a name an administrator corrected still counts. The count is read by
  // profile_id, never by email; a failed count is an error, not a guess.
  const { count, error: countError } = await serviceSupabase
    .from("solo_registrations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  if (countError) {
    return { ok: false };
  }

  const own = isOwnRegistration(
    registration,
    { email: data.user.email, full_name: metadata.full_name },
    { onlyRegistration: count === 1 }
  );

  return { ok: true, holder: own ? { profileId, metadata } : null };
};

const loadRegistration = async (
  serviceSupabase: ServiceClient,
  kind: RiderKind,
  registrationId: string
) =>
  serviceSupabase
    .from(tableFor(kind))
    // `*` rather than naming headshot_path, so the "needs a database update"
    // message below can be given instead of a query error.
    .select("*")
    .eq("id", registrationId)
    .maybeSingle();

const signedUrlFor = async (serviceSupabase: ServiceClient, path: string) => {
  const { data } = await serviceSupabase.storage
    .from(HEADSHOT_BUCKET)
    .createSignedUrl(path, HEADSHOT_SIGNED_URL_SECONDS);

  return data?.signedUrl ?? null;
};

const needsMigration = (kind: RiderKind) =>
  kind === "team"
    ? "Team rider photos need a database update first (supabase/migrations/20261108120000_shared_contact_details.sql)."
    : "Registration photos need a database update first (supabase/migrations/20261108100000_paper_rider_headshots.sql).";

export async function POST(request: Request) {
  const verification = await verifyAdminRequest();

  if (!verification.ok) {
    return verification.response;
  }

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return fail("Invalid request.", 400);
  }

  const registrationId = form.get("registrationId");
  const photo = form.get("photo");
  const kind = readKind(form.get("kind"));

  if (typeof registrationId !== "string" || !uuidPattern.test(registrationId) || !kind) {
    return fail("Invalid registration.", 400);
  }

  if (!(photo instanceof Blob) || photo.size === 0) {
    return fail("Choose a photo to upload.", 400);
  }

  if (photo.type !== HEADSHOT_UPLOAD_TYPE || photo.size > MAX_UPLOAD_BYTES) {
    return fail("That photo couldn't be processed. Try another one.", 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data: registration, error: registrationError } = await loadRegistration(
    serviceSupabase,
    kind,
    registrationId
  );

  if (registrationError) {
    return fail(registrationError.message, 400);
  }

  if (!registration) {
    return fail("That registration no longer exists. Refresh the list.", 404);
  }

  // A photo already on the registration is the one shown, so it is the one
  // replaced, whoever the registration belongs to. A team rider's photo
  // always goes onto the row.
  const registrationPath = readPaperHeadshotPath(registrationId, registration.headshot_path);

  if (kind === "solo" && !registrationPath) {
    const found = await findOwnHolder(serviceSupabase, registration);

    if (!found.ok) {
      return fail("This rider's account couldn't be checked. Try again.", 502);
    }

    if (found.holder) {
      return saveAccountHeadshot(serviceSupabase, verification.actor, registration, found.holder, photo);
    }
  }

  return saveRegistrationHeadshot(
    serviceSupabase,
    verification.actor,
    kind,
    registration,
    registrationPath,
    photo
  );
}

/* The account holder's own registration: the photo is the account's. */
const saveAccountHeadshot = async (
  serviceSupabase: ServiceClient,
  actor: Actor,
  registration: Registration,
  { profileId, metadata }: Holder,
  photo: Blob
) => {
  const registrationId = registration.id as string;
  const previousPath = readOwnHeadshotPath(profileId, metadata);
  const path = buildHeadshotPath(profileId);

  try {
    await insertRequiredAuditLog(serviceSupabase, actor, {
      action: previousPath ? "replace_headshot" : "add_headshot",
      target_table: "solo_registrations",
      target_id: registrationId,
      details: { rider: registration.full_name, stored_on: "account", profile_id: profileId },
    });
  } catch {
    return fail("The photo was not saved because its audit record could not be created.", 500);
  }

  const { error: uploadError } = await serviceSupabase.storage
    .from(HEADSHOT_BUCKET)
    .upload(path, photo, { contentType: HEADSHOT_UPLOAD_TYPE, upsert: false });

  if (uploadError) {
    return fail(uploadError.message, 500);
  }

  const { error: metadataError } = await serviceSupabase.auth.admin.updateUserById(profileId, {
    user_metadata: { ...metadata, headshot_path: path },
  });

  if (metadataError) {
    // Nothing points at the new object; don't leave it orphaned.
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([path]);
    return fail(metadataError.message, 500);
  }

  // Only once the account points at the new photo is the old one deleted.
  if (previousPath) {
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([previousPath]);
  }

  forgetHeadshotUrl(profileId);
  return NextResponse.json({ url: await signedUrlFor(serviceSupabase, path) });
};

/* Any other registration, and every team rider, keeps its own photo on the
   row. */
const saveRegistrationHeadshot = async (
  serviceSupabase: ServiceClient,
  actor: Actor,
  kind: RiderKind,
  registration: Registration,
  previousPath: string | null,
  photo: Blob
) => {
  const registrationId = registration.id as string;

  if (!("headshot_path" in registration)) {
    return fail(needsMigration(kind), 409);
  }

  const path = buildPaperHeadshotPath(registrationId);

  try {
    await insertRequiredAuditLog(serviceSupabase, actor, {
      action: previousPath ? "replace_headshot" : "add_headshot",
      target_table: tableFor(kind),
      target_id: registrationId,
      details: { rider: registration.full_name, stored_on: "registration" },
    });
  } catch {
    return fail("The photo was not saved because its audit record could not be created.", 500);
  }

  const { error: uploadError } = await serviceSupabase.storage
    .from(HEADSHOT_BUCKET)
    .upload(path, photo, { contentType: HEADSHOT_UPLOAD_TYPE, upsert: false });

  if (uploadError) {
    return fail(uploadError.message, 500);
  }

  // Written only if the row still holds the photo this request saw, so two
  // admins changing the same photo at once can't silently overwrite each other.
  const update = serviceSupabase
    .from(tableFor(kind))
    .update({ headshot_path: path })
    .eq("id", registrationId);
  const { data: updated, error: updateError } = await (previousPath
    ? update.eq("headshot_path", previousPath)
    : update.is("headshot_path", null)
  ).select("id");

  if (updateError || !updated || updated.length === 0) {
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([path]);
    return fail(
      updateError?.message ?? "This rider's photo was changed meanwhile. Refresh the list to see it.",
      updateError ? 500 : 409
    );
  }

  if (previousPath) {
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([previousPath]);
  }

  forgetPaperHeadshotUrl(registrationId);
  return NextResponse.json({ url: await signedUrlFor(serviceSupabase, path) });
};

/* Removes the photo the Solo riders list shows for this rider: the one on the
   registration if there is one, otherwise the account's, and the account's
   only for the account holder's own registration. Replies with the photo shown
   next, if any (the holder's account photo, once a registration photo has
   gone), so the list stays right. */
export async function DELETE(request: Request) {
  const verification = await verifyAdminRequest();

  if (!verification.ok) {
    return verification.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return fail("Invalid request.", 400);
  }

  const fields =
    typeof body === "object" && body !== null
      ? (body as { registrationId?: unknown; kind?: unknown })
      : {};
  const registrationId = fields.registrationId;
  const kind = readKind(fields.kind);

  if (typeof registrationId !== "string" || !uuidPattern.test(registrationId) || !kind) {
    return fail("Invalid registration.", 400);
  }

  const serviceSupabase = createServiceRoleClient();
  const { data: registration, error: registrationError } = await loadRegistration(
    serviceSupabase,
    kind,
    registrationId
  );

  if (registrationError) {
    return fail(registrationError.message, 400);
  }

  if (!registration) {
    return fail("That registration no longer exists. Refresh the list.", 404);
  }

  const registrationPath = readPaperHeadshotPath(registrationId, registration.headshot_path);

  // A team rider: only the row's own photo can be removed here.
  if (kind === "team" && !registrationPath) {
    return fail(
      "This photo is the rider's own account photo; they can change it under My Account. Add a photo here to show a different one.",
      409
    );
  }

  const found =
    kind === "solo"
      ? await findOwnHolder(serviceSupabase, registration)
      : ({ ok: true, holder: null } as const);

  if (!found.ok) {
    return fail("This rider's account couldn't be checked. Try again.", 502);
  }

  const holder = found.holder;
  const accountPath = holder ? readOwnHeadshotPath(holder.profileId, holder.metadata) : null;

  if (!registrationPath && !accountPath) {
    return fail("This rider has no photo. Refresh the list.", 404);
  }

  try {
    await insertRequiredAuditLog(serviceSupabase, verification.actor, {
      action: "remove_headshot",
      target_table: tableFor(kind),
      target_id: registrationId,
      details: {
        rider: registration.full_name,
        removed_from: registrationPath ? "registration" : "account",
      },
    });
  } catch {
    return fail("The photo was not removed because its audit record could not be created.", 500);
  }

  if (registrationPath) {
    // Cleared only if the row still holds the photo this request saw, as the
    // replace above: another administrator's newer photo is left alone.
    const { data: cleared, error: updateError } = await serviceSupabase
      .from(tableFor(kind))
      .update({ headshot_path: null })
      .eq("id", registrationId)
      .eq("headshot_path", registrationPath)
      .select("id");

    if (updateError) {
      return fail(updateError.message, 500);
    }

    if (!cleared || cleared.length === 0) {
      return fail("This rider's photo was changed meanwhile. Refresh the list to see it.", 409);
    }

    forgetPaperHeadshotUrl(registrationId);
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([registrationPath]);

    return NextResponse.json({
      url: accountPath ? await signedUrlFor(serviceSupabase, accountPath) : null,
    });
  }

  // Only reached for the account holder's own registration (accountPath is
  // null for anyone else).
  if (holder && accountPath) {
    const { error: metadataError } = await serviceSupabase.auth.admin.updateUserById(
      holder.profileId,
      { user_metadata: { ...holder.metadata, headshot_path: null } }
    );

    if (metadataError) {
      return fail(metadataError.message, 500);
    }

    forgetHeadshotUrl(holder.profileId);
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([accountPath]);
  }

  return NextResponse.json({ url: null });
}

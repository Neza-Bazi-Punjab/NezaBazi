// An administrator adds a headshot for a solo rider who has none, from the
// Solo riders list.
//
// A rider with an account: the photo is stored in their own folder and
// recorded in their Auth metadata, exactly where their own upload would put
// it, so their account page shows it and they can replace or remove it.
//
// A rider with no account (a paper entry, possibly with no phone or email):
// the photo is kept on the registration (`headshot_path`) and moves onto
// their account if they sign up later with the email on the entry.
//
// Either way an administrator can only fill an empty slot — an existing photo
// is never overwritten from here.
import { NextResponse } from "next/server";
import {
  createServiceRoleClient,
  insertRequiredAuditLog,
  verifyAdminRequest,
} from "@/lib/admin/server";
import {
  findProfileIdByEmail,
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

export const dynamic = "force-dynamic";

/* Matches the bucket's own limit. The browser has already downscaled and
   re-encoded the photo, so a real upload is far below this. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

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

  if (typeof registrationId !== "string" || !uuidPattern.test(registrationId)) {
    return fail("Invalid registration.", 400);
  }

  if (!(photo instanceof Blob) || photo.size === 0) {
    return fail("Choose a photo to upload.", 400);
  }

  if (photo.type !== HEADSHOT_UPLOAD_TYPE || photo.size > MAX_UPLOAD_BYTES) {
    return fail("That photo couldn't be processed. Try another one.", 400);
  }

  const serviceSupabase = createServiceRoleClient();

  const { data: registration, error: registrationError } = await serviceSupabase
    .from("solo_registrations")
    // `*` rather than naming headshot_path, so an account rider can still be
    // given a photo before the paper-photo migration has been run.
    .select("*")
    .eq("id", registrationId)
    .maybeSingle();

  if (registrationError) {
    return fail(registrationError.message, 400);
  }

  if (!registration) {
    return fail("That registration no longer exists. Refresh the list.", 404);
  }

  const profileId =
    (registration.profile_id as string | null) ??
    (await findProfileIdByEmail(serviceSupabase, registration.email as string));

  if (!profileId) {
    return addPaperHeadshot(serviceSupabase, verification.actor, registration, photo);
  }

  const { data: userData, error: userError } =
    await serviceSupabase.auth.admin.getUserById(profileId);

  if (userError || !userData?.user) {
    return fail("This rider's account couldn't be found.", 404);
  }

  const metadata = (userData.user.user_metadata ?? {}) as Record<string, unknown>;

  if (readOwnHeadshotPath(profileId, metadata)) {
    return fail("This rider already has a photo. Refresh the list to see it.", 409);
  }

  const path = buildHeadshotPath(profileId);

  try {
    await insertRequiredAuditLog(serviceSupabase, verification.actor, {
      action: "add_headshot",
      target_table: "solo_registrations",
      target_id: registrationId,
      details: { rider: registration.full_name, profile_id: profileId },
    });
  } catch {
    return fail("The photo was not added because its audit record could not be created.", 500);
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
    // Nothing points at the object; don't leave it orphaned.
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([path]);
    return fail(metadataError.message, 500);
  }

  forgetHeadshotUrl(profileId);

  return NextResponse.json({ url: await signedUrlFor(serviceSupabase, path) });
}

const signedUrlFor = async (
  serviceSupabase: ReturnType<typeof createServiceRoleClient>,
  path: string
) => {
  const { data } = await serviceSupabase.storage
    .from(HEADSHOT_BUCKET)
    .createSignedUrl(path, HEADSHOT_SIGNED_URL_SECONDS);

  return data?.signedUrl ?? null;
};

/* No account to hold the photo, so it is kept on the registration. */
const addPaperHeadshot = async (
  serviceSupabase: ReturnType<typeof createServiceRoleClient>,
  actor: Parameters<typeof insertRequiredAuditLog>[1],
  registration: Record<string, unknown>,
  photo: Blob
) => {
  const registrationId = registration.id as string;

  if (!("headshot_path" in registration)) {
    return fail(
      "Photos for riders without an account need a database update first (supabase/migrations/20261108100000_paper_rider_headshots.sql).",
      409
    );
  }

  if (readPaperHeadshotPath(registrationId, registration.headshot_path)) {
    return fail("This rider already has a photo. Refresh the list to see it.", 409);
  }

  const path = buildPaperHeadshotPath(registrationId);

  try {
    await insertRequiredAuditLog(serviceSupabase, actor, {
      action: "add_headshot",
      target_table: "solo_registrations",
      target_id: registrationId,
      details: { rider: registration.full_name, stored_on: "registration (no account)" },
    });
  } catch {
    return fail("The photo was not added because its audit record could not be created.", 500);
  }

  const { error: uploadError } = await serviceSupabase.storage
    .from(HEADSHOT_BUCKET)
    .upload(path, photo, { contentType: HEADSHOT_UPLOAD_TYPE, upsert: false });

  if (uploadError) {
    return fail(uploadError.message, 500);
  }

  // Only fills an empty slot, even if two admins add a photo at once.
  const { data: updated, error: updateError } = await serviceSupabase
    .from("solo_registrations")
    .update({ headshot_path: path })
    .eq("id", registrationId)
    .is("headshot_path", null)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    await serviceSupabase.storage.from(HEADSHOT_BUCKET).remove([path]);
    return fail(
      updateError?.message ?? "This rider already has a photo. Refresh the list to see it.",
      updateError ? 500 : 409
    );
  }

  forgetPaperHeadshotUrl(registrationId);
  return NextResponse.json({ url: await signedUrlFor(serviceSupabase, path) });
};

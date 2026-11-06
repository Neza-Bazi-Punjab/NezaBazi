// Short-lived display URLs for rider headshots, for staff screens: the
// commentary panel (src/lib/scoring/rider-detail.ts) and the check-in desk
// (/api/admin/check-in). Server only, through the service role; reached only
// after the caller's staff role has been verified.
import "server-only";

import type { ServiceRoleClient } from "@/lib/admin/server";
import { HEADSHOT_BUCKET, HEADSHOT_SIGNED_URL_SECONDS } from "@/lib/headshots";
import { escapeIlikePattern } from "@/lib/supabase/query";

/* The headshot lives in the rider's Auth metadata (`headshot_path`), so the
   lookup costs one Auth call and one signing call. Commentary state is
   fetched every few seconds and the check-in desk reloads a card after each
   change; a fresh signed URL each time would also make the <img> reload, so
   each profile's URL is cached for half its lifetime. */
const HEADSHOT_CACHE_MS = (HEADSHOT_SIGNED_URL_SECONDS * 1000) / 2;
const NO_HEADSHOT_CACHE_MS = 5 * 60 * 1000;
const HEADSHOT_CACHE_LIMIT = 500;
const headshotCache = new Map<string, { url: string | null; expiresAt: number }>();

/* `<profile_id>/<file>.jpg`, as buildHeadshotPath writes it. Auth metadata is
   writable by its owner, so the path is checked before it is signed: it must
   sit in that rider's own folder, or a rider could point their metadata at
   someone else's photo and have it shown under their name. */
const HEADSHOT_PATH_PATTERN = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/i;

export const getHeadshotUrl = async (
  client: ServiceRoleClient,
  profileId: string
): Promise<string | null> => {
  const cached = headshotCache.get(profileId);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  let url: string | null = null;
  let lifetime = NO_HEADSHOT_CACHE_MS;

  try {
    const { data, error } = await client.auth.admin.getUserById(profileId);
    const metadata = data?.user?.user_metadata as Record<string, unknown> | undefined;
    const path = typeof metadata?.headshot_path === "string" ? metadata.headshot_path : null;

    if (
      !error &&
      path &&
      HEADSHOT_PATH_PATTERN.test(path) &&
      path.split("/")[0].toLowerCase() === profileId.toLowerCase()
    ) {
      const signed = await client.storage
        .from(HEADSHOT_BUCKET)
        .createSignedUrl(path, HEADSHOT_SIGNED_URL_SECONDS);

      if (!signed.error && signed.data?.signedUrl) {
        url = signed.data.signedUrl;
        lifetime = HEADSHOT_CACHE_MS;
      }
    }
  } catch (error) {
    // A missing photo must never take a staff screen down.
    console.error("[headshots] headshot lookup failed", error);
  }

  if (headshotCache.size >= HEADSHOT_CACHE_LIMIT) {
    const oldest = headshotCache.keys().next().value;

    if (oldest !== undefined) {
      headshotCache.delete(oldest);
    }
  }

  headshotCache.set(profileId, { url, expiresAt: Date.now() + lifetime });
  return url;
};

/* The account behind an email address, found through a solo entry made under
   it (identity is the email address). A team rider other than the leader has
   no profile id of their own, so this is the only way to their photo short of
   scanning every Auth user; without a solo entry the photo is skipped. */
export const findProfileIdByEmail = async (
  client: ServiceRoleClient,
  email: string | null | undefined
): Promise<string | null> => {
  const address = email?.trim();

  if (!address) {
    return null;
  }

  const { data, error } = await client
    .from("solo_registrations")
    .select("profile_id")
    .ilike("email", escapeIlikePattern(address))
    .not("profile_id", "is", null)
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  const profileId = (data[0] as { profile_id: string | null }).profile_id;
  return typeof profileId === "string" ? profileId : null;
};

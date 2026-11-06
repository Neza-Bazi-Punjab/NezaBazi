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

/* Auth accounts by email address, for team riders who made their own
   account (the email in each team rider's code email invites them to) but
   hold no solo entry. Only one Auth listing call is needed at this event's
   size (about 150 accounts, one page of 1000), and it is cached briefly so a
   desk reloading a team card does not list every account each time. Only
   accounts whose email address has been confirmed count: otherwise anyone
   could sign up under a teammate's address, skip the confirmation link, and
   have their own photo shown under that teammate's name. */
const AUTH_EMAIL_CACHE_MS = 60 * 1000;
const AUTH_USERS_PER_PAGE = 1000;
let authEmailCache: { byEmail: Map<string, string>; expiresAt: number } | null = null;
let authEmailRequest: Promise<Map<string, string>> | null = null;

const loadConfirmedAuthEmails = async (
  client: ServiceRoleClient
): Promise<Map<string, string>> => {
  if (authEmailCache && authEmailCache.expiresAt > Date.now()) {
    return authEmailCache.byEmail;
  }

  /* A team card looks up up to four riders at once; share one listing. */
  if (authEmailRequest) {
    return authEmailRequest;
  }

  authEmailRequest = (async () => {
    const byEmail = new Map<string, string>();

    try {
      const { data, error } = await client.auth.admin.listUsers({
        page: 1,
        perPage: AUTH_USERS_PER_PAGE,
      });

      if (error) {
        throw error;
      }

      for (const user of data?.users ?? []) {
        const address = user.email?.trim().toLowerCase();

        if (address && user.email_confirmed_at && !byEmail.has(address)) {
          byEmail.set(address, user.id);
        }
      }

      authEmailCache = { byEmail, expiresAt: Date.now() + AUTH_EMAIL_CACHE_MS };
    } catch (error) {
      // A failed listing only means initials instead of a photo; not cached,
      // so the next card tries again.
      console.error("[headshots] auth account lookup failed", error);
    }

    return byEmail;
  })();

  try {
    return await authEmailRequest;
  } finally {
    authEmailRequest = null;
  }
};

/* The account behind an email address (identity is the email address). A team
   rider other than the leader has no profile id of their own on the row, so
   this is how their photo is found: first through a solo entry made under the
   email, then through an Auth account with that confirmed email. The photo
   itself is still only signed if it sits in that account's own folder
   (getHeadshotUrl). No match means no photo, and the desk shows initials. */
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

  if (!error && data && data.length > 0) {
    const profileId = (data[0] as { profile_id: string | null }).profile_id;

    if (typeof profileId === "string") {
      return profileId;
    }
  }

  const accounts = await loadConfirmedAuthEmails(client);
  return accounts.get(address.toLowerCase()) ?? null;
};

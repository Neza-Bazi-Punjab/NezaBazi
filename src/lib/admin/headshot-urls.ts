// Short-lived display URLs for rider headshots, for staff screens: the
// commentary panel (src/lib/scoring/rider-detail.ts) and the check-in desk
// (/api/admin/check-in). Server only, through the service role; reached only
// after the caller's staff role has been verified.
import "server-only";

import type { ServiceRoleClient } from "@/lib/admin/server";
import {
  HEADSHOT_BUCKET,
  HEADSHOT_SIGNED_URL_SECONDS,
  PAPER_HEADSHOT_FOLDER,
} from "@/lib/headshots";
import { escapeIlikePattern } from "@/lib/supabase/query";
import { isOwnRegistration, type RiderIdentity } from "@/lib/registration-identity";

/* An account's own photo lives in its Auth metadata (`headshot_path`), so the
   lookup costs one Auth call and one signing call. Commentary state is
   fetched every few seconds and the check-in desk reloads a card after each
   change; a fresh signed URL each time would also make the <img> reload, so
   each account's URL is cached for half its lifetime, together with the
   account's email and name, which decide whose photo it is (see
   getOwnAccountHeadshotUrl). */
const HEADSHOT_CACHE_MS = (HEADSHOT_SIGNED_URL_SECONDS * 1000) / 2;
const NO_HEADSHOT_CACHE_MS = 5 * 60 * 1000;
const HEADSHOT_CACHE_LIMIT = 500;

type CachedHeadshot = { url: string | null; account?: RiderIdentity; expiresAt: number };

const headshotCache = new Map<string, CachedHeadshot>();

const rememberHeadshot = (key: string, entry: CachedHeadshot) => {
  if (headshotCache.size >= HEADSHOT_CACHE_LIMIT) {
    const oldest = headshotCache.keys().next().value;

    if (oldest !== undefined) {
      headshotCache.delete(oldest);
    }
  }

  headshotCache.set(key, entry);
};

/* `<profile_id>/<file>.jpg`, as buildHeadshotPath writes it. Auth metadata is
   writable by its owner, so the path is checked before it is signed: it must
   sit in that rider's own folder, or a rider could point their metadata at
   someone else's photo and have it shown under their name. */
const HEADSHOT_PATH_PATTERN = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/i;

/* The account's photo URL (or null), with the account's email and name. */
const getAccountHeadshot = async (
  client: ServiceRoleClient,
  profileId: string
): Promise<{ url: string | null; account: RiderIdentity }> => {
  const cached = headshotCache.get(profileId);

  if (cached && cached.expiresAt > Date.now() && cached.account) {
    return { url: cached.url, account: cached.account };
  }

  let url: string | null = null;
  let account: RiderIdentity = {};
  let lifetime = NO_HEADSHOT_CACHE_MS;

  try {
    const { data, error } = await client.auth.admin.getUserById(profileId);
    const metadata = data?.user?.user_metadata as Record<string, unknown> | undefined;

    if (!error && data?.user) {
      account = { email: data.user.email ?? null, full_name: metadata?.full_name };
    }

    const path = error ? null : readOwnHeadshotPath(profileId, metadata);

    if (path) {
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

  rememberHeadshot(profileId, { url, account, expiresAt: Date.now() + lifetime });
  return { url, account };
};

/* The account's photo, but only for the account holder's own registration
   (same email and full name, see registration-identity.ts). An account that
   entered several riders has one account id on all of them; its holder's
   photo must never be shown as those riders'. `onlyRegistration`: the caller
   knows this is the account's only registration, so the name may differ. */
export const getOwnAccountHeadshotUrl = async (
  client: ServiceRoleClient,
  profileId: string,
  registration: RiderIdentity,
  { onlyRegistration = false }: { onlyRegistration?: boolean } = {}
): Promise<string | null> => {
  const { url, account } = await getAccountHeadshot(client, profileId);

  return url && isOwnRegistration(registration, account, { onlyRegistration }) ? url : null;
};

/* True when this account has entered exactly one solo registration. A failed
   count is "not known", which keeps the stricter name check. */
export const isOnlySoloRegistration = async (
  client: ServiceRoleClient,
  profileId: string
): Promise<boolean> => {
  const { count, error } = await client
    .from("solo_registrations")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);

  return !error && count === 1;
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

/* The account behind an email address, for team riders only (a solo rider's
   account is the registration's profile_id). A team rider other than the
   leader has no profile id of their own on the row, so this is how their
   photo is found: first through a solo entry made under the email, then
   through an Auth account with that confirmed email. Never enough on its own:
   getTeamRiderHeadshotUrl also requires the account's name to match the
   rider's, because solo entries made for other riders carry the entering
   account's id. Never used to decide where an upload goes. */
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

/* A team rider's photo: the row's own photo first (`team_members.headshot_path`,
   set by an administrator), then the leader's account (for the leader's row)
   or the accounts found by the rider's email, in that order, and only an
   account whose email and full name are the rider's. No match means
   initials. */
export const getTeamRiderHeadshotUrl = async (
  client: ServiceRoleClient,
  rider: {
    id?: string | null;
    email: string | null | undefined;
    full_name: string | null | undefined;
  },
  leaderProfileId: string | null
): Promise<string | null> => {
  const own = rider.id ? await getPaperHeadshotUrl(client, rider.id, "team") : null;

  if (own) {
    return own;
  }

  const address = rider.email?.trim().toLowerCase() ?? "";
  const candidates = [leaderProfileId, await findProfileIdByEmail(client, rider.email)];

  if (address) {
    candidates.push((await loadConfirmedAuthEmails(client)).get(address) ?? null);
  }

  for (const profileId of new Set(candidates)) {
    if (profileId) {
      const url = await getOwnAccountHeadshotUrl(client, profileId, rider);

      if (url) {
        return url;
      }
    }
  }

  return null;
};

/* Drop a profile's cached URL, after an administrator changes a photo, so the
   check-in desk and commentary panel on this instance pick it up at once. */
export const forgetHeadshotUrl = (profileId: string) => {
  headshotCache.delete(profileId);
};

/* A stored path is only trusted if it sits in its owner's own folder (see
   HEADSHOT_PATH_PATTERN above). */
export const readOwnHeadshotPath = (
  profileId: string,
  metadata: Record<string, unknown> | null | undefined
): string | null => {
  const path = typeof metadata?.headshot_path === "string" ? metadata.headshot_path : null;

  return path &&
    HEADSHOT_PATH_PATTERN.test(path) &&
    path.split("/")[0].toLowerCase() === profileId.toLowerCase()
    ? path
    : null;
};

/* A registration's own photo (`headshot_path` on the row, under
   `paper/<registration_id>/`; the folder name is historical, from when only
   paper riders had one). Trusted only inside that registration's own folder;
   the database enforces the same rule. */
export const readPaperHeadshotPath = (
  registrationId: string,
  path: unknown
): string | null => {
  if (typeof path !== "string") {
    return null;
  }

  const [folder, id, file, ...rest] = path.split("/");

  return folder === PAPER_HEADSHOT_FOLDER &&
    id?.toLowerCase() === registrationId.toLowerCase() &&
    rest.length === 0 &&
    /^[A-Za-z0-9._-]{1,200}$/.test(file ?? "")
    ? path
    : null;
};

const paperCacheKey = (registrationId: string) => `paper:${registrationId}`;

export const forgetPaperHeadshotUrl = (registrationId: string) => {
  headshotCache.delete(paperCacheKey(registrationId));
};

/* The photo stored on a registration row itself: a solo registration, or a
   team rider's row. Cached like the account photos (row ids are unique
   across both tables). Any failure, including the column not existing yet,
   is just "no photo". */
export const getPaperHeadshotUrl = async (
  client: ServiceRoleClient,
  registrationId: string,
  kind: "solo" | "team" = "solo"
): Promise<string | null> => {
  const key = paperCacheKey(registrationId);
  const cached = headshotCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  let url: string | null = null;
  let lifetime = NO_HEADSHOT_CACHE_MS;

  try {
    const { data, error } = await client
      .from(kind === "team" ? "team_members" : "solo_registrations")
      .select("headshot_path")
      .eq("id", registrationId)
      .maybeSingle();
    const path = error ? null : readPaperHeadshotPath(registrationId, data?.headshot_path);

    if (path) {
      const signed = await client.storage
        .from(HEADSHOT_BUCKET)
        .createSignedUrl(path, HEADSHOT_SIGNED_URL_SECONDS);

      if (!signed.error && signed.data?.signedUrl) {
        url = signed.data.signedUrl;
        lifetime = HEADSHOT_CACHE_MS;
      }
    }
  } catch (error) {
    console.error("[headshots] paper headshot lookup failed", error);
  }

  rememberHeadshot(key, { url, expiresAt: Date.now() + lifetime });
  return url;
};

/* A solo rider's photo for the staff screens: the registration's own photo
   first, then the account's, only when the registration is the account
   holder's own. */
export const getSoloHeadshotUrl = async (
  client: ServiceRoleClient,
  registration: {
    id: string;
    profile_id: string | null;
    email: string | null;
    full_name: string | null;
  }
): Promise<string | null> =>
  (await getPaperHeadshotUrl(client, registration.id)) ??
  (registration.profile_id
    ? await getOwnAccountHeadshotUrl(client, registration.profile_id, registration, {
        onlyRegistration: await isOnlySoloRegistration(client, registration.profile_id),
      })
    : null);

/* One rider, two entries: a rider who registered solo and is also on a team
   (Form teams copies the solo entry, and assign_confirmation_code gives the
   team place the same code) has a photo in either place. The check-in desk
   already treats them as one rider: the solo entry's photo first, then the
   team place's. These two do the same for the screens that look up one row. */

/* A solo rider's photo, or else their team place's own photo. */
export const getLinkedSoloHeadshotUrl = async (
  client: ServiceRoleClient,
  registration: {
    id: string;
    profile_id: string | null;
    email: string | null;
    full_name: string | null;
    confirmation_code?: string | null;
  }
): Promise<string | null> => {
  const own = await getSoloHeadshotUrl(client, registration);

  if (own || !registration.confirmation_code) {
    return own;
  }

  try {
    const { data } = await client
      .from("team_members")
      .select("id")
      .eq("confirmation_code", registration.confirmation_code)
      .limit(1);
    const twinId = (data?.[0] as { id?: string } | undefined)?.id;

    return twinId ? await getPaperHeadshotUrl(client, twinId, "team") : null;
  } catch {
    return null;
  }
};

/* A team rider's photo: their solo entry's first, then the team place's
   (getTeamRiderHeadshotUrl). */
export const getLinkedTeamRiderHeadshotUrl = async (
  client: ServiceRoleClient,
  rider: {
    id?: string | null;
    email: string | null | undefined;
    full_name: string | null | undefined;
    confirmation_code?: string | null;
  },
  leaderProfileId: string | null
): Promise<string | null> => {
  if (rider.confirmation_code) {
    try {
      const { data } = await client
        .from("solo_registrations")
        .select("id, profile_id, email, full_name")
        .eq("confirmation_code", rider.confirmation_code)
        .limit(1);
      const solo = data?.[0] as
        | { id: string; profile_id: string | null; email: string | null; full_name: string | null }
        | undefined;
      const url = solo ? await getSoloHeadshotUrl(client, solo) : null;

      if (url) {
        return url;
      }
    } catch {
      // Fall through to the team place's own photo.
    }
  }

  return getTeamRiderHeadshotUrl(client, rider, leaderProfileId);
};

/* A photo for a list's Photo column, and, when the photo shown belongs to
   the rider's other entry (or a rider with no photo has a solo entry), the
   row the cell's Add / Replace / Remove must act on instead of its own. */
export type SoloHeadshot = {
  url: string | null;
  target?: { kind: "solo" | "team"; id: string };
};

/* A rider's team place, for the Solo riders list, keyed by confirmation code. */
export type TeamTwin = { id: string; headshot_path?: string | null };


/* What loadAuthUserIndex finds: each account's own photo path (or null), with
   the account's email and name, which decide whether a registration is the
   account holder's own. */
export type AuthUserIndex = {
  accountById: Map<string, { path: string | null; email: string | null; full_name: unknown }>;
  /* Accounts by confirmed email address, for team riders (see
     loadConfirmedAuthEmails for why only confirmed ones). */
  confirmedIdByEmail: Map<string, string>;
};

/* Every Auth account's own photo path, email and name: what the Solo riders
   list needs from the Auth server, in one listing. A page starts this
   alongside its database reads (see AdminDashboardSection) rather than after
   them. Never rejects: a failed listing comes back as null, which only means
   no thumbnails. */
export const loadAuthUserIndex = async (
  client: ServiceRoleClient
): Promise<AuthUserIndex | null> => {
  try {
    const { data, error } = await client.auth.admin.listUsers({
      page: 1,
      perPage: AUTH_USERS_PER_PAGE,
    });

    if (error) {
      throw error;
    }

    const accountById: AuthUserIndex["accountById"] = new Map();
    const confirmedIdByEmail: AuthUserIndex["confirmedIdByEmail"] = new Map();

    for (const user of data?.users ?? []) {
      const metadata = user.user_metadata as Record<string, unknown> | undefined;
      const address = user.email?.trim().toLowerCase();

      accountById.set(user.id, {
        path: readOwnHeadshotPath(user.id, metadata),
        email: user.email ?? null,
        full_name: metadata?.full_name,
      });

      if (address && user.email_confirmed_at && !confirmedIdByEmail.has(address)) {
        confirmedIdByEmail.set(address, user.id);
      }
    }

    return { accountById, confirmedIdByEmail };
  } catch (error) {
    console.error("[headshots] solo list lookup failed", error);
    return null;
  }
};

export type SoloHeadshotRow = {
  id: string;
  profile_id: string | null;
  email: string;
  full_name: string;
  headshot_path?: string | null;
  confirmation_code?: string | null;
};

/* Which stored photo is each solo registration's, keyed by registration id
   (rows with no photo are left out). The registration's own photo first; the
   account's only for the account holder's own registration. `registrations`
   must be every solo registration: an account with one can only hold its
   own. With no index, only the registrations' own photos. The one rule for
   the admin Solo riders list (matchSoloHeadshots) and the broadcast photo
   index (src/lib/broadcast/photo-index.ts). Pure: no reads, no signing. */
export const chooseSoloHeadshotPaths = (
  index: AuthUserIndex | null,
  registrations: SoloHeadshotRow[]
): Map<string, string> => {
  const accountById = index?.accountById ?? new Map<string, never>();

  // How many registrations each account entered: the list is every solo
  // registration, so an account with one can only hold its own.
  const rowsByProfile = new Map<string, number>();

  for (const registration of registrations) {
    if (registration.profile_id) {
      rowsByProfile.set(
        registration.profile_id,
        (rowsByProfile.get(registration.profile_id) ?? 0) + 1
      );
    }
  }

  const pathByRegistration = new Map<string, string>();

  for (const registration of registrations) {
    const account = registration.profile_id
      ? accountById.get(registration.profile_id)
      : undefined;
    const path =
      readPaperHeadshotPath(registration.id, registration.headshot_path) ??
      (account &&
      isOwnRegistration(registration, account, {
        onlyRegistration: rowsByProfile.get(registration.profile_id ?? "") === 1,
      })
        ? account.path
        : null);

    if (path) {
      pathByRegistration.set(registration.id, path);
    }
  }

  return pathByRegistration;
};

/* Photos for the admin Solo riders list, keyed by registration id, from the
   account index above and one batch signing call for the whole list, rather
   than a lookup per rider. Which photo is whose: chooseSoloHeadshotPaths.
   With no index (the listing failed) the list gets no thumbnails at all, as
   before. A failure only means no thumbnails, never a broken page. */
export const matchSoloHeadshots = async (
  index: AuthUserIndex | null,
  registrations: SoloHeadshotRow[],
  client: ServiceRoleClient,
  /* The riders' team places by code: a photo taken on the Teams list (or
     at the desk on the team place) shows here when the entry has none, and
     Replace / Remove then act on the team place. */
  teamTwinByCode: Map<string, TeamTwin> = new Map()
): Promise<Record<string, SoloHeadshot>> => {
  const result: Record<string, SoloHeadshot> = {};

  if (!index) {
    return result;
  }

  try {
    const pathByRegistration = chooseSoloHeadshotPaths(index, registrations);

    for (const registration of registrations) {
      result[registration.id] = { url: null };

      const twin =
        !pathByRegistration.has(registration.id) && registration.confirmation_code
          ? teamTwinByCode.get(registration.confirmation_code)
          : undefined;
      const twinPath = twin ? readPaperHeadshotPath(twin.id, twin.headshot_path) : null;

      if (twin && twinPath) {
        pathByRegistration.set(registration.id, twinPath);
        result[registration.id].target = { kind: "team", id: twin.id };
      }
    }

    await signInto(client, pathByRegistration, result);
  } catch (error) {
    console.error("[headshots] solo list lookup failed", error);
  }

  return result;
};

/* One batch signing call for a list's photos, written into `result`. */
const signInto = async (
  client: ServiceRoleClient,
  pathByRow: Map<string, string>,
  result: Record<string, SoloHeadshot>
) => {
  const paths = Array.from(new Set(pathByRow.values()));

  if (paths.length === 0) {
    return;
  }

  const signed = await client.storage
    .from(HEADSHOT_BUCKET)
    .createSignedUrls(paths, HEADSHOT_SIGNED_URL_SECONDS);

  if (signed.error) {
    throw signed.error;
  }

  const urlByPath = new Map<string, string>();

  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      urlByPath.set(entry.path, entry.signedUrl);
    }
  }

  for (const [rowId, path] of pathByRow) {
    result[rowId].url = urlByPath.get(path) ?? null;
  }
};

type TeamHeadshotRow = {
  id: string;
  team_id: string;
  email: string;
  full_name: string;
  is_leader: boolean;
  headshot_path?: string | null;
  confirmation_code?: string | null;
};

/* Which stored photo is each team rider's, keyed by team_members id (riders
   with no photo are left out). The rider's own photo on the row first; then,
   as getTeamRiderHeadshotUrl does for the desk, the leader's account
   (leader's row only), an account behind a solo entry under the rider's
   email, or a confirmed account with that email, and only an account whose
   email and full name are the rider's. With no account index, only the
   riders' own photos. The one rule for the admin Teams list
   (matchTeamHeadshots) and the broadcast photo index
   (src/lib/broadcast/photo-index.ts). Pure: no reads, no signing. */
export const chooseTeamHeadshotPaths = (
  index: AuthUserIndex | null,
  members: TeamHeadshotRow[],
  leaderProfileByTeam: Map<string, string | null>,
  soloProfileByEmail: Map<string, string>
): Map<string, string> => {
  const pathByMember = new Map<string, string>();

  for (const member of members) {
    let path = readPaperHeadshotPath(member.id, member.headshot_path);

    if (!path && index) {
      const address = member.email?.trim().toLowerCase() ?? "";
      const candidates = [
        member.is_leader ? leaderProfileByTeam.get(member.team_id) ?? null : null,
        address ? soloProfileByEmail.get(address) ?? null : null,
        address ? index.confirmedIdByEmail.get(address) ?? null : null,
      ];

      for (const profileId of new Set(candidates)) {
        const account = profileId ? index.accountById.get(profileId) : undefined;

        if (account?.path && isOwnRegistration(member, account)) {
          path = account.path;
          break;
        }
      }
    }

    if (path) {
      pathByMember.set(member.id, path);
    }
  }

  return pathByMember;
};

/* Photos for the admin Teams list, keyed by team_members id, with one batch
   signing call. Which photo is whose: chooseTeamHeadshotPaths. Never
   throws. */
export const matchTeamHeadshots = async (
  index: AuthUserIndex | null,
  members: TeamHeadshotRow[],
  leaderProfileByTeam: Map<string, string | null>,
  soloProfileByEmail: Map<string, string>,
  client: ServiceRoleClient,
  /* Every solo registration, with its code: a rider's solo photo (same code;
     a team made on Form teams is a copy of the solo entry) shows first, as
     at the check-in desk, so a photo taken on the Solo riders list carries
     over to their team. Every one, because chooseSoloHeadshotPaths counts
     each account's entries. */
  soloRows: SoloHeadshotRow[] = []
): Promise<Record<string, SoloHeadshot>> => {
  const result: Record<string, SoloHeadshot> = {};

  try {
    for (const member of members) {
      result[member.id] = { url: null };
    }

    const pathByMember = chooseTeamHeadshotPaths(
      index,
      members,
      leaderProfileByTeam,
      soloProfileByEmail
    );
    const soloPaths = chooseSoloHeadshotPaths(index, soloRows);
    const soloTwinByCode = new Map<string, SoloHeadshotRow>();

    for (const row of soloRows) {
      if (row.confirmation_code && !soloTwinByCode.has(row.confirmation_code)) {
        soloTwinByCode.set(row.confirmation_code, row);
      }
    }

    for (const member of members) {
      const twin = member.confirmation_code
        ? soloTwinByCode.get(member.confirmation_code)
        : undefined;

      if (!twin) {
        continue;
      }

      const twinPath = soloPaths.get(twin.id);

      if (twinPath) {
        pathByMember.set(member.id, twinPath);
        result[member.id].target = { kind: "solo", id: twin.id };
      } else if (!pathByMember.has(member.id)) {
        // No photo anywhere: a new one goes on the solo entry, so it shows
        // in both lists (the desk's rule).
        result[member.id].target = { kind: "solo", id: twin.id };
      }
    }

    await signInto(client, pathByMember, result);
  } catch (error) {
    console.error("[headshots] team list lookup failed", error);
  }

  return result;
};

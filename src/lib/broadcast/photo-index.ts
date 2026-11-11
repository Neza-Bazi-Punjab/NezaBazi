// Every registered rider's photo, for the broadcast feeds and the ZIP.
//
// One in-memory index per server instance, rebuilt at most every 30 seconds,
// with one shared in-flight build. Storage paths only, never signed URLs: the
// feeds turn a path into a permanent signed link (photo-link.ts), so building
// the index costs four reads (solo_registrations, team_members, teams, and
// one Auth listing) and nothing per rider.
//
// Which photo is whose is the admin lists' rule, the same functions
// (chooseSoloHeadshotPaths / chooseTeamHeadshotPaths in headshot-urls.ts):
// a wrong face on air is the worst failure here.
//
// A rider's solo entry and team place (a team made on "Form teams" copies the
// solo entry, same confirmation_code) share one photo: linkSoloAndTeamPaths.
//
// Each photo also gets its public vMix name, "<Rider Name>.png"
// (assignVmixPhotoFiles, rows.ts), and `byVmixFile` finds the photo again
// from that name for /api/live/vmix/photo/<name>.
//
// A photo problem must never fail a feed. A failed rebuild keeps serving the
// previous index; with none, an empty one (or, when only the Auth listing
// failed, the registrations' own photos), retried soon after.
import "server-only";

import { createServiceRoleClient } from "@/lib/admin/server";
import {
  chooseSoloHeadshotPaths,
  chooseTeamHeadshotPaths,
  loadAuthUserIndex,
} from "@/lib/admin/headshot-urls";
import {
  assignVmixPhotoFiles,
  linkSoloAndTeamPaths,
  photoFileName,
  slugifyName,
  vmixPhotoLookupKey,
  type IndexedRider,
  type RiderPhoto,
  type VmixPhotoRider,
} from "@/lib/broadcast/rows";
import { fetchAllRows } from "@/lib/scoring/server";
import { entrantKeyForSolo, entrantKeyForTeam } from "@/lib/scoring/types";

export type PhotoIndex = {
  /* "solo:<solo_registrations id>" / "member:<team_members id>". */
  photos: Map<string, RiderPhoto>;
  riders: IndexedRider[];
  /* vmixPhotoLookupKey(vmix_file) → the storage path, for the public photo
     route. One name, one rider. */
  byVmixFile: Map<string, string>;
};

const INDEX_LIFETIME_MS = 30_000;
/* After a failure, try again soon rather than in 30 seconds. */
const RETRY_AFTER_MS = 5_000;
/* A feed waits at most this long for a rebuild when it has an older index to
   serve meanwhile; the build carries on and is used once it lands. */
const STALE_WAIT_MS = 3_000;
const FIRST_BUILD_WAIT_MS = 8_000;

const EMPTY_INDEX: PhotoIndex = { photos: new Map(), riders: [], byVmixFile: new Map() };

let current: { index: PhotoIndex; expiresAt: number } | null = null;
let building: Promise<PhotoIndex> | null = null;

type SoloRow = {
  id: string;
  profile_id: string | null;
  email: string | null;
  full_name: string | null;
  headshot_path: string | null;
  confirmation_code?: string | null;
};

type MemberRow = {
  id: string;
  team_id: string;
  email: string | null;
  full_name: string | null;
  is_leader: boolean | null;
  headshot_path: string | null;
  confirmation_code?: string | null;
};

type TeamRow = { id: string; team_name: string | null; leader_profile_id: string | null };

class PartialIndexError extends Error {
  constructor(readonly partial: PhotoIndex) {
    super("The account listing failed.");
  }
}

const SOLO_COLUMNS = "id, profile_id, email, full_name, headshot_path";
const MEMBER_COLUMNS = "id, team_id, email, full_name, is_leader, headshot_path";

const buildIndex = async (): Promise<PhotoIndex> => {
  const client = createServiceRoleClient();
  const readSolos = (columns: string) =>
    fetchAllRows<SoloRow>((from, to) =>
      client
        .from("solo_registrations")
        .select(columns)
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<SoloRow[], { merge: false }>()
    );
  const readMembers = (columns: string) =>
    fetchAllRows<MemberRow>((from, to) =>
      client
        .from("team_members")
        .select(columns)
        .order("id", { ascending: true })
        .range(from, to)
        .overrideTypes<MemberRow[], { merge: false }>()
    );
  /* With the confirmation code; should that read fail, without it (no
     linking) rather than no index. */
  const withCodeOrWithout = async (
    read: typeof readSolos | typeof readMembers,
    columns: string
  ) => {
    const result = await read(`${columns}, confirmation_code`);

    if (!result.error) {
      return result;
    }

    console.error("[broadcast] confirmation_code read failed; photos not linked", result.error.code ?? "unknown");
    return read(columns);
  };

  const [soloResult, memberResult, teamResult, authIndex] = await Promise.all([
    withCodeOrWithout(readSolos, SOLO_COLUMNS) as ReturnType<typeof readSolos>,
    withCodeOrWithout(readMembers, MEMBER_COLUMNS) as ReturnType<typeof readMembers>,
    fetchAllRows<TeamRow>((from, to) =>
      client
        .from("teams")
        .select("id, team_name, leader_profile_id")
        .order("id", { ascending: true })
        .range(from, to)
    ),
    loadAuthUserIndex(client),
  ]);

  const readError = soloResult.error ?? memberResult.error ?? teamResult.error;

  if (readError) {
    throw new Error(`Unable to read the registrations (${readError.code ?? "unknown"}).`);
  }

  const soloRows = soloResult.rows.map((row) => ({
    ...row,
    email: row.email ?? "",
    full_name: row.full_name ?? "",
  }));
  const memberRows = memberResult.rows.map((row) => ({
    ...row,
    email: row.email ?? "",
    full_name: row.full_name ?? "",
    is_leader: row.is_leader === true,
  }));
  const teamById = new Map(teamResult.rows.map((team) => [team.id, team]));

  /* As the admin Teams list builds them (AdminDashboardSection). */
  const leaderProfileByTeam = new Map(
    teamResult.rows.map((team) => [team.id, team.leader_profile_id ?? null])
  );
  const soloProfileByEmail = new Map<string, string>();

  for (const row of soloRows) {
    const address = row.email?.trim().toLowerCase();

    if (address && row.profile_id && !soloProfileByEmail.has(address)) {
      soloProfileByEmail.set(address, row.profile_id);
    }
  }

  const chosenSoloPaths = chooseSoloHeadshotPaths(authIndex, soloRows);
  const chosenMemberPaths = chooseTeamHeadshotPaths(
    authIndex,
    memberRows,
    leaderProfileByTeam,
    soloProfileByEmail
  );
  const linked = linkSoloAndTeamPaths(soloRows, memberRows, chosenSoloPaths, chosenMemberPaths);
  const soloPaths = linked.soloPaths;
  const memberPaths = linked.memberPaths;

  /* "<Rider Name>.png" for everyone registered (shared names counted over
     all of them), a solo entry and its team place being one rider. */
  const vmixRiders: VmixPhotoRider[] = [
    ...soloRows.map((row) => {
      const twin = linked.twinOfSolo.get(row.id);
      return { key: `solo:${row.id}`, id: row.id, name: row.full_name, twinKey: twin ? `member:${twin}` : undefined };
    }),
    ...memberRows.map((row) => {
      const twin = linked.twinOfMember.get(row.id);
      return { key: `member:${row.id}`, id: row.id, name: row.full_name, twinKey: twin ? `solo:${twin}` : undefined };
    }),
  ];
  const vmixFiles = assignVmixPhotoFiles(vmixRiders);
  const byVmixFile = new Map<string, string>();
  /* Names that would point at two different pictures: served for neither. */
  const conflicted = new Set<string>();

  const photos = new Map<string, RiderPhoto>();
  const riders: IndexedRider[] = [];
  const usedFiles = new Set<string>();

  /* Stable and unique: `<slug>-<first 8 of id>.jpg`, the whole id in the
     (very unlikely) case two riders share both. */
  const fileFor = (name: string, id: string) => {
    let file = photoFileName(name, id);

    if (usedFiles.has(file)) {
      file = `${slugifyName(name) || "rider"}-${id.toLowerCase().replace(/[^a-z0-9]/g, "")}.jpg`;
    }

    usedFiles.add(file);
    return file;
  };

  const add = (rider: Omit<IndexedRider, "photo">, path: string | undefined, id: string) => {
    const vmixFile = vmixFiles.get(rider.key);
    const photo: RiderPhoto | null = path
      ? { path, file: fileFor(rider.name, id), ...(vmixFile ? { vmix_file: vmixFile } : {}) }
      : null;

    if (photo && vmixFile) {
      const lookup = vmixPhotoLookupKey(vmixFile);
      const existing = byVmixFile.get(lookup);

      if (existing !== undefined && existing !== path) {
        conflicted.add(lookup);
      } else {
        byVmixFile.set(lookup, path!);
      }
    }

    if (photo) {
      photos.set(rider.key, photo);
    }

    riders.push({ ...rider, photo });
  };

  for (const row of soloRows) {
    add(
      {
        key: `solo:${row.id}`,
        kind: "solo",
        entrant_key: entrantKeyForSolo(row.id),
        name: row.full_name,
        team_name: "",
      },
      soloPaths.get(row.id),
      row.id
    );
  }

  for (const row of memberRows) {
    add(
      {
        key: `member:${row.id}`,
        kind: "team",
        entrant_key: entrantKeyForTeam(row.team_id),
        name: row.full_name,
        team_name: teamById.get(row.team_id)?.team_name ?? "",
      },
      memberPaths.get(row.id),
      row.id
    );
  }

  for (const lookup of conflicted) {
    byVmixFile.delete(lookup);
  }

  for (const photo of photos.values()) {
    if (photo.vmix_file && conflicted.has(vmixPhotoLookupKey(photo.vmix_file))) {
      delete photo.vmix_file;
    }
  }

  const index = { photos, riders, byVmixFile };

  if (!authIndex) {
    throw new PartialIndexError(index);
  }

  return index;
};

const rebuild = () => {
  if (!building) {
    building = (async () => {
      try {
        const index = await buildIndex();
        current = { index, expiresAt: Date.now() + INDEX_LIFETIME_MS };
        return index;
      } catch (error) {
        console.error("[broadcast] photo index rebuild failed", error instanceof Error ? error.message : error);

        if (current) {
          current = { index: current.index, expiresAt: Date.now() + RETRY_AFTER_MS };
          return current.index;
        }

        const fallback = error instanceof PartialIndexError ? error.partial : EMPTY_INDEX;
        current = { index: fallback, expiresAt: Date.now() + RETRY_AFTER_MS };
        return fallback;
      } finally {
        building = null;
      }
    })();
  }

  return building;
};

/* The index, never rejecting. `waitForBuild` (the ZIP, which is not on air):
   wait for a rebuild however long it takes instead of answering with an
   older or empty index. */
export const getPhotoIndex = async (
  { waitForBuild = false }: { waitForBuild?: boolean } = {}
): Promise<PhotoIndex> => {
  try {
    if (current && current.expiresAt > Date.now()) {
      return current.index;
    }

    const stale = current?.index ?? null;
    const fresh = rebuild();

    if (waitForBuild) {
      return await fresh;
    }

    /* Never hold a feed up for long on the photos: the older index meanwhile,
       or, before the first build lands, none (this response only). */
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<PhotoIndex>((resolve) => {
      timer = setTimeout(
        () => resolve(stale ?? EMPTY_INDEX),
        stale ? STALE_WAIT_MS : FIRST_BUILD_WAIT_MS
      );
    });

    try {
      return await Promise.race([fresh, waited]);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error("[broadcast] photo index unavailable", error instanceof Error ? error.message : error);
    return current?.index ?? EMPTY_INDEX;
  }
};

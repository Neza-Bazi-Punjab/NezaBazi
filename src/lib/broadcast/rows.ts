// Rows of the keyed broadcast feeds: the public vMix rows (vmix.ts) with the
// photo columns added (columns.ts), and the photo manifest.
//
// Same rules as the public feeds: every column on every row, strings never
// null, one empty row when there is nothing to show. A rider with no photo
// has all three photo columns empty. Sample riders are invented, so they all
// get one fixed placeholder picture.
//
// Pure: the photos come in as a lookup by rider ("solo:<id>" / "member:<id>",
// see photo-index.ts) and a link builder (photo-link.ts). Only modules the
// node test runner can load are imported, so the tests can load this file
// directly.
import { buildPhotoLink } from "./photo-link.ts";
import { justRodeRun, type PublicLiveState, type ScoringRound, type ScoringRun } from "../scoring/types.ts";
import type { VmixCurrentRow, VmixEntrantRow } from "../scoring/vmix.ts";

/* A rider's photo in the index: the storage path, the stable local file
   name the ZIP uses, and the name the public vMix feeds serve it under
   ("<Rider Name>.png", assignVmixPhotoFiles; absent when none was given). */
export type RiderPhoto = { path: string; file: string; vmix_file?: string };

export type RiderKey = `solo:${string}` | `member:${string}`;

export type PhotoContext = {
  /* The rider's photo, or undefined for none. */
  photoFor: (riderKey: string) => RiderPhoto | undefined;
  /* The absolute link for a storage path. */
  linkFor: (path: string) => string;
  /* `?photo_dir=`: the folder the unzipped photos sit in, or null. */
  photoDir: string | null;
  /* Absolute URL of the placeholder picture for sample riders. */
  samplePhotoUrl: string;
};

export type PhotoCells = { url: string; file: string; path: string };

const EMPTY_CELLS: PhotoCells = { url: "", file: "", path: "" };

/* The placeholder for sample riders: /icons/icon-512.png, already in public/. */
export const SAMPLE_PHOTO_PUBLIC_PATH = "/icons/icon-512.png";
export const SAMPLE_PHOTO_FILE = "sample-rider.png";

/* File names ------------------------------------------------------------------ */

const SLUG_MAX_LENGTH = 40;

/* Lower-case ASCII a-z, 0-9 and single hyphens, at most 40 characters; ""
   when nothing is left (a name in Gurmukhi, say). */
export const slugifyName = (name: string | null | undefined) =>
  (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");

/* `<name-slug>-<first 8 of row id>.jpg`, `rider` when the slug is empty. It
   does not change when the photo is replaced. */
export const photoFileName = (name: string | null | undefined, rowId: string) => {
  const slug = slugifyName(name) || "rider";
  const id = rowId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "0";
  return `${slug}-${id}.jpg`;
};

/* Public vMix photo names ------------------------------------------------------ */

/* The rider's name as a file name: characters unsafe in a Windows file name or
   a URL path (\ / : * ? " < > | % # and control characters) removed,
   whitespace collapsed and trimmed. "" when nothing is left. */
export const cleanVmixPhotoName = (name: string | null | undefined) =>
  (name ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|%#\u0000-\u001f\u007f-\u009f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/* How names are compared (the public photo route, and shared names):
   case-insensitive, NFC. */
export const vmixPhotoLookupKey = (file: string) => file.normalize("NFC").toLowerCase();

export type VmixPhotoRider = {
  /* "solo:<id>" / "member:<id>". */
  key: string;
  /* The registration row id (its first 4 characters tell two riders apart). */
  id: string;
  name: string;
  /* The key of the same rider's other entry (a solo entry and its team place
     share a confirmation code), or undefined. */
  twinKey?: string;
};

const compactId = (id: string, length?: number) => {
  const compact = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (length ? compact.slice(0, length) : compact) || "0";
};

/* The public file name of every rider in `riders`, by key: "<Rider Name>.png",
   or "<Rider Name> <first 4 of row id>.png" for EVERY rider whose cleaned name
   (case-insensitively) belongs to more than one rider. A solo entry and its
   team place with the same cleaned name are one rider: one file name (the
   solo entry's id), counted once. No two riders ever share a file name: a
   clash left after the suffix takes the whole id, and a clash after that gets
   no file name (so no photo on the public feeds) rather than a shared one. */
export const assignVmixPhotoFiles = (riders: readonly VmixPhotoRider[]): Map<string, string> => {
  const byKey = new Map(riders.map((rider) => [rider.key, rider]));
  const nameKey = (rider: VmixPhotoRider) => vmixPhotoLookupKey(cleanVmixPhotoName(rider.name));

  /* The entry that stands for the person: the solo entry of a twin pair with
     the same cleaned name, the entry itself otherwise. */
  const personOf = (rider: VmixPhotoRider) => {
    const twin = rider.twinKey ? byKey.get(rider.twinKey) : undefined;

    if (!twin || twin.key === rider.key || nameKey(twin) !== nameKey(rider)) {
      return rider;
    }

    if (rider.key.startsWith("solo:")) {
      return rider;
    }

    return twin.key.startsWith("solo:") || twin.key < rider.key ? twin : rider;
  };

  const peopleByName = new Map<string, Set<string>>();

  for (const rider of riders) {
    const people = peopleByName.get(nameKey(rider)) ?? new Set<string>();
    people.add(personOf(rider).key);
    peopleByName.set(nameKey(rider), people);
  }

  const fileByPerson = new Map<string, string | null>();
  const used = new Set<string>();
  const ordered = [...riders].sort((first, second) =>
    first.key < second.key ? -1 : first.key > second.key ? 1 : 0
  );

  for (const rider of ordered) {
    const person = personOf(rider);

    if (fileByPerson.has(person.key)) {
      continue;
    }

    const cleaned = cleanVmixPhotoName(person.name);
    const shared = !cleaned || (peopleByName.get(nameKey(person))?.size ?? 0) > 1;
    const base = cleaned || "Rider";
    const suffixed = [`${base} ${compactId(person.id, 4)}.png`, `${base} ${compactId(person.id)}.png`];
    const candidates = shared ? suffixed : [`${base}.png`, ...suffixed];
    const file = candidates.find((candidate) => !used.has(vmixPhotoLookupKey(candidate))) ?? null;

    if (file) {
      used.add(vmixPhotoLookupKey(file));
    }

    fileByPerson.set(person.key, file);
  }

  const files = new Map<string, string>();

  for (const rider of riders) {
    const file = fileByPerson.get(personOf(rider).key);

    if (file) {
      files.set(rider.key, file);
    }
  }

  return files;
};

/* Solo entry and team place --------------------------------------------------- */

type CodedRow = { id: string; confirmation_code?: string | null };

const codeOf = (row: CodedRow) => row.confirmation_code?.trim().toUpperCase() ?? "";

/* A team made on "Form teams" is a copy of the rider's solo entry, and both
   rows carry the same confirmation code: one rider, one photo. Applied after
   the admin lists' choice (chooseSoloHeadshotPaths / chooseTeamHeadshotPaths):
   - a team member takes the solo entry's photo first, then its own;
   - a solo entry with none takes its team place's photo.
   Empty codes never link; a code on more than one solo entry is ambiguous and
   links nothing; a solo entry only borrows when its team places hold exactly
   one photo between them. `twinOfMember` / `twinOfSolo` give the linked ids. */
export const linkSoloAndTeamPaths = (
  solos: readonly CodedRow[],
  members: readonly CodedRow[],
  soloPaths: ReadonlyMap<string, string>,
  memberPaths: ReadonlyMap<string, string>
) => {
  const solosByCode = new Map<string, string[]>();

  for (const row of solos) {
    const code = codeOf(row);

    if (code) {
      solosByCode.set(code, [...(solosByCode.get(code) ?? []), row.id]);
    }
  }

  const twinOfMember = new Map<string, string>();
  const membersBySolo = new Map<string, string[]>();

  for (const row of members) {
    const code = codeOf(row);
    const matches = code ? solosByCode.get(code) : undefined;

    if (matches?.length === 1) {
      twinOfMember.set(row.id, matches[0]);
      membersBySolo.set(matches[0], [...(membersBySolo.get(matches[0]) ?? []), row.id]);
    }
  }

  const linkedMemberPaths = new Map(memberPaths);

  for (const [memberId, soloId] of twinOfMember) {
    const soloPath = soloPaths.get(soloId);

    if (soloPath) {
      linkedMemberPaths.set(memberId, soloPath);
    }
  }

  const linkedSoloPaths = new Map(soloPaths);
  const twinOfSolo = new Map<string, string>();

  for (const [soloId, memberIds] of membersBySolo) {
    twinOfSolo.set(soloId, memberIds[0]);

    if (soloPaths.get(soloId)) {
      continue;
    }

    const paths = new Set(
      memberIds.map((id) => memberPaths.get(id)).filter((path): path is string => !!path)
    );

    if (paths.size === 1) {
      linkedSoloPaths.set(soloId, [...paths][0]);
    }
  }

  return { soloPaths: linkedSoloPaths, memberPaths: linkedMemberPaths, twinOfMember, twinOfSolo };
};

/* ?photo_dir= ----------------------------------------------------------------- */

const PHOTO_DIR_MAX_LENGTH = 200;

/* The folder, or null when absent, empty, longer than 200 characters or
   holding a control character. */
export const readPhotoDir = (url: URL): string | null => {
  const raw = url.searchParams.get("photo_dir");

  if (raw === null) {
    return null;
  }

  const folder = raw.trim();

  if (folder === "" || folder.length > PHOTO_DIR_MAX_LENGTH || /[\u0000-\u001f\u007f-\u009f]/.test(folder)) {
    return null;
  }

  return folder;
};

/* folder + "\" + file; "/" when the folder uses "/" (and no "\"); never a
   doubled separator. */
export const joinPhotoPath = (folder: string, file: string) => {
  if (folder.endsWith("\\") || folder.endsWith("/")) {
    return `${folder}${file}`;
  }

  const separator = folder.includes("/") && !folder.includes("\\") ? "/" : "\\";
  return `${folder}${separator}${file}`;
};

/* What a broadcast route builds its rows with: links from the request's own
   origin, signed with the key it was given. */
export const createPhotoContext = (
  url: URL,
  secret: string,
  photos: ReadonlyMap<string, RiderPhoto>
): PhotoContext => ({
  photoFor: (riderKey) => photos.get(riderKey),
  linkFor: (path) => buildPhotoLink(url.origin, secret, path),
  photoDir: readPhotoDir(url),
  samplePhotoUrl: `${url.origin}${SAMPLE_PHOTO_PUBLIC_PATH}`,
});

/* Cells ----------------------------------------------------------------------- */

export const photoCells = (photo: RiderPhoto | undefined | null, context: PhotoContext): PhotoCells =>
  photo
    ? {
        url: context.linkFor(photo.path),
        file: photo.file,
        path: context.photoDir ? joinPhotoPath(context.photoDir, photo.file) : "",
      }
    : EMPTY_CELLS;

export const samplePhotoCells = (context: PhotoContext): PhotoCells => ({
  url: context.samplePhotoUrl,
  file: SAMPLE_PHOTO_FILE,
  path: context.photoDir ? joinPhotoPath(context.photoDir, SAMPLE_PHOTO_FILE) : "",
});

/* The rider a run belongs to, as the photo index keys it. */
export const riderKeyForRun = (run: Pick<ScoringRun, "solo_registration_id" | "team_member_id"> | null | undefined): RiderKey | null => {
  if (run?.solo_registration_id) {
    return `solo:${run.solo_registration_id}`;
  }

  return run?.team_member_id ? `member:${run.team_member_id}` : null;
};

/* A run's photo: the sample placeholder for a sample rider, the index's photo
   otherwise, empty with no run. */
const cellsForRun = (run: ScoringRun | null | undefined, context: PhotoContext, sample: boolean): PhotoCells => {
  if (!run) {
    return EMPTY_CELLS;
  }

  if (sample) {
    return run.rider_name ? samplePhotoCells(context) : EMPTY_CELLS;
  }

  const key = riderKeyForRun(run);
  return key ? photoCells(context.photoFor(key), context) : EMPTY_CELLS;
};

/* current --------------------------------------------------------------------- */

/* The public feeds' own photo columns, which the keyed feeds leave out. */
type PublicPhotoColumn = "photo" | "photo_url" | "last_photo" | "last_photo_url";

const PUBLIC_PHOTO_KEYS = ["photo", "photo_url", "last_photo", "last_photo_url"] as const;

/* A copy of `row` without `keys`, the other keys in their order. */
const withoutKeys = <T extends object, K extends keyof T>(row: T, keys: readonly K[]): Omit<T, K> =>
  Object.fromEntries(
    Object.entries(row).filter(([key]) => !(keys as readonly PropertyKey[]).includes(key))
  ) as Omit<T, K>;

export type BroadcastCurrentRow = Omit<VmixCurrentRow, "sample" | PublicPhotoColumn> & {
  photo_url: string;
  photo_file: string;
  photo_path: string;
  last_photo_url: string;
  last_photo_file: string;
  last_photo_path: string;
  sample: VmixCurrentRow["sample"];
};

/* The runs the public current row names, from the same state: the rider on
   course (between riders, the one who has just ridden) and the last result. */
export const currentRowRuns = (state: PublicLiveState) => ({
  run: state.current_run ?? justRodeRun(state),
  last: state.last_scored_run,
});

export const toBroadcastCurrentRow = (
  base: VmixCurrentRow,
  state: PublicLiveState,
  context: PhotoContext,
  sample = false
): BroadcastCurrentRow => {
  const { run, last } = currentRowRuns(state);
  const photo = cellsForRun(run, context, sample);
  const lastPhoto = cellsForRun(last, context, sample);
  const { sample: sampleFlag, ...rest } = withoutKeys(base, PUBLIC_PHOTO_KEYS);

  return {
    ...rest,
    photo_url: photo.url,
    photo_file: photo.file,
    photo_path: photo.path,
    last_photo_url: lastPhoto.url,
    last_photo_file: lastPhoto.file,
    last_photo_path: lastPhoto.path,
    sample: sampleFlag,
  };
};

/* entrants -------------------------------------------------------------------- */

export type BroadcastEntrantRow = Omit<VmixEntrantRow, "sample" | "photo" | "photo_url"> & {
  photo_url: string;
  photo_file: string;
  photo_path: string;
  member_1_photo_url: string;
  member_2_photo_url: string;
  member_3_photo_url: string;
  member_4_photo_url: string;
  sample: VmixEntrantRow["sample"];
};

/* `base` is toVmixEntrantRows(round, runs, …) for the same round and runs.
   Single: the rider's photo in photo_*. Section: member_N_photo_url for the
   riders in the order of `members` (the order toVmixEntrantRows lists them:
   first appearance in run order). */
export const toBroadcastEntrantRows = (
  base: readonly VmixEntrantRow[],
  round: ScoringRound | null,
  runs: readonly ScoringRun[],
  context: PhotoContext,
  sample = false
): BroadcastEntrantRow[] => {
  const byEntrant = new Map<string, ScoringRun[]>();

  for (const run of [...runs].sort((first, second) => first.run_order - second.run_order)) {
    byEntrant.set(run.entrant_key, [...(byEntrant.get(run.entrant_key) ?? []), run]);
  }

  const section = round?.event_type === "section";

  return base.map((row) => {
    const entrantRuns = row.entrant_key ? byEntrant.get(row.entrant_key) ?? [] : [];
    let photo = EMPTY_CELLS;
    const memberUrls = ["", "", "", ""];

    if (entrantRuns.length > 0 && section) {
      /* One run per rider name, the first, as `members` is built. */
      const firstRunByName = new Map<string, ScoringRun>();

      for (const run of entrantRuns) {
        if (!firstRunByName.has(run.rider_name)) {
          firstRunByName.set(run.rider_name, run);
        }
      }

      [...firstRunByName.values()].slice(0, memberUrls.length).forEach((run, index) => {
        memberUrls[index] = cellsForRun(run, context, sample).url;
      });
    } else if (entrantRuns.length > 0) {
      photo = cellsForRun(entrantRuns[0], context, sample);
    }

    const { sample: sampleFlag, ...rest } = withoutKeys(row, ["photo", "photo_url"] as const);

    return {
      ...rest,
      photo_url: photo.url,
      photo_file: photo.file,
      photo_path: photo.path,
      member_1_photo_url: memberUrls[0],
      member_2_photo_url: memberUrls[1],
      member_3_photo_url: memberUrls[2],
      member_4_photo_url: memberUrls[3],
      sample: sampleFlag,
    };
  });
};

/* photos (the manifest) ------------------------------------------------------- */

/* One registered rider, as the photo index lists them. */
export type IndexedRider = {
  key: RiderKey;
  kind: "solo" | "team";
  entrant_key: string;
  name: string;
  team_name: string;
  photo: RiderPhoto | null;
};

export type BroadcastPhotoRow = {
  entrant_key: string;
  name: string;
  team_name: string;
  has_photo: "Yes" | "No" | "";
  photo_file: string;
  photo_url: string;
  photo_path: string;
};

export const EMPTY_BROADCAST_PHOTO_ROW: BroadcastPhotoRow = {
  entrant_key: "",
  name: "",
  team_name: "",
  has_photo: "",
  photo_file: "",
  photo_url: "",
  photo_path: "",
};

const byName = (first: IndexedRider, second: IndexedRider) =>
  first.name.localeCompare(second.name, "en", { sensitivity: "base" }) ||
  first.key.localeCompare(second.key);

/* Solo riders, then team riders, each by name. */
export const sortIndexedRiders = (riders: readonly IndexedRider[]) => [
  ...riders.filter((rider) => rider.kind === "solo").sort(byName),
  ...riders.filter((rider) => rider.kind === "team").sort(byName),
];

export const toBroadcastPhotoRows = (
  riders: readonly IndexedRider[],
  context: Pick<PhotoContext, "linkFor" | "photoDir">
): BroadcastPhotoRow[] => {
  if (riders.length === 0) {
    return [EMPTY_BROADCAST_PHOTO_ROW];
  }

  return sortIndexedRiders(riders).map((rider) => {
    const cells = photoCells(rider.photo, { ...context, photoFor: () => undefined, samplePhotoUrl: "" });

    return {
      entrant_key: rider.entrant_key,
      name: rider.name,
      team_name: rider.team_name,
      has_photo: rider.photo ? "Yes" : "No",
      photo_file: cells.file,
      photo_url: cells.url,
      photo_path: cells.path,
    };
  });
};

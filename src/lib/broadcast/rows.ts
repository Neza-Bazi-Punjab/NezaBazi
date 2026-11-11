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

/* A rider's photo in the index: the storage path, and the stable local file
   name the ZIP uses. */
export type RiderPhoto = { path: string; file: string };

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

export type BroadcastCurrentRow = Omit<VmixCurrentRow, "sample"> & {
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
  const { sample: sampleFlag, ...rest } = base;

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

export type BroadcastEntrantRow = Omit<VmixEntrantRow, "sample"> & {
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

    const { sample: sampleFlag, ...rest } = row;

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

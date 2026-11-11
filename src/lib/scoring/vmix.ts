// vMix Data Sources: flat rows built from the public live scoring data.
//
// vMix reads a URL on a refresh interval and binds title fields to columns of
// "rows" — each element of a JSON array, or each record of a CSV. It wants
// flat objects, and a binding breaks when a key goes missing, so every field
// is present on every response: empty string or 0, never null or absent. With
// nothing to show (scoring not set up, no live round) the response is still
// one row of empty values, so the schema vMix learned never changes.
//
// Every row also carries `sample`: "Yes" for the rehearsal rows of ?sample=1,
// ?sample=solo and ?sample=demo (vmix-sample.ts, vmix-sample-live.ts), "No"
// otherwise, so a title can show a SAMPLE badge.
//
// Everything here is derived from the scoring_* tables and the
// scoring_leaderboard view (assembled in server.ts), plus one thing from the
// photo index: each rider's photo name and link (`photo` / `photo_url`), passed
// in as a lookup (VmixPhotos) so these builders stay pure. No other
// registration data reaches a row. Without a lookup there are no photos.
import { NextResponse } from "next/server";
import { toCsv, type CsvValue } from "@/lib/scoring/csv";
import { POOL_LABEL_PATTERN, UUID_PATTERN } from "@/lib/scoring/validation";
import {
  RESULT_LABELS,
  shortLocation,
  type LeaderboardRow,
  type PublicLiveState,
  type ScoringRound,
  type ScoringRun,
} from "@/lib/scoring/types";
import { justRodeRun } from "@/lib/scoring/types";
import type { RoundRunSummary } from "@/lib/scoring/server";
import { SAMPLE_PHOTO_FILE, riderKeyForRun } from "@/lib/broadcast/rows";

export {
  VMIX_CURRENT_COLUMNS,
  VMIX_ENTRANTS_COLUMNS,
  VMIX_LEADERBOARD_COLUMNS,
  VMIX_ROUNDS_COLUMNS,
} from "@/lib/scoring/vmix-columns";

type SampleFlag = "Yes" | "No";

/* The rider photos a feed may name, from the photo index (public-photos.ts). */
export type VmixPhotos = {
  /* The rider's public file name ("<Rider Name>.png") by rider key
     ("solo:<id>" / "member:<id>"), or "" for none. */
  fileFor: (riderKey: string) => string;
  /* The absolute link for a file name. */
  urlFor: (file: string) => string;
  /* The absolute link of the placeholder for ?sample= riders, or "". */
  sampleUrl: string;
};

export const NO_VMIX_PHOTOS: VmixPhotos = { fileFor: () => "", urlFor: () => "", sampleUrl: "" };

type PhotoCells = { photo: string; photo_url: string };

const NO_PHOTO: PhotoCells = { photo: "", photo_url: "" };

/* A rider's photo cells. Sample riders are invented: one placeholder. Any
   problem with the lookup gives empty cells, never a failed feed. */
const photoCellsFor = (
  photos: VmixPhotos,
  riderKey: string | null,
  riderName: string | null | undefined,
  sample: boolean
): PhotoCells => {
  try {
    if (sample) {
      return riderName && photos.sampleUrl
        ? { photo: SAMPLE_PHOTO_FILE, photo_url: photos.sampleUrl }
        : NO_PHOTO;
    }

    if (!riderKey) {
      return NO_PHOTO;
    }

    const file = photos.fileFor(riderKey);

    if (!file) {
      return NO_PHOTO;
    }

    const url = photos.urlFor(file);
    return typeof file === "string" && typeof url === "string" && url
      ? { photo: file, photo_url: url }
      : NO_PHOTO;
  } catch {
    return NO_PHOTO;
  }
};

/* A run's rider, as the photo index keys them. */
const runPhotoCells = (
  photos: VmixPhotos,
  run: ScoringRun | null | undefined,
  sample: boolean
): PhotoCells => (run ? photoCellsFor(photos, riderKeyForRun(run), run.rider_name, sample) : NO_PHOTO);

/* A Single entrant ("solo:<id>") is its rider; a Section side has no one photo. */
const entrantPhotoKey = (entrantKey: string | null | undefined) =>
  entrantKey?.startsWith("solo:") ? entrantKey : null;

export type VmixCurrentRow = {
  round_name: string;
  event_type: string;
  round_number: number;
  pool_label: string;
  next_pool_label: string;
  rider_name: string;
  team_name: string;
  entrant_name: string;
  horse_name: string;
  location_short: string;
  attempt_number: number;
  attempts_per_rider: number;
  run_order: number;
  runs_total: number;
  display_mode: string;
  message: string;
  last_rider_name: string;
  last_team_name: string;
  last_entrant_name: string;
  last_result: string;
  last_points: number;
  last_scored_at: string;
  updated_at: string;
  photo: string;
  photo_url: string;
  last_photo: string;
  last_photo_url: string;
  sample: SampleFlag;
};

export type VmixLeaderboardRow = {
  rank: number;
  pool_rank: number;
  pool_label: string;
  name: string;
  team_name: string;
  horse_name: string;
  location_short: string;
  points: number;
  best_result: string;
  runs_scored: number;
  runs_total: number;
  advanced: string;
  photo: string;
  photo_url: string;
  sample: SampleFlag;
};

export type VmixEntrantRow = {
  entrant_key: string;
  pool_label: string;
  start_position: number;
  name: string;
  team_name: string;
  horse_name: string;
  location_short: string;
  /* Section: the four riders in riding order, joined with "; ". */
  members: string;
  runs_total: number;
  runs_scored: number;
  points: number;
  best_result: string;
  advanced: string;
  rank: number;
  pool_rank: number;
  photo: string;
  photo_url: string;
  sample: SampleFlag;
};

export type VmixRoundRow = {
  round_id: string;
  name: string;
  event_type: string;
  round_number: number;
  status: string;
  is_live: string;
  attempts_per_rider: number;
  target_points: number;
  pool_size: number;
  pool_count: number;
  entrants: number;
  runs_total: number;
  runs_scored: number;
  sample: SampleFlag;
};

const text = (value: string | null | undefined) => value ?? "";
const flag = (sample: boolean): SampleFlag => (sample ? "Yes" : "No");
const yesNo = (value: boolean | null | undefined) =>
  value === true ? "Yes" : value === false ? "No" : "";

/* `runCount` is the length of the current round's start list, from the same
   read that assembled the state. */
export const toVmixCurrentRow = (
  state: PublicLiveState,
  runCount: number,
  sample = false,
  photos: VmixPhotos = NO_VMIX_PHOTOS
): VmixCurrentRow => {
  const round = state.current_round;
  /* Between riders the feed keeps the rider who has just ridden, so the
     graphic never drops to an empty name while the judge readies the next. */
  const run = state.current_run ?? justRodeRun(state);
  const last = state.last_scored_run;
  /* A team round: the four riders go down the track together, so the feed
     names the team where it names the rider in singles. The broadcast's
     titles are bound to rider_name and last_rider_name, and show the team
     with no change on their side; a team has no one horse or photo. */
  const teamRun = Boolean(run?.team_name);
  const teamLast = Boolean(last?.team_name);
  const photo = teamRun ? NO_PHOTO : runPhotoCells(photos, run, sample);
  const lastPhoto = teamLast ? NO_PHOTO : runPhotoCells(photos, last, sample);

  return {
    round_name: text(round?.name),
    event_type: text(round?.event_type),
    round_number: round?.round_number ?? 0,
    pool_label: text(state.live?.called_pool_label),
    next_pool_label: text(state.next_pool_label),
    rider_name: text(run?.team_name ?? run?.rider_name),
    team_name: text(run?.team_name),
    /* Who is on the track: the team in a Section round (its riders go
       together), the rider otherwise. */
    entrant_name: text(run?.team_name ?? run?.rider_name),
    horse_name: teamRun ? "" : text(run?.horse_name),
    location_short: text(shortLocation(run?.rider_location)),
    attempt_number: run?.attempt_number ?? 0,
    attempts_per_rider: round?.attempts_per_rider ?? 0,
    run_order: run?.run_order ?? 0,
    runs_total: round ? runCount : 0,
    display_mode: text(state.live?.display_mode),
    message: text(state.live?.message),
    last_rider_name: text(last?.team_name ?? last?.rider_name),
    last_team_name: text(last?.team_name),
    last_entrant_name: text(last?.team_name ?? last?.rider_name),
    last_result: last?.result ? RESULT_LABELS[last.result] : "",
    last_points: last?.points ?? 0,
    last_scored_at: text(last?.scored_at),
    updated_at: text(state.live?.updated_at),
    photo: photo.photo,
    photo_url: photo.photo_url,
    last_photo: lastPhoto.photo,
    last_photo_url: lastPhoto.photo_url,
    sample: flag(sample),
  };
};

export const EMPTY_VMIX_LEADERBOARD_ROW: VmixLeaderboardRow = {
  rank: 0,
  pool_rank: 0,
  pool_label: "",
  name: "",
  team_name: "",
  horse_name: "",
  location_short: "",
  points: 0,
  best_result: "",
  runs_scored: 0,
  runs_total: 0,
  advanced: "",
  photo: "",
  photo_url: "",
  sample: "No",
};

const toVmixLeaderboardRow = (
  row: LeaderboardRow,
  sample: boolean,
  photos: VmixPhotos
): VmixLeaderboardRow => {
  const photoKey = entrantPhotoKey(row.entrant_key);
  const photo = photoKey ? photoCellsFor(photos, photoKey, row.name, sample) : NO_PHOTO;

  return {
    rank: row.rank,
    pool_rank: row.pool_rank,
    pool_label: text(row.pool_label),
    name: text(row.name),
    team_name: text(row.team_name),
    horse_name: text(row.horse_name),
    location_short: text(shortLocation(row.location)),
    points: row.points ?? 0,
    best_result: row.best_result ? RESULT_LABELS[row.best_result] : "",
    runs_scored: row.runs_scored ?? 0,
    runs_total: row.runs_total ?? 0,
    advanced: yesNo(row.advanced),
    photo: photo.photo,
    photo_url: photo.photo_url,
    sample: flag(sample),
  };
};

export const VMIX_LEADERBOARD_DEFAULT_LIMIT = 50;
export const VMIX_LEADERBOARD_MAX_LIMIT = 200;

export type VmixLeaderboardQuery = {
  /* A pool letter, or null for the whole round. "invalid" when the parameter
     was present but not a pool letter: nothing matches, the empty row is
     returned. */
  pool: string | null | "invalid";
  limit: number;
};

export const readVmixLeaderboardQuery = (url: URL): VmixLeaderboardQuery => {
  const rawPool = url.searchParams.get("pool");
  let pool: VmixLeaderboardQuery["pool"] = null;

  if (rawPool !== null && rawPool.trim() !== "") {
    const normalized = rawPool.trim().toUpperCase();
    pool = POOL_LABEL_PATTERN.test(normalized) ? normalized : "invalid";
  }

  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit >= 1
      ? Math.min(rawLimit, VMIX_LEADERBOARD_MAX_LIMIT)
      : VMIX_LEADERBOARD_DEFAULT_LIMIT;

  return { pool, limit };
};

export const toVmixLeaderboardRows = (
  state: PublicLiveState,
  query: VmixLeaderboardQuery,
  sample = false,
  photos: VmixPhotos = NO_VMIX_PHOTOS
): VmixLeaderboardRow[] => {
  if (query.pool === "invalid") {
    return [EMPTY_VMIX_LEADERBOARD_ROW];
  }

  const rows =
    query.pool === null
      ? [...state.leaderboard].sort((first, second) => first.rank - second.rank)
      : state.leaderboard
          .filter((row) => row.pool_label === query.pool)
          .sort((first, second) => first.pool_rank - second.pool_rank);

  const flat = rows.slice(0, query.limit).map((row) => toVmixLeaderboardRow(row, sample, photos));
  return flat.length > 0 ? flat : [EMPTY_VMIX_LEADERBOARD_ROW];
};

/* Entrants ------------------------------------------------------------------- */

export const EMPTY_VMIX_ENTRANT_ROW: VmixEntrantRow = {
  entrant_key: "",
  pool_label: "",
  start_position: 0,
  name: "",
  team_name: "",
  horse_name: "",
  location_short: "",
  members: "",
  runs_total: 0,
  runs_scored: 0,
  points: 0,
  best_result: "",
  advanced: "",
  rank: 0,
  pool_rank: 0,
  photo: "",
  photo_url: "",
  sample: "No",
};

/* ?round=<round_id>: "invalid" when present but not an id (nothing matches,
   the empty row is returned); null when absent (the live round). */
export const readVmixRoundParam = (url: URL): string | null | "invalid" => {
  const raw = url.searchParams.get("round");

  if (raw === null || raw.trim() === "") {
    return null;
  }

  const normalized = raw.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : "invalid";
};

/* One row per entrant in start order (the run_order of their first run). */
export const toVmixEntrantRows = (
  round: ScoringRound | null,
  runs: readonly ScoringRun[],
  leaderboard: readonly LeaderboardRow[],
  sample = false,
  photos: VmixPhotos = NO_VMIX_PHOTOS
): VmixEntrantRow[] => {
  if (!round || runs.length === 0) {
    return [EMPTY_VMIX_ENTRANT_ROW];
  }

  const byEntrant = new Map<string, ScoringRun[]>();

  for (const run of [...runs].sort((first, second) => first.run_order - second.run_order)) {
    byEntrant.set(run.entrant_key, [...(byEntrant.get(run.entrant_key) ?? []), run]);
  }

  const standings = new Map(leaderboard.map((row) => [row.entrant_key, row]));
  const section = round.event_type === "section";

  return [...byEntrant.entries()].map(([entrantKey, entrantRuns]) => {
    const first = entrantRuns[0];
    const standing = standings.get(entrantKey);
    const riders = section ? [...new Set(entrantRuns.map((run) => run.rider_name))] : [];
    /* A Single entrant's rider; a Section side has no one photo. */
    const photo = section ? NO_PHOTO : runPhotoCells(photos, first, sample);

    return {
      entrant_key: entrantKey,
      pool_label: text(first.pool_label),
      start_position: first.run_order,
      name: section ? text(first.team_name ?? first.rider_name) : first.rider_name,
      team_name: text(first.team_name),
      horse_name: section ? "" : text(first.horse_name),
      location_short: text(shortLocation(first.rider_location)),
      members: riders.join("; "),
      runs_total: entrantRuns.filter((run) => run.status !== "void").length,
      runs_scored: entrantRuns.filter((run) => run.status === "scored").length,
      points: standing?.points ?? 0,
      best_result: standing?.best_result ? RESULT_LABELS[standing.best_result] : "",
      advanced: yesNo(standing?.advanced),
      rank: standing?.rank ?? 0,
      pool_rank: standing?.pool_rank ?? 0,
      photo: photo.photo,
      photo_url: photo.photo_url,
      sample: flag(sample),
    };
  });
};

/* Rounds ---------------------------------------------------------------------- */

export const EMPTY_VMIX_ROUND_ROW: VmixRoundRow = {
  round_id: "",
  name: "",
  event_type: "",
  round_number: 0,
  status: "",
  is_live: "",
  attempts_per_rider: 0,
  target_points: 0,
  pool_size: 0,
  pool_count: 0,
  entrants: 0,
  runs_total: 0,
  runs_scored: 0,
  sample: "No",
};

export const toVmixRoundRows = (
  rounds: readonly ScoringRound[],
  runs: readonly RoundRunSummary[],
  liveRoundId: string | null,
  sample = false
): VmixRoundRow[] => {
  if (rounds.length === 0) {
    return [EMPTY_VMIX_ROUND_ROW];
  }

  return [...rounds]
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((round) => {
      const roundRuns = runs.filter((run) => run.round_id === round.id);

      return {
        round_id: round.id,
        name: round.name,
        event_type: round.event_type,
        round_number: round.round_number,
        status: round.status,
        is_live: round.id === liveRoundId ? "Yes" : "No",
        attempts_per_rider: round.attempts_per_rider,
        target_points: round.target_points ?? 0,
        pool_size: round.pool_size ?? 0,
        pool_count: new Set(
          roundRuns.map((run) => run.pool_label).filter((label): label is string => !!label)
        ).size,
        entrants: new Set(roundRuns.map((run) => run.entrant_key)).size,
        runs_total: roundRuns.filter((run) => run.status !== "void").length,
        runs_scored: roundRuns.filter((run) => run.status === "scored").length,
        sample: flag(sample),
      };
    });
};

/* Query and response ---------------------------------------------------------- */

export const wantsCsv = (url: URL) =>
  url.searchParams.get("format")?.trim().toLowerCase() === "csv";

/* ?sample=1 (or true / yes): the frozen rehearsal rows; ?sample=solo: the
   moving ones of vmix-sample-live.ts while the admin switch is on;
   ?sample=demo: the organisers' shared demo, as the judges drive it on
   /judge/demo (invented riders, read from the practice row only). Never the
   scoring data. */
export const wantsSample = (url: URL) =>
  ["1", "true", "yes", "solo", "demo"].includes(
    url.searchParams.get("sample")?.trim().toLowerCase() ?? ""
  );

/* JSON array (one element per row) or CSV with a header row. */
export const vmixResponse = (
  columns: readonly string[],
  rows: readonly Readonly<Record<string, CsvValue>>[],
  csv: boolean,
  cacheControl: string
) => {
  if (csv) {
    return new NextResponse(toCsv(columns, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": cacheControl,
      },
    });
  }

  return NextResponse.json(rows, { headers: { "Cache-Control": cacheControl } });
};

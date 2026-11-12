/* Every number the Stats page shows, worked out from a season file's facts.
   Pure: no React, no I/O, so it is unit-tested directly (compute.test.mts).

   The rules (see docs/superpowers/specs/2026-11-11-stats-page.md):
   - Points: carry 4, strike 2, miss 0.
   - An "unknown" run counts as ridden, scores 0, and is left out of both
     percentages and of points per run.
   - A team ride with points: null counts as a ride and is left out of the
     best ride and the full houses. Teams were placed on each round's result,
     so there is no running team total. */

import {
  RESULT_POINTS,
  SINGLE_STAGES,
  TEAM_STAGES,
  type SeasonStats,
  type SingleStage,
  type StatRider,
  type StatTeam,
  type TeamStage,
} from "./types.ts";

/* A stage's points: undefined = not ridden, null = ridden but no result is
   known, a number = the points scored in it. */
export type StageCell = number | null | undefined;

export interface RiderRow {
  id: string;
  name: string;
  horse: string | null;
  location: string | null;
  /* The last part of the location (state or province), or null. */
  state: string | null;
  runs: number;
  carries: number;
  strikes: number;
  misses: number;
  /* Runs ridden whose result was not recorded. */
  unknown: number;
  /* Runs with a known result (runs - unknown). */
  known: number;
  points: number;
  pointsPerRun: number | null;
  carryRate: number | null;
  hitRate: number | null;
  stages: Record<SingleStage, StageCell>;
  reached: SingleStage | null;
  /* Index of `reached` in SINGLE_STAGES, -1 when the rider rode nothing. */
  reachedIndex: number;
  place: 1 | 2 | 3 | null;
  rank: number;
}

export interface TeamRow {
  id: string;
  name: string;
  riders: { name: string; horse: string | null }[];
  rides: number;
  /* The highest recorded ride total, for the Best ride tile. */
  best: number | null;
  fullHouses: number;
  stages: Record<TeamStage, StageCell>;
  reached: TeamStage | null;
  reachedIndex: number;
  place: 1 | 2 | 3 | null;
  rank: number;
}

export const FULL_HOUSE = 16;

export const SINGLE_STAGE_LABELS: Record<SingleStage, string> = {
  qualification: "Qualification",
  aarhi1: "Aarhi round 1",
  aarhi2: "Aarhi round 2",
  // One ride for first place or for third place, not a round everyone rode.
  final: "Placing ride",
};

export const TEAM_STAGE_LABELS: Record<TeamStage, string> = {
  round1: "Round 1",
  round2: "Round 2",
  third: "3rd place ride-off",
  final1: "Final",
  // The final finished level, so both teams rode again.
  final2: "Final tie-break",
};

/* ---------- riders ---------- */

export function stateOf(location: string | null): string | null {
  if (!location) return null;
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

const rate = (count: number, of: number) => (of > 0 ? count / of : null);

export function riderNumbers(rider: StatRider): Omit<RiderRow, "rank"> {
  let carries = 0;
  let strikes = 0;
  let misses = 0;
  let unknown = 0;
  let reachedIndex = -1;
  const stages = Object.fromEntries(SINGLE_STAGES.map((stage) => [stage, undefined])) as Record<
    SingleStage,
    StageCell
  >;

  for (const run of rider.runs) {
    if (run.result === "carry") carries += 1;
    else if (run.result === "strike") strikes += 1;
    else if (run.result === "miss") misses += 1;
    else unknown += 1;

    reachedIndex = Math.max(reachedIndex, SINGLE_STAGES.indexOf(run.stage));

    const before = stages[run.stage];
    if (run.result === "unknown") {
      // Ridden, no result: a dash unless another run in the stage is known.
      if (before === undefined) stages[run.stage] = null;
    } else {
      stages[run.stage] = (before ?? 0) + RESULT_POINTS[run.result];
    }
  }

  const runs = rider.runs.length;
  const known = runs - unknown;
  const points = carries * RESULT_POINTS.carry + strikes * RESULT_POINTS.strike;

  return {
    id: rider.id,
    name: rider.name,
    horse: rider.horse,
    location: rider.location,
    state: stateOf(rider.location),
    runs,
    carries,
    strikes,
    misses,
    unknown,
    known,
    points,
    pointsPerRun: rate(points, known),
    carryRate: rate(carries, known),
    hitRate: rate(carries + strikes, known),
    stages,
    reached: reachedIndex >= 0 ? SINGLE_STAGES[reachedIndex] : null,
    reachedIndex,
    place: rider.place,
  };
}

const placeKey = (place: 1 | 2 | 3 | null) => place ?? 4;

/* Rank order without the name: the parts that decide a rank number. */
function riderRankParts(row: Omit<RiderRow, "rank">): number[] {
  const reachedPoints = row.reached ? (row.stages[row.reached] ?? 0) : 0;
  return [
    placeKey(row.place),
    -row.reachedIndex,
    -reachedPoints,
    -row.points,
    -(row.carryRate ?? -1),
  ];
}

/* No running total here: teams were placed on each round's result. */
function teamRankParts(row: Omit<TeamRow, "rank">): number[] {
  const reachedPoints = row.reached ? (row.stages[row.reached] ?? 0) : 0;
  return [placeKey(row.place), -row.reachedIndex, -reachedPoints];
}

const compareParts = (a: number[], b: number[]) => {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

export const compareNames = (a: string, b: string) =>
  a.localeCompare(b, "en", { sensitivity: "base" });

/* Sorts into rank order and gives each row its rank. Rows level on every
   rank part share a number (1, 2, 2, 4); the name only orders them. */
function assignRanks<T extends { name: string; id: string }>(
  rows: T[],
  parts: (row: T) => number[]
): (T & { rank: number })[] {
  const keyed = rows.map((row) => ({ row, key: parts(row) }));
  keyed.sort(
    (a, b) =>
      compareParts(a.key, b.key) || compareNames(a.row.name, b.row.name) || compareNames(a.row.id, b.row.id)
  );

  let rank = 0;
  return keyed.map((entry, index) => {
    if (index === 0 || compareParts(keyed[index - 1].key, entry.key) !== 0) rank = index + 1;
    return { ...entry.row, rank };
  });
}

/* All riders in rank order, each with a rank. */
export function riderRows(season: Pick<SeasonStats, "riders">): RiderRow[] {
  return assignRanks(season.riders.map(riderNumbers), riderRankParts);
}

/* ---------- teams ---------- */

export function teamNumbers(team: StatTeam): Omit<TeamRow, "rank"> {
  let best: number | null = null;
  let fullHouses = 0;
  let reachedIndex = -1;
  const stages = Object.fromEntries(TEAM_STAGES.map((stage) => [stage, undefined])) as Record<
    TeamStage,
    StageCell
  >;

  for (const ride of team.rides) {
    reachedIndex = Math.max(reachedIndex, TEAM_STAGES.indexOf(ride.stage));
    const before = stages[ride.stage];
    if (ride.points === null) {
      if (before === undefined) stages[ride.stage] = null;
      continue;
    }
    stages[ride.stage] = (before ?? 0) + ride.points;
    best = best === null ? ride.points : Math.max(best, ride.points);
    if (ride.points === FULL_HOUSE) fullHouses += 1;
  }

  return {
    id: team.id,
    name: team.name,
    riders: team.riders,
    rides: team.rides.length,
    best,
    fullHouses,
    stages,
    reached: reachedIndex >= 0 ? TEAM_STAGES[reachedIndex] : null,
    reachedIndex,
    place: team.place,
  };
}

/* All teams in rank order, each with a rank. */
export function teamRows(season: Pick<SeasonStats, "teams">): TeamRow[] {
  return assignRanks(season.teams.map(teamNumbers), teamRankParts);
}

/* ---------- summary tiles ---------- */

export function riderSummary(rows: RiderRow[]) {
  return {
    riders: rows.filter((row) => row.runs > 0).length,
    runs: rows.reduce((sum, row) => sum + row.runs, 0),
    carries: rows.reduce((sum, row) => sum + row.carries, 0),
    reachedAarhi: rows.filter((row) => row.reachedIndex >= SINGLE_STAGES.indexOf("aarhi1")).length,
  };
}

export function teamSummary(rows: TeamRow[]) {
  const bests = rows.map((row) => row.best).filter((best): best is number => best !== null);
  return {
    teams: rows.length,
    rides: rows.reduce((sum, row) => sum + row.rides, 0),
    fullHouses: rows.reduce((sum, row) => sum + row.fullHouses, 0),
    best: bests.length ? Math.max(...bests) : null,
  };
}

/* ---------- search and filters ---------- */

const normalise = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/* True when every word of the query appears somewhere in the fields. */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const words = normalise(query).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = normalise(fields.filter(Boolean).join(" "));
  return words.every((word) => haystack.includes(word));
}

export const riderSearchFields = (row: RiderRow) => [row.name, row.horse, row.location];

export const teamSearchFields = (row: TeamRow) => [row.name, ...row.riders.map((rider) => rider.name)];

/* The states in the season, sorted by name. */
export function statesOf(rows: RiderRow[]): string[] {
  return [...new Set(rows.map((row) => row.state).filter((state): state is string => !!state))].sort(
    compareNames
  );
}

/* ---------- sorting ---------- */

export type SortDirection = "ascending" | "descending";
export type SortValue = number | string | null | undefined;

/* Sorts rows by a value. Rows with no value (blank or dash) always go last,
   whichever way the column is sorted; ties keep rank order. */
export function sortRows<T extends { rank: number; name: string }>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: SortDirection
): T[] {
  const sign = direction === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const leftMissing = left === null || left === undefined;
    const rightMissing = right === null || right === undefined;
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    if (!leftMissing && !rightMissing && left !== right) {
      const order =
        typeof left === "string" || typeof right === "string"
          ? compareNames(String(left), String(right))
          : left - right;
      if (order !== 0) return order * sign;
    }
    return a.rank - b.rank || compareNames(a.name, b.name);
  });
}

/* ---------- pages ---------- */

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), pageCount(total, pageSize));
}

/* The page numbers to show: all of them when there are few, otherwise the
   first, the last and the ones around the current page, with "gap" where
   numbers are left out. */
export function pageList(current: number, count: number): (number | "gap")[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);
  const keep = new Set([1, count, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((page) => keep.add(page));
  if (current >= count - 2) [count - 3, count - 2, count - 1].forEach((page) => keep.add(page));
  const pages = [...keep].filter((page) => page >= 1 && page <= count).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

/* "Showing 1–25 of 111 riders" */
export function showingText(page: number, pageSize: number, total: number, noun: string): string {
  if (total === 0) return `Showing 0 ${noun}s`;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return `Showing ${first}–${last} of ${total} ${total === 1 ? noun : `${noun}s`}`;
}

/* ---------- formatting ---------- */

export const formatPercent = (value: number | null) =>
  value === null ? null : `${Math.round(value * 100)}%`;

export const formatDecimal = (value: number | null, places: number) =>
  value === null ? null : value.toFixed(places);

export const formatPlace = (place: 1 | 2 | 3 | null) =>
  place === null ? null : (["1st", "2nd", "3rd"] as const)[place - 1];

/* "2026-11-11" -> "11 November 2026". Unreadable dates come back as given. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

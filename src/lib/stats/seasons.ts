/* The seasons the Stats page can show, newest first.

   A season is one static file, src/data/stats/<year>.json. Adding a year is
   adding its file and one line to SEASON_FILES below. Each file is checked
   when it is loaded, so a file regenerated with a mistake in it fails loudly
   at build time instead of showing wrong numbers. */

import season2026 from "../../data/stats/2026.json" with { type: "json" };
import {
  SINGLE_STAGES,
  TEAM_STAGES,
  type SeasonStats,
  type SingleStage,
  type StatResult,
  type StatRideStatus,
  type TeamStage,
} from "./types.ts";

const SEASON_FILES: Record<number, unknown> = {
  2026: season2026,
};

const RESULTS: readonly StatResult[] = ["carry", "strike", "miss", "unknown"];
const RIDE_STATUSES: readonly StatRideStatus[] = ["scratched", "out"];

const fail = (where: string, what: string): never => {
  throw new Error(`Season stats file: ${where} ${what}`);
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPlace = (value: unknown) => value === null || value === 1 || value === 2 || value === 3;

const nullableString = (value: unknown) => value === null || typeof value === "string";

/* Checks that `raw` has the shape of a season file and returns it typed.
   Throws an Error naming the first thing that is wrong. */
export function parseSeason(raw: unknown): SeasonStats {
  if (!isObject(raw)) return fail("root", "is not an object");

  if (typeof raw.season !== "number" || !Number.isInteger(raw.season)) fail("season", "is not a year");
  for (const key of ["eventName", "eventDate", "updated"] as const) {
    if (typeof raw[key] !== "string") fail(key, "is not text");
  }
  if (typeof raw.provisional !== "boolean") fail("provisional", "is not true or false");
  if (!Array.isArray(raw.notes) || raw.notes.some((note) => typeof note !== "string")) {
    fail("notes", "is not a list of text");
  }
  if (!Array.isArray(raw.riders)) fail("riders", "is not a list");
  if (!Array.isArray(raw.teams)) fail("teams", "is not a list");

  const riderIds = new Set<string>();
  (raw.riders as unknown[]).forEach((rider, index) => {
    const where = `riders[${index}]`;
    if (!isObject(rider)) return fail(where, "is not an object");
    if (typeof rider.id !== "string" || !rider.id) fail(where, "has no id");
    if (riderIds.has(rider.id as string)) fail(where, `repeats the id "${String(rider.id)}"`);
    riderIds.add(rider.id as string);
    if (typeof rider.name !== "string") fail(where, "has no name");
    if (!nullableString(rider.horse)) fail(where, "has a horse that is not text");
    if (!nullableString(rider.location)) fail(where, "has a location that is not text");
    if (!isPlace(rider.place)) fail(where, "has a place that is not 1, 2, 3 or null");
    if (!Array.isArray(rider.runs)) return fail(where, "has no runs list");
    rider.runs.forEach((run, runIndex) => {
      if (!isObject(run)) return fail(`${where}.runs[${runIndex}]`, "is not an object");
      if (!SINGLE_STAGES.includes(run.stage as SingleStage)) {
        fail(`${where}.runs[${runIndex}]`, `has an unknown stage "${String(run.stage)}"`);
      }
      if (!RESULTS.includes(run.result as StatResult)) {
        fail(`${where}.runs[${runIndex}]`, `has an unknown result "${String(run.result)}"`);
      }
    });
  });

  const teamIds = new Set<string>();
  (raw.teams as unknown[]).forEach((team, index) => {
    const where = `teams[${index}]`;
    if (!isObject(team)) return fail(where, "is not an object");
    if (typeof team.id !== "string" || !team.id) fail(where, "has no id");
    if (teamIds.has(team.id as string)) fail(where, `repeats the id "${String(team.id)}"`);
    teamIds.add(team.id as string);
    if (typeof team.name !== "string") fail(where, "has no name");
    if (!isPlace(team.place)) fail(where, "has a place that is not 1, 2, 3 or null");
    if (!Array.isArray(team.riders)) return fail(where, "has no riders list");
    team.riders.forEach((member, memberIndex) => {
      if (!isObject(member) || typeof member.name !== "string" || !nullableString(member.horse)) {
        fail(`${where}.riders[${memberIndex}]`, "is not a rider with a name");
      }
    });
    if (!Array.isArray(team.rides)) return fail(where, "has no rides list");
    team.rides.forEach((ride, rideIndex) => {
      if (!isObject(ride)) return fail(`${where}.rides[${rideIndex}]`, "is not an object");
      if (!TEAM_STAGES.includes(ride.stage as TeamStage)) {
        fail(`${where}.rides[${rideIndex}]`, `has an unknown stage "${String(ride.stage)}"`);
      }
      const points = ride.points;
      if (
        points !== null &&
        (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > 16)
      ) {
        fail(`${where}.rides[${rideIndex}]`, "has points that are not a whole number from 0 to 16");
      }
      if (ride.status !== undefined) {
        if (!RIDE_STATUSES.includes(ride.status as StatRideStatus)) {
          fail(`${where}.rides[${rideIndex}]`, `has an unknown status "${String(ride.status)}"`);
        }
        if (points !== null) fail(`${where}.rides[${rideIndex}]`, "has a status and a total (a status needs points: null)");
      }
    });
  });

  return raw as unknown as SeasonStats;
}

/* The seasons that have a file, newest first. */
export const SEASONS: readonly number[] = Object.keys(SEASON_FILES)
  .map(Number)
  .sort((a, b) => b - a);

export const LATEST_SEASON: number = SEASONS[0];

const loaded = new Map<number, SeasonStats>();

/* The season's stats, or null when there is no file for that year. */
export function loadSeason(year: number): SeasonStats | null {
  if (!Object.hasOwn(SEASON_FILES, year)) return null;
  let season = loaded.get(year);
  if (!season) {
    season = parseSeason(SEASON_FILES[year]);
    if (season.season !== year) fail("season", `is ${season.season} in the file listed as ${year}`);
    loaded.set(year, season);
  }
  return season;
}

/* Reads a ?season= value: a listed year, or the newest season otherwise. */
export function resolveSeason(value: string | string[] | undefined): number {
  const text = Array.isArray(value) ? value[0] : value;
  const year = text && /^\d{4}$/.test(text) ? Number(text) : NaN;
  return SEASONS.includes(year) ? year : LATEST_SEASON;
}

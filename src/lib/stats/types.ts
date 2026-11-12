/* Season statistics: the shape of a season file in src/data/stats/<year>.json.

   A season file holds facts only (who rode, each run's result, each team
   ride's total, the placings). Every number the Stats page shows beyond
   those is worked out from them in compute.ts, so a corrected result in the
   file corrects every total, rate and rank that depends on it.

   Points are the event's: a carry is 4, a strike is 2, a miss is 0. */

export type StatResult = "carry" | "strike" | "miss" | "unknown";

/* Singles stages in the order they were ridden. "final" covers the placing
   rides (third place and first place). */
export type SingleStage = "qualification" | "aarhi1" | "aarhi2" | "final";

/* Team stages in the order they were ridden. */
export type TeamStage = "round1" | "round2" | "third" | "final1" | "final2";

export interface StatRun {
  stage: SingleStage;
  /* "unknown" is a run that was ridden but whose result was not recorded. It
     counts as a run, scores nothing, and is left out of the rates. */
  result: StatResult;
}

export interface StatRider {
  /* Unique within the season; stable across regenerations of the file. */
  id: string;
  name: string;
  horse: string | null;
  /* District or city, then state or province. Already public. */
  location: string | null;
  /* In the order ridden. */
  runs: StatRun[];
  /* Final placing in the singles event, when the rider took one. */
  place: 1 | 2 | 3 | null;
}

export interface StatTeamRide {
  stage: TeamStage;
  /* Out of 16 (four riders, one peg each). null = the ride happened but its
     total was not recorded; it counts as a ride and is left out of totals. */
  points: number | null;
}

export interface StatTeam {
  id: string;
  name: string;
  riders: { name: string; horse: string | null }[];
  /* In the order ridden. */
  rides: StatTeamRide[];
  place: 1 | 2 | 3 | null;
}

export interface SeasonStats {
  season: number;
  eventName: string;
  /* ISO date of the event. */
  eventDate: string;
  /* ISO date the file was last regenerated. */
  updated: string;
  /* true while results are still being checked; the page says so. */
  provisional: boolean;
  /* Short public notes shown under the tables. */
  notes: string[];
  riders: StatRider[];
  teams: StatTeam[];
}

export const RESULT_POINTS: Record<StatResult, number> = {
  carry: 4,
  strike: 2,
  miss: 0,
  unknown: 0,
};

export const SINGLE_STAGES: readonly SingleStage[] = ["qualification", "aarhi1", "aarhi2", "final"];
export const TEAM_STAGES: readonly TeamStage[] = ["round1", "round2", "third", "final1", "final2"];

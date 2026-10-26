// Groups a round's runs into pools and entrants for /admin/scoring and its
// printable pool sheet. Pure functions over ScoringRun[]; no state.
import type { ScoringRun } from "@/lib/scoring/types";

export type EntrantSummary = {
  entrant_key: string;
  name: string;
  /* Team name for a Section entrant's riders, horse for a Single rider. */
  detail: string | null;
  location: string | null;
  pool_label: string | null;
  is_team: boolean;
  /* Section: the riders in riding order. */
  members: { name: string; horse: string | null }[];
  runs: ScoringRun[];
  scored: number;
  voided: number;
};

export type PoolGroup = {
  /* null for a round that is not drawn into pools. */
  label: string | null;
  entrants: EntrantSummary[];
  runs: ScoringRun[];
};

/* 'A' -> 0, 'Z' -> 25, 'AA' -> 26: the order pools ride in. */
export const poolIndex = (label: string) =>
  label.length === 1
    ? label.charCodeAt(0) - 65
    : (label.charCodeAt(0) - 64) * 26 + (label.charCodeAt(1) - 65);

export const comparePools = (first: string | null, second: string | null) => {
  if (first === second) {
    return 0;
  }

  if (first === null) {
    return -1;
  }

  if (second === null) {
    return 1;
  }

  return poolIndex(first) - poolIndex(second);
};

export const groupStartList = (runs: ScoringRun[]): PoolGroup[] => {
  const ordered = [...runs].sort((first, second) => first.run_order - second.run_order);
  const groups = new Map<string, PoolGroup>();
  const entrants = new Map<string, EntrantSummary>();

  for (const run of ordered) {
    const key = run.pool_label ?? "";
    let group = groups.get(key);

    if (!group) {
      group = { label: run.pool_label, entrants: [], runs: [] };
      groups.set(key, group);
    }

    group.runs.push(run);

    let entrant = entrants.get(run.entrant_key);

    if (!entrant) {
      const isTeam = run.entrant_key.startsWith("team:");
      entrant = {
        entrant_key: run.entrant_key,
        name: isTeam ? run.team_name ?? run.rider_name : run.rider_name,
        detail: isTeam ? null : run.horse_name,
        location: run.rider_location,
        pool_label: run.pool_label,
        is_team: isTeam,
        members: [],
        runs: [],
        scored: 0,
        voided: 0,
      };
      entrants.set(run.entrant_key, entrant);
      group.entrants.push(entrant);
    }

    entrant.runs.push(run);
    entrant.scored += run.status === "scored" ? 1 : 0;
    entrant.voided += run.status === "void" ? 1 : 0;

    if (
      entrant.is_team &&
      !entrant.members.some((member) => member.name === run.rider_name)
    ) {
      entrant.members.push({ name: run.rider_name, horse: run.horse_name });
    }
  }

  return [...groups.values()].sort((first, second) => comparePools(first.label, second.label));
};

/* The pool a late entrant would join: fewest entrants, ties to the earliest
   letter — the same rule as scoring_add_entrant. */
export const smallestPool = (groups: PoolGroup[], pooled: boolean) => {
  if (!pooled) {
    return null;
  }

  const labelled = groups.filter((group) => group.label !== null);

  if (labelled.length === 0) {
    return "A";
  }

  return [...labelled].sort(
    (first, second) =>
      first.entrants.length - second.entrants.length ||
      comparePools(first.label, second.label)
  )[0].label;
};

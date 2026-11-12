/* The Stats table's columns: their headings, groups, how each sorts and what
   each cell shows. Pure, so the page test and compute.test.mts can check them.

   A cell is one of:
   - blank: the rider or team did not ride that stage;
   - dash: ridden, but no result is known (with the reason, read aloud);
   - a value. */

import {
  SINGLE_STAGE_LABELS,
  TEAM_STAGE_LABELS,
  formatDecimal,
  formatPercent,
  formatPlace,
  type RiderRow,
  type SortDirection,
  type SortValue,
  type StageCell,
  type TeamRow,
} from "./compute.ts";
import { SINGLE_STAGES, TEAM_STAGES } from "./types.ts";

export type Cell =
  | { kind: "blank"; reason: string }
  | { kind: "dash"; reason: string }
  | { kind: "value"; text: string };

export interface ColumnGroup {
  id: string;
  label: string;
  /* Shown by default on narrow screens (below the `sm` breakpoint). */
  onPhone: boolean;
}

export interface StatColumn<T> {
  id: string;
  /* Short heading. */
  label: string;
  /* Full name, for screen readers and the tooltip, when it differs. */
  title?: string;
  group: string;
  numeric: boolean;
  /* The direction of the first click on the heading. */
  firstDirection: SortDirection;
  sortValue: (row: T) => SortValue;
  cell: (row: T) => Cell;
}

const value = (text: string | number): Cell => ({ kind: "value", text: String(text) });

const NOT_RIDDEN: Cell = { kind: "blank", reason: "did not ride" };

const orDash = (text: string | null, reason: string): Cell =>
  text === null ? { kind: "dash", reason } : value(text);

const stageCell = (cell: StageCell, missing: string): Cell =>
  cell === undefined ? NOT_RIDDEN : cell === null ? { kind: "dash", reason: missing } : value(cell);

const placeCell = (place: 1 | 2 | 3 | null): Cell =>
  place === null ? { kind: "blank", reason: "no place" } : value(formatPlace(place)!);

/* ---------- riders ---------- */

export const RIDER_GROUPS: readonly ColumnGroup[] = [
  { id: "runs", label: "Runs", onPhone: false },
  { id: "rounds", label: "Points by round", onPhone: false },
  { id: "totals", label: "Totals", onPhone: true },
  { id: "result", label: "Result", onPhone: true },
];

const SHORT_SINGLE: Record<string, string> = { qualification: "Qual" };

const NO_KNOWN_RUN = "no run with a known result";

export const RIDER_COLUMNS: readonly StatColumn<RiderRow>[] = [
  {
    id: "runs",
    label: "Runs",
    title: "Runs ridden",
    group: "runs",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.runs,
    cell: (row) => value(row.runs),
  },
  {
    id: "carries",
    label: "C",
    title: "Carries",
    group: "runs",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.carries,
    cell: (row) => value(row.carries),
  },
  {
    id: "strikes",
    label: "S",
    title: "Strikes",
    group: "runs",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.strikes,
    cell: (row) => value(row.strikes),
  },
  {
    id: "misses",
    label: "M",
    title: "Misses",
    group: "runs",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.misses,
    cell: (row) => value(row.misses),
  },
  ...SINGLE_STAGES.map(
    (stage): StatColumn<RiderRow> => ({
      id: `stage-${stage}`,
      label: SHORT_SINGLE[stage] ?? SINGLE_STAGE_LABELS[stage],
      title: `Points in ${SINGLE_STAGE_LABELS[stage]}`,
      group: "rounds",
      numeric: true,
      firstDirection: "descending",
      sortValue: (row) => row.stages[stage],
      cell: (row) => stageCell(row.stages[stage], "ridden, result not recorded"),
    })
  ),
  {
    id: "points",
    label: "Pts",
    title: "Points",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    // A rider whose every run went unrecorded shows a dash, not a zero.
    sortValue: (row) => (row.known > 0 || row.runs === 0 ? row.points : null),
    cell: (row) =>
      row.known > 0 || row.runs === 0 ? value(row.points) : { kind: "dash", reason: NO_KNOWN_RUN },
  },
  {
    id: "pointsPerRun",
    label: "Pts/Run",
    title: "Points per run",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.pointsPerRun,
    cell: (row) => orDash(formatDecimal(row.pointsPerRun, 2), NO_KNOWN_RUN),
  },
  {
    id: "carryRate",
    label: "Carry %",
    title: "Carry percentage",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.carryRate,
    cell: (row) => orDash(formatPercent(row.carryRate), NO_KNOWN_RUN),
  },
  {
    id: "hitRate",
    label: "Hit %",
    title: "Hit percentage",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.hitRate,
    cell: (row) => orDash(formatPercent(row.hitRate), NO_KNOWN_RUN),
  },
  {
    id: "reached",
    label: "Reached",
    title: "Furthest round reached",
    group: "result",
    numeric: false,
    firstDirection: "descending",
    sortValue: (row) => (row.reachedIndex >= 0 ? row.reachedIndex : null),
    cell: (row) => (row.reached ? value(SINGLE_STAGE_LABELS[row.reached]) : NOT_RIDDEN),
  },
  {
    id: "place",
    label: "Place",
    group: "result",
    numeric: true,
    firstDirection: "ascending",
    sortValue: (row) => row.place,
    cell: (row) => placeCell(row.place),
  },
];

/* ---------- teams ---------- */

export const TEAM_GROUPS: readonly ColumnGroup[] = [
  { id: "rounds", label: "Points by round", onPhone: false },
  { id: "totals", label: "Totals", onPhone: true },
  { id: "result", label: "Result", onPhone: true },
];

export const TEAM_COLUMNS: readonly StatColumn<TeamRow>[] = [
  ...TEAM_STAGES.map(
    (stage): StatColumn<TeamRow> => ({
      id: `stage-${stage}`,
      label: TEAM_STAGE_LABELS[stage],
      title: `Points in ${TEAM_STAGE_LABELS[stage]}, out of 16`,
      group: "rounds",
      numeric: true,
      firstDirection: "descending",
      sortValue: (row) => row.stages[stage],
      cell: (row) => stageCell(row.stages[stage], "ridden, total not recorded"),
    })
  ),
  {
    id: "rides",
    label: "Rides",
    title: "Rides ridden",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.rides,
    cell: (row) => value(row.rides),
  },
  {
    id: "points",
    label: "Pts",
    title: "Points",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => (row.recorded > 0 ? row.points : null),
    cell: (row) => (row.recorded > 0 ? value(row.points) : { kind: "dash", reason: "no total recorded" }),
  },
  {
    id: "average",
    label: "Avg",
    title: "Average points per ride",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.average,
    cell: (row) => orDash(formatDecimal(row.average, 1), "no total recorded"),
  },
  {
    id: "best",
    label: "Best",
    title: "Best ride",
    group: "totals",
    numeric: true,
    firstDirection: "descending",
    sortValue: (row) => row.best,
    cell: (row) => orDash(row.best === null ? null : String(row.best), "no total recorded"),
  },
  {
    id: "reached",
    label: "Reached",
    title: "Furthest round reached",
    group: "result",
    numeric: false,
    firstDirection: "descending",
    sortValue: (row) => (row.reachedIndex >= 0 ? row.reachedIndex : null),
    cell: (row) => (row.reached ? value(TEAM_STAGE_LABELS[row.reached]) : NOT_RIDDEN),
  },
  {
    id: "place",
    label: "Place",
    group: "result",
    numeric: true,
    firstDirection: "ascending",
    sortValue: (row) => row.place,
    cell: (row) => placeCell(row.place),
  },
];

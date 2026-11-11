// vMix Data Source: the side on the track, one flat row.
//
// Team name, pool, points, target and whether it is through, then the same
// four cells for each of its riders (rider1_ ... rider4_): name, horse,
// result and points. Every field is always present (empty string or 0), so
// vMix keeps a stable schema between sides and outside a Section round.
import { teamOnTrack, type TeamState } from "@/lib/scoring/team-on-track";
import { RESULT_LABELS, type RunResult } from "@/lib/scoring/types";

export const VMIX_TEAM_RIDERS = 4;

const RIDER_CELLS = ["name", "horse", "result", "points", "status"] as const;

export const VMIX_TEAM_COLUMNS: readonly string[] = [
  "team_name",
  "pool_label",
  "team_points",
  "target_points",
  "through",
  "team_rank",
  "riders_scored",
  "riders_total",
  ...Array.from({ length: VMIX_TEAM_RIDERS }, (_, index) =>
    RIDER_CELLS.map((cell) => `rider${index + 1}_${cell}`)
  ).flat(),
  "sample",
];

export type VmixTeamRow = Record<string, string | number>;

const STATUS_TEXT: Record<string, string> = {
  pending: "To ride",
  on_course: "On course",
  scored: "Scored",
  void: "Out",
};

export const toVmixTeamRow = (
  state: TeamState | null,
  which: "now" | "last",
  sample = false
): VmixTeamRow => {
  const team = teamOnTrack(state, which);
  const row: VmixTeamRow = {
    team_name: team?.name ?? "",
    pool_label: team?.pool_label ?? "",
    team_points: team?.points ?? 0,
    target_points: team?.target ?? 0,
    through: team?.through === true ? "Yes" : team?.through === false ? "No" : "",
    team_rank: team?.rank ?? 0,
    riders_scored: team?.members.filter((member) => member.status === "scored").length ?? 0,
    riders_total: team?.members.filter((member) => member.status !== "void").length ?? 0,
  };

  for (let index = 0; index < VMIX_TEAM_RIDERS; index += 1) {
    const member = team?.members[index];
    const prefix = `rider${index + 1}_`;

    row[`${prefix}name`] = member?.rider_name ?? "";
    row[`${prefix}horse`] = member?.horse_name ?? "";
    row[`${prefix}result`] = member?.result ? (RESULT_LABELS[member.result as RunResult] ?? "") : "";
    row[`${prefix}points`] = member?.points ?? 0;
    row[`${prefix}status`] = member ? (STATUS_TEXT[member.status] ?? "") : "";
  }

  row.sample = sample ? "Yes" : "No";
  return row;
};

/* ?which=last: the side whose result came in most recently. Anything else is
   the side on the track now. */
export const readVmixTeamWhich = (url: URL): "now" | "last" =>
  url.searchParams.get("which")?.trim().toLowerCase() === "last" ? "last" : "now";

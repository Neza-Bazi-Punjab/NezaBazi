import StatsSeason, { statsMetadata } from "../StatsSeason";
import { LATEST_SEASON } from "@/lib/stats/seasons";

/* /stats/teams: the newest season, teams. Built at deploy time. */
export const metadata = statsMetadata(LATEST_SEASON, "teams");

export default function StatsTeamsPage() {
  return <StatsSeason year={LATEST_SEASON} view="teams" />;
}

import StatsSeason, { statsMetadata } from "./StatsSeason";
import { LATEST_SEASON } from "@/lib/stats/seasons";

/* /stats: the newest season, riders. Built at deploy time (StatsSeason.tsx). */
export const metadata = statsMetadata(LATEST_SEASON, "riders");

export default function StatsPage() {
  return <StatsSeason year={LATEST_SEASON} view="riders" />;
}

import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Rankings",
  description:
    "Live rankings and statistics for the Neza Bazi Punjab Championship 2026 — coming soon.",
};

export default function RankingsPage() {
  return (
    <ComingSoon
      title="Rankings"
      description="Live leaderboards, run-by-run scores and rider statistics from the championship."
      phaseNote="Rankings go live during the event, once scoring begins."
    />
  );
}

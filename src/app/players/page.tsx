import type { Metadata } from "next";
import ComingSoon from "@/components/ComingSoon";

export const metadata: Metadata = {
  title: "Players",
  description:
    "Rider profiles for the Neza Bazi Punjab Championship 2026 — coming soon.",
};

export default function PlayersPage() {
  return (
    <ComingSoon
      title="Players"
      description="Profiles of the riders competing at the Championship 2026 — their horses, categories and records."
      phaseNote="Player profiles go live once registration opens and riders join the championship."
    />
  );
}

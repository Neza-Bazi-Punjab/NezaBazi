import type { Metadata } from "next";
import { site } from "@/lib/site";
import LiveBoard from "./LiveBoard";

export const metadata: Metadata = {
  title: "Live Scores",
  description: `Live results, pools and standings from the ${site.title} — ${site.eventDate}, ${site.venue}.`,
};

export default function LivePage() {
  return <LiveBoard />;
}

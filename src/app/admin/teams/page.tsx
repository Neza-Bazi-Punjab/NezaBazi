import type { Metadata } from "next";
import { site } from "@/lib/site";
import AdminDashboardSection from "../AdminDashboardSection";

export const metadata: Metadata = {
  title: "Teams",
  description: `Team registrations for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export default function AdminTeamsPage() {
  return (
    <AdminDashboardSection
      tab="team"
      title="Teams"
      intro="Search, review, edit or remove teams and their four riders."
      path="/admin/teams"
    />
  );
}

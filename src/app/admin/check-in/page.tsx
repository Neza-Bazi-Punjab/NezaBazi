import type { Metadata } from "next";
import { site } from "@/lib/site";
import AdminDashboardSection from "../AdminDashboardSection";

export const metadata: Metadata = {
  title: "Check-in",
  description: `Rider check-in for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export default function AdminCheckInPage() {
  return (
    <AdminDashboardSection
      tab="checkin"
      title="Check-in"
      intro="Check riders in at the desk, and see who has arrived."
      path="/admin/check-in"
    />
  );
}

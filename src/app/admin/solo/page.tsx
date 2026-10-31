import type { Metadata } from "next";
import { site } from "@/lib/site";
import AdminDashboardSection from "../AdminDashboardSection";

export const metadata: Metadata = {
  title: "Solo Riders",
  description: `Solo registrations for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export default function AdminSoloPage() {
  return (
    <AdminDashboardSection
      tab="solo"
      title="Solo Riders"
      intro="Search, review, edit or remove solo registrations."
      path="/admin/solo"
    />
  );
}

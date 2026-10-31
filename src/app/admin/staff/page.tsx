import type { Metadata } from "next";
import { site } from "@/lib/site";
import AdminDashboardSection from "../AdminDashboardSection";

export const metadata: Metadata = {
  title: "Staff",
  description: `Staff roles for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export default function AdminStaffPage() {
  return (
    <AdminDashboardSection
      tab="profiles"
      title="Staff"
      intro="Give judges, commentators and other administrators their roles."
      path="/admin/staff"
    />
  );
}

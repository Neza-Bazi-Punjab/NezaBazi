import type { Metadata } from "next";
import { site } from "@/lib/site";
import AdminDashboardSection from "../AdminDashboardSection";

export const metadata: Metadata = {
  title: "Audit Log",
  description: `The audit log for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export default function AdminAuditPage() {
  return (
    <AdminDashboardSection
      tab="audit"
      title="Audit Log"
      intro="Every change made by an administrator, judge or commentator, with who made it and when."
      path="/admin/audit"
    />
  );
}

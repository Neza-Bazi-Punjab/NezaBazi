// /admin/form-teams — put solo riders onto teams on event day, checked in or
// not. Administrators only, gated like every /admin page: a Login block when
// nobody is signed in, an Access Denied block for any other role. The panel
// reads and saves through /api/admin/desk-teams, which checks again.
import type { Metadata } from "next";
import { site } from "@/lib/site";
import AdminPageHeading from "../AdminPageHeading";
import FormTeamsPanel from "../FormTeamsPanel";
import { AdminAccessMessage, getAdminAccess } from "../admin-access";

export const metadata: Metadata = {
  title: "Form teams",
  description: `Put solo riders onto teams for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TITLE = "Form teams";
const PATH = "/admin/form-teams";

export default async function AdminFormTeamsPage() {
  const access = await getAdminAccess();

  if (access.kind !== "admin") {
    return <AdminAccessMessage title={TITLE} kind={access.kind} redirect={PATH} />;
  }

  return (
    <>
      <AdminPageHeading
        title={TITLE}
        intro="Put riders who registered solo onto a team, checked in or not."
      />

      <section className="bg-cream">
        <div className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6">
          <FormTeamsPanel />
        </div>
      </section>
    </>
  );
}

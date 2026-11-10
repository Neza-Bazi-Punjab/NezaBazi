// /admin/marksheet — the players' marksheet for manual team scoring, the
// paper backup beside live scoring: every team rider already filled in, one
// sheet per Dal Panth, ready to print. Administrators only, gated like every
// /admin page. It reads team riders under the administrator's own session
// (names, horses, teams and Dal Panth; no contact details).
import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import {
  MARKSHEET_PATH,
  MARKSHEET_SELECT,
  buildTeamMarksheets,
  type MarksheetSource,
} from "@/lib/admin/team-marksheet";
import AdminPageHeading from "../AdminPageHeading";
import { AdminAccessMessage, getAdminAccess } from "../admin-access";
import TeamMarksheet from "./TeamMarksheet";

export const metadata: Metadata = {
  title: "Team marksheets",
  description: `Printable marksheets for manual team scoring at the ${site.title}.`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TITLE = "Team marksheets";
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export default async function AdminMarksheetPage() {
  const access = await getAdminAccess();

  if (access.kind !== "admin") {
    return <AdminAccessMessage title={TITLE} kind={access.kind} redirect={MARKSHEET_PATH} />;
  }

  // Paged in a fixed order so no rider is read twice or missed; the sheets
  // are sorted afterwards.
  const riders: MarksheetSource[] = [];
  let failed = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await access.supabase
      .from("team_members")
      .select(MARKSHEET_SELECT)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .overrideTypes<MarksheetSource[], { merge: false }>();

    if (error) {
      console.error("[admin] team marksheet read failed", error);
      failed = true;
      break;
    }

    riders.push(...(data ?? []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }
  }

  return (
    <>
      <AdminPageHeading
        title={TITLE}
        intro="The paper backup for team scoring: every team rider filled in, one sheet per Dal."
      />

      <section className="bg-cream">
        <div className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6">
          {failed ? (
            <p role="alert" className="rounded-lg border border-red-700/30 bg-red-50 px-4 py-3 text-red-800">
              The team list could not be read. Refresh the page to try again.
            </p>
          ) : (
            <TeamMarksheet sheets={buildTeamMarksheets(riders)} />
          )}

          <p className="mt-6 text-sm text-brown/80">
            Teams are made on the{" "}
            <Link href="/admin/form-teams" className="underline">
              Form teams
            </Link>{" "}
            page. Refresh this page after forming or changing a team.
          </p>
        </div>
      </section>
    </>
  );
}

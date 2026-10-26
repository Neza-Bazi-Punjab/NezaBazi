// /admin/scoring — rounds, start lists, pools, overrides and the podium.
// Administrators only, gated the same way as /admin: a Login block when nobody
// is signed in, an Access Denied block for any other role. The role is read
// server-side from the caller's own profile, never from the browser.
import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createServiceRoleClient } from "@/lib/admin/server";
import { buildAdminScoringState } from "@/lib/scoring/admin-state";
import type { AdminScoringState } from "@/lib/scoring/admin-types";
import { getSessionRole } from "@/lib/scoring/auth";
import { site } from "@/lib/site";
import ScoringAdmin from "./ScoringAdmin";

export const metadata: Metadata = {
  title: "Scoring Admin",
  description: `Rounds, start lists and pools for the ${site.title}.`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminScoringPage() {
  const session = await getSessionRole();

  if (!session) {
    return (
      <>
        <PageHeader
          title="Scoring Admin"
          intro="This page requires an administrator login."
        />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Login Required</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                You must be logged in as an administrator to view this page.
              </p>

              <Link
                href="/login?redirect=/admin/scoring"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
              >
                Log In
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (session.role !== "admin") {
    return (
      <>
        <PageHeader
          title="Scoring Admin"
          intro="Rounds and start lists are managed by administrators only."
        />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Access Denied</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                Access denied — this page is for administrators only.
              </p>

              <Link
                href="/"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </>
    );
  }

  // The first paint comes from the server; every action afterwards gets the
  // fresh payload back from its own route. A failure here is not fatal — the
  // panel loads the same payload from /api/admin/scoring/rounds.
  let initialState: AdminScoringState | null = null;

  try {
    initialState = await buildAdminScoringState(createServiceRoleClient());
  } catch (error) {
    console.error("[scoring] loading /admin/scoring failed", error);
  }

  return (
    <>
      <PageHeader
        title="Scoring Admin"
        intro={`Rounds, start lists, pools and results for the ${site.title}.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-[1500px] px-4 py-12 sm:px-6 sm:py-16">
          <ScoringAdmin initialState={initialState} />
        </div>
      </section>
    </>
  );
}

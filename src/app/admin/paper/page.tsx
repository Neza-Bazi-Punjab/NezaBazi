import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import PaperEntryPanel from "./PaperEntryPanel";

export const metadata: Metadata = {
  title: "Paper Entry",
  description: `Enter paper registration forms for the ${site.title}.`,
  robots: { index: false, follow: false },
};

/* Administrators key in the printed registration forms here. The gate is the
   one /admin uses; the route behind the form checks the session again, so
   this page only decides what to render. */
export default async function AdminPaperEntryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <PageHeader
          title="Paper Entry"
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
                href="/login?redirect=/admin/paper"
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return (
      <>
        <PageHeader
          title="Paper Entry"
          intro="Registration data is available to administrators only."
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

  return (
    <>
      <PageHeader
        title="Paper Entry"
        intro="Key in a paper registration form exactly as written. The fields follow the order of the printed sheet, top to bottom."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.15em] text-bronze-dark transition-colors hover:text-bronze"
          >
            ← Admin Dashboard
          </Link>

          <div className="mt-8">
            <PaperEntryPanel />
          </div>
        </div>
      </section>
    </>
  );
}

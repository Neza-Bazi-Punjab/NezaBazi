import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";
import AdminPageHeading from "../AdminPageHeading";

export const metadata: Metadata = {
  title: "PDF Guides",
  description: `The printed guides for the ${site.title}.`,
  robots: { index: false, follow: false },
};

/* The three printed guides, built from docs/ by `npm run build:guide`. Each
   opens in a new tab. The PDFs themselves are public files; this page only
   gathers them for the organisers, behind the same gate as /admin. */
const PDF_GUIDES = [
  {
    href: "/documents/staff-guide.pdf",
    title: "Staff guide",
    audience: "Organisers, judges and commentators",
    description:
      "How live scoring works on the day, role by role: setting up rounds, recording results, calling pools and following along as a commentator.",
  },
  {
    href: "/documents/vmix-guide.pdf",
    title: "vMix guide",
    audience: "The live-stream graphics team",
    description:
      "The live data feeds for the stream graphics, how to test them, and the checklist before going on air.",
  },
  {
    href: "/documents/rehearsal-guide.pdf",
    title: "Rehearsal guide",
    audience: "Everyone running the event",
    description:
      "How to practise alone on sample riders, and the run sheet for the full dress rehearsal before event day.",
  },
] as const;

const pageButton =
  "block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze";

export default async function AdminGuidesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <PageHeader title="PDF Guides" intro="This page requires an administrator login." />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Login Required</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                You must be logged in as an administrator to view this page.
              </p>

              <Link href="/login?redirect=/admin/guides" className={pageButton}>
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
        <PageHeader title="PDF Guides" intro="This page is for administrators only." />

        <section className="bg-cream">
          <div className="mx-auto max-w-xl px-6 py-16">
            <SectionHeading>Access Denied</SectionHeading>

            <div className="mt-10 space-y-6">
              <p className="leading-7 text-brown/85">
                Access denied — this page is for administrators only.
              </p>

              <Link href="/" className={pageButton}>
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
      <AdminPageHeading
        title="PDF Guides"
        intro="The printed guides for running the championship. Each opens in a new tab, ready to read, print or share."
      />

      {/* Same left edge as every admin page; the cards keep a comfortable
          width and leave the space on the right. */}
      <section className="bg-cream">
        <div className="px-6 pb-12 pt-4 sm:pb-16 sm:pt-6">
          <ul className="grid max-w-5xl gap-6 md:grid-cols-3">
            {PDF_GUIDES.map((guide) => (
              <li key={guide.href}>
                <a
                  href={guide.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col rounded-lg border border-bronze/20 bg-sand p-6 transition-colors hover:border-bronze/50"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                      {guide.title}
                    </span>
                    <span className="shrink-0 rounded border border-bronze/25 px-1.5 py-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-brown/70">
                      PDF
                    </span>
                  </span>
                  <span className="mt-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-brown/70">
                    For: {guide.audience}
                  </span>
                  <span className="mt-4 flex-1 leading-7 text-brown/85">{guide.description}</span>
                  <span className="mt-6 font-display text-sm font-semibold uppercase tracking-[0.15em] text-bronze-deep group-hover:text-bronze">
                    Open guide →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

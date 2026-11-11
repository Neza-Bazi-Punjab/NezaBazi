import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Stats",
  description: `Leaderboards and statistics from the ${site.title}: coming soon.`,
  alternates: { canonical: "/stats" },
};

export default function StatsPage() {
  return (
    <>
      <PageHeader
        title="Stats"
        intro={`Leaderboards and statistics from the ${site.title}.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-xl border border-bronze/25 bg-sand p-8 text-center sm:p-12">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-bronze">
              Coming Soon
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold uppercase tracking-wide text-bronze-dark sm:text-4xl">
              Updated leaderboards &amp; statistics
            </h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-brown/85">
              Final standings, round-by-round results and rider statistics are being checked and
              will be posted here soon.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Team Registration Received",
  description: "Your team registration has been received.",
};

export default function RegisterTeamSuccessPage() {
  return (
    <>
      <PageHeader
        title="Team Registration Received"
        intro="Your team's registration was successfully submitted. The team leader will be contacted with further event details."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <Link
            href="/"
            className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </>
  );
}

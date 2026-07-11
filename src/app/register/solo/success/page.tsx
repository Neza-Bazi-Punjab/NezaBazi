import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Registration Received",
  description: "Your solo rider registration has been received.",
};

export default function RegisterSuccessPage() {
  return (
    <>
      <PageHeader
        title="Registration Received"
        intro="Your solo registration was successfully submitted. We will contact you with further event details."
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

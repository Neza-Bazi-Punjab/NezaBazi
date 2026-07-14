import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

export const metadata: Metadata = {
  title: "Link Expired",
  description: "This authentication link is invalid or has expired.",
};

export default function AuthCodeErrorPage() {
  return (
    <>
      <PageHeader
        title="Link Expired"
        intro="This link is invalid or has already been used."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>Try Again</SectionHeading>

          <div className="mt-10 space-y-6">
            <p className="leading-7 text-brown/85">
              Confirmation and reset links can only be used once and expire after a
              short time. Please request a new one.
            </p>

            <div className="space-y-3">
              <Link
                href="/login"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
              >
                Go to Login
              </Link>
              <Link
                href="/forgot-password"
                className="block text-center text-sm font-semibold text-bronze-deep underline"
              >
                Reset your password
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

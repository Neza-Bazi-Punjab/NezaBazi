import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

export const metadata: Metadata = {
  title: "Confirm Your Email",
  description: "Check your inbox to confirm your account.",
};

export default function SignupSuccessPage() {
  return (
    <>
      <PageHeader
        title="Confirm Your Email"
        intro="Your account is almost ready — one quick step to go."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <SectionHeading>Check Your Inbox</SectionHeading>

          <div className="mt-10 space-y-6">
            <p className="leading-7 text-brown/85">
              We&apos;ve sent a confirmation link to your email address. Click the
              link to activate your account, then log in to register for the
              championship.
            </p>
            <p className="leading-7 text-brown/70">
              Can&apos;t find it? Check your spam folder — the email comes from the
              Neza Bazi Punjab Championship.
            </p>

            <div className="space-y-3">
              <Link
                href="/login"
                className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
              >
                Go to Login
              </Link>

              <p className="text-center text-sm text-brown/80">
                Want to return later?{" "}
                <Link href="/" className="font-semibold text-bronze-deep underline">
                  Back to home
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ResendConfirmation from "@/components/ResendConfirmation";
import SectionHeading from "@/components/SectionHeading";
import { getPostSignupRedirect } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Confirm Your Email",
  description: "Check your inbox to confirm your account.",
};

type SignupSuccessPageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function SignupSuccessPage({ searchParams }: SignupSuccessPageProps) {
  const { redirect } = await searchParams;
  const loginHref = `/login?redirect=${encodeURIComponent(
    getPostSignupRedirect(redirect ?? null),
  )}`;

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
            <p className="leading-7 text-brown/70">
              {`If you have signed up with this address before, no new email is sent — use the resend button below, or log in if your account is already confirmed.`}
            </p>

            <div className="rounded-lg border border-bronze/25 bg-sand p-5">
              <ResendConfirmation />
            </div>

            <div className="space-y-3">
              <Link
                href={loginHref}
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

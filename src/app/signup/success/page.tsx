import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Account Created",
  description: "Your account has been created successfully.",
};

export default function SignupSuccessPage() {
  return (
    <>
      <PageHeader
        title="Account Created"
        intro="Your account was successfully created. You're all set and can now register for the championship."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-xl px-6 py-16">
          <div className="space-y-6">
            <Link
              href="/register"
              className="block w-full rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze"
            >
              Register for the Championship
            </Link>

            <p className="text-center text-sm text-brown/80">
              Want to return later?{" "}
              <Link href="/" className="font-semibold text-bronze-deep underline">
                Back to home
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

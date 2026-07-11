import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Register",
  description: `Choose solo or team registration for the ${site.title}.`,
};

const registrationOptions = [
  {
    title: "Solo Registration",
    description: "Register yourself as an individual rider.",
    href: "/register/solo",
  },
  {
    title: "Team Registration",
    description: "Register your team of 4 riders, including yourself as leader.",
    href: "/register-team",
  },
] as const;

export default function RegisterPage() {
  return (
    <>
      <PageHeader
        title="Register"
        intro={`Choose solo or team registration for the ${site.title}.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Choose Registration Type</SectionHeading>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {registrationOptions.map((option) => (
              <Link
                key={option.href}
                href={option.href}
                className="rounded-2xl border border-bronze/20 bg-sand p-6 transition-colors hover:border-bronze/40"
              >
                <h3 className="font-display text-xl font-bold uppercase tracking-wide text-bronze-dark">
                  {option.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-brown/80">
                  {option.description}
                </p>
                <span className="mt-6 block rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors hover:bg-bronze">
                  Continue
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Register",
  description:
    "Rider registration for the Neza Bazi Punjab Championship 2026 opens soon.",
};

const prepare = [
  {
    title: "Rider Details",
    detail: "Full name, date of birth, nationality and riding experience.",
  },
  {
    title: "Horse Details",
    detail: "Horse name, age, breed and up-to-date veterinary records.",
  },
  {
    title: "Category Choice",
    detail: "Open Individual, Team Relay or International Exhibition.",
  },
];

export default function RegisterPage() {
  return (
    <>
      <PageHeader
        title="Registration Opens Soon"
        intro="Online rider registration for the Championship 2026 is being prepared. Get your details ready — places will be limited."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>What You&apos;ll Need</SectionHeading>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {prepare.map((item, i) => (
              <li
                key={item.title}
                className="rounded-2xl border border-bronze/20 bg-sand p-6"
              >
                <p className="font-display text-4xl font-bold text-bronze/60">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-brown/80">
                  {item.detail}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-14 rounded-2xl bg-bronze-deep px-8 py-10 text-center text-cream">
            <p className="font-display text-xl font-bold uppercase tracking-[0.2em]">
              Want to be first to know?
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-cream/80">
              Email us and we&apos;ll notify you the moment online registration
              opens.
            </p>
            <a
              href={`mailto:${site.email}?subject=Notify me when registration opens`}
              className="mt-6 inline-block rounded-lg bg-cream px-6 py-3 font-display text-sm font-semibold uppercase tracking-[0.15em] text-bronze-deep transition-colors hover:bg-white"
            >
              Notify Me
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

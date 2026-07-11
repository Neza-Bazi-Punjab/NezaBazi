import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Register",
  description: `Rider registration for the ${site.cupName} — ${site.title} — opens soon.`,
};

const steps = [
  {
    title: "Visit & Register",
    detail:
      "Come back to this website and hit Register Now once registration opens.",
  },
  {
    title: "Rider Profile & Horse Details",
    detail:
      "Complete your rider profile — name, nationality, experience — and add your horse's details.",
  },
  {
    title: "Choose Your Event",
    detail: `Select the ${site.cupName} and choose your competition category.`,
  },
  {
    title: "Submit & Confirm",
    detail:
      "Submit your registration and receive your confirmation email instantly.",
  },
];

const confirmationContents = [
  "Registration number",
  "Rider details",
  "Event information",
  "Competition category",
  "Check-in instructions",
];

export default function RegisterPage() {
  return (
    <>
      <PageHeader
        title="Registration Opens Soon"
        intro={`Online rider registration for the ${site.cupName} is being prepared. Get your rider and horse details ready.`}
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>How to Register</SectionHeading>
          <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, i) => (
              <li
                key={step.title}
                className="rounded-2xl border border-bronze/20 bg-sand p-6"
              >
                <p className="font-display text-4xl font-bold text-bronze/60">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-brown/80">
                  {step.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Your Confirmation Email</SectionHeading>
          <div className="mt-8 grid gap-10 lg:grid-cols-2">
            <div>
              <p className="max-w-xl leading-7 text-brown/85">
                Once your registration is successfully submitted, you&apos;ll
                receive a confirmation email straight away. Keep it safe — you
                will need to present it during event check-in.
              </p>
            </div>
            <ul className="space-y-3">
              {confirmationContents.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-bronze" />
                  <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-14 rounded-2xl bg-bronze-deep px-8 py-10 text-center text-cream">
            <p className="font-display text-xl font-bold uppercase tracking-[0.2em]">
              Get Notified When Registration Opens
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-cream/80">
              Email us and we&apos;ll let you know as soon as it&apos;s live.
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

import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import Reveal from "@/components/Reveal";
import { DocumentIcon, HorseIcon, UsersIcon } from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Register",
  description: `Choose solo or team registration for the ${site.title}.`,
};

/* Matches the Event page's language — dark hero, then the two entries as
   cards shaped like the competition cards. The event facts (date, venue,
   field, prize) are deliberately not repeated here: this page exists to get
   a rider into a form, and the Event page already carries them. */
const registrationOptions = [
  {
    icon: HorseIcon,
    tag: "Individual Championship",
    title: "Solo Registration",
    href: "/register/solo",
    facts: ["1 rider", "3 qualification attempts", "Aarhi knockout"],
    description:
      "Register yourself as an individual rider. You take three attempts to qualify, then ride the Aarhi knockout rounds alone for the podium.",
  },
  {
    icon: UsersIcon,
    tag: "Four-Rider Sections",
    title: "Team Registration",
    href: "/register-team",
    facts: ["4 riders", "Combined scores", "You ride as leader"],
    description:
      "Register a section of four riders, including yourself as team leader. All four scores combine each round, and every rider must check in for the team to compete.",
  },
];

export default function RegisterPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <Image
          src="/images/lancesunset.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[42%_58%] opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/35" />

        <Reveal className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="max-w-3xl">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-bronze">
              1st Open Tent-Pegging Championship
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.9] text-cream sm:text-7xl lg:text-8xl">
              Register
              <span className="mt-2 block italic text-bronze">
                {site.cupName}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-cream/85 sm:text-lg">
              {`Ride alone or bring a section of four. Every rider gets a confirmation code by email, brings it to check-in on ${site.checkInDate}, and only riders who check in are drawn into the brackets.`}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/register/solo" variant="light">
                Register Solo
              </ButtonLink>
              <ButtonLink
                href="/register-team"
                variant="outline"
                className="border-cream/50 text-cream hover:border-bronze hover:text-bronze"
              >
                Register a Team
              </ButtonLink>
            </div>
          </div>
        </Reveal>

        <BrushDivider className="relative text-bronze/80" />
      </section>

      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-col gap-4 border-b border-bronze/25 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                Choose Your Entry
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none text-ink sm:text-5xl">
                Solo or Section
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-brown/75">
              Both entries are open to every rider. You can enter solo and ride
              on a team — one code covers both.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {registrationOptions.map((option) => (
              <Link
                key={option.href}
                href={option.href}
                className="group flex flex-col rounded-2xl border border-bronze/20 bg-sand p-5 transition-[border-color,transform,box-shadow] duration-[var(--dur-base)] ease-[var(--ease-soft)] hover:border-bronze motion-safe:hover:-translate-y-1 motion-safe:hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bronze text-cream">
                    <option.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                      {option.tag}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold uppercase leading-tight text-ink">
                      {option.title}
                    </h3>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {option.facts.map((fact) => (
                    <span
                      key={fact}
                      className="rounded-full border border-bronze/25 bg-cream px-3 py-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark"
                    >
                      {fact}
                    </span>
                  ))}
                </div>

                <p className="mt-5 flex-1 text-sm leading-6 text-brown/85">
                  {option.description}
                </p>

                <span className="mt-6 block rounded-lg bg-bronze-deep px-6 py-3 text-center font-display text-sm font-semibold uppercase tracking-[0.15em] text-cream transition-colors group-hover:bg-bronze">
                  Continue
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-bronze/25 bg-ink px-5 py-5 text-cream sm:px-6">
            <div className="flex items-start gap-4">
              <DocumentIcon className="mt-0.5 h-6 w-6 shrink-0 text-bronze" />
              <div>
                <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-bronze">
                  Before You Ride
                </p>
                <p className="mt-2 text-sm leading-6 text-cream/85">
                  {`Scoring, appeals, equipment and horse-welfare rules are in the `}
                  <Link href="/rules" className="text-bronze underline">
                    official rulebook
                  </Link>
                  {`, alongside the ground, barshi and peg dimension sheets.`}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

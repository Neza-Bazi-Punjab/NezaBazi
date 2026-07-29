import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import Reveal from "@/components/Reveal";
import {
  ArenaLightIcon,
  CalendarIcon,
  HorseIcon,
  MapPinIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Event",
  description:
    "How the Neza Bazi Punjab Championship 2026 runs: Single Tent Pegging with Aarhi knockout rounds, the Section team event, the Championship Cavalcade, day schedule and venue details.",
};

/* The two competitions and the cavalcade, summarised from the official
   rulebook (see /rules for the full simplified rule book). */
const competitions = [
  {
    icon: HorseIcon,
    title: "Single Tent Pegging",
    tag: "Individual Championship",
    facts: ["3 qualification attempts", "4-point carry advances", "Aarhi knockout rounds"],
    paragraphs: [
      "Every rider opens with a qualification round: three attempts to strike the peg at full gallop and carry it past the crossing line. One successful run is enough to advance — miss all three and the championship is over.",
      "Qualified riders then enter the Aarhi elimination rounds: a single run each, where only a clean 4-point carry across the line advances. The knockout continues round after round until just a few riders remain, and the final round decides 1st, 2nd and 3rd.",
    ],
  },
  {
    icon: UsersIcon,
    title: "Section (Teams) Tent Pegging",
    tag: "Four-Rider Sections",
    facts: ["4 riders per team", "2 points struck", "4 points carried"],
    paragraphs: [
      "Teams — “sections” — of four riders take the track together, one run per rider per round, with all four scores combined. A struck peg earns 2 points; carrying it across the line earns 4.",
      "The bar rises every round: 8 points to survive Round 1, 12 in Round 2, and from Round 3 onward a perfect 16-point Full House. Full House rounds repeat until only a few teams are left, and the last round settles the podium.",
    ],
  },
  {
    icon: ArenaLightIcon,
    title: "Championship Cavalcade",
    tag: "Mounted Procession",
    facts: ["All competitors", "Traditional dress", "Saang-tipped lances"],
    paragraphs: [
      "After the Single Tent Pegging event, every team rides in the Championship Cavalcade — a mounted procession of all competitors. Expect traditional dress and decorated horses: every rider competes wearing a Dastaar or religious head covering, lance tipped with a Saang.",
    ],
  },
];

const eventStats = [
  {
    icon: CalendarIcon,
    label: "Date",
    value: site.eventDate,
  },
  {
    icon: MapPinIcon,
    label: "Venue",
    value: site.venue,
  },
  {
    icon: UsersIcon,
    label: "Field",
    value: `${site.riders} riders`,
  },
  {
    icon: TrophyIcon,
    label: "Prize",
    value: site.prize,
  },
];

const schedule = [
  {
    time: "Morning",
    title: "Opening Ceremony & Qualification",
    detail:
      "Riders parade and horse inspection, then Single Tent Pegging qualification: every rider gets three attempts on the main track.",
  },
  {
    time: "Afternoon",
    title: "Aarhi Rounds, Cavalcade & Team Events",
    detail:
      "Knockout Aarhi rounds narrow the singles field, the Championship Cavalcade follows, and the four-rider sections chase 8-, 12- and Full-House 16-point rounds.",
  },
  {
    time: "Evening",
    title: "Finals Under Lights",
    detail:
      "The last Aarhi and Full House rounds in the fully lit arena decide the podiums, followed by the prize ceremony.",
  },
];

export default function EventPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-ink text-cream">
        <Image
          src="/images/fullgallop.webp"
          alt="A Neza Bazi rider at full gallop during competition"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/35" />
        <Reveal className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:min-h-[620px] lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-bronze">
              1st Open Tent-Pegging Championship
            </p>
            <h1 className="mt-4 font-display text-5xl font-bold uppercase leading-[0.9] text-cream sm:text-7xl lg:text-8xl">
              The Event
              <span className="mt-2 block italic text-bronze">
                {site.cupName}
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-cream/85 sm:text-lg">
              {`One day, two championships and a cavalcade: the ${site.title} brings ${site.riders} riders to ${site.venue} on ${site.eventDate} to fight for the ${site.cupName} — individually in Single Tent Pegging and together in four-rider team sections.`}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/register" variant="light">
                Register Now
              </ButtonLink>
              <ButtonLink
                href="/rules"
                variant="outline"
                className="border-cream/50 text-cream hover:border-bronze hover:text-bronze"
              >
                View Rules
              </ButtonLink>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {eventStats.map((stat) => (
              <div
                key={stat.label}
                className="border border-bronze/35 bg-ink/65 p-4 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <stat.icon className="h-6 w-6 shrink-0 text-bronze" />
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.25em] text-cream/65">
                    {stat.label}
                  </p>
                </div>
                <p className="mt-2 font-display text-2xl font-bold uppercase tracking-wide text-cream">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
        <BrushDivider className="relative text-bronze/80" />
      </section>

      {/* The competitions, from the official rulebook */}
      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-col gap-4 border-b border-bronze/25 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                Championship Format
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none text-ink sm:text-5xl">
                The Competitions
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-brown/75">
              Individual skill, four-rider team pressure and a mounted
              procession all packed into one championship day.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {competitions.map((comp) => (
              <article
                key={comp.title}
                className="rounded-2xl border border-bronze/20 bg-sand p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-bronze text-cream">
                    <comp.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-bronze">
                      {comp.tag}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold uppercase leading-tight text-ink">
                      {comp.title}
                    </h3>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {comp.facts.map((fact) => (
                    <span
                      key={fact}
                      className="rounded-full border border-bronze/25 bg-cream px-3 py-1 font-display text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-bronze-dark"
                    >
                      {fact}
                    </span>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {comp.paragraphs.map((text) => (
                    <p
                      key={text.slice(0, 32)}
                      className="text-sm leading-6 text-brown/85"
                    >
                      {text}
                    </p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 rounded-2xl border border-bronze/25 bg-ink px-5 py-5 text-cream sm:px-6">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-bronze">
              Official Rules
            </p>
            <p className="mt-2 text-sm leading-6 text-cream/85">
              {`Scoring, appeals and horse-welfare rules are covered in the `}
              <Link href="/rules" className="text-bronze underline">
                official rulebook
              </Link>
              {` — available to download as a PDF in English and Punjabi.`}
            </p>
          </div>
        </Reveal>
      </section>

      {/* Day schedule */}
      <section className="bg-ink text-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-col gap-4 border-b border-bronze/35 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                {site.eventDate}
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none text-cream sm:text-5xl">
                Day Schedule
              </h2>
            </div>
            <ButtonLink href="/register" variant="light">
              Register Now
            </ButtonLink>
          </div>

          <ol className="mt-10 grid gap-5 lg:grid-cols-3">
            {schedule.map((slot, index) => (
              <li
                key={slot.time}
                className="relative overflow-hidden rounded-2xl border border-bronze/35 bg-cream p-5 text-ink"
              >
                <p className="font-display text-6xl font-bold leading-none text-bronze/20">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-5 font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                  {slot.time}
                </p>
                <h3 className="mt-2 font-display text-2xl font-bold uppercase leading-tight text-ink">
                  {slot.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-brown/85">
                  {slot.detail}
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-8 border-l-4 border-bronze pl-4 text-sm italic text-cream/70">
            Detailed run order will be published closer to the event.
          </p>
        </Reveal>
        <BrushDivider className="text-bronze/80" flip />
      </section>

      {/* Contact: the site's channels, spelled out once in full */}
      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 rounded-2xl border border-bronze/20 bg-sand p-6 sm:p-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                Get in Touch
              </p>
              <h2 className="mt-2 font-display text-4xl font-bold uppercase leading-none text-ink sm:text-5xl">
                Ride, Register, Ask
              </h2>
              <p className="mt-5 max-w-xl leading-7 text-brown/85">
                Questions about riding, registration or the event? Reach the team
                directly:
              </p>
            </div>
            <ul className="space-y-4 text-brown/85">
              <li className="rounded-lg border border-bronze/20 bg-cream px-4 py-3">
                <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                  {`Email: `}
                </span>
                <a
                  href={`mailto:${site.email}`}
                  className="text-bronze underline"
                >
                  {site.email}
                </a>
              </li>
              <li className="rounded-lg border border-bronze/20 bg-cream px-4 py-3">
                <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                  {`Instagram: `}
                </span>
                <a
                  href={site.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bronze underline"
                >
                  {site.socialHandle}
                </a>
              </li>
              <li className="rounded-lg border border-bronze/20 bg-cream px-4 py-3">
                <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                  {`YouTube: `}
                </span>
                <a href={site.youtube} className="text-bronze underline">
                  {site.name}
                </a>
              </li>
            </ul>
          </div>
        </Reveal>
      </section>
    </>
  );
}

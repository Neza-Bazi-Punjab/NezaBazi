import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import {
  ArenaLightIcon,
  HorseIcon,
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
    paragraphs: [
      "Every rider opens with a qualification round: three attempts to strike the peg at full gallop and carry it past the crossing line. One successful run is enough to advance — miss all three and the championship is over.",
      "Qualified riders then enter the Aarhi elimination rounds: a single run each, where only a clean 4-point carry across the line advances. The knockout continues round after round until just a few riders remain, and the final round decides 1st, 2nd and 3rd.",
    ],
  },
  {
    icon: UsersIcon,
    title: "Section (Teams) Tent Pegging",
    paragraphs: [
      "Teams — “sections” — of four riders take the track together, one run per rider per round, with all four scores combined. A struck peg earns 2 points; carrying it across the line earns 4.",
      "The bar rises every round: 8 points to survive Round 1, 12 in Round 2, and from Round 3 onward a perfect 16-point Full House. Full House rounds repeat until only a few teams are left, and the last round settles the podium.",
    ],
  },
  {
    icon: ArenaLightIcon,
    title: "Championship Cavalcade",
    paragraphs: [
      "After the Single Tent Pegging event, every team rides in the Championship Cavalcade — a mounted procession of all competitors. Expect traditional dress and decorated horses: every rider competes wearing a Dastaar or religious head covering, lance tipped with a Saang.",
    ],
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
      <PageHeader
        title="The Event"
        intro={`One day, two championships and a cavalcade: the Neza Bazi Punjab Championship 2026 brings ${site.riders} riders to ${site.venue} on ${site.eventDate} to fight for the ${site.cupName} — individually in Single Tent Pegging and together in four-rider team sections.`}
      />

      {/* The competitions, from the official rulebook */}
      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <SectionHeading>The Competitions</SectionHeading>
          <div className="mt-10 space-y-10">
            {competitions.map((comp) => (
              <div key={comp.title} className="flex items-start gap-4">
                <comp.icon className="mt-1 h-8 w-8 shrink-0 text-bronze" />
                <div>
                  <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                    {comp.title}
                  </h3>
                  {comp.paragraphs.map((text) => (
                    <p
                      key={text.slice(0, 32)}
                      className="mt-2 max-w-3xl text-sm leading-6 text-brown/85"
                    >
                      {text}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-sm text-brown/70">
            {`Scoring, appeals and horse-welfare rules are covered in the `}
            <Link href="/rules" className="text-bronze underline">
              official rulebook
            </Link>
            {` — available to download as a PDF in English and Punjabi.`}
          </p>
        </Reveal>
      </section>

      {/* Day schedule */}
      <section className="bg-sand">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <SectionHeading>Day Schedule</SectionHeading>
          <ol className="mt-10 space-y-6 border-l-2 border-bronze/30 pl-6">
            {schedule.map((slot) => (
              <li key={slot.time} className="relative">
                <span className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-bronze" />
                <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                  {slot.time}
                </p>
                <h3 className="mt-1 font-display text-lg font-bold uppercase tracking-wide text-ink">
                  {slot.title}
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-brown/80">
                  {slot.detail}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm italic text-brown/60">
            Detailed run order will be published closer to the event.
          </p>
        </Reveal>
      </section>

      {/* Contact: the site's channels, spelled out once in full */}
      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Get in Touch</SectionHeading>
          <p className="mt-6 max-w-xl leading-7 text-brown/85">
            Questions about riding, registration or the event? Reach the team
            directly:
          </p>
          <ul className="mt-6 space-y-3 text-brown/85">
            <li>
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
            <li>
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
            <li>
              <span className="font-display text-sm font-bold uppercase tracking-[0.15em] text-ink">
                {`YouTube: `}
              </span>
              <a href={site.youtube} className="text-bronze underline">
                {site.name}
              </a>
            </li>
          </ul>
        </Reveal>
      </section>
    </>
  );
}

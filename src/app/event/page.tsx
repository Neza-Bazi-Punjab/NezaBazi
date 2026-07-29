import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import CtaBand from "@/components/CtaBand";
import DissolvePhoto from "@/components/DissolvePhoto";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Event",
  description:
    "How the Neza Bazi Punjab Championship 2026 runs: Single Tent Pegging with Aarhi knockout rounds, the Section team event, the Championship Cavalcade, day schedule and venue details.",
};

/* The page is built as a poster: the numbers that decide the day carry the
   information, and prose only fills the gaps between them. Every figure here
   comes from the official rulebook (see /rules). */

const headlineStats = [
  { value: site.riders, label: "Riders" },
  { value: "2", label: "Championships" },
  { value: site.prize, label: "Cash Prize" },
  { value: "1", label: "Day" },
];

const competitions = [
  {
    kicker: "Individual",
    title: "Single Tent Pegging",
    blurb:
      "Three attempts to qualify. One run per round after that. Miss, and your championship is over.",
    stats: [
      { value: "3", label: "Attempts to qualify" },
      { value: "1", label: "Run per Aarhi round" },
      { value: "4", label: "Points to advance" },
    ],
    closing:
      "Aarhi knockout rounds repeat until only a handful of riders remain. The final round decides 1st, 2nd and 3rd.",
    photo: "/images/holla.webp",
    photoAlt:
      "A rider at full gallop lowers the lance toward the peg during a run",
    // 800×480 — the lance runs corner to corner, so any other box clips it.
    photoAspect: "aspect-[5/3]",
  },
  {
    kicker: "Teams of Four",
    title: "Section Tent Pegging",
    blurb:
      "Four riders, one run each, all four scores combined. The bar rises every round until nothing but perfection survives.",
    stats: [
      { value: "8", label: "To survive Round 1" },
      { value: "12", label: "To survive Round 2" },
      { value: "16", label: "Full House, Round 3+" },
    ],
    closing:
      "Full House rounds repeat until only a few sections are left standing, and the last round settles the podium.",
    photo: "/images/aboutsport.webp",
    photoAlt: "Riders line up together before a team run at the championship",
    // 980×671 — the lance reaches down to the peg in the bottom-left corner.
    photoAspect: "aspect-[980/671]",
  },
];

const scoring = [
  { value: "2", label: "Points", detail: "Strike the peg" },
  { value: "4", label: "Points", detail: "Carry it past the line" },
];

const schedule = [
  {
    time: "Morning",
    title: "Opening & Qualification",
    detail:
      "Riders parade, horses are inspected, then every rider takes three attempts on the main track.",
  },
  {
    time: "Afternoon",
    title: "Aarhi Rounds & Sections",
    detail:
      "Knockout rounds cut the singles field, the Cavalcade rides, and the four-rider sections chase 8, 12 and Full House.",
  },
  {
    time: "Evening",
    title: "Finals Under Lights",
    detail:
      "The last Aarhi and Full House rounds decide the podiums in the fully lit arena, followed by the prize ceremony.",
  },
];

export default function EventPage() {
  return (
    <>
      {/* Poster hero: the stakes first, in the largest type on the site. */}
      <section className="relative isolate overflow-hidden bg-ink">
        {/* Full-bleed backdrop, so it has to crop to fill the band. The focal
            point is biased onto the lance — which runs from the rider's hand
            down to the peg at lower left — instead of the centre, so the crop
            keeps it in frame at both tall mobile and wide desktop ratios. */}
        <Image
          src="/images/lancesunset.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[42%_58%] opacity-40"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-ink/90 via-ink/65 to-ink/95"
          aria-hidden
        />

        <div className="hero-stagger relative mx-auto max-w-6xl px-6 py-20 text-center sm:py-28">
          {/* Stacks deliberately on narrow screens rather than breaking the
              venue mid-phrase. */}
          <p className="font-display text-xs font-semibold uppercase leading-6 tracking-[0.3em] text-bronze sm:text-sm sm:tracking-[0.35em]">
            <span className="block sm:inline">{site.eventDate}</span>
            <span className="hidden sm:inline">{` · `}</span>
            <span className="block sm:inline">{site.venue}</span>
          </p>

          <h1 className="mt-6 font-display font-bold uppercase leading-[0.88] text-cream">
            <span className="block text-6xl tracking-tight sm:text-8xl lg:text-9xl">
              One Day
            </span>
            <span className="text-shadow-warm block text-6xl italic tracking-tight text-bronze sm:text-8xl lg:text-9xl">
              One Cup
            </span>
          </h1>

          <p className="mx-auto mt-8 max-w-2xl font-display text-base font-medium uppercase tracking-[0.2em] text-cream/85 sm:text-xl">
            {`${site.riders} riders. Two championships. One ${site.cupName}.`}
          </p>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <ButtonLink href="/register">Register Now</ButtonLink>
            <ButtonLink href="/rules" variant="light">
              Read the Rulebook
            </ButtonLink>
          </div>
        </div>

        <BrushDivider className="relative text-sand" />
      </section>

      {/* The numbers that define the day, oversized. */}
      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-10 sm:py-12">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-10 text-center lg:grid-cols-4">
            {headlineStats.map((stat, index) => (
              /* Counted in one after another, so the numbers land like a
                 scoreboard rather than appearing all at once. */
              <Reveal key={stat.label} delayMs={index * 90}>
                <dt className="sr-only">{stat.label}</dt>
                <dd>
                  <span className="block font-display text-5xl font-bold tracking-tight text-bronze sm:text-6xl lg:text-7xl">
                    {stat.value}
                  </span>
                  <span className="mt-2 block font-display text-xs font-semibold uppercase tracking-[0.25em] text-brown/80 sm:text-sm">
                    {stat.label}
                  </span>
                </dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* The two competitions, led by their scoring thresholds. */}
      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <Reveal>
            <SectionHeading>Two Ways to Win</SectionHeading>
          </Reveal>

          <div className="mt-10 space-y-12">
            {competitions.map((competition, index) => (
              <div
                key={competition.title}
                className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
              >
                {/* Photo lands first, the text follows a beat later, so the
                    block assembles itself instead of appearing as one slab. */}
                <Reveal
                  className={index % 2 === 1 ? "lg:order-last" : undefined}
                >
                  <DissolvePhoto
                    src={competition.photo}
                    alt={competition.photoAlt}
                    fade="wide"
                    className={`${competition.photoAspect} mx-auto w-full max-w-xl lg:max-w-none`}
                    sizes="(max-width: 1024px) 100vw, 32rem"
                  />
                </Reveal>

                <Reveal delayMs={140}>
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
                    {competition.kicker}
                  </p>
                  <h3 className="mt-3 font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight text-bronze-dark sm:text-5xl">
                    {competition.title}
                  </h3>
                  <p className="mt-5 text-lg leading-8 text-brown">
                    {competition.blurb}
                  </p>

                  <div className="mt-8 grid grid-cols-3 gap-4 border-y border-bronze/25 py-6">
                    {competition.stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="font-display text-4xl font-bold tracking-tight text-bronze sm:text-5xl">
                          {stat.value}
                        </p>
                        <p className="mt-1.5 font-display text-[0.65rem] font-semibold uppercase leading-4 tracking-[0.15em] text-brown/75">
                          {stat.label}
                        </p>
                      </div>
                    ))}
                  </div>

                  <p className="mt-6 leading-7 text-brown/85">
                    {competition.closing}
                  </p>
                </Reveal>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scoring, reduced to the only two numbers that matter on the track. */}
      <section className="dust-glow bg-parchment">
        <Reveal className="mx-auto max-w-6xl px-6 py-12 sm:py-14">
          <div className="text-center">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.35em] text-bronze-dark sm:text-sm">
              Every Run Is Scored
            </p>
            <div className="mt-10 grid gap-10 sm:grid-cols-2">
              {scoring.map((entry, index) => (
                <Reveal key={entry.detail} delayMs={index * 130}>
                  <p className="text-shadow-warm font-display text-7xl font-bold leading-none tracking-tight text-bronze sm:text-8xl">
                    {entry.value}
                  </p>
                  <p className="mt-2 font-display text-sm font-semibold uppercase tracking-[0.3em] text-brown">
                    {entry.label}
                  </p>
                  <p className="mt-3 font-display text-lg font-medium uppercase tracking-[0.12em] text-ink">
                    {entry.detail}
                  </p>
                </Reveal>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-2xl leading-7 text-brown/85">
              {`Nothing else counts. Full scoring, appeals and horse-welfare rules are in the `}
              <Link href="/rules" className="font-semibold text-bronze underline">
                official rulebook
              </Link>
              {`.`}
            </p>
          </div>
        </Reveal>
      </section>

      {/* The Cavalcade — the one part of the day that is not a contest. */}
      <section className="bg-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-12 sm:py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          {/* 547×1024, and the top third is empty sky. The box is shorter than
              the file and anchored to the bottom, so the crop takes the sky
              and keeps the rider and the lance running down to the ground.
              Width-capped so the tall ratio does not tower over the text. */}
          <Reveal>
            <DissolvePhoto
              src="/images/heritage.webp"
              alt="Riders in traditional dress ride together in procession"
              fade="wide"
              className="mx-auto aspect-[547/760] w-full max-w-[21rem]"
              imageClassName="object-bottom"
              sizes="(max-width: 1024px) 100vw, 21rem"
            />
          </Reveal>
          <Reveal delayMs={140}>
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
              Not a Contest
            </p>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight text-bronze-dark sm:text-5xl">
              Championship Cavalcade
            </h2>
            <p className="mt-5 text-lg leading-8 text-brown">
              {`Every team rides together after the singles event — a mounted procession of the whole field in traditional dress, on decorated horses.`}
            </p>
            <p className="mt-4 leading-7 text-brown/85">
              {`Every rider competes wearing a Dastaar or religious head covering, lance tipped with a Saang.`}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Day schedule as three bold blocks rather than a list. */}
      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <Reveal>
            <SectionHeading>How the Day Runs</SectionHeading>
          </Reveal>

          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            {schedule.map((slot, index) => (
              <Reveal
                key={slot.time}
                delayMs={index * 90}
                className="border-t-2 border-bronze pt-6"
              >
                <p className="font-display text-3xl font-bold uppercase tracking-tight text-bronze sm:text-4xl">
                  {slot.time}
                </p>
                <h3 className="mt-3 font-display text-lg font-bold uppercase tracking-[0.1em] text-ink">
                  {slot.title}
                </h3>
                <p className="mt-3 leading-7 text-brown/85">{slot.detail}</p>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 text-sm italic text-brown/60">
            Detailed run order will be published closer to the event.
          </p>
        </div>
      </section>

      <CtaBand />

      {/* Contact: the site's channels, spelled out once in full */}
      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-12">
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

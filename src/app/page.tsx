import Image from "next/image";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import CtaBand from "@/components/CtaBand";
import DissolvePhoto from "@/components/DissolvePhoto";
import FlagRow from "@/components/FlagRow";
import IconBadge from "@/components/IconBadge";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import {
  ArenaLightIcon,
  CalendarIcon,
  HorseIcon,
  LedScreenIcon,
  MapPinIcon,
  SeatIcon,
  TrophyIcon,
} from "@/components/icons";
import { site } from "@/lib/site";

const schedule = [
  {
    time: "Morning",
    title: "Opening Ceremony & Qualifying Runs",
    detail:
      "Riders parade, horse inspection and the first qualifying rounds on the main track.",
  },
  {
    time: "Afternoon",
    title: "Team Events & Quarter-Finals",
    detail:
      "Team relay runs and knockout rounds as the field narrows toward the finals.",
  },
  {
    time: "Evening",
    title: "Finals Under Lights",
    detail:
      "Individual finals in the fully lit arena, followed by the prize ceremony.",
  },
];

const categories = [
  {
    title: "Open Individual",
    detail: "The main event: individual lance runs, open to all riders.",
  },
  {
    title: "Team Relay",
    detail: "Teams of riders combine scores across consecutive runs.",
  },
];

const highlights = [
  { icon: ArenaLightIcon, lines: ["Fully Lit Arena", "Night & Day Events"] },
  { icon: SeatIcon, lines: ["Premium Seating", "For Spectators"] },
  { icon: LedScreenIcon, lines: ["Big LED Display", "Live Action"] },
  { icon: HorseIcon, lines: ["Horse Staging", "& Facilities"] },
];

export default function Home() {
  return (
    <>
      {/* Hero: every key fact (what, where, when, prize) inside the first
          mobile viewport, with the rider photo as a shorter dissolving strip
          below the facts on mobile and a page-bleed to the right on desktop. */}
      <section className="dust-glow relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-5 px-6 pb-8 pt-8 sm:pt-14 lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-28 lg:pt-16">
          <div className="hero-stagger relative z-10">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-brown/80 sm:text-sm sm:tracking-[0.3em]">
              1st Open Tent-Pegging Championship
            </p>

            <h1 className="mt-3 font-display font-bold uppercase leading-[0.95] text-brown sm:mt-5">
              <span className="block text-5xl tracking-tight sm:text-7xl lg:text-8xl">
                Neza Bazi
              </span>
              <span className="block text-5xl italic tracking-tight text-bronze sm:text-7xl lg:text-8xl">
                Punjab
              </span>
              <span className="mt-2 block text-xl font-semibold tracking-[0.3em] text-brown sm:mt-3 sm:text-3xl">
                Championship 2026
              </span>
            </h1>

            <p className="mt-4 flex items-center gap-2 font-display text-lg font-medium uppercase tracking-[0.2em] text-bronze">
              <MapPinIcon className="h-5 w-5 shrink-0" />
              {site.venue}
            </p>

            <div className="mt-4 space-y-2.5">
              <p className="flex items-center gap-2.5 font-display text-base font-semibold uppercase tracking-[0.12em] text-ink">
                <CalendarIcon className="h-6 w-6 shrink-0 text-bronze" />
                {site.eventDate}
              </p>
              <p className="flex items-start gap-2.5 font-display text-base font-semibold uppercase tracking-[0.12em] text-ink">
                <TrophyIcon className="mt-0.5 h-6 w-6 shrink-0 text-bronze" />
                <span>
                  <span className="text-bronze-dark">{site.prize}</span> Cash
                  Prize
                  <span className="mt-0.5 block text-xs font-semibold tracking-[0.2em] text-brown/80">
                    {site.cupName} · 1st Place
                  </span>
                </span>
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <ButtonLink href="/register">Register Now</ButtonLink>
              <ButtonLink href="/about" variant="outline">
                Learn More
              </ButtonLink>
            </div>

            <FlagRow className="mt-6" />
          </div>

          {/* Rider photo dissolves into the parchment at every viewport — no
              card edge. Short strip on mobile so the facts own the first
              screen; bleeds to the top-right of the page on desktop. */}
          <div className="hero-photo-fade relative aspect-[3/2] w-full overflow-hidden sm:aspect-[16/9] lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[clamp(32rem,calc(38vw+8rem),56rem)]">
            <Image
              src="/images/hero-rider.webp"
              alt="A rider in blue lowers the lance at a full gallop during a Neza Bazi run"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 52vw"
              className="object-cover object-[50%_55%] sm:object-center lg:object-[50%_92%]"
            />
          </div>
        </div>
        <BrushDivider className="text-bronze/80" />
      </section>

      {/* About preview */}
      <section className="bg-cream">
        <Reveal className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <SectionHeading>About Neza Bazi</SectionHeading>
            <p className="mt-6 max-w-md leading-7 text-brown/85">
              Neza Bazi is Punjab&apos;s tent-pegging sport: full gallop,
              lowered lance, one peg to strike clean off the ground before the
              line.
            </p>
            <ButtonLink href="/about" variant="outline" className="mt-8">
              Discover More
            </ButtonLink>
          </div>
          <DissolvePhoto
            src="/images/lancesunset.webp"
            alt="A rider strikes the peg at sunset in front of a packed crowd"
            className="aspect-[3/2]"
          />
        </Reveal>
      </section>

      {/* Day schedule (folded in from the former Event page) */}
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

      {/* Categories */}
      <section className="bg-cream">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <SectionHeading>Categories</SectionHeading>
          <ul className="mt-10 grid gap-8 md:grid-cols-2">
            {categories.map((cat) => (
              <li key={cat.title}>
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                  {cat.title}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-brown/80">
                  {cat.detail}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Event highlights */}
      <section className="bg-sand">
        <Reveal className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <SectionHeading>Event Highlights</SectionHeading>
          <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {highlights.map(({ icon: Icon, lines }, i) => (
              <li
                key={lines.join()}
                className={`group flex flex-col items-center gap-4 text-center transition-transform duration-[var(--dur-base)] ease-[var(--ease-soft)] motion-safe:hover:-translate-y-1 ${
                  i > 0 ? "lg:border-l lg:border-bronze/20" : ""
                }`}
              >
                <IconBadge className="transition-transform duration-[var(--dur-base)] ease-[var(--ease-soft)] motion-safe:group-hover:scale-105">
                  <Icon className="h-9 w-9" />
                </IconBadge>
                <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                  {lines[0]}
                  <span className="block">{lines[1]}</span>
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}

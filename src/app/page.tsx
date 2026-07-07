import Image from "next/image";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import CtaBand from "@/components/CtaBand";
import DissolvePhoto from "@/components/DissolvePhoto";
import FlagRow from "@/components/FlagRow";
import IconBadge from "@/components/IconBadge";
import InfoStrip from "@/components/InfoStrip";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import {
  ArenaLightIcon,
  HorseIcon,
  LedScreenIcon,
  SeatIcon,
  TrophyIcon,
} from "@/components/icons";
import { site } from "@/lib/site";

const highlights = [
  { icon: ArenaLightIcon, lines: ["Fully Lit Arena", "Night & Day Events"] },
  { icon: SeatIcon, lines: ["Premium Seating", "For Spectators"] },
  { icon: LedScreenIcon, lines: ["Big LED Display", "Live Action"] },
  { icon: HorseIcon, lines: ["Horse Staging", "& Facilities"] },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="dust-glow relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-12 sm:pt-16 lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr] lg:pb-28">
          <div className="hero-stagger relative z-10">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-brown/60">
              www.nbp.com
            </p>
            <p className="mt-1 font-display text-sm font-bold uppercase tracking-[0.4em] text-ink">
              Neza Bazi Punjab
            </p>
            <FlagRow className="mt-4" />

            <h1 className="mt-6 font-display font-bold uppercase leading-[0.95] text-brown">
              <span className="block text-6xl tracking-tight sm:text-7xl lg:text-8xl">
                Neza Bazi
              </span>
              <span className="block text-6xl italic tracking-tight text-bronze sm:text-7xl lg:text-8xl">
                Punjab
              </span>
              <span className="mt-3 block text-2xl font-semibold tracking-[0.3em] text-brown sm:text-3xl">
                Championship 2026
              </span>
            </h1>

            <p className="mt-5 font-display text-lg font-medium uppercase tracking-[0.3em] text-bronze">
              {site.tagline}
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <ButtonLink href="/register">Register Now</ButtonLink>
              <ButtonLink href="/about" variant="outline">
                Learn More
              </ButtonLink>
            </div>
          </div>

          {/* Rider photo dissolves into the parchment at every viewport — no
              card edge. On desktop it also bleeds to the top-right of the page,
              like the poster. */}
          <div className="hero-photo-fade relative aspect-[4/5] w-full overflow-hidden lg:absolute lg:inset-y-0 lg:right-0 lg:aspect-auto lg:w-[clamp(32rem,calc(38vw+8rem),56rem)]">
            <Image
              src="/images/hero-rider.webp"
              alt="A rider in blue lowers the lance at a full gallop during a Neza Bazi run"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 52vw"
              className="object-cover object-top lg:object-[50%_92%]"
            />
          </div>
        </div>
        <BrushDivider className="text-bronze/80" />
      </section>

      <InfoStrip />

      {/* About preview */}
      <section className="bg-sand">
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

      {/* Event highlights */}
      <section className="bg-cream">
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

      {/* Gurdaspur Cup prize band */}
      <section className="bg-bronze-deep text-cream">
        <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-16 text-center sm:py-20 lg:flex-row lg:justify-between lg:text-left">
          <div className="flex flex-col items-center gap-6 lg:flex-row lg:gap-8">
            <TrophyIcon className="h-16 w-16 shrink-0 text-cream/90" />
            <div>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-cream/70">
                {site.cupName} · 1st Place
              </p>
              <p className="text-shadow-warm mt-2 font-display text-5xl font-bold uppercase tracking-tight sm:text-6xl">
                {site.prize} Cash Prize
              </p>
              <p className="mt-3 text-sm leading-6 text-cream/75">
                {`Win the inaugural ${site.cupName} on ${site.eventDate} and take home the champion's purse.`}
              </p>
            </div>
          </div>
          <ButtonLink href="/register" variant="light" className="shrink-0">
            Register Now
          </ButtonLink>
        </Reveal>
      </section>

      <CtaBand />
    </>
  );
}

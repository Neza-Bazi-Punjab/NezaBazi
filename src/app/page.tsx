import Image from "next/image";
import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import FlagRow from "@/components/FlagRow";
import {
  CalendarIcon,
  MapPinIcon,
  PlayIcon,
  TrophyIcon,
  UsersIcon,
} from "@/components/icons";
import { site } from "@/lib/site";

export default function Home() {
  return (
    <>
      {/* Hero: the page is intentionally hero-only — every key fact (what,
          where, when, prize, field size, rewards, live broadcast) lives here,
          with the rider photo as a shorter dissolving strip below the facts
          on mobile and a page-bleed to the right on desktop. */}
      <section className="dust-glow relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-5 px-6 pb-8 pt-8 sm:pt-12 lg:min-h-[640px] lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-28 lg:pt-14">
          <div className="hero-stagger relative z-10">
            <FlagRow className="mb-5" />

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
                  <span className="text-bronze-dark">{site.prize}</span>
                  {` Cash Prize`}
                  <span className="mt-0.5 block text-xs font-semibold tracking-[0.2em] text-brown/80">
                    {`${site.cupName} · 1st Place`}
                  </span>
                </span>
              </p>
              <p className="flex items-center gap-2.5 font-display text-base font-semibold uppercase tracking-[0.12em] text-ink">
                <UsersIcon className="h-6 w-6 shrink-0 text-bronze" />
                <span className="text-bronze-dark">{site.riders}</span>
                {` Riders`}
              </p>
              <p className="flex items-center gap-2.5 font-display text-base font-semibold uppercase tracking-[0.12em] text-ink">
                <PlayIcon className="h-6 w-6 shrink-0 text-bronze" />
                Broadcast Live
              </p>
            </div>

            <div className="mt-6 flex flex-wrap gap-4">
              <ButtonLink href="/register">Register Now</ButtonLink>
              <ButtonLink href="/event" variant="outline">
                Event Details
              </ButtonLink>
            </div>
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
              className="object-cover object-[50%_55%] sm:object-center lg:-translate-y-8 lg:scale-110 lg:object-[25%_92%]"
            />
          </div>
        </div>
        <BrushDivider className="text-bronze/80" />
      </section>
    </>
  );
}

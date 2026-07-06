import BrushDivider from "@/components/BrushDivider";
import ButtonLink from "@/components/Button";
import CtaBand from "@/components/CtaBand";
import FlagRow from "@/components/FlagRow";
import IconBadge from "@/components/IconBadge";
import ImagePlaceholder from "@/components/ImagePlaceholder";
import InfoStrip from "@/components/InfoStrip";
import SectionHeading from "@/components/SectionHeading";
import {
  ArenaLightIcon,
  HorseIcon,
  LedScreenIcon,
  SeatIcon,
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
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:pb-24">
          <div>
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

          <ImagePlaceholder
            name="hero-rider.jpg"
            label="Nihang rider at full charge"
            className="aspect-[3/4] max-h-[560px]"
          />
        </div>
        <BrushDivider className="text-bronze/80" />
      </section>

      <InfoStrip />

      {/* About preview */}
      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <SectionHeading>About Neza Bazi</SectionHeading>
            <p className="mt-6 max-w-md leading-7 text-brown/85">
              Neza Bazi is the brave and historic equestrian sport of Punjab. A
              test of skill, speed and precision that reflects our rich
              heritage and warrior spirit.
            </p>
            <ButtonLink href="/about" variant="outline" className="mt-8">
              Discover More
            </ButtonLink>
          </div>
          <ImagePlaceholder
            name="about-sunset.jpg"
            label="Rider with lance at sunset"
            className="aspect-video"
          />
        </div>
      </section>

      {/* Event highlights */}
      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <SectionHeading>Event Highlights</SectionHeading>
          <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-12 lg:grid-cols-4">
            {highlights.map(({ icon: Icon, lines }, i) => (
              <li
                key={lines.join()}
                className={`flex flex-col items-center gap-4 text-center ${
                  i > 0 ? "lg:border-l lg:border-bronze/20" : ""
                }`}
              >
                <IconBadge>
                  <Icon className="h-9 w-9" />
                </IconBadge>
                <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                  {lines[0]}
                  <span className="block">{lines[1]}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

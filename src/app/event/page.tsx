import type { Metadata } from "next";
import ButtonLink from "@/components/Button";
import PageHeader from "@/components/PageHeader";
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
  UsersIcon,
} from "@/components/icons";
import { site, sponsors } from "@/lib/site";

export const metadata: Metadata = {
  title: "Event",
  description: `Compete for the ${site.cupName} — ${site.eventDate} at ${site.venue}. ${site.prize} first-place cash prize. Schedule, categories and facilities.`,
};

const keyFacts = [
  { icon: CalendarIcon, label: "Date", value: site.eventDate },
  { icon: MapPinIcon, label: "Venue", value: site.venue },
  { icon: TrophyIcon, label: "Edition", value: "1st Open Championship" },
  { icon: UsersIcon, label: "Field", value: "International Participation" },
];

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
    detail: "The main event — individual lance runs, open to all riders.",
  },
  {
    title: "Team Relay",
    detail: "Teams of riders combine scores across consecutive runs.",
  },
  {
    title: "International Exhibition",
    detail: "Showcase runs by visiting international riders and clubs.",
  },
];

const facilities = [
  { icon: ArenaLightIcon, text: "Fully lit arena for night & day events" },
  { icon: SeatIcon, text: "Premium seating for spectators" },
  { icon: LedScreenIcon, text: "Big LED display with live action" },
  { icon: HorseIcon, text: "Horse staging & stabling facilities" },
];

export default function EventPage() {
  return (
    <>
      <PageHeader
        title="Championship 2026"
        intro={`Riders from around the world compete for the ${site.cupName} on ${site.eventDate} — here's the schedule, categories and facilities.`}
      />

      <section className="bg-cream">
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 py-12 lg:grid-cols-4">
          {keyFacts.map(({ icon: Icon, label, value }, i) => (
            <li
              key={label}
              className={`flex flex-col items-center gap-2 text-center ${
                i > 0 ? "lg:border-l lg:border-bronze/25" : ""
              }`}
            >
              <Icon className="h-10 w-10 text-bronze" />
              <p className="text-xs uppercase tracking-[0.3em] text-brown/60">
                {label}
              </p>
              <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                {value}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Gurdaspur Cup */}
      <section className="bg-bronze-deep text-cream">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-6 py-14 text-center lg:flex-row lg:gap-10 lg:text-left">
          <TrophyIcon className="h-16 w-16 shrink-0 text-cream/90" />
          <div>
            <p className="font-display text-sm font-semibold uppercase tracking-[0.35em] text-cream/70">
              The {site.cupName}
            </p>
            <p className="text-shadow-warm mt-2 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
              {site.prize} Cash Prize · 1st Place
            </p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cream/75">
              {`The champion of the inaugural ${site.cupName} takes home the trophy and the ${site.prize} winner's purse. Further placings and prizes will be announced with the final run order.`}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-16">
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
        </div>
      </section>

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Categories</SectionHeading>
          <Reveal as="ul" className="mt-10 grid gap-6 md:grid-cols-3">
            {categories.map((cat) => (
              <li
                key={cat.title}
                className="rounded-2xl border border-bronze/20 bg-sand p-6"
              >
                <h3 className="font-display text-lg font-bold uppercase tracking-wide text-bronze-dark">
                  {cat.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-brown/80">
                  {cat.detail}
                </p>
              </li>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Facilities</SectionHeading>
          <Reveal as="ul" className="mt-10 grid gap-6 sm:grid-cols-2">
            {facilities.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-4">
                <Icon className="h-9 w-9 shrink-0 text-bronze" />
                <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                  {text}
                </p>
              </li>
            ))}
          </Reveal>
          <ButtonLink href="/register" className="mt-12">
            Register Now
          </ButtonLink>
        </div>
      </section>

      {/* Sponsors */}
      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Powered By</SectionHeading>
          <Reveal as="ul" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {sponsors.map((sponsor) => (
              <li
                key={sponsor}
                className="flex items-center justify-center rounded-2xl border border-bronze/20 bg-sand px-6 py-10 text-center"
              >
                <p className="font-display text-base font-bold uppercase tracking-[0.12em] text-bronze-dark">
                  {sponsor}
                </p>
              </li>
            ))}
          </Reveal>
          <p className="mt-8 text-sm text-brown/70">
            Interested in sponsoring the championship? Contact{" "}
            <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="text-bronze underline">
              {site.phone}
            </a>{" "}
            or{" "}
            <a href={`mailto:${site.email}`} className="text-bronze underline">
              {site.email}
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}

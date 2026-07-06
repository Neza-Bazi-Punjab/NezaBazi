import type { Metadata } from "next";
import ButtonLink from "@/components/Button";
import PageHeader from "@/components/PageHeader";
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
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Event",
  description: `Championship details — ${site.eventDate} at ${site.venue}. Schedule, categories and facilities.`,
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
    detail: "The flagship event — individual lance runs, open to all riders.",
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
        intro="Everything you need to know about the Neza Bazi Punjab Championship — date, venue, schedule, categories and facilities."
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
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
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
          </ul>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Facilities</SectionHeading>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {facilities.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-4">
                <Icon className="h-9 w-9 shrink-0 text-bronze" />
                <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink">
                  {text}
                </p>
              </li>
            ))}
          </ul>
          <ButtonLink href="/register" className="mt-12">
            Register Now
          </ButtonLink>
        </div>
      </section>
    </>
  );
}

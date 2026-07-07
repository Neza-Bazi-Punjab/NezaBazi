import { site } from "@/lib/site";
import {
  CalendarIcon,
  MapPinIcon,
  TrophyIcon,
  UsersIcon,
} from "./icons";

const facts = [
  { icon: TrophyIcon, lines: ["1st Open", "Championship"] },
  { icon: CalendarIcon, lines: [site.eventDate, "Event Date"] },
  { icon: MapPinIcon, lines: ["Gurdaspur", "Venue"] },
  { icon: UsersIcon, lines: ["International", "Participation"] },
];

/* Home-page strip of key event facts (edition, date, venue, participation) */
export default function InfoStrip() {
  return (
    <section aria-label="Key event facts" className="bg-cream">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-y-10 px-6 py-12 lg:grid-cols-4">
        {facts.map(({ icon: Icon, lines }, i) => (
          <li
            key={lines.join()}
            className={`flex flex-col items-center gap-3 text-center ${
              i > 0 ? "lg:border-l lg:border-bronze/25" : ""
            }`}
          >
            <Icon className="h-11 w-11 text-bronze" />
            <p className="font-display text-sm font-semibold uppercase tracking-[0.15em] text-ink">
              {lines[0]}
              <span className="block">{lines[1]}</span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

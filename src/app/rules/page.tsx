import type { Metadata } from "next";
import ButtonLink from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import SectionHeading from "@/components/SectionHeading";

export const metadata: Metadata = {
  title: "Rules",
  description:
    "Competition format, equipment, scoring and conduct for the Neza Bazi Punjab Championship 2026.",
};

const scoring = [
  {
    points: "6",
    title: "Carry",
    detail:
      "The peg is struck, lifted and carried cleanly on the lance past the finish line.",
  },
  {
    points: "4",
    title: "Draw",
    detail:
      "The peg is struck and drawn out of the ground but not carried to the line.",
  },
  {
    points: "2",
    title: "Strike",
    detail: "The peg is clearly struck by the lance but remains in the ground.",
  },
  {
    points: "0",
    title: "Miss",
    detail: "The peg is untouched, or the run is broken off before the gallop.",
  },
];

const conduct = [
  "Riders must complete the run at a full gallop through the timed section; a broken gait voids the run.",
  "Each rider is responsible for the fitness and welfare of their horse — veterinary checks apply before competition.",
  "Approved riding helmets or traditional protective headwear are required in the arena.",
  "Any interference with another rider's run leads to disqualification from the round.",
  "The judges' scoring decisions on each run are final.",
];

export default function RulesPage() {
  return (
    <>
      <PageHeader
        title="Rules of Competition"
        intro="The championship follows internationally recognised tent-pegging rules, honouring the traditions of Neza Bazi. Full regulations will be shared with registered riders."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Format</SectionHeading>
          <div className="mt-6 max-w-3xl space-y-4 leading-7 text-brown/85">
            <p>
              Each rider makes a series of runs down a straight track at full
              gallop, aiming to strike and carry a ground peg with the lance.
              Qualifying rounds decide the field for the knockout stages, and
              cumulative scores decide the champions in each category.
            </p>
            <p>
              Ties in the final rounds are broken by timed run-offs on
              progressively smaller pegs.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Scoring</SectionHeading>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {scoring.map((rule) => (
              <li
                key={rule.title}
                className="rounded-2xl border border-bronze/20 bg-cream p-6 text-center"
              >
                <p className="font-display text-5xl font-bold text-bronze">
                  {rule.points}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.3em] text-brown/60">
                  points
                </p>
                <h3 className="mt-3 font-display text-lg font-bold uppercase tracking-wide text-ink">
                  {rule.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-brown/80">
                  {rule.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-cream">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Equipment</SectionHeading>
          <div className="mt-6 max-w-3xl space-y-4 leading-7 text-brown/85">
            <p>
              Runs are made with a regulation lance of approximately 2.5
              metres, wooden or cane shafted with a steel tip. Pegs are of
              standard competition sizes, reducing through the rounds as the
              difficulty increases.
            </p>
            <p>
              Riders may compete in traditional Punjabi dress or approved
              equestrian attire. All tack must pass safety inspection before
              each round.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <SectionHeading>Conduct &amp; Safety</SectionHeading>
          <ul className="mt-8 max-w-3xl space-y-4">
            {conduct.map((rule) => (
              <li key={rule} className="flex gap-3 leading-7 text-brown/85">
                <span className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-bronze" />
                {rule}
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

import type { StatsView } from "./SeasonViewNav";

const riderTerms: [string, string][] = [
  ["Runs", "Runs ridden, including any whose result was not recorded."],
  ["C", "Carry: the peg is picked up and carried past the line. 4 points."],
  ["S", "Strike: the peg is hit but not carried. 2 points."],
  ["M", "Miss: the peg is not hit. 0 points."],
  ["Qual", "Qualification: the points the rider scored in it."],
  ["Aarhi 1, Aarhi 2", "Aarhi round 1 and Aarhi round 2: points in each knockout round."],
  ["Placing", "Placing ride: one ride for first place or for third place, not a round everyone rode."],
  ["Pts", "Points: 4 for each carry and 2 for each strike."],
  ["Pts/Run", "Points divided by the runs that have a recorded result."],
  ["Carry %", "Carries out of the runs that have a recorded result."],
  ["Hit %", "Carries and strikes together, out of the runs that have a recorded result."],
  ["Reached", "The furthest round the rider rode in."],
  ["Place", "1st, 2nd or 3rd overall."],
];

const teamTerms: [string, string][] = [
  ["Round points", "A team's total for one ride, out of 16: four riders, up to 4 points each. 16 is a full house."],
  ["Round 1, Round 2", "Teams were placed on each round's result, not on a running total."],
  ["3rd place", "3rd place ride-off: the ride for third place."],
  ["Final", "Final: the ride for first place."],
  ["Tie-break", "Final tie-break: the final finished level, so both teams rode again."],
  ["Reached", "The furthest round the team rode in."],
  ["Place", "1st, 2nd or 3rd overall."],
];

/* What the table's short headings mean, in plain words. */
export default function StatsLegend({ view }: { view: StatsView }) {
  const terms = view === "teams" ? teamTerms : riderTerms;

  return (
    <div className="space-y-3 text-sm leading-6">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
        {terms.map(([term, meaning]) => (
          <div key={term} className="contents">
            <dt className="font-display font-semibold uppercase tracking-wide text-bronze-dark">
              {term}
            </dt>
            <dd className="text-brown/90">{meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-bronze/15 pt-3 text-brown/85">
        <span aria-hidden className="font-semibold">
          –
        </span>
        <span className="sr-only">A dash</span> means it was ridden but the result was not recorded.
        It still counts as {view === "teams" ? "a ride and scores nothing" : "a run, scores nothing, and is left out of the percentages"}. A blank means not ridden.
      </p>
    </div>
  );
}

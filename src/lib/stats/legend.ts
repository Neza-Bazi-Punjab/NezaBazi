/* The Stats legend: what a first-time visitor needs to read the table. Short
   titled sections, each a list of a term and one plain line. Pure, so the
   page test can check it covers every column of the view.

   Keep every line short and plain. No em dashes, and no names of any group. */

export interface LegendSection {
  title: string;
  terms: { term: string; meaning: string }[];
}

export type LegendView = "riders" | "teams";

const POINTS: LegendSection = {
  title: "How points work",
  terms: [
    { term: "Carry", meaning: "The peg is lifted and carried past the line. 4 points." },
    { term: "Strike", meaning: "The peg is hit but not carried. 2 points." },
    { term: "Miss", meaning: "The peg is not hit. 0 points." },
  ],
};

const RIDER_ROUNDS: LegendSection = {
  title: "How a rider goes through",
  terms: [
    { term: "Qualification", meaning: "Two tries at a 6 cm peg. 4 points in total goes through." },
    { term: "Aarhi round 1", meaning: "One try at a smaller 4 cm peg. Only a carry goes through." },
    {
      term: "Aarhi round 2",
      meaning: "One try. Riders who carried rode for first place, riders who struck rode for third.",
    },
    { term: "Placing ride", meaning: "One ride to decide first and second, or third." },
  ],
};

const TEAM_ROUNDS: LegendSection = {
  title: "How a team goes through",
  terms: [
    { term: "A ride", meaning: "Four riders ride together, one peg each. A ride is out of 16." },
    { term: "Full house", meaning: "16 out of 16: all four riders carried." },
    { term: "Round 1", meaning: "8 or more goes through." },
    {
      term: "Round 2",
      meaning: "12 or more goes to the Final. The next best teams rode off for third place.",
    },
    {
      term: "Final",
      meaning: "The higher total wins. It finished level, so both teams rode a tie-break.",
    },
  ],
};

const RIDER_TABLE: LegendSection = {
  title: "Reading the table",
  terms: [
    { term: "Runs", meaning: "Runs ridden." },
    { term: "C / S / M", meaning: "Carries, strikes and misses." },
    { term: "Qual, Aarhi 1, Aarhi 2, Placing", meaning: "Points in each round." },
    { term: "Pts", meaning: "Total points." },
    { term: "Pts/Run", meaning: "Average points for each run." },
    { term: "Carry %", meaning: "How often the rider carried the peg." },
    { term: "Hit %", meaning: "How often the rider carried or struck the peg." },
    { term: "Reached", meaning: "The furthest round the rider rode in." },
    { term: "Place", meaning: "1st, 2nd or 3rd." },
    { term: "–", meaning: "Ridden, but the result was not recorded. Left out of the % columns." },
    { term: "Blank", meaning: "Did not ride that round." },
  ],
};

const TEAM_TABLE: LegendSection = {
  title: "Reading the table",
  terms: [
    { term: "Round 1, Round 2", meaning: "The team's total in that round, out of 16." },
    { term: "3rd place", meaning: "The ride-off for third place." },
    { term: "Final, Tie-break", meaning: "The ride for first place, and the ride after it finished level." },
    { term: "Reached", meaning: "The furthest round the team rode in." },
    { term: "Place", meaning: "1st, 2nd or 3rd." },
    { term: "–", meaning: "Ridden, but the total was not recorded." },
    { term: "Scratched", meaning: "This ride did not count. It scored nothing." },
    { term: "Out", meaning: "The team was put out. No total was announced." },
    { term: "Blank", meaning: "Did not ride that round." },
  ],
};

/* The sections for one view, in the order they are shown. */
export function legendSections(view: LegendView): LegendSection[] {
  return view === "teams" ? [POINTS, TEAM_ROUNDS, TEAM_TABLE] : [POINTS, RIDER_ROUNDS, RIDER_TABLE];
}

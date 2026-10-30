// The check-in desk's instant search: filters the rider list the panel keeps
// in memory, as the administrator types, from the first letter.
//
// Matching is "begins with", not "contains", so one letter gives a short list:
// typing "a" finds Arman, not Janav. Results are ranked:
//   0  the whole name begins with it          "arm"     -> Arman Gill
//   1  every typed word begins a name word    "sandhu"  -> Harpreet Singh Sandhu
//                                             "har san" -> Harpreet Singh Sandhu
//   2  the email (2+ characters) or the code   "arman@", "7k4m", "nbp-7k"
//      (3+ characters) begins with it
//   3  a word of the team name begins with it "doaba"   -> riders of Doaba Riders
//   4  the phone contains the typed digits    "4521"    -> ...98 7654 4521
// Phone is "contains" on purpose: people give the last few digits, and the
// country code makes "begins with" awkward. Ties sort by name.
//
// Pure and dependency-free, so `node --test` loads it directly
// (check-in-search.test.mts).

export type SearchableRider = {
  full_name: string;
  email: string;
  phone: string;
  team_name: string | null;
  confirmation_code: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const words = (value: string) => normalize(value).split(" ").filter(Boolean);
const digits = (value: string) => value.replace(/\D/g, "");
const bareCode = (value: string) => normalize(value).replace(/^nbp-?/, "");

/* The rank of one rider for this query, or null when they do not match. */
export const matchRank = (rider: SearchableRider, query: string): number | null => {
  const typed = normalize(query);

  if (typed === "") {
    return null;
  }

  const name = normalize(rider.full_name);

  if (name.startsWith(typed)) {
    return 0;
  }

  const nameWords = words(rider.full_name);
  const typedWords = typed.split(" ");

  if (typedWords.every((part) => nameWords.some((word) => word.startsWith(part)))) {
    return 1;
  }

  // Not from the first letter: one letter would pull in every email and code
  // that happens to start with it, below the names that do.
  if (typed.length >= 2 && normalize(rider.email).startsWith(typed)) {
    return 2;
  }

  const code = bareCode(typed);

  if (code.length >= 3 && bareCode(rider.confirmation_code).startsWith(code)) {
    return 2;
  }

  if (rider.team_name) {
    const teamWords = words(rider.team_name);

    if (typedWords.every((part) => teamWords.some((word) => word.startsWith(part)))) {
      return 3;
    }
  }

  const typedDigits = digits(typed);

  // Only when what was typed is a number (spaces, + and dashes allowed), and
  // long enough not to match half the list.
  if (typedDigits.length >= 3 && /^[\d\s+()-]+$/.test(typed) && digits(rider.phone).includes(typedDigits)) {
    return 4;
  }

  return null;
};

/* Every match, best first. */
export const searchRiders = <T extends SearchableRider>(riders: readonly T[], query: string): T[] =>
  riders
    .map((rider) => ({ rider, rank: matchRank(rider, query) }))
    .filter((entry): entry is { rider: T; rank: number } => entry.rank !== null)
    .sort(
      (first, second) =>
        first.rank - second.rank || first.rider.full_name.localeCompare(second.rider.full_name)
    )
    .map((entry) => entry.rider);

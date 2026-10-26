// The start-list search box on /admin/scoring and in the judges' start-list
// drawer: type part of a rider's name, a team, a horse, or a pool ("B",
// "Pool B") and the list narrows as you type.
//
// Pure and import-free so both panels share one rule and `node --test` can
// load it directly (start-list-search.test.mts).

export type StartListSearchRow = {
  /* Rider name, team name, horse name, team riders' names … — anything a
     person might type part of. */
  texts: readonly (string | null | undefined)[];
  pool: string | null;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/* Returns the predicate for one query. An empty query keeps every row. A
   query that is a pool in the round — "b", "B", "pool b", "Pool B" — keeps
   that pool's rows; anything else keeps rows where any text contains it
   (case-insensitive). One or two letters count as a pool only when that pool
   exists, so typing "z" in a round without a Pool Z still searches names. */
export const startListMatcher = (
  query: string,
  pools: readonly string[]
): ((row: StartListSearchRow) => boolean) => {
  const needle = normalize(query);

  if (needle === "") {
    return () => true;
  }

  const poolQuery = needle.match(/^(?:pool ?)?([a-z]{1,2})$/);
  const label = poolQuery ? poolQuery[1].toUpperCase() : null;

  if (label !== null && pools.includes(label)) {
    return (row) => row.pool === label;
  }

  return (row) =>
    row.texts.some((text) => typeof text === "string" && normalize(text).includes(needle));
};

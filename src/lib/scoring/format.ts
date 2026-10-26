// Small wording helpers for the scoring panels, the pool sheet and /live. No
// imports at all, so the browser, the server and `node --test` can load it.

/* A count and its noun, agreeing in number: plural(1, "rider") is "1 rider",
   plural(3, "rider") is "3 riders", plural(0, "team") is "0 teams". The plural
   defaults to the singular plus "s"; pass it for anything irregular. */
export const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

import { legendSections } from "@/lib/stats/legend";
import type { StatsView } from "./SeasonViewNav";

/* The rules and the table's short headings, in plain words: short titled
   sections, each a list of a term and one line. Only what applies to the
   view is shown. The words live in src/lib/stats/legend.ts. */
export default function StatsLegend({ view }: { view: StatsView }) {
  return (
    <div className="space-y-5 text-sm leading-6">
      {legendSections(view).map((section) => (
        <section key={section.title}>
          <h3 className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-bronze-dark">
            {section.title}
          </h3>
          <dl className="mt-1.5 divide-y divide-bronze/10">
            {section.terms.map(({ term, meaning }) => (
              <div key={term} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] gap-x-3 py-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
                <dt className="break-words font-semibold text-ink">
                  {term === "–" ? (
                    <>
                      <span aria-hidden>–</span>
                      <span className="sr-only">A dash</span>
                    </>
                  ) : (
                    term
                  )}
                </dt>
                <dd className="text-brown/90">{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

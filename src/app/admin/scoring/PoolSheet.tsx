"use client";

/* The printable pool sheet for the venue notice board: every pool of one
   round, plain black on white. Rendered twice while open — once inline as an
   on-screen preview, once as a direct child of <body> that only exists in
   print. While the print copy is mounted, print CSS hides every other child of
   <body>, so the printout is the sheet and nothing else (no site navbar,
   footer or admin controls). When the sheet is closed the print copy and its
   CSS are gone, so printing the page normally is unaffected. */
import { createPortal } from "react-dom";
import { site } from "@/lib/site";
import { plural } from "@/lib/scoring/format";
import type { ScoringRound } from "@/lib/scoring/types";
import type { PoolGroup } from "./start-list";

const PRINT_CSS = `
@media screen {
  .pool-sheet-print { display: none !important; }
}
@media print {
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body > *:not(.pool-sheet-print) { display: none !important; }
  .pool-sheet-print { display: block !important; color: #000 !important; background: #fff !important; }
  .pool-sheet-print * { color: #000 !important; background: transparent !important; box-shadow: none !important; }
  .pool-sheet-pool { break-inside: avoid; page-break-inside: avoid; }
}
`;

type PoolSheetProps = {
  round: ScoringRound;
  groups: PoolGroup[];
};

function SheetBody({ round, groups }: PoolSheetProps) {
  const entrantCount = groups.reduce((total, group) => total + group.entrants.length, 0);
  const isSection = round.event_type === "section";

  return (
    <div className="bg-white p-6 font-sans text-black">
      <header className="border-b-2 border-black pb-3">
        <p className="text-sm uppercase tracking-[0.12em]">
          {site.title} · {site.eventDate} · {site.venue}
        </p>
        <h2 className="mt-1 text-3xl font-bold uppercase">{round.name}</h2>
        <p className="mt-1 text-sm">
          {isSection ? "Section Tent Pegging" : "Single Tent Pegging"} ·{" "}
          {plural(entrantCount, isSection ? "team" : "rider")}
          {groups.some((group) => group.label) ? ` · ${plural(groups.length, "pool")}` : ""} · Pools
          ride in order; riders within a pool ride in the order listed.
        </p>
      </header>

      <div className="mt-4 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
        {groups.map((group) => (
          <section key={group.label ?? "all"} className="pool-sheet-pool">
            <h3 className="border-b border-black pb-1 text-xl font-bold uppercase">
              {group.label ? `Pool ${group.label}` : "Start list"}{" "}
              <span className="text-sm font-normal normal-case">
                ({plural(group.entrants.length, isSection ? "team" : "rider")})
              </span>
            </h3>
            <ol className="mt-2 space-y-1.5">
              {group.entrants.map((entrant, index) => (
                <li key={entrant.entrant_key} className="text-base leading-snug">
                  <span className="inline-block w-7 font-bold tabular-nums">{index + 1}.</span>
                  <span className="font-semibold">{entrant.name}</span>
                  {entrant.detail ? <span> — {entrant.detail}</span> : null}
                  {entrant.is_team && entrant.members.length > 0 ? (
                    <span className="block pl-7 text-sm">
                      {entrant.members.map((member) => member.name).join(" · ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="mt-6 border-t border-black pt-2 text-xs">
        Live results: {site.url.replace(/^https?:\/\//, "")}/live
      </p>
    </div>
  );
}

export default function PoolSheet(props: PoolSheetProps) {
  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-black/30 bg-white shadow-sm">
        <SheetBody {...props} />
      </div>
      {typeof document !== "undefined"
        ? createPortal(
            <div className="pool-sheet-print">
              <style>{PRINT_CSS}</style>
              <SheetBody {...props} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}

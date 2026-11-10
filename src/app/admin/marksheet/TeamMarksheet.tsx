"use client";

/* The printable players' marksheet for manual team scoring, laid out like the
   organisers' own paper form: the event banner, the team name, Dal name and
   Jathedar lines, and twelve numbered rows with Round 1 to Round 4 boxes.

   Rendered twice, like the pool sheet: once on screen as a preview, once as a
   direct child of <body> that only exists in print. While the print copy is
   mounted, print CSS hides every other child of <body>, so the printout is
   the sheets and nothing else, one sheet to an A4 page. */
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { site } from "@/lib/site";
import {
  MARKSHEET_ROUNDS,
  blankMarksheet,
  type MarksheetSheet,
} from "@/lib/admin/team-marksheet";

const PRINT_CSS = `
@media screen {
  .team-marksheet-print { display: none !important; }
}
@media print {
  @page { size: A4 portrait; margin: 10mm; }
  html, body { background: #fff !important; }
  body > *:not(.team-marksheet-print) { display: none !important; }
  .team-marksheet-print { display: block !important; }
  .team-marksheet-print, .team-marksheet-print * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .team-marksheet-sheet { break-after: page; page-break-after: always; break-inside: avoid; }
  .team-marksheet-sheet:last-child { break-after: auto; page-break-after: auto; }
}
`;

const cell = "border border-black px-2 align-middle";

/* False while the server renders and while the browser hydrates, true after:
   the print copy is a portal into <body>, which only exists in the browser,
   and the first browser render must match the server's. */
const noSubscription = () => () => {};
const useInBrowser = () =>
  useSyncExternalStore(
    noSubscription,
    () => true,
    () => false
  );

function Sheet({ sheet }: { sheet: MarksheetSheet }) {
  return (
    <article className="team-marksheet-sheet bg-white font-sans text-black">
      <header className="flex items-stretch bg-neutral-300">
        <div className="flex w-[20%] shrink-0 items-center justify-center bg-neutral-500 p-3">
          {/* The logo in white on the grey block, as on the paper form. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a print sheet: the plain file, no lazy loading. */}
          <img src="/brand/logo.png" alt="" className="max-h-24 w-auto brightness-0 invert" />
        </div>
        <div className="min-w-0 flex-1 px-5 py-3">
          <p className="text-xl uppercase leading-tight">{site.title}</p>
          <p className="mt-0.5 text-sm">
            {site.eventDate} · {site.venue}
          </p>
          <p className="mt-2 inline-block border-b-2 border-black pr-6 text-lg font-bold uppercase leading-tight">
            Players Marksheet
          </p>
          <p className="mt-3 flex items-end gap-3 text-lg">
            <span className="shrink-0">ਟੀਮ ਦਾ ਨਾਮ :-</span>
            <span className="min-h-7 flex-1 border-b border-black px-1 font-semibold">
              {sheet.team ?? ""}
            </span>
            {sheet.pages > 1 ? (
              <span className="shrink-0 text-xs">
                Sheet {sheet.page} of {sheet.pages}
              </span>
            ) : null}
          </p>
        </div>
      </header>

      <p className="mt-3 flex items-end gap-3 px-8 text-lg">
        <span className="shrink-0">ਦਲ ਦਾ ਨਾਮ :-</span>
        <span className="min-h-7 flex-1 border-b border-black px-1 font-semibold">
          {sheet.dal ?? ""}
        </span>
      </p>
      <p className="mt-2 flex items-end gap-3 px-8 text-lg">
        <span className="shrink-0">ਦਲ ਦੇ ਜਥੇਦਾਰ ਸਾਹਿਬ ਦਾ ਨਾਮ :-</span>
        <span className="min-h-7 flex-1 border-b border-black" />
      </p>

      <table className="mt-6 w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[7%]" />
          <col className="w-[25%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          {MARKSHEET_ROUNDS.map((round) => (
            <col key={round} className="w-[9%]" />
          ))}
        </colgroup>
        <thead>
          <tr className="h-16 text-center font-bold">
            <th className={cell} />
            <th className={cell}>Full name/ ਪੂਰਾ ਨਾਮ</th>
            <th className={cell}>
              Horse name/
              <br />
              ਘੋੜੇ ਦਾ ਨਾਮ
            </th>
            <th className={cell}>
              Team/
              <br />
              ਟੀਮ
            </th>
            {MARKSHEET_ROUNDS.map((round) => (
              <th key={round} className={cell}>
                Round
                <br />
                {round}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, index) => (
            <tr key={index} className="h-[13.5mm]">
              <td className={`${cell} text-center`}>{index + 1}</td>
              <td className={`${cell} break-words font-semibold leading-tight`}>{row?.name ?? ""}</td>
              <td className={`${cell} break-words leading-tight`}>{row?.horse ?? ""}</td>
              <td className={`${cell} break-words leading-tight`}>{row?.team ?? ""}</td>
              {MARKSHEET_ROUNDS.map((round) => (
                <td key={round} className={cell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

export default function TeamMarksheet({ sheets }: { sheets: MarksheetSheet[] }) {
  const [blanks, setBlanks] = useState(sheets.length === 0 ? 1 : 0);
  const inBrowser = useInBrowser();

  const all = [
    ...sheets,
    ...Array.from({ length: blanks }, (_, index) => blankMarksheet(`blank-${index + 1}`)),
  ];

  const riders = sheets.reduce(
    (total, sheet) => total + sheet.rows.filter((row) => row !== null).length,
    0
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bronze/20 bg-sand p-4">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={all.length === 0}
          className="rounded-lg bg-bronze-deep px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-bronze disabled:cursor-not-allowed disabled:opacity-60"
        >
          Print or save as PDF
        </button>
        <label className="flex items-center gap-2 text-sm text-brown">
          Blank sheets to add
          <input
            type="number"
            min={0}
            max={20}
            value={blanks}
            onChange={(event) =>
              setBlanks(Math.max(0, Math.min(20, Math.trunc(Number(event.target.value)) || 0)))
            }
            className="w-20 rounded-md border border-bronze/40 bg-white px-2 py-1.5"
          />
        </label>
        <p className="text-sm text-brown/80">
          {riders === 0
            ? "No teams yet, so the sheet is blank."
            : `${riders} team ${riders === 1 ? "rider" : "riders"} on ${sheets.length} ${
                sheets.length === 1 ? "sheet" : "sheets"
              }, one per team.`}{" "}
          One sheet prints per A4 page.
        </p>
      </div>

      <div className="space-y-6">
        {all.map((sheet) => (
          <div
            key={sheet.key}
            className="mx-auto max-w-[210mm] overflow-x-auto rounded-lg border border-black/30 bg-white p-4 shadow-sm"
          >
            <div className="min-w-[640px]">
              <Sheet sheet={sheet} />
            </div>
          </div>
        ))}
      </div>

      {inBrowser
        ? createPortal(
            <div className="team-marksheet-print">
              <style>{PRINT_CSS}</style>
              {all.map((sheet) => (
                <Sheet key={sheet.key} sheet={sheet} />
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

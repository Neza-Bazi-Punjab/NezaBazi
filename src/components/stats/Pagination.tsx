"use client";

import { pageList } from "@/lib/stats/compute";
import { focusRing } from "./styles";

const base = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 font-display text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

/* Previous, numbered pages, Next. */
export default function Pagination({
  page,
  count,
  onPage,
}: {
  page: number;
  count: number;
  onPage: (page: number) => void;
}) {
  if (count <= 1) return null;

  return (
    <nav aria-label="Table pages" className="mt-4">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className={`${base} border-brown/25 bg-cream text-brown hover:border-bronze`}
          >
            Previous
          </button>
        </li>
        {pageList(page, count).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className="px-1 text-brown/60">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                onClick={() => onPage(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Page ${item}`}
                className={`${base} ${
                  item === page
                    ? "border-bronze-deep bg-bronze-deep text-cream"
                    : "border-brown/25 bg-cream text-brown hover:border-bronze"
                }`}
              >
                {item}
              </button>
            </li>
          )
        )}
        <li>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= count}
            className={`${base} border-brown/25 bg-cream text-brown hover:border-bronze`}
          >
            Next
          </button>
        </li>
      </ul>
    </nav>
  );
}

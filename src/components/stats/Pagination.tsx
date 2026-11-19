"use client";

import { pageList } from "@/lib/stats/compute";
import t from "./stats.module.css";

/* The table's numbered pages (long runs fold into "…"). */
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
    <nav aria-label="Table pages">
      <ul className={t.pg}>
        {pageList(page, count).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className={t.gap}>
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                onClick={() => onPage(item)}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Page ${item}`}
              >
                {item}
              </button>
            </li>
          )
        )}
      </ul>
    </nav>
  );
}

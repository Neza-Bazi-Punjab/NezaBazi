"use client";

import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import shared from "@/components/redesign/shared.module.css";
import {
  RIDER_COLUMNS,
  RIDER_GROUPS,
  TEAM_COLUMNS,
  TEAM_GROUPS,
  RIDE_STATUS_TEXT,
  type Cell,
  type ColumnGroup,
  type StatColumn,
} from "@/lib/stats/columns";
import {
  PLACES_DECIDED,
  SINGLE_STAGE_LABELS,
  TEAM_STAGE_LABELS,
  clampPage,
  matchesSearch,
  pageCount,
  riderSearchFields,
  showingText,
  sortRows,
  teamSearchFields,
  type RiderRow,
  type SortDirection,
  type SortValue,
  type TeamRow,
} from "@/lib/stats/compute";
import { legendSections } from "@/lib/stats/legend";
import Pagination from "./Pagination";
import type { StatsView } from "./SeasonViewNav";
import t from "./stats.module.css";

/* The interactive part of /stats: search, filters, the sortable table and its
   pages (the agreed draft, handoff/mock-home/stats.html). Season and view are
   the page's own address; everything here is local state, reset by a new
   view. Every column has a fixed width and every row a fixed height, so
   sorting or paging never moves the table: only what is inside changes.

   A phone opens on the short table (the groups marked onPhone). Its
   "All columns" switch lays the whole table out as on a computer, scrolled
   sideways with the name held in place, so nobody has to turn the phone. */

export const PAGE_SIZE = 25;

type Props =
  | { view: "riders"; season: number; rows: RiderRow[]; states: string[] }
  | { view: "teams"; season: number; rows: TeamRow[] };

interface ViewConfig<T> {
  noun: string;
  nameHeading: string;
  searchLabel: string;
  searchPlaceholder: string;
  columns: readonly StatColumn<T>[];
  groups: readonly ColumnGroup[];
  /* Each column's width in px; the name column takes what is left, but
     never less than nameMin. */
  widths: Record<string, number>;
  nameMin: number;
  searchFields: (row: T) => (string | null | undefined)[];
  stageOptions: { index: number; label: string }[];
  subline: (row: T) => string;
}

const RANK_WIDTH = 44;
/* The name column's width on a phone showing all columns: narrow, so the
   numbers get most of the screen. */
const PHONE_NAME_WIDTH = 132;

const riderConfig: ViewConfig<RiderRow> = {
  noun: "rider",
  nameHeading: "Rider",
  searchLabel: "Search riders",
  searchPlaceholder: "Search a rider, horse or place",
  columns: RIDER_COLUMNS,
  groups: RIDER_GROUPS,
  /* Sized so the whole table, Place included, still fits a 1440px laptop
     with both deciding rides in it. "3rd place ride-off" takes two lines in
     Reached; a few very long horse-and-place lines end in an ellipsis. */
  widths: {
    runs: 68,
    carries: 42,
    strikes: 42,
    misses: 42,
    "stage-qualification": 68,
    "stage-aarhi1": 86,
    "stage-aarhi2": 86,
    "stage-third": 106,
    "stage-final": 72,
    points: 58,
    pointsPerRun: 92,
    carryRate: 92,
    hitRate: 70,
    reached: 104,
    place: 76,
  },
  nameMin: 184,
  searchFields: riderSearchFields,
  /* Everyone rode qualification, so "Any round" already covers it. A rider
     rode the 3rd place ride-off or the Final, never both, so "or further"
     from the ride-off also takes in the finalists. */
  stageOptions: [
    { index: 1, label: `${SINGLE_STAGE_LABELS.aarhi1} or further` },
    { index: 2, label: `${SINGLE_STAGE_LABELS.aarhi2} or further` },
    { index: 3, label: `${SINGLE_STAGE_LABELS.third} or the ${SINGLE_STAGE_LABELS.final}` },
    { index: 4, label: SINGLE_STAGE_LABELS.final },
  ],
  subline: (row) => [row.horse, row.location].filter(Boolean).join(" · "),
};

const teamConfig: ViewConfig<TeamRow> = {
  noun: "team",
  nameHeading: "Team",
  searchLabel: "Search teams",
  searchPlaceholder: "Search a team or rider",
  columns: TEAM_COLUMNS,
  groups: TEAM_GROUPS,
  widths: {
    "stage-round1": 104,
    "stage-round2": 104,
    "stage-third": 112,
    "stage-final1": 92,
    "stage-final2": 112,
    reached: 150,
    place: 90,
  },
  nameMin: 380,
  searchFields: teamSearchFields,
  /* The 3rd place ride-off and the Final were ridden side by side, so
     "or further" from the ride-off also takes in the finalists. Everyone
     rode Round 1 ("Any round"), and the tie-break teams are the finalists,
     so neither has an option of its own. */
  stageOptions: [
    { index: 1, label: `${TEAM_STAGE_LABELS.round2} or further` },
    { index: 2, label: `${TEAM_STAGE_LABELS.third} or the ${TEAM_STAGE_LABELS.final1}` },
    { index: 3, label: TEAM_STAGE_LABELS.final1 },
  ],
  subline: (row) => row.riders.map((rider) => rider.name).join(", "),
};

export default function StatsBrowser(props: Props) {
  return props.view === "riders" ? (
    <Browser view="riders" season={props.season} rows={props.rows} config={riderConfig} states={props.states} />
  ) : (
    <Browser view="teams" season={props.season} rows={props.rows} config={teamConfig} states={[]} />
  );
}

type SortKey = "rank" | "name" | string;

const MEDAL = { 1: shared.gold, 2: shared.silver, 3: shared.bronzem } as const;

function Browser<
  T extends {
    id: string;
    name: string;
    rank: number;
    reachedIndex: number;
    place: 1 | 2 | 3 | null;
    state?: string | null;
  },
>({
  view,
  season,
  rows,
  config,
  states,
}: {
  view: StatsView;
  season: number;
  rows: T[];
  config: ViewConfig<T>;
  states: string[];
}) {
  const uid = useId();
  const [search, setSearch] = useState("");
  const [reachedAtLeast, setReachedAtLeast] = useState(-1);
  const [state, setState] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "rank",
    direction: "ascending",
  });
  const [page, setPage] = useState(1);
  /* Phones only: the short table, or every column scrolled sideways. */
  const [allColumns, setAllColumns] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesSearch(search, config.searchFields(row)) &&
          row.reachedIndex >= reachedAtLeast &&
          (!state || row.state === state)
      ),
    [rows, search, reachedAtLeast, state, config]
  );

  const sortValue = useMemo((): ((row: T) => SortValue) => {
    if (sort.key === "rank") return (row) => row.rank;
    if (sort.key === "name") return (row) => row.name;
    const column = config.columns.find((candidate) => candidate.id === sort.key);
    return column ? column.sortValue : (row) => row.rank;
  }, [sort.key, config.columns]);

  const sorted = useMemo(
    () => (sort.key === "rank" && sort.direction === "ascending" ? filtered : sortRows(filtered, sortValue, sort.direction)),
    [filtered, sortValue, sort]
  );

  const total = sorted.length;
  const pages = pageCount(total, PAGE_SIZE);
  const current = clampPage(page, total, PAGE_SIZE);
  const shown = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  /* Each column with its group; the first column of a group carries the
     divider line, and groups not meant for phones hide on narrow screens. */
  const columns = config.groups.flatMap((group) =>
    config.columns
      .filter((column) => column.group === group.id)
      .map((column, index) => ({ column, group, startsGroup: index === 0 }))
  );
  const cellClass = (group: ColumnGroup, startsGroup: boolean, ...more: (string | false | undefined)[]) =>
    [startsGroup && t.gs, !group.onPhone && t.phHide, ...more].filter(Boolean).join(" ");
  const columnsWidth = columns.reduce((sum, { column }) => sum + (config.widths[column.id] ?? 80), 0);
  const tableMinWidth = RANK_WIDTH + config.nameMin + columnsWidth;
  /* A view with nothing hidden on phones needs no switch. */
  const phoneSwitch = config.groups.some((group) => !group.onPhone);
  const tableStyle = {
    minWidth: tableMinWidth,
    "--phone-min": `${RANK_WIDTH + PHONE_NAME_WIDTH + columnsWidth}px`,
  } as CSSProperties;

  const filtersOn = reachedAtLeast >= 0 || state !== "" || search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setReachedAtLeast(-1);
    setState("");
    setPage(1);
  };

  const sortBy = (key: SortKey, firstDirection: SortDirection) => {
    setSort((before) =>
      before.key === key
        ? { key, direction: before.direction === "ascending" ? "descending" : "ascending" }
        : { key, direction: firstDirection }
    );
    setPage(1);
  };

  const goToPage = (next: number) => {
    setPage(next);
    const box = boxRef.current;
    if (box && box.getBoundingClientRect().top < 0) {
      box.scrollIntoView({ block: "start" });
    }
  };

  const captionId = `${uid}-caption`;
  const sortColumn = config.columns.find((column) => column.id === sort.key);
  const sortText =
    sort.key === "rank"
      ? sort.direction === "ascending"
        ? "in rank order"
        : "in reverse rank order"
      : sort.key === "name"
        ? `by name, ${sort.direction === "ascending" ? "A to Z" : "Z to A"}`
        : `by ${lowerFirst(sortColumn?.title ?? sortColumn?.label ?? "rank")}, ${
            sort.direction === "descending" ? "highest first" : "lowest first"
          }`;
  /* The marks under the table explain only what is on this page of it. */
  const shownCells = shown.flatMap((row) => columns.map(({ column }) => column.cell(row)));
  const anyDash = shownCells.some((cell) => cell.kind === "dash");
  const shownStatuses = new Set(shownCells.flatMap((cell) => (cell.kind === "status" ? [cell.text] : [])));

  const ariaSort = (key: SortKey) => (sort.key === key ? sort.direction : undefined);

  return (
    <div ref={boxRef} className={t.tbox}>
      {/* ---------- search and filters ---------- */}
      <div className={t.tools}>
        <label htmlFor={`${uid}-search`} className={t.srOnly}>
          {config.searchLabel}
        </label>
        <input
          id={`${uid}-search`}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={config.searchPlaceholder}
          autoComplete="off"
        />
        <label htmlFor={`${uid}-reached`} className={t.srOnly}>
          Reached
        </label>
        <select
          id={`${uid}-reached`}
          value={reachedAtLeast}
          onChange={(event) => {
            setReachedAtLeast(Number(event.target.value));
            setPage(1);
          }}
        >
          <option value={-1}>Any round</option>
          {config.stageOptions.map((option) => (
            <option key={option.index} value={option.index}>
              {option.label}
            </option>
          ))}
        </select>
        {view === "riders" && (
          <>
            <label htmlFor={`${uid}-state`} className={t.srOnly}>
              State
            </label>
            <select
              id={`${uid}-state`}
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Every state</option>
              {states.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </>
        )}
        {phoneSwitch && (
          <div role="group" aria-label="Columns" className={t.cols}>
            <button type="button" aria-pressed={!allColumns} onClick={() => setAllColumns(false)}>
              Summary
            </button>
            <button type="button" aria-pressed={allColumns} onClick={() => setAllColumns(true)}>
              All columns
            </button>
            {allColumns && <span className={t.swipe}>Swipe the table sideways.</span>}
          </div>
        )}
      </div>

      <p className={t.how}>
        <b>{PLACES_DECIDED[view].lead}</b> {PLACES_DECIDED[view].detail}
      </p>

      {/* ---------- the key: the rules and every heading, in plain words ---------- */}
      <details className={t.key}>
        <summary>Key: how points, rounds and the table work</summary>
        <div className={t.keyBody}>
          {legendSections(view).map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <dl>
                {section.terms.map(({ term, meaning }) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </details>

      {/* ---------- table ---------- */}
      <div role="region" aria-labelledby={captionId} tabIndex={0} className={t.scroll}>
        <table className={`${t.table} ${allColumns ? t.full : ""}`} style={tableStyle}>
          <caption id={captionId} className={t.srOnly}>
            {config.nameHeading} statistics, {season} season, {sortText}
          </caption>
          <colgroup>
            <col style={{ width: RANK_WIDTH }} />
            <col />
            {columns.map(({ column }) => (
              <col key={column.id} style={{ width: config.widths[column.id] ?? 80 }} />
            ))}
          </colgroup>
          <thead>
            <tr className={t.grp}>
              <td colSpan={2} />
              {config.groups.map((group) => (
                <th
                  key={group.id}
                  colSpan={config.columns.filter((column) => column.group === group.id).length}
                  scope="colgroup"
                  className={cellClass(group, true)}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              <th scope="col" aria-sort={ariaSort("rank")}>
                <SortButton
                  label="#"
                  title="Rank"
                  active={sort.key === "rank"}
                  first={sort.direction === "ascending"}
                  onClick={() => sortBy("rank", "ascending")}
                />
              </th>
              <th scope="col" aria-sort={ariaSort("name")} className={`${t.l} ${t.nm}`}>
                <SortButton
                  label={config.nameHeading}
                  active={sort.key === "name"}
                  first={sort.direction === "ascending"}
                  onClick={() => sortBy("name", "ascending")}
                />
              </th>
              {columns.map(({ column, group, startsGroup }) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort(column.id)}
                  className={cellClass(group, startsGroup, !column.numeric && t.l)}
                >
                  <SortButton
                    label={column.label}
                    title={column.title}
                    active={sort.key === column.id}
                    first={sort.direction === column.firstDirection}
                    onClick={() => sortBy(column.id, column.firstDirection)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const subline = config.subline(row);
              return (
                <tr key={row.id}>
                  <td className={t.rk}>{row.rank}</td>
                  <th scope="row" className={t.nm}>
                    <b>{row.name}</b>
                    <small>{subline}</small>
                  </th>
                  {columns.map(({ column, group, startsGroup }) => {
                    const cell = column.cell(row);
                    return (
                      <td
                        key={column.id}
                        className={cellClass(
                          group,
                          startsGroup,
                          !column.numeric && t.l,
                          column.id === "points" && t.pts,
                          cell.kind === "dash" && t.dash
                        )}
                      >
                        {column.id === "place" && row.place ? (
                          <span className={`${t.med} ${MEDAL[row.place]}`}>{cell.kind === "value" ? cell.text : ""}</span>
                        ) : (
                          <CellView cell={cell} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {total === 0 && (
              <tr className={t.empty}>
                <td colSpan={columns.length + 2}>
                  No {config.noun}s match.
                  <button type="button" onClick={clearFilters} disabled={!filtersOn} className={t.clear}>
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(anyDash || shownStatuses.size > 0) && (
        <ul className={t.marks}>
          {anyDash && (
            <li>
              <b aria-hidden>–</b>
              <span className={t.srOnly}>A dash:</span>{" "}
              {view === "teams" ? "ridden, total not recorded." : "ridden, result not recorded. Left out of the % columns."}
            </li>
          )}
          {Object.values(RIDE_STATUS_TEXT)
            .filter(({ text }) => shownStatuses.has(text))
            .map(({ text, meaning }) => (
              <li key={text}>
                <b>{text}:</b> {meaning}.
              </li>
            ))}
        </ul>
      )}

      <div className={t.pager}>
        <span aria-live="polite">{showingText(current, PAGE_SIZE, total, config.noun)}</span>
        <Pagination page={current} count={pages} onPage={goToPage} />
      </div>
    </div>
  );
}

/* "Points in Aarhi round 1" -> "points in Aarhi round 1": round names keep
   their capitals inside a sentence. "#" and short headings pass through. */
const lowerFirst = (text: string) => (text ? text[0].toLowerCase() + text.slice(1) : text);

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === "value") return <>{cell.text}</>;
  if (cell.kind === "blank") return <span className={t.srOnly}>{cell.reason}</span>;
  if (cell.kind === "status") {
    return (
      <span title={cell.reason} className={t.status}>
        <span aria-hidden>{cell.text}</span>
        <span className={t.srOnly}>{cell.reason}</span>
      </span>
    );
  }
  return (
    <span title={cell.reason[0].toUpperCase() + cell.reason.slice(1)}>
      <span aria-hidden>–</span>
      <span className={t.srOnly}>{cell.reason}</span>
    </span>
  );
}

/* A heading's sort button. The arrow's space is always kept, so a heading
   never changes width: ▾ while the column is in its first-click order, ▴
   once it is turned round. */
function SortButton({
  label,
  title,
  active,
  first,
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  first: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Sort by ${lowerFirst(title ?? label)}`}
      className={`${t.sort} ${active ? t.on : ""}`}
    >
      {title && title !== label ? (
        <>
          <span aria-hidden>{label}</span>
          <span className={t.srOnly}>{title}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
      <span aria-hidden className={`${t.ar} ${active ? "" : t.off}`}>
        {active && !first ? "▴" : "▾"}
      </span>
    </button>
  );
}

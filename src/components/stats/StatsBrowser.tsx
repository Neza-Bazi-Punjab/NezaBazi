"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  formatPlace,
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

   A phone gets one short table that fits the screen: rank, name (with the
   medal under it, so the winners are plain) and each round's points. A tap
   on a row slides up that rider's or team's card with everything on it.
   Nothing scrolls sideways. */

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
  /* Each column's narrowest width in px, nameMin for the name column. Spare
     width is shared across them all in proportion. */
  widths: Record<string, number>;
  nameMin: number;
  searchFields: (row: T) => (string | null | undefined)[];
  stageOptions: { index: number; label: string }[];
  subline: (row: T) => string;
}

const RANK_WIDTH = 44;
/* Round headings short enough for five of them to fit a phone. */
const PHONE_LABEL: Record<string, string> = {
  "stage-qualification": "Qual",
  "stage-aarhi1": "A1",
  "stage-aarhi2": "A2",
  "stage-third": "3rd",
  "stage-final": "Final",
  "stage-round1": "R1",
  "stage-round2": "R2",
  "stage-final1": "Final",
  "stage-final2": "T-B",
};
/* The same break as stats.module.css. */
const PHONE_QUERY = "(max-width: 820px)";

const riderConfig: ViewConfig<RiderRow> = {
  noun: "rider",
  nameHeading: "Rider",
  searchLabel: "Search riders",
  searchPlaceholder: "Search a rider, horse or place",
  columns: RIDER_COLUMNS,
  groups: RIDER_GROUPS,
  /* The narrowest each column goes; together they fit a 1440px laptop. On a
     wider screen the spare width is shared out across every column in
     proportion, so the numbers spread over the table instead of the name
     column taking it all. */
  widths: {
    runs: 72,
    carries: 48,
    strikes: 48,
    misses: 48,
    "stage-qualification": 76,
    "stage-aarhi1": 90,
    "stage-aarhi2": 90,
    "stage-third": 110,
    "stage-final": 80,
    points: 68,
    reached: 150,
    place: 84,
  },
  nameMin: 250,
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
  /* Phones: whose card is up. */
  const [openId, setOpenId] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const openRow = openId ? (rows.find((row) => row.id === openId) ?? null) : null;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (openRow && sheet && !sheet.open) sheet.showModal();
  }, [openRow]);
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
     divider line. */
  const columns = config.groups.flatMap((group) =>
    config.columns
      .filter((column) => column.group === group.id)
      .map((column, index) => ({ column, group, startsGroup: index === 0 }))
  );
  const cellClass = (startsGroup: boolean, ...more: (string | false | undefined)[]) =>
    [startsGroup && t.gs, ...more].filter(Boolean).join(" ");
  const columnsWidth = columns.reduce((sum, { column }) => sum + (config.widths[column.id] ?? 80), 0);
  const tableMinWidth = RANK_WIDTH + config.nameMin + columnsWidth;
  const valueOf = (row: T, id: string) => {
    const cell = config.columns.find((column) => column.id === id)?.cell(row);
    return cell?.kind === "value" ? cell.text : "";
  };
  /* The rounds a row rode, for its card. */
  const roundsOf = (row: T) =>
    columns
      .filter(({ group }) => group.id === "rounds")
      .map(({ column }) => ({ column, cell: column.cell(row) }))
      .filter(({ cell }) => cell.kind !== "blank");

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
        <span className={t.tap}>Points in each round. Tap a {config.noun} for more.</span>
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
        <table className={t.table} style={{ minWidth: tableMinWidth }}>
          <caption id={captionId} className={t.srOnly}>
            {config.nameHeading} statistics, {season} season, {sortText}
          </caption>
          <colgroup>
            <col style={{ width: RANK_WIDTH }} />
            <col style={{ width: config.nameMin }} />
            {columns.map(({ column, group }) => (
              <col key={column.id} data-g={group.id} style={{ width: config.widths[column.id] ?? 80 }} />
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
                  data-g={group.id}
                  className={cellClass(true)}
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
                  data-g={group.id}
                  className={cellClass(startsGroup, !column.numeric && t.l)}
                >
                  <SortButton
                    label={column.label}
                    short={PHONE_LABEL[column.id]}
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
            {shown.map((row, rowIndex) => {
              const subline = config.subline(row);
              /* A tap opens the card on a phone only: a computer shows it all. */
              const openCard = () => {
                if (window.matchMedia(PHONE_QUERY).matches) setOpenId(row.id);
              };
              return (
                <tr key={row.id} className={`${t.row} ${rowIndex % 2 === 1 ? t.alt : ""}`} onClick={openCard}>
                  <td className={t.rk}>{row.rank}</td>
                  <th scope="row" className={t.nm}>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-label={`Every round for ${row.name}`}
                      className={t.more}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenId(row.id);
                      }}
                    >
                      <span aria-hidden>›</span>
                    </button>
                    <b>{row.name}</b>
                    {row.place && (
                      <span aria-hidden className={t.won}>
                        <span className={`${t.med} ${MEDAL[row.place]}`}>{formatPlace(row.place)}</span>
                      </span>
                    )}
                    <small>{subline}</small>
                  </th>
                  {columns.map(({ column, group, startsGroup }) => {
                    const cell = column.cell(row);
                    return (
                      <td
                        key={column.id}
                        data-g={group.id}
                        className={cellClass(
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

      {/* ---------- phones: the card that slides up from a tapped row ---------- */}
      <dialog
        ref={sheetRef}
        aria-labelledby={`${uid}-sheet`}
        className={t.sheet}
        onClose={() => setOpenId(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        {openRow && (
          <div className={t.sheetBody}>
            <button type="button" aria-label="Close" className={t.sheetClose} onClick={() => sheetRef.current?.close()}>
              <span aria-hidden>✕</span>
            </button>
            <h3 id={`${uid}-sheet`}>{openRow.name}</h3>
            <p className={t.sheetSub}>{config.subline(openRow)}</p>
            <p className={t.sheetRes}>
              {openRow.place && <span className={`${t.med} ${MEDAL[openRow.place]}`}>{formatPlace(openRow.place)}</span>}
              {[valueOf(openRow, "reached"), valueOf(openRow, "points") && `${valueOf(openRow, "points")} points`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <dl className={t.strip}>
              {roundsOf(openRow).map(({ column, cell }) => (
                <div key={column.id}>
                  <dt>{PHONE_LABEL[column.id] ?? column.label}</dt>
                  <dd>
                    <CellView cell={cell} />
                  </dd>
                </div>
              ))}
            </dl>
            <dl className={t.card}>
              {roundsOf(openRow).map(({ column, cell }) => (
                <div key={column.id}>
                  <dt>{roundName(column.title ?? column.label)}</dt>
                  <dd>
                    {view === "riders" && cell.kind === "value" && column.id !== "stage-qualification" && (
                      <em>{RESULT_WORD[cell.text] ?? ""}</em>
                    )}
                    <CellView cell={cell} />
                  </dd>
                </div>
              ))}
              {columns
                .filter(({ group }) => group.id === "runs")
                .map(({ column }) => (
                  <div key={column.id}>
                    <dt>{column.title ?? column.label}</dt>
                    <dd>
                      <CellView cell={column.cell(openRow)} />
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </dialog>

      {(anyDash || shownStatuses.size > 0) && (
        <ul className={t.marks}>
          {anyDash && (
            <li>
              <b aria-hidden>–</b>
              <span className={t.srOnly}>A dash:</span>{" "}
              {view === "teams" ? "ridden, total not recorded." : "ridden, result not recorded."}
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

/* A round column's title as the card's label: "Points in Final, out of
   16" -> "Final". */
const roundName = (title: string) => title.replace(/^Points in /, "").replace(/, out of 16$/, "");

/* One run's points as the word for it. Qualification is two tries added
   together, so it shows the points alone. */
const RESULT_WORD: Record<string, string> = { "4": "Carry", "2": "Strike", "0": "Miss" };

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
  short,
  title,
  active,
  first,
  onClick,
}: {
  label: string;
  /* A shorter heading for phones, when the full one is too wide there. */
  short?: string;
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
          {short && short !== label ? (
            <>
              <span aria-hidden className={t.lblFull}>
                {label}
              </span>
              <span aria-hidden className={t.lblShort}>
                {short}
              </span>
            </>
          ) : (
            <span aria-hidden>{label}</span>
          )}
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

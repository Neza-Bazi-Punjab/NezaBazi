"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  RIDER_COLUMNS,
  RIDER_GROUPS,
  TEAM_COLUMNS,
  TEAM_GROUPS,
  type Cell,
  type ColumnGroup,
  type StatColumn,
} from "@/lib/stats/columns";
import {
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
import Pagination from "./Pagination";
import Popover from "./Popover";
import type { StatsView } from "./SeasonViewNav";
import StatsLegend from "./StatsLegend";
import { fieldLabel, focusRing, selectClass } from "./styles";

/* The interactive part of /stats: search, filters, columns, legend, the
   sortable table and its pages. Season and view come from the query string
   (the server page); everything here is local state, reset by a new view. */

export const PAGE_SIZES = [25, 50, 100] as const;

type Props =
  | { view: "riders"; season: number; rows: RiderRow[]; states: string[] }
  | { view: "teams"; season: number; rows: TeamRow[] };

type GroupSetting = "auto" | "on" | "off";

interface ViewConfig<T> {
  noun: string;
  nameHeading: string;
  searchLabel: string;
  searchPlaceholder: string;
  columns: readonly StatColumn<T>[];
  groups: readonly ColumnGroup[];
  searchFields: (row: T) => (string | null | undefined)[];
  stageOptions: { index: number; label: string }[];
  subline: (row: T) => string;
}

const riderConfig: ViewConfig<RiderRow> = {
  noun: "rider",
  nameHeading: "Rider",
  searchLabel: "Search riders",
  searchPlaceholder: "Rider, horse or place",
  columns: RIDER_COLUMNS,
  groups: RIDER_GROUPS,
  searchFields: riderSearchFields,
  stageOptions: [
    { index: 0, label: SINGLE_STAGE_LABELS.qualification },
    { index: 1, label: `${SINGLE_STAGE_LABELS.aarhi1} or further` },
    { index: 2, label: `${SINGLE_STAGE_LABELS.aarhi2} or further` },
    { index: 3, label: SINGLE_STAGE_LABELS.final },
  ],
  subline: (row) => [row.horse, row.location].filter(Boolean).join(" · "),
};

const teamConfig: ViewConfig<TeamRow> = {
  noun: "team",
  nameHeading: "Team",
  searchLabel: "Search teams",
  searchPlaceholder: "Team or rider name",
  columns: TEAM_COLUMNS,
  groups: TEAM_GROUPS,
  searchFields: teamSearchFields,
  /* The 3rd place ride-off and the Final were ridden side by side, so
     "or further" from the ride-off also takes in the finalists. */
  stageOptions: [
    { index: 0, label: TEAM_STAGE_LABELS.round1 },
    { index: 1, label: `${TEAM_STAGE_LABELS.round2} or further` },
    { index: 2, label: `${TEAM_STAGE_LABELS.third} or the ${TEAM_STAGE_LABELS.final1}` },
    { index: 3, label: TEAM_STAGE_LABELS.final1 },
    { index: 4, label: TEAM_STAGE_LABELS.final2 },
  ],
  subline: (row) => row.riders.map((rider) => rider.name).join(", "),
};

/* Matches Tailwind's `sm` breakpoint (40rem). The server renders as if
   wide; the CSS classes on each group keep phones right before hydration. */
const WIDE_QUERY = "(min-width: 40rem)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useIsWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true
  );

export default function StatsBrowser(props: Props) {
  return props.view === "riders" ? (
    <Browser view="riders" season={props.season} rows={props.rows} config={riderConfig} states={props.states} />
  ) : (
    <Browser view="teams" season={props.season} rows={props.rows} config={teamConfig} states={[]} />
  );
}

type SortKey = "rank" | "name" | string;

function Browser<T extends { id: string; name: string; rank: number; reachedIndex: number; state?: string | null }>({
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
  const isWide = useIsWide();
  const [search, setSearch] = useState("");
  const [reachedAtLeast, setReachedAtLeast] = useState(-1);
  const [state, setState] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: "rank",
    direction: "ascending",
  });
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [openPanel, setOpenPanel] = useState<"filters" | "columns" | "legend" | null>(null);
  const [groupSettings, setGroupSettings] = useState<Record<string, GroupSetting>>({});
  const toolbarRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

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
  const pages = pageCount(total, pageSize);
  const current = clampPage(page, total, pageSize);
  const shown = sorted.slice((current - 1) * pageSize, current * pageSize);

  /* Visible groups. "auto" follows the screen: groups not meant for phones
     are hidden below `sm` by CSS (no flash before hydration). */
  const visibleGroups = config.groups.filter((group) => (groupSettings[group.id] ?? "auto") !== "off");
  const groupClass = (group: ColumnGroup) =>
    (groupSettings[group.id] ?? "auto") === "auto" && !group.onPhone ? "hidden sm:table-cell" : "";
  const groupChecked = (group: ColumnGroup) => {
    const setting = groupSettings[group.id] ?? "auto";
    return setting === "on" || (setting === "auto" && (group.onPhone || isWide));
  };
  const visibleColumns = visibleGroups.flatMap((group) =>
    config.columns.filter((column) => column.group === group.id).map((column) => ({ column, group }))
  );

  const activeFilters = (reachedAtLeast >= 0 ? 1 : 0) + (state ? 1 : 0);
  const filtersOn = activeFilters > 0 || search.trim() !== "";

  const clearFilters = () => {
    setSearch("");
    setReachedAtLeast(-1);
    setState("");
    setPage(1);
  };

  const closePanel = useCallback((open: boolean) => {
    if (!open) setOpenPanel(null);
  }, []);
  const panelProps = (id: "filters" | "columns" | "legend") => ({
    id: `${uid}-${id}`,
    open: openPanel === id,
    onOpenChange: (open: boolean) => (open ? setOpenPanel(id) : closePanel(false)),
  });

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
    const toolbar = toolbarRef.current;
    if (toolbar && toolbar.getBoundingClientRect().top < 0) {
      toolbar.scrollIntoView({ block: "start" });
    }
  };

  /* Show the "scroll sideways" hint only when the table is wider than its box. */
  useEffect(() => {
    const region = regionRef.current;
    if (!region) return;
    const check = () => setOverflowing(region.scrollWidth > region.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(region);
    const table = region.firstElementChild;
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [shown.length, visibleColumns.length]);

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
  const anyDash = shown.some((row) => visibleColumns.some(({ column }) => column.cell(row).kind === "dash"));

  const ariaSort = (key: SortKey) => (sort.key === key ? sort.direction : undefined);

  return (
    <div className="min-w-0">
      {/* ---------- toolbar ---------- */}
      <div ref={toolbarRef} className="scroll-mt-24 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${uid}-search`} className={fieldLabel}>
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
              className={`mt-1 min-h-11 w-full rounded-lg border border-brown/25 bg-cream px-3 text-base text-ink placeholder:text-brown/50 ${focusRing}`}
            />
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <Popover label="Filters" badge={activeFilters ? String(activeFilters) : undefined} {...panelProps("filters")}>
            <div className="space-y-4">
              <div>
                <label htmlFor={`${uid}-reached`} className={fieldLabel}>
                  Reached
                </label>
                <select
                  id={`${uid}-reached`}
                  value={reachedAtLeast}
                  onChange={(event) => {
                    setReachedAtLeast(Number(event.target.value));
                    setPage(1);
                  }}
                  className={`mt-1 ${selectClass}`}
                >
                  <option value={-1}>Any round</option>
                  {config.stageOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {view === "riders" && (
                <div>
                  <label htmlFor={`${uid}-state`} className={fieldLabel}>
                    State
                  </label>
                  <select
                    id={`${uid}-state`}
                    value={state}
                    onChange={(event) => {
                      setState(event.target.value);
                      setPage(1);
                    }}
                    className={`mt-1 ${selectClass}`}
                  >
                    <option value="">Any state</option>
                    {states.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={clearFilters}
                disabled={!filtersOn}
                className={`min-h-11 font-semibold text-bronze-dark underline underline-offset-4 disabled:cursor-not-allowed disabled:text-brown/40 disabled:no-underline ${focusRing}`}
              >
                Clear filters
              </button>
            </div>
          </Popover>

          <Popover label="Columns" {...panelProps("columns")}>
            <fieldset>
              <legend className={fieldLabel}>Show these columns</legend>
              <ul className="mt-2 space-y-1">
                {config.groups.map((group) => (
                  <li key={group.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={groupChecked(group)}
                        onChange={(event) => {
                          const on = event.target.checked;
                          setGroupSettings((before) => ({ ...before, [group.id]: on ? "on" : "off" }));
                        }}
                        className={`h-5 w-5 accent-bronze-deep ${focusRing}`}
                      />
                      <span>
                        {group.label}
                        <span className="block text-xs text-brown/65">
                          {config.columns
                            .filter((column) => column.group === group.id)
                            .map((column) => column.label)
                            .join(", ")}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </Popover>

          <Popover label="Stats legend" {...panelProps("legend")}>
            <StatsLegend view={view} />
          </Popover>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm text-brown/85" aria-live="polite">
            {showingText(current, pageSize, total, config.noun)}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor={`${uid}-size`} className="text-sm text-brown/85">
              Rows per page
            </label>
            <select
              id={`${uid}-size`}
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className={`min-h-11 rounded-lg border border-brown/25 bg-cream px-2 text-base text-ink ${focusRing}`}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ---------- table ---------- */}
      {total === 0 ? (
        <div className="mt-4 rounded-xl border border-bronze/20 bg-sand px-4 py-10 text-center">
          <p className="text-brown/85">No {config.noun}s match your search or filters.</p>
          <button
            type="button"
            onClick={clearFilters}
            className={`mt-3 inline-flex min-h-11 items-center rounded-lg border border-bronze-deep bg-bronze-deep px-4 font-display text-sm font-semibold uppercase tracking-[0.12em] text-cream ${focusRing}`}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {overflowing && (
            <p className="mt-4 flex items-center gap-1.5 text-xs text-brown/70">
              <svg viewBox="0 0 16 10" aria-hidden className="h-2.5 w-4">
                <path d="M1 5h14M11 1l4 4-4 4M5 1 1 5l4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              Scroll the table sideways to see more columns.
            </p>
          )}
          <div
            ref={regionRef}
            role="region"
            aria-labelledby={captionId}
            tabIndex={0}
            className={`relative mt-2 max-w-full overflow-x-auto rounded-xl border border-bronze/20 bg-cream ${focusRing}`}
          >
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <caption id={captionId} className="sr-only">
                {config.nameHeading} statistics, {season} season, {sortText}
              </caption>
              <thead className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-brown">
                <tr>
                  <th
                    rowSpan={2}
                    scope="col"
                    aria-sort={ariaSort("rank")}
                    className="sticky left-0 z-20 w-12 min-w-12 border-b border-bronze/20 bg-parchment px-2 py-2 align-bottom"
                  >
                    <SortButton
                      label="#"
                      title="Rank"
                      active={sort.key === "rank"}
                      direction={sort.direction}
                      onClick={() => sortBy("rank", "ascending")}
                    />
                  </th>
                  <th
                    rowSpan={2}
                    scope="col"
                    aria-sort={ariaSort("name")}
                    className="sticky left-12 z-20 min-w-[9.5rem] border-b border-r border-bronze/20 bg-parchment px-2 py-2 align-bottom sm:min-w-[13rem]"
                  >
                    <SortButton
                      label={config.nameHeading}
                      active={sort.key === "name"}
                      direction={sort.direction}
                      onClick={() => sortBy("name", "ascending")}
                    />
                  </th>
                  {visibleGroups.map((group) => {
                    const span = config.columns.filter((column) => column.group === group.id).length;
                    return (
                      <th
                        key={group.id}
                        colSpan={span}
                        scope="colgroup"
                        className={`border-b border-l border-bronze/15 bg-parchment/60 px-2 pb-1 pt-2 text-center text-bronze-dark first:border-l-0 ${groupClass(group)}`}
                      >
                        {group.label}
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {visibleColumns.map(({ column, group }, index) => {
                    const startsGroup = index === 0 || visibleColumns[index - 1].group.id !== group.id;
                    return (
                      <th
                        key={column.id}
                        scope="col"
                        aria-sort={ariaSort(column.id)}
                        className={`whitespace-nowrap border-b border-bronze/20 bg-parchment/60 px-2 py-2 ${
                          column.numeric ? "text-right" : ""
                        } ${startsGroup ? "border-l border-l-bronze/15" : ""} ${groupClass(group)}`}
                      >
                        <SortButton
                          label={column.label}
                          title={column.title}
                          align={column.numeric ? "right" : "left"}
                          active={sort.key === column.id}
                          direction={sort.direction}
                          onClick={() => sortBy(column.id, column.firstDirection)}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const subline = config.subline(row);
                  return (
                    <tr key={row.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-bronze/10 bg-cream px-2 py-2.5 align-top font-display text-base font-bold tabular-nums text-brown/80 group-hover:bg-sand">
                        {row.rank}
                      </td>
                      <th
                        scope="row"
                        className="sticky left-12 z-10 max-w-[9.5rem] border-b border-r border-b-bronze/10 border-r-bronze/20 bg-cream px-2 py-2.5 align-top font-normal group-hover:bg-sand sm:max-w-[18rem]"
                      >
                        <span className="block break-words font-display font-semibold uppercase leading-tight tracking-wide text-ink">
                          {row.name}
                        </span>
                        {subline && (
                          <span className="mt-0.5 block break-words text-xs leading-snug text-brown/70">
                            {subline}
                          </span>
                        )}
                      </th>
                      {visibleColumns.map(({ column, group }, index) => {
                        const startsGroup = index === 0 || visibleColumns[index - 1].group.id !== group.id;
                        return (
                          <td
                            key={column.id}
                            className={`whitespace-nowrap border-b border-bronze/10 px-2 py-2.5 align-top tabular-nums group-hover:bg-sand ${
                              column.numeric ? "text-right" : ""
                            } ${column.id === "points" ? "font-semibold text-ink" : "text-brown"} ${
                              startsGroup ? "border-l border-l-bronze/10" : ""
                            } ${groupClass(group)}`}
                          >
                            <CellView cell={column.cell(row)} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {anyDash && (
            <p className="mt-2 text-xs text-brown/70">
              <span aria-hidden className="font-semibold">
                –
              </span>
              <span className="sr-only">A dash</span>{" "}
              {view === "teams"
                ? "ridden, total not recorded. It counts as a ride and scores nothing."
                : "ridden, result not recorded. It counts as a run and is left out of the percentages."}
            </p>
          )}
          <Pagination page={current} count={pages} onPage={goToPage} />
        </>
      )}
    </div>
  );
}

/* "Points in Aarhi round 1" -> "points in Aarhi round 1": round names keep
   their capitals inside a sentence. "#" and short headings pass through. */
const lowerFirst = (text: string) => (text ? text[0].toLowerCase() + text.slice(1) : text);

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === "value") return <>{cell.text}</>;
  if (cell.kind === "blank") return <span className="sr-only">{cell.reason}</span>;
  return (
    <span title={cell.reason[0].toUpperCase() + cell.reason.slice(1)} className="text-brown/60">
      <span aria-hidden>–</span>
      <span className="sr-only">{cell.reason}</span>
    </span>
  );
}

function SortButton({
  label,
  title,
  active,
  direction,
  align = "left",
  onClick,
}: {
  label: string;
  title?: string;
  active: boolean;
  direction: SortDirection;
  align?: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Sort by ${lowerFirst(title ?? label)}`}
      className={`inline-flex min-h-8 items-center gap-1 rounded uppercase tracking-[0.12em] hover:text-bronze-dark ${
        align === "right" ? "flex-row-reverse" : ""
      } ${active ? "text-bronze-dark" : ""} ${focusRing}`}
    >
      {title && title !== label ? (
        <>
          <span aria-hidden>{label}</span>
          <span className="sr-only">{title}</span>
        </>
      ) : (
        <span>{label}</span>
      )}
      <svg viewBox="0 0 10 12" aria-hidden className={`h-3 w-2.5 shrink-0 ${active ? "" : "opacity-35"}`}>
        {(!active || direction === "ascending") && <path d="M5 1 1.5 5h7Z" fill="currentColor" />}
        {(!active || direction === "descending") && <path d="M5 11 1.5 7h7Z" fill="currentColor" />}
      </svg>
    </button>
  );
}

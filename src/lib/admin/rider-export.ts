// The administrators' Excel export of riders ("Export to Excel" under Solo
// Riders and under Teams): the fixed column lists, the rows, and the small
// rules around them. Pure functions, no I/O, so the tests exercise them
// directly. The route (src/app/api/admin/registrations/export) reads the
// database and hands the plain rows here.
//
// The column lists below are the whole of what is written. The file carries
// contact details (phone, email, address, age, parents, emergency contact)
// and is for organisers only, but it carries NO confirmation code (that is
// what a rider shows to check in) and no internal ids, no checked_in_by, no
// entered_by, no profile_id and no headshot_path. The selects name only the
// columns the rows need.
//
// No `@/` alias and no `server-only`: imports carry the `.ts` extension
// Node's test runner needs, and the browser button can import the filename
// helper.
import { isPaperPlaceholderEmail } from "../paper-registration.ts";
import { shortLocation } from "../scoring/types.ts";
import type { XlsxCell, XlsxColumn } from "../xlsx/write-xlsx.ts";

export type RiderExportList = "solo" | "teams";

export const RIDER_EXPORT_API = "/api/admin/registrations/export";

/* The same value as XLSX_CONTENT_TYPE in write-xlsx.ts (the tests pin that),
   kept here so the browser button never loads the writer and node:zlib. */
export const RIDER_EXPORT_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const RIDER_EXPORT_NOTE = "Every rider, with contact details. For organisers only.";

/* ?list=solo or ?list=teams, nothing else. */
export const parseRiderExportList = (value: string | null | undefined): RiderExportList | null =>
  value === "solo" || value === "teams" ? value : null;

/* Columns ------------------------------------------------------------------ */

const text = (header: string, width: number): XlsxColumn => ({ header, width, kind: "text" });
const number = (header: string, width: number): XlsxColumn => ({ header, width, kind: "number" });

/* From Father's name to Experience (years): the same in both lists. */
const RIDER_DETAIL_COLUMNS: XlsxColumn[] = [
  text("Father's name", 22),
  text("Mother's name", 22),
  number("Age", 7),
  text("Dal Panth", 22),
  text("Horse", 18),
  text("Horse breed", 16),
  number("Horse age", 10),
  text("District and state", 24),
  text("Full address", 40),
  text("Phone", 16),
  text("Email", 30),
  number("Experience (years)", 12),
];

export const SOLO_EXPORT_COLUMNS: readonly XlsxColumn[] = [
  number("No.", 6),
  text("Rider", 24),
  ...RIDER_DETAIL_COLUMNS,
  text("Emergency contact", 22),
  text("Emergency phone", 16),
  text("Registered", 12),
  text("Registered on", 18),
  text("Checked in", 11),
  text("Checked in at", 18),
];

export const TEAM_EXPORT_COLUMNS: readonly XlsxColumn[] = [
  number("No.", 6),
  text("Team", 22),
  text("Team leader", 12),
  text("Rider", 24),
  ...RIDER_DETAIL_COLUMNS,
  text("Team emergency contact", 22),
  text("Team emergency phone", 16),
  text("Registered", 12),
  text("Registered on", 18),
  text("Checked in", 11),
  text("Checked in at", 18),
];

/* Selects ------------------------------------------------------------------ */

/* Exactly the columns read. dal_panth comes last so the fallback (before the
   migration is applied) drops it and nothing else. */
const SOLO_BASE_COLUMNS = [
  "full_name",
  "father_name",
  "mother_name",
  "age",
  "horse_name",
  "horse_breed",
  "horse_age",
  "location",
  "phone",
  "email",
  "years_experience",
  "emergency_contact_name",
  "emergency_contact_phone",
  "registration_source",
  "created_at",
  "checked_in_at",
] as const;

const MEMBER_BASE_COLUMNS = [
  "full_name",
  "is_leader",
  "father_name",
  "mother_name",
  "age",
  "horse_name",
  "horse_breed",
  "horse_age",
  "location",
  "phone",
  "email",
  "years_experience",
  "created_at",
  "checked_in_at",
] as const;

/* The team each rider belongs to, embedded through team_members.team_id. */
const TEAM_EMBED =
  "teams(team_name, emergency_contact_name, emergency_contact_phone, registration_source, created_at)";

export const soloExportSelect = (withDalPanth: boolean) =>
  [...SOLO_BASE_COLUMNS, ...(withDalPanth ? ["dal_panth"] : [])].join(", ");

export const teamExportSelect = (withDalPanth: boolean) =>
  [...MEMBER_BASE_COLUMNS, ...(withDalPanth ? ["dal_panth"] : []), TEAM_EMBED].join(", ");

/* Postgres: undefined_column. What a select naming dal_panth gets before the
   Dal Panth migration is applied. */
export const UNDEFINED_COLUMN = "42703";

type ReadError = { code?: string | null; message?: string | null } | null | undefined;
type ReadResult<T> = { rows: T[]; error: ReadError };

/* Reads with dal_panth; if the column does not exist yet (42703), reads once
   more without it, and the Dal Panth column is exported blank. Any other
   error, or an error on the second read, is returned as it is. */
export const readWithDalPanthFallback = async <T>(
  read: (select: string) => PromiseLike<ReadResult<T>>,
  selectFor: (withDalPanth: boolean) => string
): Promise<ReadResult<T> & { dalPanthAvailable: boolean }> => {
  const first = await read(selectFor(true));

  if (first.error?.code !== UNDEFINED_COLUMN) {
    return { ...first, dalPanthAvailable: true };
  }

  const second = await read(selectFor(false));
  return { ...second, dalPanthAvailable: false };
};

/* Rows ---------------------------------------------------------------------- */

export type SoloExportSource = {
  full_name: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  age?: number | null;
  dal_panth?: string | null;
  horse_name?: string | null;
  horse_breed?: string | null;
  horse_age?: number | null;
  location?: string | null;
  phone?: string | null;
  email?: string | null;
  years_experience?: number | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  registration_source?: string | null;
  created_at?: string | null;
  checked_in_at?: string | null;
};

export type TeamExportTeam = {
  team_name?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  registration_source?: string | null;
  created_at?: string | null;
};

export type TeamMemberExportSource = Omit<
  SoloExportSource,
  "emergency_contact_name" | "emergency_contact_phone" | "registration_source"
> & {
  is_leader?: boolean | null;
  /* PostgREST gives the embedded team as an object (or, for some
     relationships, a one-item array). */
  teams?: TeamExportTeam | TeamExportTeam[] | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const indiaParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* "10 Nov 2026 19:35" in India time; "" for no time or one that cannot be
   read. Built from numeric parts, so it never depends on how a runtime spells
   a month. */
export const formatIndiaDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = Object.fromEntries(
    indiaParts.formatToParts(date).map((part) => [part.type, part.value])
  ) as Record<string, string | undefined>;
  const month = MONTHS[Number(parts.month) - 1];

  if (!month || !parts.day || !parts.year || !parts.hour || !parts.minute) {
    return "";
  }

  return `${Number(parts.day)} ${month} ${parts.year} ${parts.hour.padStart(2, "0")}:${parts.minute.padStart(2, "0")}`;
};

const registeredHow = (source: string | null | undefined) =>
  source === "paper" ? "Paper" : source === "desk" ? "Desk" : "Online";

/* A paper entry's generated placeholder address is written blank. */
const exportEmail = (email: string | null | undefined) =>
  !email || isPaperPlaceholderEmail(email) ? "" : email;

const textOf = (value: string | null | undefined) => (typeof value === "string" ? value : "");

const numberOf = (value: number | null | undefined): XlsxCell =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const compareText = (first: string | null | undefined, second: string | null | undefined) =>
  textOf(first).localeCompare(textOf(second), "en", { sensitivity: "base" });

const compareTime = (first: string | null | undefined, second: string | null | undefined) => {
  const a = first ? Date.parse(first) : Number.NaN;
  const b = second ? Date.parse(second) : Number.NaN;

  if (Number.isNaN(a) || Number.isNaN(b)) {
    return Number.isNaN(a) === Number.isNaN(b) ? 0 : Number.isNaN(a) ? 1 : -1;
  }

  return a - b;
};

/* The twelve cells from Father's name to Experience (years). */
const riderDetailCells = (row: SoloExportSource): XlsxCell[] => [
  textOf(row.father_name),
  textOf(row.mother_name),
  numberOf(row.age),
  textOf(row.dal_panth),
  textOf(row.horse_name),
  textOf(row.horse_breed),
  numberOf(row.horse_age),
  shortLocation(row.location) ?? "",
  textOf(row.location),
  textOf(row.phone),
  exportEmail(row.email),
  numberOf(row.years_experience),
];

/* Sorted by rider name, then registration time. */
export const buildSoloExportRows = (rows: readonly SoloExportSource[]): XlsxCell[][] =>
  [...rows]
    .sort(
      (first, second) =>
        compareText(first.full_name, second.full_name) ||
        compareTime(first.created_at, second.created_at)
    )
    .map((row, index) => [
      index + 1,
      textOf(row.full_name),
      ...riderDetailCells(row),
      textOf(row.emergency_contact_name),
      textOf(row.emergency_contact_phone),
      registeredHow(row.registration_source),
      formatIndiaDateTime(row.created_at),
      row.checked_in_at ? "Yes" : "No",
      formatIndiaDateTime(row.checked_in_at),
    ]);

const teamOf = (row: TeamMemberExportSource): TeamExportTeam => {
  const team = Array.isArray(row.teams) ? row.teams[0] : row.teams;
  return team ?? {};
};

/* Sorted by team name (then the team's registration time, so two teams with
   the same name never interleave), the leader first, then rider name. */
export const buildTeamExportRows = (rows: readonly TeamMemberExportSource[]): XlsxCell[][] =>
  [...rows]
    .map((row) => ({ row, team: teamOf(row) }))
    .sort(
      (first, second) =>
        compareText(first.team.team_name, second.team.team_name) ||
        compareTime(first.team.created_at, second.team.created_at) ||
        Number(Boolean(second.row.is_leader)) - Number(Boolean(first.row.is_leader)) ||
        compareText(first.row.full_name, second.row.full_name) ||
        compareTime(first.row.created_at, second.row.created_at)
    )
    .map(({ row, team }, index) => [
      index + 1,
      textOf(team.team_name),
      row.is_leader ? "Yes" : "No",
      textOf(row.full_name),
      ...riderDetailCells(row),
      textOf(team.emergency_contact_name),
      textOf(team.emergency_contact_phone),
      registeredHow(team.registration_source),
      formatIndiaDateTime(row.created_at ?? team.created_at),
      row.checked_in_at ? "Yes" : "No",
      formatIndiaDateTime(row.checked_in_at),
    ]);

/* File ---------------------------------------------------------------------- */

export const riderExportSheetName = (list: RiderExportList) =>
  list === "solo" ? "Solo riders" : "Team riders";

/* nezabazi-solo-riders-2026-11-10.xlsx; the date is India's. */
export const riderExportFilename = (list: RiderExportList, isoDate: string) =>
  `nezabazi-${list === "solo" ? "solo" : "team"}-riders-${isoDate}.xlsx`;

/* YYYY-MM-DD in India. */
export const todayInIndia = (now: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/* The file name the browser saves: the server's, when it is a plain .xlsx
   name, otherwise the fallback. Never a path. */
export const filenameFromContentDisposition = (
  header: string | null | undefined,
  fallback: string
) => {
  const match = /filename="([^"]*)"/i.exec(header ?? "") ?? /filename=([^;]+)/i.exec(header ?? "");
  const name = match?.[1]?.trim() ?? "";

  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.xlsx$/.test(name) ? name : fallback;
};

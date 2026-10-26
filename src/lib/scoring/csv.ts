// RFC 4180 CSV for the vMix data sources.
//
// Fields containing a comma, a double quote, a carriage return or a line feed
// are wrapped in double quotes, with every quote inside doubled; records end
// in CRLF; the first record is the header. No imports, so the node test runner
// can load this file directly.

export type CsvValue = string | number | boolean | null | undefined;

export const csvField = (value: CsvValue) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (
  columns: readonly string[],
  rows: readonly Readonly<Record<string, CsvValue>>[]
) =>
  [
    columns.map(csvField).join(","),
    ...rows.map((row) => columns.map((column) => csvField(row[column])).join(",")),
  ].join("\r\n") + "\r\n";

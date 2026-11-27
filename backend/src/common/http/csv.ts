/**
 * CSV for spreadsheets. A cell that starts with = + @ (or - followed by anything but a plain number)
 * would be run as a formula by Excel / Sheets, so it gets a leading apostrophe (Rules.md 5.7).
 * Negative amounts such as -1180.00 are plain numbers and stay as they are.
 */
const text = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint')
    return String(v);
  return JSON.stringify(v);
};

export function csvCell(value: unknown): string {
  let s = text(value);
  const formula =
    /^[=+@\t\r]/.test(s) || (s.startsWith('-') && !/^-\d+(\.\d+)?$/.test(s));
  if (formula) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Byte order mark, so Excel reads the file as UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

/** BOM first; CRLF line ends. */
export function toCsv(rows: unknown[][]): string {
  return (
    BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
  );
}

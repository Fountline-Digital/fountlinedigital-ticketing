// CSV that opens cleanly in Excel: BOM, CRLF, quoted when needed, and formula-looking
// cells (= + - @) prefixed so exported text never runs as a formula.
export function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return "﻿" + [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}

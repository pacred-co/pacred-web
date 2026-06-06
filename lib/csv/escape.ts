/**
 * CSV cell escaping — RFC-4180 quoting PLUS spreadsheet formula-injection
 * neutralization.
 *
 * Why both: the admin CSV exports (≈40 surfaces, all via
 * components/admin/csv-button.tsx) carry customer-controlled free text —
 * name, address, LINE id, Facebook, refund reason, product title, bank
 * account name, notes. RFC-4180 double-quote quoting prevents
 * delimiter/quote/newline breakout, but it does NOT stop a cell whose first
 * character is `=` `+` `-` `@` (or a leading TAB / CR) from being executed
 * as a FORMULA when an admin or VA opens the file in Excel / LibreOffice /
 * Google Sheets. A payload like `=HYPERLINK(...)` / `=IMPORTXML(...)` /
 * `=WEBSERVICE(...)` can then exfiltrate the whole sheet. A customer can set
 * such a value at self-registration, so this is the highest-impact issue on
 * the export surface. We defuse it by prefixing a guard apostrophe so the
 * spreadsheet treats the cell as literal text.
 *
 * (Numeric columns are pre-stringified upstream via toFixed/String, so the
 * guard never corrupts a figure that matters for these report exports.)
 */
export function escapeCsvCell(value: string | number | null | undefined): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Gap #8 — Admin reports framework: shared types for legacy-PCS-faithful
 * report pages.
 *
 * Legacy ground-truth: pcs-admin/report-*.php. Each report renders a single
 * table of grouped rows + a totals footer; some show a list of detail rows
 * (linkable). This module defines the canonical row shape so each report
 * page can rely on the same shell.
 *
 *   See: docs/research/d1-deep-audit-2026-05-24.md §1 Gap #8.
 */

/** A single column on a report table. */
export type ReportColumn = {
  /** Object key the cell value is read from on each row. */
  key: string;
  /** Header label (Thai is the legacy default — keep it). */
  label: string;
  /** Optional right-align for numerics. */
  align?: "left" | "right" | "center";
  /** Optional explicit cell formatter (e.g. money → "฿1,234.56"). Falls
   *  back to `String(value)` if not provided. */
  format?: (v: unknown) => string;
  /** Marks this column as the primary "value" — included in the footer
   *  total + treated as the report's headline number. */
  total?: boolean;
};

/** One row on the report — value bag keyed by column.key. */
export type ReportRow = Record<string, string | number | null | undefined>;

/** A grand-total / per-column aggregate, rendered in <tfoot>. */
export type ReportTotals = Record<string, string | number>;

/** Pre-fetched data for a report — what the page hands the shell. */
export type ReportData = {
  columns: ReportColumn[];
  rows:    ReportRow[];
  totals?: ReportTotals;
};

// ── helpers (centralised so every report formats the same way) ───────────

/** Thai-locale baht. Returns "฿1,234.56" (always 2 dp). */
export function thb(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "฿0.00";
  return "฿" + v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Thai-locale integer (no decimals). */
export function intTh(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString("th-TH");
}

/** Thai-locale decimal with N dp. */
export function decTh(n: number | string | null | undefined, dp = 2): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return (0).toFixed(dp);
  return v.toLocaleString("th-TH", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/** Format a timestamp / date string in TH-locale (date only). */
export function dateTh(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("th-TH");
}

/** Format a timestamp / date string in TH-locale (date + time). */
export function dateTimeTh(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("th-TH");
}

// ── date-range helpers — every report defaults to last 30 days unless
//    the URL ?from=YYYY-MM-DD&to=YYYY-MM-DD overrides it. ─────────────────

export type DateRange = {
  /** ISO `YYYY-MM-DD` (UTC midnight start). */
  from: string;
  /** ISO `YYYY-MM-DD` (inclusive — query uses `<= to + 23:59:59`). */
  to:   string;
};

/** Resolve `?from=&to=` from a Next searchParams bag, default = last 30 days. */
export function resolveDateRange(sp: { from?: string; to?: string }, defaultDays = 30): DateRange {
  const now = new Date();
  const toDefault = isoDate(now);
  const fromDefault = isoDate(new Date(now.getTime() - defaultDays * 86_400_000));
  // Validate the YYYY-MM-DD format; fall back to default if malformed.
  const from = isValidDate(sp.from) ? sp.from! : fromDefault;
  const to   = isValidDate(sp.to)   ? sp.to!   : toDefault;
  return { from, to };
}

/** A start-of-day timestamp for a `YYYY-MM-DD` string (UTC). */
export function dayStartIso(d: string): string {
  return new Date(`${d}T00:00:00Z`).toISOString();
}
/** An end-of-day timestamp for a `YYYY-MM-DD` string (UTC). */
export function dayEndIso(d: string): string {
  return new Date(`${d}T23:59:59Z`).toISOString();
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isValidDate(s: string | undefined): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

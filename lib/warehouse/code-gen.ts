/**
 * Container code generator (T-P2 / CT-2).
 *
 * Pure logic — no DB.  Generates the spine code format the audit calls
 * for: `<originPrefix>-<YYMMDD>-<seq>` (e.g. "GZE260516-1" =
 * Guangzhou-Eastbound, 2026-05-16, sequence 1).
 *
 * Lives outside `server-only` so tsx tests can import directly.  Sequence
 * resolution against the DB is the caller's responsibility — this helper
 * just builds the string from inputs.
 */

/**
 * Map an origin (city / warehouse / "GZE" already) to a 2-3 char prefix.
 * Conservative — unknown inputs pass through (uppercased) so admin can
 * write whatever convention the warehouse uses.
 */
const ORIGIN_PREFIX: Record<string, string> = {
  guangzhou: "GZ",
  yiwu:      "YW",
  shenzhen:  "SZ",
  hangzhou:  "HZ",
  shanghai:  "SH",
};

export function originPrefix(origin: string): string {
  const key = origin.trim().toLowerCase();
  if (ORIGIN_PREFIX[key]) return ORIGIN_PREFIX[key];
  // Fall back to uppercased first 3 chars (handles "GZE", "Yiwu", "GZE-1", etc.)
  return origin.trim().toUpperCase().slice(0, 3) || "XX";
}

/** YYMMDD per Bangkok/UTC+7 — same as legacy container_no in 0016. */
export function dateSlug(d: Date = new Date()): string {
  // Convert to UTC+7 by adding 7 hours then taking UTC parts.
  const bkkMs = d.getTime() + 7 * 60 * 60 * 1000;
  const bkk = new Date(bkkMs);
  const yy = String(bkk.getUTCFullYear()).slice(-2);
  const mm = String(bkk.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bkk.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Build the canonical spine code from parts. */
export function buildContainerCode(opts: {
  origin:   string;
  date?:    Date;
  seq:      number;
}): string {
  const prefix = originPrefix(opts.origin);
  const date   = dateSlug(opts.date);
  return `${prefix}${date}-${opts.seq}`;
}

/**
 * Relative time helper for customer freshness signals.
 *
 * Use case (U1-7 last-sync timestamp): when a customer lands on a tracking
 * page they need to know "is this data fresh, or has the system not heard
 * from anyone in 3 days?". Absolute timestamps require math; relative
 * time ("5 นาทีที่แล้ว") communicates freshness instantly.
 *
 * Returns Thai by default. Falls back to "วันที่ DD/MM/YYYY" for >30 days
 * because Thai relative-time vocabulary becomes vague past a month.
 *
 * @example
 *   relativeTimeTh(new Date()) // "เพิ่งอัพเดท"
 *   relativeTimeTh(Date.now() - 5 * 60_000) // "5 นาทีที่แล้ว"
 *   relativeTimeTh(Date.now() - 3 * 60 * 60_000) // "3 ชั่วโมงที่แล้ว"
 */

export function relativeTimeTh(input: Date | string | number | null | undefined): string {
  if (input == null) return "—";
  const then = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  const ms = Date.now() - then.getTime();

  // Future or in the very recent past
  if (ms < 30_000) return "เพิ่งอัพเดท";

  const sec = Math.floor(ms / 1000);
  if (sec < 60)        return `${sec} วินาทีที่แล้ว`;

  const min = Math.floor(sec / 60);
  if (min < 60)        return `${min} นาทีที่แล้ว`;

  const hr = Math.floor(min / 60);
  if (hr < 24)         return `${hr} ชั่วโมงที่แล้ว`;

  const day = Math.floor(hr / 24);
  if (day < 7)         return `${day} วันที่แล้ว`;

  const week = Math.floor(day / 7);
  if (week < 5)        return `${week} สัปดาห์ที่แล้ว`;

  // Past 30 days — relative-time becomes too vague; use absolute.
  return then.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Color hint for a freshness pill — caller maps to Tailwind classes.
 *
 *   fresh    = updated within 1 hour    → green
 *   recent   = updated within 24 hours  → muted (default)
 *   stale    = updated 1-7 days ago     → amber
 *   very-old = updated >7 days ago      → red
 *
 * Used in U1-7 to signal "data has not been updated in a while — contact
 * support if you expect newer info".
 */
export function freshnessClass(input: Date | string | number | null | undefined): "fresh" | "recent" | "stale" | "very-old" | "unknown" {
  if (input == null) return "unknown";
  const then = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  const ms = Date.now() - then.getTime();

  if (ms < 60 * 60_000)        return "fresh";       // < 1h
  if (ms < 24 * 60 * 60_000)   return "recent";      // < 24h
  if (ms < 7 * 24 * 60 * 60_000) return "stale";     // < 7d
  return "very-old";
}

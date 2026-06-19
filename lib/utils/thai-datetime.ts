/**
 * Thai-timezone date/time formatters (owner 2026-06-19).
 *
 * Pacred runs in Thailand. Timestamps in the DB are UTC, and the bare
 * `toLocaleString` calls scattered across admin surfaces render either in the
 * server's TZ or with an ambiguous locale — the owner saw "03:53" where Bangkok
 * was "10:53". These formatters PIN the timezone to Asia/Bangkok and produce the
 * owner's requested format:
 *
 *   - date     → "DD/MM/YY"        (year = Buddhist Era, 2-digit: 2569 → "69")
 *   - time     → "HH.MM น."        (24-hour, dot separator, trailing " น.")
 *   - datetime → "DD/MM/YY HH.MM น."
 *
 * All null / invalid inputs → "—".
 *
 * @example
 *   // Instant 2026-06-18T20:53:00Z = Bangkok 2026-06-19 03:53 (UTC+7).
 *   formatThaiDateTime("2026-06-18T20:53:00Z") // "19/06/69 03.53 น."
 *   formatThaiDate("2026-06-18T20:53:00Z")     // "19/06/69"
 *   formatThaiTime("2026-06-18T20:53:00Z")     // "03.53 น."
 *   formatThaiDateTime(null)                   // "—"
 */

const EM_DASH = "—";

/** Coerce the input to a valid Date, or null. */
function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve the Bangkok-local calendar parts of an instant.
 *
 * Intl with `timeZone: 'Asia/Bangkok'` gives us the wall-clock day/month/year/
 * hour/minute as they read in Thailand regardless of the server TZ. We then add
 * 543 to the Gregorian year for the Buddhist Era and take its last two digits.
 */
function bangkokParts(d: Date): {
  day: string;
  month: string;
  yearBE2: string;
  hour: string;
  minute: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const gregorianYear = Number(get("year"));
  const yearBE = gregorianYear + 543;
  // 2-digit BE year — last two digits, zero-padded.
  const yearBE2 = String(yearBE % 100).padStart(2, "0");

  // Intl en-GB hour can render "24" at midnight in some engines — normalise to 00.
  let hour = get("hour");
  if (hour === "24") hour = "00";

  return {
    day: get("day"),
    month: get("month"),
    yearBE2,
    hour,
    minute: get("minute"),
  };
}

/** "DD/MM/YY HH.MM น." in Asia/Bangkok (BE 2-digit year). null/invalid → "—". */
export function formatThaiDateTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return EM_DASH;
  const { day, month, yearBE2, hour, minute } = bangkokParts(d);
  return `${day}/${month}/${yearBE2} ${hour}.${minute} น.`;
}

/** "DD/MM/YY" in Asia/Bangkok (BE 2-digit year). null/invalid → "—". */
export function formatThaiDate(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return EM_DASH;
  const { day, month, yearBE2 } = bangkokParts(d);
  return `${day}/${month}/${yearBE2}`;
}

/** "HH.MM น." in Asia/Bangkok (24-hour). null/invalid → "—". */
export function formatThaiTime(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return EM_DASH;
  const { hour, minute } = bangkokParts(d);
  return `${hour}.${minute} น.`;
}

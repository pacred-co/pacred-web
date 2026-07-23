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

/**
 * Parse a DB timestamp as a UTC **instant**.
 *
 * The legacy `tb_*` datetimes are stored UTC but are frequently serialized
 * WITHOUT a timezone marker (e.g. `"2026-07-06T03:40:00"` or
 * `"2026-07-06 03:40:00"`). On a Bangkok (UTC+7) client, `new Date(bareString)`
 * parses such strings as **local** time, shifting the instant by −7h — a
 * just-placed order then reads "7 ชั่วโมงที่แล้ว".
 *
 * This helper treats a tz-less string as UTC:
 *   - a space between date and time → `T`
 *   - append `Z` so the engine parses it as a UTC instant
 * If the input already carries a tz (trailing `Z` or a `±HH:MM` / `±HHMM`
 * offset), or is a `Date` / number, it is used as-is.
 *
 * @example
 *   parseDbInstant("2026-07-06T03:40:00")   // === "2026-07-06T03:40:00Z"
 *   parseDbInstant("2026-07-06 03:40:00")   // === "2026-07-06T03:40:00Z"
 *   parseDbInstant("2026-07-06T03:40:00Z")  // unchanged
 *   parseDbInstant("2026-07-06T03:40:00+07:00") // unchanged
 *   parseDbInstant(1751771000000)           // pass-through
 */
export function parseDbInstant(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let s = input.trim();
  if (s === "") return null;

  // Does the string already carry a timezone? — trailing Z, or a ±HH:MM /
  // ±HHMM offset after the time portion (avoid matching the date's own
  // hyphens by requiring a `:` or digit-run before the offset).
  const hasTz = /[zZ]$/.test(s) || /\d[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) {
    s = s.replace(" ", "T") + "Z";
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
  second: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
    second: get("second"),
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

// Colon-separated (not the dot the minute-precision helpers use): with three
// components "08.16.42" reads as a date, "08:16:42" reads as a clock.
/** "HH:MM:SS น." in Asia/Bangkok (24-hour, to the second). null/invalid → "—". */
export function formatThaiTimeWithSeconds(input: Date | string | number | null | undefined): string {
  const d = toDate(input);
  if (!d) return EM_DASH;
  const { hour, minute, second } = bangkokParts(d);
  return `${hour}:${minute}:${second} น.`;
}

// ──────────────────────────────────────────────────────────────────────────────
// วว/ดด/ปปปป ⇄ ISO — date-only form fields (owner 2026-07-23)
//
// WHY not `<input type="date">`: its DISPLAYED format follows the BROWSER/OS
// locale, not the page. On an en-US browser it renders 04/24/2026 (MM/DD) which
// Thai staff read as 4 April. There is no HTML/CSS way to force DD/MM on it, so
// a date-only filter that must be unambiguous uses a text field + these helpers.
//
// Pure STRING arithmetic on purpose — a date-only value has no time and no zone,
// so routing it through `new Date()` would drag Asia/Bangkok vs UTC into a field
// that has neither (the classic "picked the 24th, saved the 23rd" bug).
//
// Year is ค.ศ. (2026), matching the existing dd/mm/yyyy entry on
// `components/admin/api-forwarder-manual-form.tsx` and the legacy daterangepicker.
// ──────────────────────────────────────────────────────────────────────────────

/** y-m-d is a date that really exists (leap years included). */
function isRealYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  // Day 0 of the NEXT month = last day of this one.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "24/04/2026" → "2026-04-24". Rejects impossible dates (31/02) → null. */
export function ddmmyyyyToIso(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (!isRealYmd(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "2026-04-24" → "24/04/2026". Non-ISO input → "" (renders an empty field). */
export function isoToDdmmyyyy(iso: string | null | undefined): string {
  if (typeof iso !== "string") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** Accept EITHER "24/04/2026" or "2026-04-24" → ISO, else null. Lets an old
 *  ISO bookmark/link keep working after a field switches to the Thai format. */
export function anyDateToIso(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    // NOT Date.parse — it ROLLS OVER instead of rejecting ("2026-02-31" comes
    // back as 2026-03-03), which would silently filter a different day than the
    // one in the URL. Validate the calendar day explicitly.
    return isRealYmd(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? s : null;
  }
  return ddmmyyyyToIso(s);
}

import { formatThaiDateTime, formatThaiDate, formatThaiTime, parseDbInstant } from "./thai-datetime";

let pass = 0;
let fail = 0;
function assert(label: string, cond: boolean): void {
  if (cond) { pass++; console.log("  ✓", label); }
  else      { fail++; console.error("  ✗", label); }
}

console.log("thai-datetime helper");
{
  // Anchor instant: 2026-06-18T20:53:00Z.
  // Bangkok (UTC+7) wall-clock = 2026-06-19 03:53.
  // BE year = 2026 + 543 = 2569 → 2-digit "69".
  const anchor = "2026-06-18T20:53:00Z";

  // ── formatThaiDateTime ──
  console.log("  formatThaiDateTime");
  assert("anchor → '19/06/69 03.53 น.'",        formatThaiDateTime(anchor) === "19/06/69 03.53 น.");
  assert("Date object accepted",                 formatThaiDateTime(new Date(anchor)) === "19/06/69 03.53 น.");
  assert("epoch ms accepted",                    formatThaiDateTime(new Date(anchor).getTime()) === "19/06/69 03.53 น.");
  assert("null → '—'",                           formatThaiDateTime(null) === "—");
  assert("undefined → '—'",                      formatThaiDateTime(undefined) === "—");
  assert("invalid string → '—'",                 formatThaiDateTime("not-a-date") === "—");

  // ── formatThaiDate ──
  console.log("  formatThaiDate");
  assert("anchor → '19/06/69'",                  formatThaiDate(anchor) === "19/06/69");
  assert("null → '—'",                           formatThaiDate(null) === "—");
  assert("invalid → '—'",                        formatThaiDate("xyz") === "—");

  // ── formatThaiTime ──
  console.log("  formatThaiTime");
  assert("anchor → '03.53 น.'",                  formatThaiTime(anchor) === "03.53 น.");
  assert("null → '—'",                           formatThaiTime(null) === "—");
  assert("invalid → '—'",                        formatThaiTime("") === "—");

  // ── timezone-crossing edge: instant on a different Bangkok calendar day ──
  // 2026-12-31T18:30:00Z = Bangkok 2027-01-01 01:30 → BE 2570 → "70".
  console.log("  timezone day-rollover");
  assert("UTC Dec-31 evening → Bangkok next-day Jan-01", formatThaiDateTime("2026-12-31T18:30:00Z") === "01/01/70 01.30 น.");

  // ── midnight normalisation: Bangkok 00:00 ──
  // 2026-06-18T17:00:00Z = Bangkok 2026-06-19 00:00.
  console.log("  midnight");
  assert("Bangkok midnight → '00.00 น.'",        formatThaiTime("2026-06-18T17:00:00Z") === "00.00 น.");
  assert("Bangkok midnight datetime",            formatThaiDateTime("2026-06-18T17:00:00Z") === "19/06/69 00.00 น.");

  // ── parseDbInstant — tz-less DB strings must parse as UTC instants ──
  console.log("  parseDbInstant");
  const utcMs = new Date("2026-07-06T03:40:00Z").getTime();
  assert("bare 'T' string → UTC instant",        parseDbInstant("2026-07-06T03:40:00")?.getTime() === utcMs);
  assert("bare space string → UTC instant",      parseDbInstant("2026-07-06 03:40:00")?.getTime() === utcMs);
  assert("bare 'T' === bare space (same instant)",
    parseDbInstant("2026-07-06T03:40:00")!.getTime() === parseDbInstant("2026-07-06 03:40:00")!.getTime());
  assert("Z-suffixed unchanged",                 parseDbInstant("2026-07-06T03:40:00Z")?.getTime() === utcMs);
  assert("+07:00 offset unchanged (−7h instant)",
    parseDbInstant("2026-07-06T10:40:00+07:00")?.getTime() === utcMs);
  assert("+0700 offset (no colon) unchanged",
    parseDbInstant("2026-07-06T10:40:00+0700")?.getTime() === utcMs);
  // Date / number pass through
  const d = new Date(utcMs);
  assert("Date passes through same instance",     parseDbInstant(d) === d);
  assert("number passes through",                 parseDbInstant(utcMs)?.getTime() === utcMs);
  // Null / invalid
  assert("null → null",                           parseDbInstant(null) === null);
  assert("undefined → null",                      parseDbInstant(undefined) === null);
  assert("empty string → null",                   parseDbInstant("") === null);
  assert("garbage string → null",                 parseDbInstant("not-a-date") === null);
  // The BUG-5 symptom: a just-placed order stored tz-less must NOT read 7h old.
  // With a UTC instant, "now" formatted tz-less then re-parsed is within seconds.
  const bareNow = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  const drift = Math.abs(Date.now() - parseDbInstant(bareNow)!.getTime());
  assert("tz-less 'now' parses within 2s (no 7h drift)", drift < 2000);
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

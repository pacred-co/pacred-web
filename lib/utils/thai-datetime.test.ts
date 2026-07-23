import {
  formatThaiDateTime, formatThaiDate, formatThaiTime, parseDbInstant,
  ddmmyyyyToIso, isoToDdmmyyyy, anyDateToIso,
} from "./thai-datetime";

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

// ── วว/ดด/ปปปป ⇄ ISO (date-only form fields · owner 2026-07-23) ──────────────
{
  console.log("  ddmmyyyyToIso");
  assert("24/04/2026 → 2026-04-24",        ddmmyyyyToIso("24/04/2026") === "2026-04-24");
  assert("1-digit d/m padded",             ddmmyyyyToIso("1/7/2026") === "2026-07-01");
  assert("surrounding spaces tolerated",   ddmmyyyyToIso("  24/04/2026 ") === "2026-04-24");
  assert("leap day 29/02/2024 accepted",   ddmmyyyyToIso("29/02/2024") === "2024-02-29");
  assert("29/02/2026 (not leap) → null",   ddmmyyyyToIso("29/02/2026") === null);
  assert("31/02/2026 → null",              ddmmyyyyToIso("31/02/2026") === null);
  assert("31/04/2026 (30-day month) → null", ddmmyyyyToIso("31/04/2026") === null);
  assert("month 13 → null",                ddmmyyyyToIso("01/13/2026") === null);
  assert("day 0 → null",                   ddmmyyyyToIso("00/04/2026") === null);
  assert("ISO input → null (wrong shape)", ddmmyyyyToIso("2026-04-24") === null);
  assert("garbage → null",                 ddmmyyyyToIso("not-a-date") === null);
  assert("null → null",                    ddmmyyyyToIso(null) === null);
  // Guard the reason these are string-only: no timezone may shift the day.
  assert("no tz shift on 01/01",           ddmmyyyyToIso("01/01/2026") === "2026-01-01");
  assert("no tz shift on 31/12",           ddmmyyyyToIso("31/12/2026") === "2026-12-31");

  console.log("  isoToDdmmyyyy");
  assert("2026-04-24 → 24/04/2026",        isoToDdmmyyyy("2026-04-24") === "24/04/2026");
  assert("ISO datetime prefix accepted",   isoToDdmmyyyy("2026-04-24T05:43:00") === "24/04/2026");
  assert("null → ''",                      isoToDdmmyyyy(null) === "");
  assert("garbage → ''",                   isoToDdmmyyyy("nope") === "");

  console.log("  anyDateToIso (back-compat with old ISO links)");
  assert("accepts dd/mm/yyyy",             anyDateToIso("24/04/2026") === "2026-04-24");
  assert("accepts ISO unchanged",          anyDateToIso("2026-04-24") === "2026-04-24");
  assert("rejects impossible ISO",         anyDateToIso("2026-02-31") === null);
  assert("garbage → null",                 anyDateToIso("zzz") === null);

  // Round-trip: whatever the field shows must survive a submit unchanged.
  const rt = ["2026-01-01", "2026-04-24", "2024-02-29", "2026-12-31"];
  assert("round-trip ISO→ดด/ปป→ISO stable", rt.every((iso) => ddmmyyyyToIso(isoToDdmmyyyy(iso)) === iso));
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);

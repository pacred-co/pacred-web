/**
 * Legacy `diffDateTimeNow($datetime)` — the elapsed-time-since Thai string
 * (member/include/function.php L1074-1093). Renders how long ago (or until) a
 * timestamp is, broken down into the largest relevant units:
 *
 *   "40 นาที 48 วินาที"                      (< 1 hour)
 *   "14 ชั่วโมง 40 นาที 48 วินาที"           (< 1 day)
 *   "1 วัน 14 ชั่วโมง 40 นาที 48 วินาที"     (< 1 month)
 *   "2 เดือน 3 วัน 14 ชั่วโมง …"             (< 1 year)
 *   "1 ปี 2 เดือน 3 วัน …"                   (≥ 1 year)
 *
 * Direction-agnostic like the legacy: always the absolute gap to now.
 *
 * WHY THIS FILE: the exact same helper was hand-transcribed inside the customer
 * `forwarder-row-view.tsx` (a `"use client"` component) and, in a seconds-dropped
 * variant, inside the admin `forwarders-table.tsx` (`diffDateTimeNowThai`). Admin
 * surfaces that want the full legacy string were importing it FROM the customer
 * route file — dragging a whole client component across route groups for one pure
 * function. This is the shared home; new callers import here.
 */

/** True Gregorian-calendar breakdown (handles month/day borrow) between two dates. */
function calendarDiff(from: Date, to: Date): { y: number; m: number; day: number; h: number; i: number; s: number } {
  let y = to.getFullYear() - from.getFullYear();
  let m = to.getMonth() - from.getMonth();
  let day = to.getDate() - from.getDate();
  let h = to.getHours() - from.getHours();
  let i = to.getMinutes() - from.getMinutes();
  let s = to.getSeconds() - from.getSeconds();
  if (s < 0) { s += 60; i -= 1; }
  if (i < 0) { i += 60; h -= 1; }
  if (h < 0) { h += 24; day -= 1; }
  if (day < 0) {
    // days in the month BEFORE `to` (JS day 0 of month = last day of prior month)
    const prevMonthDays = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    day += prevMonthDays;
    m -= 1;
  }
  if (m < 0) { m += 12; y -= 1; }
  return { y, m, day, h, i, s };
}

/**
 * The elapsed-time Thai string for `datetime` relative to now.
 *
 * @returns "" for null / unparseable / a zero gap (so a caller can render nothing).
 */
export function diffDateTimeNow(datetime: string | null | undefined): string {
  if (!datetime) return "";
  const target = new Date(String(datetime).replace(" ", "T"));
  if (Number.isNaN(target.getTime())) return "";
  const now = new Date();
  const from = target < now ? target : now;
  const to = target < now ? now : target;

  const { y, m, day, h, i, s } = calendarDiff(from, to);
  if (y === 0 && m === 0 && day === 0 && h === 0 && i === 0) return "";
  if (y === 0 && m === 0 && day === 0 && h === 0) return `${i} นาที ${s} วินาที`;
  if (y === 0 && m === 0 && day === 0) return `${h} ชั่วโมง ${i} นาที ${s} วินาที`;
  if (y === 0 && m === 0) return `${day} วัน ${h} ชั่วโมง ${i} นาที ${s} วินาที`;
  if (y === 0) return `${m} เดือน ${day} วัน ${h} ชั่วโมง ${i} นาที ${s} วินาที`;
  return `${y} ปี ${m} เดือน ${day} วัน ${h} ชั่วโมง ${i} นาที ${s} วินาที`;
}

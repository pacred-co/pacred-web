/**
 * Shared formatting + calendar helpers for the planner (pure, no deps).
 * Dates are handled in LOCAL time (publishDate is a YYYY-MM-DD wall date) to
 * avoid UTC off-by-one in the calendar grid.
 */

/** ชื่อวันสั้น เรียงตาม Date.getDay() (0 = อาทิตย์). */
export const TH_DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"] as const;

export const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const TH_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function fmtNum(n?: number | null): string {
  return typeof n === "number" && !Number.isNaN(n) ? n.toLocaleString("th-TH") : "—";
}

export function fmtMoney(n?: number | null): string {
  return typeof n === "number" && !Number.isNaN(n) ? `฿${n.toLocaleString("th-TH", { maximumFractionDigits: 0 })}` : "—";
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Date → "YYYY-MM-DD" in local time. */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD" → local Date (or null). */
export function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** "30 มิ.ย. 2569" (Buddhist year via th-TH locale). */
export function fmtThaiDate(s?: string | null): string {
  const d = parseDate(s);
  if (!d) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtThaiDateTime(s?: string | null, time?: string | null): string {
  const base = fmtThaiDate(s);
  return time ? `${base} ${time} น.` : base;
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function sameYmd(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** 6×7 grid of Dates for a month (Sunday-start, incl. leading/trailing days). */
export function monthMatrix(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d += 1) {
      row.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d));
    }
    weeks.push(row);
  }
  return weeks;
}

/** 7 Dates for the week containing `ref` (Sunday-start). */
export function weekDays(ref: Date): Date[] {
  const start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function ymKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

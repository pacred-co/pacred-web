/**
 * Production plan distribution (ปอน 2026-07-01) — spread a monthly quota
 * (long clips per pillar + short total) evenly across the days of a month so
 * the team can see "อะไรลงวันไหนบ้าง". Pure.
 */
import type { ProductionTargets } from "./types";
import { pad2 } from "./util";

export type DaySlot = {
  date: string; // YYYY-MM-DD
  day: number; // 1..N
  longs: { pillarId: string; count: number }[];
  short: number;
  article: number; // บทความ ยืนพื้น/วัน
  post: number; // โพสต์ ยืนพื้น/วัน
  total: number;
};

/** Spread `count` items across `days` buckets as evenly as possible. */
export function spread(count: number, days: number): number[] {
  const arr = new Array<number>(Math.max(0, days)).fill(0);
  if (count <= 0 || days <= 0) return arr;
  for (let i = 0; i < count; i += 1) {
    const d = Math.min(days - 1, Math.floor((i * days) / count));
    arr[d] += 1;
  }
  return arr;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Per-day plan for a month from the quota. */
export function distributeMonth(year: number, month: number, t: ProductionTargets): DaySlot[] {
  const days = daysInMonth(year, month);
  const pillarSpreads = Object.entries(t.longByPillar)
    .filter(([, c]) => c > 0)
    .map(([pillarId, c]) => ({ pillarId, perDay: spread(c, days) }));
  const shortPerDay = spread(t.shortTotal, days);
  // บทความ/โพสต์ = ยืนพื้นต่อวัน (ลงเท่ากันทุกวัน) — ไม่ใช่เกลี่ยจากยอดเดือน
  const article = Math.max(0, t.articlePerDay ?? 0);
  const post = Math.max(0, t.postPerDay ?? 0);

  const slots: DaySlot[] = [];
  for (let d = 0; d < days; d += 1) {
    const longs = pillarSpreads
      .map((p) => ({ pillarId: p.pillarId, count: p.perDay[d] }))
      .filter((x) => x.count > 0);
    const short = shortPerDay[d];
    const longTotal = longs.reduce((s, x) => s + x.count, 0);
    slots.push({ date: `${year}-${pad2(month + 1)}-${pad2(d + 1)}`, day: d + 1, longs, short, article, post, total: longTotal + short + article + post });
  }
  return slots;
}

/** Month totals from the quota. Pass `days` to include the per-day บทความ/โพสต์ baseline. */
export function targetsTotal(
  t: ProductionTargets,
  days = 0,
): { long: number; short: number; article: number; post: number; total: number } {
  const long = Object.values(t.longByPillar).reduce((s, n) => s + (n > 0 ? n : 0), 0);
  const article = Math.max(0, t.articlePerDay ?? 0) * days;
  const post = Math.max(0, t.postPerDay ?? 0) * days;
  return { long, short: t.shortTotal, article, post, total: long + t.shortTotal + article + post };
}

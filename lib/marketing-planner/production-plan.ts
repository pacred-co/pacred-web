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

/** Spread `count` items across the given 0-based day positions, as evenly as
 *  possible. Returns a length-`days` array with 0 on every non-target day. */
export function spreadOnto(count: number, days: number, targetIdx: number[]): number[] {
  const arr = new Array<number>(Math.max(0, days)).fill(0);
  const n = targetIdx.length;
  if (count <= 0 || n <= 0) return arr;
  for (let i = 0; i < count; i += 1) {
    const slot = Math.min(n - 1, Math.floor((i * n) / count));
    arr[targetIdx[slot]] += 1;
  }
  return arr;
}

/** Spread `count` items across all `days` buckets as evenly as possible. */
export function spread(count: number, days: number): number[] {
  return spreadOnto(count, days, Array.from({ length: Math.max(0, days) }, (_, i) => i));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Per-day plan for a month from the quota.
 *
 * `selectedDays` (a set of 1-based day numbers) = "เลือกวันเอง" mode: the whole
 * quota is distributed ONLY onto those days (long/short spread across them, the
 * บทความ/โพสต์ baseline lands only on them) and every other day stays empty.
 * null / undefined = "auto" mode: spread across every day of the month.
 */
export function distributeMonth(year: number, month: number, t: ProductionTargets, selectedDays?: Set<number> | null): DaySlot[] {
  const days = daysInMonth(year, month);
  // The 0-based positions that receive content: every day (auto) or only the
  // chosen ones (manual). An empty selection ⇒ no active days ⇒ an all-zero plan.
  const targetIdx: number[] = [];
  for (let d = 0; d < days; d += 1) {
    if (!selectedDays || selectedDays.has(d + 1)) targetIdx.push(d);
  }
  const activeIdx = new Set(targetIdx);

  const pillarSpreads = Object.entries(t.longByPillar)
    .filter(([, c]) => c > 0)
    .map(([pillarId, c]) => ({ pillarId, perDay: spreadOnto(c, days, targetIdx) }));
  const shortPerDay = spreadOnto(t.shortTotal, days, targetIdx);
  // บทความ/โพสต์ = ยืนพื้นต่อวัน (ลงเฉพาะวันที่ active — ทุกวันใน auto · เฉพาะวันที่เลือกใน manual)
  const articleBase = Math.max(0, t.articlePerDay ?? 0);
  const postBase = Math.max(0, t.postPerDay ?? 0);

  const slots: DaySlot[] = [];
  for (let d = 0; d < days; d += 1) {
    const active = activeIdx.has(d);
    const longs = pillarSpreads
      .map((p) => ({ pillarId: p.pillarId, count: p.perDay[d] }))
      .filter((x) => x.count > 0);
    const short = shortPerDay[d];
    const article = active ? articleBase : 0;
    const post = active ? postBase : 0;
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

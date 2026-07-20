/**
 * Production plan distribution (ปอน 2026-07-01 · per-day pins ปอน 2026-07-18) —
 * spread a monthly quota (long clips per pillar + short total + บทความ/โพสต์
 * baseline) across the days of a month so the team can see "อะไรลงวันไหน".
 *
 * Two layers:
 *  1. เกลี่ยอัตโนมัติ — each type's monthly POOL spreads evenly onto the chosen days.
 *  2. กำหนดเอง (pin) — a day can be pinned to an exact per-type count; the REMAINING
 *     pool then re-balances onto the other chosen (un-pinned) days. (owner ปอน 2026-07-18)
 * Pure.
 */
import { longTotalOf, type ProductionTargets } from "./types";
import { pad2 } from "./util";

export type DaySlot = {
  date: string; // YYYY-MM-DD
  day: number; // 1..N
  longs: { pillarId: string; count: number }[];
  short: number;
  article: number; // บทความ
  total: number;
};

/** ค่าที่ผู้ใช้กำหนดเอง (pin) ต่อวัน ต่อประเภท — undefined = ไม่ pin (เกลี่ยอัตโนมัติ). */
export type DayOverride = { long?: number; short?: number; article?: number };
/** day (1-based) → override. */
export type PlanOverrides = Map<number, DayOverride>;

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

/**
 * Spread a `total` pool onto `targetIdx` days, but honour per-day PINS: a pinned
 * target day keeps its exact value; the REMAINDER (`total − Σ pins`, ≥ 0) is
 * spread evenly onto the un-pinned target days. Pins that overshoot the pool are
 * kept as-is (remainder floors at 0) — the UI warns "เกินโควต้า". `pins` key =
 * 0-based day index (must be a target day to count). Non-target days stay 0.
 */
export function spreadWithPins(total: number, days: number, targetIdx: number[], pins: Map<number, number>): number[] {
  const arr = new Array<number>(Math.max(0, days)).fill(0);
  let pinnedSum = 0;
  const pinnedSet = new Set<number>();
  for (const idx of targetIdx) {
    const p = pins.get(idx);
    if (p != null) {
      const v = Math.max(0, Math.floor(p));
      arr[idx] = v;
      pinnedSum += v;
      pinnedSet.add(idx);
    }
  }
  const freeIdx = targetIdx.filter((i) => !pinnedSet.has(i));
  const remainder = Math.max(0, total - pinnedSum);
  const spreadFree = spreadOnto(remainder, days, freeIdx);
  for (const i of freeIdx) arr[i] = spreadFree[i];
  return arr;
}

/**
 * Split a single day's long-clip total across the pillars, proportional to each
 * pillar's monthly quota (largest-remainder → the parts sum EXACTLY to `dayLongTotal`).
 * So the day cell pins ONE "ยาว รวม" number while `slot.longs` stays per-pillar for
 * generation. Monthly per-pillar totals are therefore proportional (the monthly ยาว
 * TOTAL is exact; the pillar split rounds).
 */
export function splitAcrossPillars(dayLongTotal: number, pillarQuota: [string, number][]): { pillarId: string; count: number }[] {
  const active = pillarQuota.filter(([, q]) => q > 0);
  const totalQuota = active.reduce((s, [, q]) => s + q, 0);
  if (dayLongTotal <= 0 || active.length === 0 || totalQuota <= 0) return [];
  const parts = active.map(([pillarId, q]) => {
    const exact = (dayLongTotal * q) / totalQuota;
    const count = Math.floor(exact);
    return { pillarId, count, frac: exact - count };
  });
  let leftover = dayLongTotal - parts.reduce((s, p) => s + p.count, 0);
  for (const p of [...parts].sort((a, b) => b.frac - a.frac)) {
    if (leftover <= 0) break;
    p.count += 1;
    leftover -= 1;
  }
  return parts.filter((p) => p.count > 0).map((p) => ({ pillarId: p.pillarId, count: p.count }));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Per-day plan for a month from the quota (+ optional per-day pins).
 *
 * `selectedDays` (a set of 1-based day numbers) = "เลือกวันเอง": the quota lands
 * ONLY on those days; every other day is empty. null / undefined = "auto": every day.
 *
 * `overrides` (1-based day → per-type pin) = "กำหนดเอง": a pinned day keeps its exact
 * count and the rest of that type's pool re-balances onto the other chosen days.
 * undefined / empty = pure auto-even (unchanged behaviour).
 *
 * Pools: ยาว = Σ pillar quota · สั้น = shortTotal · บท = articlePerDay × วันที่เลือก ·
 * (บทความ เดิม flat/วัน → ตอนนี้ pooled เพื่อเกลี่ย/pin ได้ ·
 * ไม่มี pin = ผลเท่าเดิม เพราะ pool/วัน = perDay.)
 */
export function distributeMonth(
  year: number,
  month: number,
  t: ProductionTargets,
  selectedDays?: Set<number> | null,
  overrides?: PlanOverrides | null,
): DaySlot[] {
  const days = daysInMonth(year, month);
  const targetIdx: number[] = [];
  for (let d = 0; d < days; d += 1) {
    if (!selectedDays || selectedDays.has(d + 1)) targetIdx.push(d);
  }
  const activeIdx = new Set(targetIdx);
  const activeDays = targetIdx.length;

  // Per-type pin map (0-based day idx → count), only for target days.
  const pinFor = (key: keyof DayOverride): Map<number, number> => {
    const m = new Map<number, number>();
    if (overrides) {
      for (const [day, ov] of overrides) {
        const idx = day - 1;
        const v = ov[key];
        if (activeIdx.has(idx) && v != null) m.set(idx, Math.max(0, Math.floor(v)));
      }
    }
    return m;
  };

  // คลิปยาว = ก้อนเดียว ไม่แตกตามเสาหลักแล้ว (owner 2026-07-20) — แผนเก่าที่เคยแตกไว้
  // ยังนับรวมได้ผ่าน longTotalOf
  const longPool = longTotalOf(t);
  const longPerDay = spreadWithPins(longPool, days, targetIdx, pinFor("long"));
  const shortPerDay = spreadWithPins(t.shortTotal, days, targetIdx, pinFor("short"));
  const articlePool = Math.max(0, t.articlePerDay ?? 0) * activeDays;
  const articlePerDay = spreadWithPins(articlePool, days, targetIdx, pinFor("article"));

  const slots: DaySlot[] = [];
  for (let d = 0; d < days; d += 1) {
    const longs = longPerDay[d] > 0 ? [{ pillarId: "", count: longPerDay[d] }] : [];
    const short = shortPerDay[d];
    const article = articlePerDay[d];
    const longTotal = longs.reduce((s, x) => s + x.count, 0);
    slots.push({ date: `${year}-${pad2(month + 1)}-${pad2(d + 1)}`, day: d + 1, longs, short, article, total: longTotal + short + article });
  }
  return slots;
}

/** Month totals from the quota. Pass `days` to include the per-day บทความ/โพสต์ baseline. */
export function targetsTotal(
  t: ProductionTargets,
  days = 0,
): { long: number; short: number; article: number; total: number } {
  const long = longTotalOf(t);
  const article = Math.max(0, t.articlePerDay ?? 0) * days;
  return { long, short: t.shortTotal, article, total: long + t.shortTotal + article };
}

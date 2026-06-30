/** Aggregations for dashboard + analytics (owner brief §2.1, §2.6). Pure. */
import type { ContentItem } from "./types";
import { isResultEmpty } from "./performance";

export type Totals = {
  reach: number; view: number; engagement: number; click: number;
  inbox: number; lead: number; deal: number; revenue: number; cost: number;
};

export function notArchived(items: ContentItem[]): ContentItem[] {
  return items.filter((c) => !c.archivedAt);
}

export function inMonth(items: ContentItem[], ym: string): ContentItem[] {
  return items.filter((c) => (c.publishDate ?? "").slice(0, 7) === ym);
}

export function totals(items: ContentItem[]): Totals {
  const t: Totals = { reach: 0, view: 0, engagement: 0, click: 0, inbox: 0, lead: 0, deal: 0, revenue: 0, cost: 0 };
  for (const c of items) {
    const r = c.result;
    if (!r) continue;
    t.reach += r.reach ?? 0;
    t.view += r.view ?? 0;
    t.engagement += (r.like ?? 0) + (r.comment ?? 0) + (r.share ?? 0) + (r.save ?? 0);
    t.click += r.click ?? 0;
    t.inbox += (r.inbox ?? 0) + (r.lineAdd ?? 0);
    t.lead += r.lead ?? 0;
    t.deal += r.deal ?? 0;
    t.revenue += r.revenue ?? 0;
    t.cost += r.cost ?? 0;
  }
  return t;
}

/** Count items grouped by a content field (e.g. platformId), desc. */
export function countByField(items: ContentItem[], field: keyof ContentItem): { id: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of items) {
    const v = c[field];
    if (typeof v !== "string" || !v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

/** Posts per day for a given month (index 0 = day 1). */
export function postsByDayOfMonth(items: ContentItem[], year: number, month: number): number[] {
  const days = new Date(year, month + 1, 0).getDate();
  const arr = new Array<number>(days).fill(0);
  for (const c of items) {
    const d = c.publishDate;
    if (!d) continue;
    const [y, m, day] = d.split("-").map(Number);
    if (y === year && m === month + 1 && day >= 1 && day <= days) arr[day - 1] += 1;
  }
  return arr;
}

export function withResult(items: ContentItem[]): ContentItem[] {
  return items.filter((c) => c.result && !isResultEmpty(c.result));
}

export function topByScore(items: ContentItem[], n: number): ContentItem[] {
  return withResult(items)
    .slice()
    .sort((a, b) => (b.result?.performanceScore ?? 0) - (a.result?.performanceScore ?? 0))
    .slice(0, n);
}

export function shouldRepeatItems(items: ContentItem[]): ContentItem[] {
  return items.filter((c) => c.result?.shouldRepeat === "yes");
}

export function needReworkItems(items: ContentItem[]): ContentItem[] {
  return items.filter((c) => c.result?.resultStatus === "rework" || c.result?.shouldRepeat === "no");
}

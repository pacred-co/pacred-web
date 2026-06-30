/**
 * Performance scoring for a content result (owner brief §2.6).
 * Pure functions — score 0-100 with saturating normalization (diminishing
 * returns) weighted toward the bottom of the funnel (lead/deal/revenue).
 */
import type { ContentResult, ResultStatus } from "./types";

/** x / (x + k) → 0..1, saturating. */
function sat(x: number | undefined, k: number): number {
  const v = typeof x === "number" && x > 0 ? x : 0;
  return v / (v + k);
}

const TRACKED_FIELDS: (keyof ContentResult)[] = [
  "reach", "impression", "view", "like", "comment", "share", "save",
  "click", "inbox", "lineAdd", "lead", "deal", "revenue",
  "organicTraffic", "review", "mention", "backlink",
];

/** 0..1 — how much of the result was actually filled in. */
export function resultCompleteness(r: ContentResult): number {
  const filled = TRACKED_FIELDS.filter((f) => {
    const v = r[f];
    return typeof v === "number" && v > 0;
  }).length;
  return filled / TRACKED_FIELDS.length;
}

/** True when the result has no meaningful numbers entered yet. */
export function isResultEmpty(r: ContentResult | undefined): boolean {
  if (!r) return true;
  return TRACKED_FIELDS.every((f) => {
    const v = r[f];
    return !(typeof v === "number" && v > 0);
  });
}

/** Performance score 0-100. */
export function computePerformanceScore(r: ContentResult): number {
  const engagement = (r.like ?? 0) + (r.comment ?? 0) * 2 + (r.share ?? 0) * 3 + (r.save ?? 0) * 2 + (r.review ?? 0) * 5;
  const reachAll = (r.reach ?? r.impression ?? 0) + (r.organicTraffic ?? 0);
  const actions = (r.lead ?? 0) + (r.lineAdd ?? 0) + (r.inbox ?? 0);
  const advocacy = (r.mention ?? 0) + (r.backlink ?? 0) * 3;
  const parts: [number, number][] = [
    [0.1, sat(reachAll, 5000)],
    [0.12, sat(r.view, 5000)],
    [0.16, sat(engagement, 500)],
    [0.14, sat(r.click, 200)],
    [0.2, sat(actions, 25)],
    [0.12, sat(r.deal, 5)],
    [0.06, sat(r.revenue, 50000)],
    [0.06, sat(advocacy, 15)],
    [0.04, resultCompleteness(r)],
  ];
  const score = parts.reduce((acc, [w, n]) => acc + w * n, 0) * 100;
  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Derive a result status tier (unless the user pinned an override). */
export function deriveResultStatus(r: ContentResult, score: number): ResultStatus {
  if (r.resultStatusOverride) return r.resultStatusOverride;
  if (isResultEmpty(r) && !r.actualPublishDate) return "none";
  if (isResultEmpty(r)) return "waiting";
  if (r.shouldRepeat === "yes") return "repeat";
  if (r.shouldRepeat === "no") return "rework";
  if (score < 40) return "low";
  if (score < 70) return "mid";
  return "high";
}

/** Return a result with performanceScore + resultStatus filled. */
export function enrichResult(r: ContentResult): ContentResult {
  const performanceScore = computePerformanceScore(r);
  const resultStatus = deriveResultStatus(r, performanceScore);
  return { ...r, performanceScore, resultStatus };
}

export const RESULT_STATUS_LABEL: Record<ResultStatus, string> = {
  none: "ยังไม่กรอกผล",
  waiting: "รอข้อมูล",
  low: "ผลลัพธ์ต่ำ",
  mid: "ผลลัพธ์กลาง",
  high: "ผลลัพธ์ดี",
  repeat: "ควรทำซ้ำ",
  rework: "ควรปรับใหม่",
};

export const RESULT_STATUS_COLOR: Record<ResultStatus, string> = {
  none: "#94a3b8",
  waiting: "#f59e0b",
  low: "#ef4444",
  mid: "#3b82f6",
  high: "#22c55e",
  repeat: "#16a34a",
  rework: "#f97316",
};

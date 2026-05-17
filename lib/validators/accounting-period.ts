/**
 * Zod schemas for V-E9 accounting periods admin flows.
 *
 * Per [docs/port-specs/freight-monthly-closing.md] + migration
 * 0056_accounting_periods.sql.
 *
 * V1 surface area (admin-only):
 *   - openAccountingPeriod    → seed a yyyymm row in 'open' state
 *   - markPeriodClosing       → open → closing (UI soft-warning)
 *   - closePeriod             → closing → closed (snapshot fan-out; super+accounting)
 *   - reopenPeriod            → closed → open (SUPER ONLY emergency rollback;
 *                                              reason ≥10 chars required)
 *
 * Status lifecycle (mirrors the DB CHECK):
 *   open → closing → closed → (super-only reopen) → open
 */

import { z } from "zod";

/** Allowed status values — mirrors the DB CHECK on accounting_periods.status. */
export const ACCOUNTING_PERIOD_STATUSES = ["open", "closing", "closed"] as const;
export type AccountingPeriodStatus = (typeof ACCOUNTING_PERIOD_STATUSES)[number];

export const ACCOUNTING_PERIOD_STATUS_LABEL: Record<AccountingPeriodStatus, string> = {
  open:    "เปิด",
  closing: "กำลังปิด",
  closed:  "ปิดแล้ว",
};

/**
 * yyyymm pattern — 6 digits, first 4 = year (2020+ defensively), last 2 in [01..12].
 * Mirrors the DB CHECK regex `^[0-9]{4}(0[1-9]|1[0-2])$`.
 */
const yyyymmRegex = /^[0-9]{4}(0[1-9]|1[0-2])$/;

export const yyyymmSchema = z
  .string()
  .trim()
  .regex(yyyymmRegex, "period_yyyymm ต้องเป็น YYYYMM (เช่น 202605)")
  .refine((s) => {
    const year = Number.parseInt(s.slice(0, 4), 10);
    return year >= 2020 && year <= 2099;
  }, "ปีต้องอยู่ระหว่าง 2020 ถึง 2099");

/** Helper — derive "this month" in BKK timezone as a yyyymm string. */
export function currentYyyymm(now: Date = new Date()): string {
  // Use Intl.DateTimeFormat to convert to BKK time then extract yyyymm.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  });
  // en-CA gives "2026-05" style. Strip the dash.
  return fmt.format(now).replace("-", "");
}

/**
 * Last N months as yyyymm strings, most-recent-first.
 * Used by the list page to render the "last 24 months" rollup.
 */
export function lastNYyyymm(n: number, ref: Date = new Date()): string[] {
  const out: string[] = [];
  // Walk backward N months from ref, computing each in BKK calendar.
  for (let i = 0; i < n; i++) {
    const d = new Date(ref);
    d.setUTCMonth(d.getUTCMonth() - i);
    out.push(currentYyyymm(d));
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Open period (seed a new yyyymm row in 'open' state)
// ────────────────────────────────────────────────────────────

export const openPeriodSchema = z.object({
  period_yyyymm: yyyymmSchema,
});
export type OpenPeriodInput = z.infer<typeof openPeriodSchema>;

// ────────────────────────────────────────────────────────────
// Mark period as closing (open → closing — soft warning state)
// ────────────────────────────────────────────────────────────

export const markPeriodClosingSchema = z.object({
  period_yyyymm: yyyymmSchema,
});
export type MarkPeriodClosingInput = z.infer<typeof markPeriodClosingSchema>;

// ────────────────────────────────────────────────────────────
// Close period (closing → closed — snapshot fan-out)
// ────────────────────────────────────────────────────────────

export const closePeriodSchema = z.object({
  period_yyyymm: yyyymmSchema,
  /**
   * Free-form notes (e.g. "ภพ.30 reconciled · 2 manual adjustments").
   * Optional but encouraged — admins often record what tied out at close.
   */
  closing_notes: z
    .string()
    .trim()
    .max(2000, "หมายเหตุยาวเกินไป (≤2000 ตัวอักษร)")
    .optional(),
});
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;

// ────────────────────────────────────────────────────────────
// Reopen period (closed → open — SUPER ONLY emergency rollback)
// ────────────────────────────────────────────────────────────

export const reopenPeriodSchema = z.object({
  period_yyyymm: yyyymmSchema,
  /**
   * Why are you reopening a closed period? Required ≥10 chars (DB CHECK
   * mirrors this). This is "rare + serious" per the spec — high friction
   * intentional.
   */
  reopened_reason: z
    .string()
    .trim()
    .min(10, "ระบุเหตุผลอย่างน้อย 10 ตัวอักษร")
    .max(500, "เหตุผลยาวเกินไป (≤500 ตัวอักษร)"),
});
export type ReopenPeriodInput = z.infer<typeof reopenPeriodSchema>;

/**
 * Zod schemas for admin broadcasts.
 *
 * ── 2026-06-01 — REPOINTED to legacy `tb_notify` (re-sweep M-1 · FG-1) ───────
 * The customer login-popup announcement is the legacy `pcs-admin/popup.php`
 * flow: an admin creates ONE `tb_notify` row, and EVERY active customer sees
 * it at login (filtered by the `datestart..dateexp` window) until each marks it
 * read in `tb_notify_read`. There is no draft/schedule/send lifecycle and no
 * audience targeting in legacy — the date window IS the schedule, and the
 * audience is always "all customers".
 *
 * `tb_notify` columns (migration 0081, all lowercase):
 *   id bigint · title varchar(400) · content varchar(100) · datestart timestamp
 *   · dateexp timestamp · url varchar(400) NOT NULL · adminid varchar(10) NOT NULL
 * `tb_notify_read` columns: id bigint · userid varchar(10) · popid bigint
 *   (popid = the tb_notify.id the customer acknowledged).
 *
 * The faithful create/delete schemas are `createNotifySchema` + `deleteNotifySchema`.
 *
 * ── DEAD TWIN (removable — kept this pass, do NOT extend) ─────────────────────
 * The old rebuilt fan-out model (one `notifications` row per `profiles` target,
 * with draft→scheduled→sending→sent + audience filters) lives in the `broadcasts`
 * + `notifications` tables. Its schemas below (`scheduleBroadcastSchema`,
 * `sendBroadcastNowSchema`, `cancelBroadcastSchema`) + the cron at
 * `/api/cron/send-scheduled-broadcasts` are now orphaned — the create flow no
 * longer produces `broadcasts` rows for them to act on. Safe to delete once the
 * rebuilt `notifications`/`notification_reads`/`broadcasts` stack is retired.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// FAITHFUL — tb_notify (popup.php) create + delete
// ────────────────────────────────────────────────────────────

/**
 * Create a `tb_notify` row (one popup, shown to all active customers within
 * the display window). Mirrors `popup.php`'s save_notify handler.
 *
 * `content` is varchar(100) in legacy and held an uploaded image filename
 * (`images/notify/<content>`). We keep the column semantics: it is the popup's
 * visual — either a short text line OR an image URL (the popup renders an
 * <img> when it looks like an image URL, otherwise renders the text). Capped at
 * 100 to match the column so there is no silent truncation.
 */
export const createNotifySchema = z.object({
  title:     z.string().trim().min(1, "ระบุชื่อเรื่องประกาศ").max(400),
  content:   z.string().trim().max(100, "ข้อความ/ลิงก์รูป ยาวได้ไม่เกิน 100 ตัวอักษร").optional(),
  url:       z.string().trim().max(400).optional(),
  /** Display window start (ISO). Defaults to now in the action when omitted. */
  datestart: z.string().datetime("วันเริ่มต้นต้องเป็น ISO timestamp").optional(),
  /** Display window end (ISO). Defaults to +1 year in the action when omitted. */
  dateexp:   z.string().datetime("วันหมดอายุต้องเป็น ISO timestamp").optional(),
});
export type CreateNotifyInput = z.infer<typeof createNotifySchema>;

/** Delete a `tb_notify` row (+ its `tb_notify_read` receipts). Mirrors `popup/delete.php`. */
export const deleteNotifySchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type DeleteNotifyInput = z.infer<typeof deleteNotifySchema>;

export const BROADCAST_AUDIENCES = [
  "all",
  "juristic_only",
  "personal_only",
  "specific_ids",
] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export const BROADCAST_AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all:            "ลูกค้าทั้งหมด",
  juristic_only:  "เฉพาะนิติบุคคล",
  personal_only:  "เฉพาะบุคคลธรรมดา",
  specific_ids:   "เลือกลูกค้าเฉพาะ (profile UUIDs)",
};

export const BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const BROADCAST_STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft:     "ร่าง",
  scheduled: "กำหนดเวลา",
  sending:   "กำลังส่ง",
  sent:      "ส่งแล้ว",
  cancelled: "ยกเลิก",
};

// ────────────────────────────────────────────────────────────
// Create broadcast (draft)
// ────────────────────────────────────────────────────────────

export const createBroadcastSchema = z.object({
  title:        z.string().trim().min(1, "ระบุหัวข้อ").max(200),
  body:         z.string().trim().min(1, "ระบุเนื้อหา").max(2000),
  link_href:    z.string().trim().max(500).optional(),
  audience:     z.enum(BROADCAST_AUDIENCES),
  /** Required when audience='specific_ids'. */
  audience_ids: z.array(z.string().uuid()).optional(),
}).refine(
  (d) => d.audience !== "specific_ids" || (d.audience_ids && d.audience_ids.length > 0),
  { message: "ระบุ specific_ids ต้องมี audience_ids อย่างน้อย 1", path: ["audience_ids"] },
);
export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;

// ────────────────────────────────────────────────────────────
// Schedule broadcast (draft → scheduled)
// ────────────────────────────────────────────────────────────

export const scheduleBroadcastSchema = z.object({
  id:            z.string().uuid(),
  scheduled_for: z.string().datetime("scheduled_for ต้องเป็น ISO timestamp"),
});
export type ScheduleBroadcastInput = z.infer<typeof scheduleBroadcastSchema>;

// ────────────────────────────────────────────────────────────
// Send-now (draft → sending → sent)
// ────────────────────────────────────────────────────────────

export const sendBroadcastNowSchema = z.object({
  id: z.string().uuid(),
});
export type SendBroadcastNowInput = z.infer<typeof sendBroadcastNowSchema>;

// ────────────────────────────────────────────────────────────
// Cancel (draft|scheduled → cancelled)
// ────────────────────────────────────────────────────────────

export const cancelBroadcastSchema = z.object({
  id:               z.string().uuid(),
  cancelled_reason: z.string().trim().min(3, "ระบุเหตุผล ≥3 ตัวอักษร").max(500),
});
export type CancelBroadcastInput = z.infer<typeof cancelBroadcastSchema>;

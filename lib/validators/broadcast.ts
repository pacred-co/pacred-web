/**
 * Zod schemas for V-G3 admin broadcasts.
 *
 * Per port-spec [docs/port-specs/admin-polish-bundle.md] §V-G3.
 *
 * V1 audience modes: all | juristic_only | personal_only | specific_ids
 * V1 deferred: specific_segment (JSONB filter, V-G3.2)
 *
 * V1 scheduling: admin can save as draft OR "send now" (cron picks up
 * scheduled rows in V-G3.1).
 */

import { z } from "zod";

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

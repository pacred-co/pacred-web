/**
 * Zod schemas + shared constants for the cross-department work-board
 * (0080 work_items spine).
 *
 * Per docs/research/operating-system-analysis-2026-05-18.md §1.4 — the
 * Tier-2 centrepiece. work_items is a thin ADDITIVE overlay: each row
 * points (entity_type, entity_ref) at a domain row and carries the
 * assignment + lifecycle state the domain row lacks.
 *
 * These constants are the single source of truth shared by the migration
 * (0080), the Server Actions (actions/admin/work-items.ts) and the board
 * UI (/admin/board). The string literals MUST match the migration's CHECK
 * constraints exactly.
 */

import { z } from "zod";

// ── Entity types — the domain tables work_items can index ───────────
// entity_ref is the natural key of that table, as text.
//
// Wave 3 cleanup (2026-05-20 ค่ำ): `cargo_container` / `cargo_shipment`
// are kept in the enum for legacy work_item rows but the spine tables
// were retired — new work_items should not target these types. The
// faithful port routes container work to `forwarder` (per tb_forwarder).
export const WORK_ENTITY_TYPES = [
  "forwarder",            // entity_ref = forwarders.f_no
  "service_order",        // entity_ref = service_orders.h_no
  "cargo_container",      // RETIRED (legacy spine) — kept for old rows only
  "cargo_shipment",       // RETIRED (legacy spine) — kept for old rows only
  "freight_shipment",     // entity_ref = freight_shipments.id (uuid::text)
  "customs_declaration",  // entity_ref = customs_declarations.id (uuid::text)
  "freight_invoice",      // entity_ref = freight_invoices.id (uuid::text)
  "contact_message",      // entity_ref = contact_messages.id (uuid::text)
  "refund_request",       // entity_ref = refund_requests.id (uuid::text)
  "qa_inspection",        // entity_ref = freight_qa_inspections.id (uuid::text)
] as const;
export type WorkEntityType = (typeof WORK_ENTITY_TYPES)[number];

export const WORK_ENTITY_LABEL: Record<WorkEntityType, string> = {
  forwarder:           "ฝากนำเข้า",
  service_order:       "ฝากสั่ง",
  cargo_container:     "ตู้คอนเทนเนอร์",
  cargo_shipment:      "Shipment",
  freight_shipment:    "Freight",
  customs_declaration: "ใบขนสินค้า",
  freight_invoice:     "Invoice freight",
  contact_message:     "ข้อความติดต่อ",
  refund_request:      "คำขอคืนเงิน",
  qa_inspection:       "ตรวจ QA",
};

/** Domain detail-page URL for an entity (board card → domain row). */
export function workEntityHref(type: WorkEntityType, ref: string): string {
  switch (type) {
    case "forwarder":           return `/admin/forwarders/${ref}`;
    case "service_order":       return `/admin/service-orders`;
    // Wave 3: spine retired — both retired types now route to the
    // faithful report-cnt page so legacy work_item cards still resolve
    // to a useful destination.
    case "cargo_container":     return `/admin/report-cnt`;
    case "cargo_shipment":      return `/admin/report-cnt`;
    case "freight_shipment":    return `/admin/freight/shipments/${ref}`;
    case "customs_declaration": return `/admin/freight/declarations/${ref}`;
    case "freight_invoice":     return `/admin/freight/shipments`;
    case "contact_message":     return `/admin/contact-messages`;
    case "refund_request":      return `/admin/refunds`;
    case "qa_inspection":       return `/admin/warehouse/qa-inspections`;
  }
}

// ── Work types — the work category, drives icon + default routing ───
export const WORK_TYPES = [
  "intake_review",
  "payment_followup",
  "warehouse_action",
  "doc_issue",
  "customs_clearance",
  "delivery_dispatch",
  "cs_followup",
  "refund_process",
  "qa_check",
  "general",
] as const;
export type WorkType = (typeof WORK_TYPES)[number];

export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  intake_review:     "รับงานใหม่",
  payment_followup:  "ตามชำระเงิน",
  warehouse_action:  "งานโกดัง",
  doc_issue:         "ออกเอกสาร",
  customs_clearance: "เคลียร์ศุลกากร",
  delivery_dispatch: "จัดส่ง / มอบหมายคนขับ",
  cs_followup:       "ดูแลลูกค้า",
  refund_process:    "ดำเนินการคืนเงิน",
  qa_check:          "ตรวจ QA/QC",
  general:           "งานทั่วไป",
};

// ── Status — the work_item lifecycle ────────────────────────────────
// open → in_progress → done (terminal) | → cancelled (terminal)
// blocked = non-terminal hold (waiting on another dept / the customer).
export const WORK_STATUSES = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  open:        "รอเริ่ม",
  in_progress: "กำลังทำ",
  blocked:     "ติดขัด",
  done:        "เสร็จแล้ว",
  cancelled:   "ยกเลิก",
};

/**
 * Legal status transitions. The advance action validates the requested
 * (from → to) hop against this map; the DB write also carries an
 * optimistic `.eq("status", expectedFrom)` race-guard.
 */
export const WORK_STATUS_TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  open:        ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "done", "cancelled"],
  blocked:     ["open", "in_progress", "cancelled"],
  done:        [],                                  // terminal
  cancelled:   [],                                  // terminal
};

// ── Priority ────────────────────────────────────────────────────────
export const WORK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];

export const WORK_PRIORITY_LABEL: Record<WorkPriority, string> = {
  low:    "ต่ำ",
  normal: "ปกติ",
  high:   "สูง",
  urgent: "ด่วน",
};

/** Sort weight — higher = nearer the top of a board column. */
export const WORK_PRIORITY_WEIGHT: Record<WorkPriority, number> = {
  urgent: 3,
  high:   2,
  normal: 1,
  low:    0,
};

// ── Assignable roles — must stay within admins.role (0033 + 0054) ───
export const WORK_ASSIGNABLE_ROLES = [
  "super",
  "ops",
  "accounting",
  "sales_admin",
  "warehouse",
  "driver",
  "interpreter",
] as const;
export type WorkAssignableRole = (typeof WORK_ASSIGNABLE_ROLES)[number];

export const WORK_ROLE_LABEL: Record<WorkAssignableRole, string> = {
  super:       "ผู้ดูแลระบบ",
  ops:         "ปฏิบัติการ",
  accounting:  "บัญชี",
  sales_admin: "เซลส์",
  warehouse:   "โกดัง",
  driver:      "คนขับ",
  interpreter: "ล่าม",
};

// ── Schemas ─────────────────────────────────────────────────────────

/** Create a new work_item (manual entry from the board). */
export const createWorkItemSchema = z.object({
  entity_type:   z.enum(WORK_ENTITY_TYPES),
  entity_ref:    z.string().trim().min(1, "ต้องระบุงานต้นทาง").max(128),
  type:          z.enum(WORK_TYPES),
  title:         z.string().trim().min(1, "ต้องมีหัวข้องาน").max(200),
  note:          z.string().trim().max(2000).optional().or(z.literal("")),
  assigned_role: z.enum(WORK_ASSIGNABLE_ROLES),
  assigned_to:   z.string().uuid().optional().or(z.literal("")),
  priority:      z.enum(WORK_PRIORITIES).default("normal"),
  // Datetime-local string from the form, or empty.
  due_at:        z.string().optional().or(z.literal("")),
});
export type CreateWorkItemInput = z.infer<typeof createWorkItemSchema>;

/** (Re)assign a work_item to a role and optionally a person. */
export const assignWorkItemSchema = z.object({
  id:            z.string().uuid(),
  assigned_role: z.enum(WORK_ASSIGNABLE_ROLES),
  assigned_to:   z.string().uuid().optional().or(z.literal("")),
});
export type AssignWorkItemInput = z.infer<typeof assignWorkItemSchema>;

/** Advance a work_item's status (the from→to hop is validated server-side). */
export const advanceWorkItemSchema = z.object({
  id:   z.string().uuid(),
  from: z.enum(WORK_STATUSES),
  to:   z.enum(WORK_STATUSES),
});
export type AdvanceWorkItemInput = z.infer<typeof advanceWorkItemSchema>;

/** Update the priority of a work_item. */
export const setWorkItemPrioritySchema = z.object({
  id:       z.string().uuid(),
  priority: z.enum(WORK_PRIORITIES),
});
export type SetWorkItemPriorityInput = z.infer<typeof setWorkItemPrioritySchema>;

/** True when a work_item is past its SLA and still active. */
export function isWorkItemOverdue(
  dueAt: string | null,
  status: WorkStatus,
  now: Date = new Date(),
): boolean {
  if (!dueAt) return false;
  if (status === "done" || status === "cancelled") return false;
  return new Date(dueAt).getTime() < now.getTime();
}

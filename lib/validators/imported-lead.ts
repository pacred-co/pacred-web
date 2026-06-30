import { z } from "zod";

/**
 * Zod schemas for the imported-leads CRM workspace (ปอน 2026-06-22).
 * Lives outside the "use server" action file (which may only export async fns).
 */

export const IMPORTED_LEAD_SOURCES = ["Axelra", "TT", "Pcs", "Pacred"] as const;
export const IMPORTED_LEAD_SERVICES = ["FCL", "CARGO", "เคลียร์ศุลกากร", "ฝากสั่ง", "ฝากโอนชำระ"] as const;
// Mirrors LEAD_CALL_STATUSES (actions/admin/leads-types.ts). ปอน 2026-06-22:
// added 'callback' = "รอติดต่อกลับ". 2026-06-23: 'other_rep' = "ลูกค้าเซลล์อื่น"
// (set via the handoff action — picks a rep + routes the lead to them, NOT a
// plain status flip; lives in the enum so it persists + renders a badge).
export const IMPORTED_LEAD_CALL_STATUSES = ["called", "no_answer", "callback", "closed", "not_interested", "other_rep"] as const;

export type ImportedLeadSource = (typeof IMPORTED_LEAD_SOURCES)[number];
export type ImportedLeadService = (typeof IMPORTED_LEAD_SERVICES)[number];
export type ImportedLeadCallStatus = (typeof IMPORTED_LEAD_CALL_STATUSES)[number];

const importedLeadRowSchema = z.object({
  name: z.string().trim().max(300).default(""),
  address: z.string().trim().max(1000).default(""),
  phone: z.string().trim().max(50).default(""),
  line_facebook: z.string().trim().max(300).default(""),
  email: z.string().trim().max(300).default(""),
  service: z.string().trim().max(100).default(""),
});

export const saveImportedLeadsSchema = z.object({
  source: z.enum(IMPORTED_LEAD_SOURCES),
  rows: z.array(importedLeadRowSchema).min(1).max(5000),
});

export const assignImportedLeadsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(5000),
  legacyId: z.string().trim().max(50), // rep adminID; '' clears assignment
});

// Random even distribution (ปอน 2026-06-23 "เลือกทั้งหมด → สุ่มคละ แบ่งเท่าๆกันให้
// เซลล์ที่เลือก"): shuffle the ids + round-robin split across ≥2 reps.
export const distributeImportedLeadsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(5000),
  legacyIds: z.array(z.string().trim().min(1).max(50)).min(2).max(50),
});

export const logImportedLeadCallSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(IMPORTED_LEAD_CALL_STATUSES).optional(),
  note: z.string().trim().max(1000).default(""),
});

export const setImportedLeadStatusSchema = z.object({
  id: z.number().int().positive(),
  status: z.union([z.enum(IMPORTED_LEAD_CALL_STATUSES), z.literal("")]),
});

export const setImportedLeadServiceSchema = z.object({
  id: z.number().int().positive(),
  service: z.union([z.enum(IMPORTED_LEAD_SERVICES), z.literal("")]),
});

// Standing per-lead note ("ช่องหมายเหตุ") — editable by the assigned rep + seniors
// in the normal work view (ปอน 2026-06-22). Distinct from a per-call note.
export const setImportedLeadNoteSchema = z.object({
  id: z.number().int().positive(),
  note: z.string().trim().max(2000).default(""),
});

// LINE/Facebook contact — editable inline by the assigned rep + seniors (ปอน
// 2026-06-23 "ให้ user แก้ contact line/facebook ได้"). Same scoping as note.
export const setImportedLeadLineFacebookSchema = z.object({
  id: z.number().int().positive(),
  lineFacebook: z.string().trim().max(300).default(""),
});

// Email — editable inline (ปอน 2026-06-23 "email ก็ทำให้ user แก้ได้ด้วย"). Freeform
// (lead data is messy · not format-enforced). Same scoping as note/line.
export const setImportedLeadEmailSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().trim().max(300).default(""),
});

// "รหัส PR" — member code recorded on a closed deal (ปอน 2026-06-23 · "ปิดการขายได้"
// tab). Editable free-text · same scoping as note/email · migration 0203.
export const setImportedLeadPrCodeSchema = z.object({
  id: z.number().int().positive(),
  prCode: z.string().trim().max(50).default(""),
});

// Phone — editable so reps can fix messy / typo'd numbers (ปอน 2026-06-23: "ปุ่มโทร
// ต้องโทรได้จริง อิงเบอร์จากช่องคอลัมน์"). The tel: link + display use the digits of
// this field, so correcting it here makes the call dial the right number.
export const setImportedLeadPhoneSchema = z.object({
  id: z.number().int().positive(),
  phone: z.string().trim().max(50).default(""),
});

// "ประวัติการมอบหมายโทรเซลล์" report (ปอน 2026-06-23) — per-rep call/close summary
// over a date range (default วันนี้-วันนี้), filterable by rep + status.
export const importedLeadReportSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rep: z.string().trim().max(50).default(""), // '' = all reps
  status: z.union([z.enum(IMPORTED_LEAD_CALL_STATUSES), z.literal("")]).default(""), // '' = all statuses
});

// Drill-down behind a report row (owner 2026-06-23 "กดแล้วกางดูว่าลูกค้าเป็นใคร"):
// the actual customers a rep contacted in the range. Here `rep` is the EXACT
// assigned_admin_id ('' = ยังไม่มอบหมาย) — NOT the report filter's '' = all.
export const importedLeadReportDetailSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rep: z.string().trim().max(50),
  status: z.union([z.enum(IMPORTED_LEAD_CALL_STATUSES), z.literal("")]).default(""),
});

// "ลูกค้าเซลล์อื่น" handoff (ปอน 2026-06-23) — a rep, mid-call, finds the customer
// actually belongs to another rep → routes the lead to them; it then appears in
// THAT rep's "ลูกค้าของฉัน". legacyId is required (must pick a rep).
export const handoffImportedLeadSchema = z.object({
  id: z.number().int().positive(),
  legacyId: z.string().trim().min(1).max(50),
});

// "งานที่มอบหมาย" assignment-summary drill-down (owner 2026-06-30 "เอาประวัติสรุปที่
// ได้รับมอบหมายมาขึ้นด้วยสำหรับเซลล์ที่แบ่งงานไปให้") — the leads CURRENTLY assigned
// to a rep (standing workload · NOT date-ranged, unlike the call report). `rep` =
// EXACT assigned_admin_id ('' = ยังไม่มอบหมาย) · `bucket` filters by progress/outcome.
export const importedLeadAssignmentDetailSchema = z.object({
  rep: z.string().trim().max(50),
  bucket: z
    .enum(["all", "untouched", "called", "callback", "closed", "no_answer", "not_interested", "other_rep"])
    .default("all"),
  // mine=true forces self-scope (a เซลล์ viewing their OWN assigned summary) — the
  // server ignores `rep` and uses the caller's id. Non-senior callers are always
  // self-scoped regardless of this flag.
  mine: z.boolean().optional(),
});

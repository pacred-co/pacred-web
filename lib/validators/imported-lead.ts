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

// "ลูกค้าเซลล์อื่น" handoff (ปอน 2026-06-23) — a rep, mid-call, finds the customer
// actually belongs to another rep → routes the lead to them; it then appears in
// THAT rep's "ลูกค้าของฉัน". legacyId is required (must pick a rep).
export const handoffImportedLeadSchema = z.object({
  id: z.number().int().positive(),
  legacyId: z.string().trim().min(1).max(50),
});

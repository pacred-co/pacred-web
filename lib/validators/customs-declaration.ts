/**
 * V-E11 — Zod schemas for customs_declarations + customs_declaration_lines.
 *
 * Per [docs/port-specs/freight-customs-declaration.md] and migration
 * `0057_customs_declarations.sql`.
 *
 * Status workflow: draft → submitted → accepted → released, with cancel
 * possible at any non-released stage.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────
// Enums (mirror DB CHECK)
// ────────────────────────────────────────────────────────────

export const CUSTOMS_DECLARATION_STATUSES = [
  "draft", "submitted", "accepted", "released", "cancelled",
] as const;
export type CustomsDeclarationStatus = (typeof CUSTOMS_DECLARATION_STATUSES)[number];

export const CUSTOMS_DECLARATION_STATUS_LABEL: Record<CustomsDeclarationStatus, string> = {
  draft:     "ร่าง",
  submitted: "ยื่นแล้ว",
  accepted:  "ศุลฯ ตรวจรับ",
  released:  "ตรวจปล่อย",
  cancelled: "ยกเลิก",
};

export const CUSTOMS_DECLARATION_TYPES = ["import", "export", "transit"] as const;
export type CustomsDeclarationType = (typeof CUSTOMS_DECLARATION_TYPES)[number];

export const CUSTOMS_DECLARATION_TYPE_LABEL: Record<CustomsDeclarationType, string> = {
  import:  "นำเข้า (Import)",
  export:  "ส่งออก (Export)",
  transit: "ผ่านแดน (Transit)",
};

// Curated list (free-text in DB; this is the dropdown options).
export const CUSTOMS_OFFICES = [
  "BANGKOK_PORT_CUSTOMS_HOUSE",
  "LAEM_CHABANG_CUSTOMS_HOUSE",
  "SUVARNABHUMI_AIRPORT_CUSTOMS",
  "DON_MUEANG_AIRPORT_CUSTOMS",
  "MUKDAHAN_CUSTOMS_BORDER",
  "NONG_KHAI_CUSTOMS_BORDER",
  "MAE_SAI_CUSTOMS_BORDER",
  "PADANG_BESAR_CUSTOMS_BORDER",
  "SADAO_CUSTOMS_BORDER",
  "OTHER",
] as const;
export type CustomsOffice = (typeof CUSTOMS_OFFICES)[number];

export const CUSTOMS_OFFICE_LABEL: Record<CustomsOffice, string> = {
  BANGKOK_PORT_CUSTOMS_HOUSE:     "ด่านศุลกากรท่าเรือกรุงเทพ",
  LAEM_CHABANG_CUSTOMS_HOUSE:     "ด่านศุลกากรท่าเรือแหลมฉบัง",
  SUVARNABHUMI_AIRPORT_CUSTOMS:   "ด่านศุลกากรท่าอากาศยานสุวรรณภูมิ",
  DON_MUEANG_AIRPORT_CUSTOMS:     "ด่านศุลกากรท่าอากาศยานดอนเมือง",
  MUKDAHAN_CUSTOMS_BORDER:        "ด่านศุลกากรมุกดาหาร",
  NONG_KHAI_CUSTOMS_BORDER:       "ด่านศุลกากรหนองคาย",
  MAE_SAI_CUSTOMS_BORDER:         "ด่านศุลกากรแม่สาย",
  PADANG_BESAR_CUSTOMS_BORDER:    "ด่านศุลกากรปาดังเบซาร์",
  SADAO_CUSTOMS_BORDER:           "ด่านศุลกากรสะเดา",
  OTHER:                          "อื่นๆ",
};

export const CUSTOMS_LINE_UNITS = [
  "PCS", "LO", "MTK", "KGM", "CTN", "PAL", "SET", "KG", "LTR", "MTR",
] as const;
export type CustomsLineUnit = (typeof CUSTOMS_LINE_UNITS)[number];

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function roundThb(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute line-level duty + vat given declared_value + duty_rate.
 *
 * Thai customs convention (matches lib/validators/freight-shipment.ts):
 *   duty = declared_value × duty_rate%
 *   vat  = (declared_value + duty) × 7%
 */
export function computeLineTaxes(args: {
  declared_value_thb: number;
  duty_rate_pct: number;
}): { duty_thb: number; vat_thb: number } {
  const declared = Math.max(0, Number(args.declared_value_thb) || 0);
  const rate     = Math.max(0, Math.min(100, Number(args.duty_rate_pct) || 0));
  const duty_thb = roundThb(declared * (rate / 100));
  const vat_thb  = roundThb((declared + duty_thb) * 0.07);
  return { duty_thb, vat_thb };
}

// ────────────────────────────────────────────────────────────
// Declaration CRUD
// ────────────────────────────────────────────────────────────

export const createDeclarationSchema = z.object({
  freight_shipment_id: z.string().uuid(),
  declaration_type:    z.enum(CUSTOMS_DECLARATION_TYPES),
});
export type CreateDeclarationInput = z.infer<typeof createDeclarationSchema>;

export const updateDeclarationHeaderSchema = z.object({
  id:                          z.string().uuid(),
  declaration_type:            z.enum(CUSTOMS_DECLARATION_TYPES).optional(),
  customs_office:              z.string().trim().max(100).optional().nullable(),
  broker_name:                 z.string().trim().max(300).optional().nullable(),
  broker_license_no:           z.string().trim().max(50).optional().nullable(),
  ship_or_truck_arrival_date:  z.string().regex(ISO_DATE_RE).optional().nullable(),
  port_of_entry:               z.string().trim().max(200).optional().nullable(),
  paid_through_promptpay:      z.boolean().optional(),
  total_other_taxes_thb:       z.number().min(0).max(999_999_999.99).optional().nullable(),
  notes:                       z.string().trim().max(2000).optional().nullable(),
});
export type UpdateDeclarationHeaderInput = z.infer<typeof updateDeclarationHeaderSchema>;

export const declarationIdOnlySchema = z.object({ id: z.string().uuid() });
export type DeclarationIdOnlyInput = z.infer<typeof declarationIdOnlySchema>;

// ────────────────────────────────────────────────────────────
// Line CRUD
// ────────────────────────────────────────────────────────────

export const addDeclarationLineSchema = z.object({
  declaration_id:     z.string().uuid(),
  position:           z.number().int().min(1).max(999).optional(),
  hs_code:            z.string().trim().max(20).optional().nullable(),
  description:        z.string().trim().min(1).max(500),
  country_of_origin:  z.string().trim().regex(/^[A-Z]{2}$/, { message: "country_of_origin ต้องเป็น ISO 2-letter (CN, TH, ...)" }).optional(),
  qty:                z.number().min(0).max(9_999_999),
  unit:               z.enum(CUSTOMS_LINE_UNITS).default("PCS"),
  gross_weight_kg:    z.number().min(0).max(9_999_999.999).optional().nullable(),
  net_weight_kg:      z.number().min(0).max(9_999_999.999).optional().nullable(),
  declared_value_thb: z.number().min(0).max(999_999_999.99).default(0),
  duty_rate_pct:      z.number().min(0).max(100).default(0),
  fta_applied:        z.boolean().optional(),
  notes:              z.string().trim().max(1000).optional().nullable(),
});
export type AddDeclarationLineInput = z.infer<typeof addDeclarationLineSchema>;

export const updateDeclarationLineSchema = z.object({
  id:                 z.string().uuid(),
  hs_code:            z.string().trim().max(20).optional().nullable(),
  description:        z.string().trim().min(1).max(500).optional(),
  country_of_origin:  z.string().trim().regex(/^[A-Z]{2}$/).optional(),
  qty:                z.number().min(0).max(9_999_999).optional(),
  unit:               z.enum(CUSTOMS_LINE_UNITS).optional(),
  gross_weight_kg:    z.number().min(0).max(9_999_999.999).optional().nullable(),
  net_weight_kg:      z.number().min(0).max(9_999_999.999).optional().nullable(),
  declared_value_thb: z.number().min(0).max(999_999_999.99).optional(),
  duty_rate_pct:      z.number().min(0).max(100).optional(),
  fta_applied:        z.boolean().optional(),
  notes:              z.string().trim().max(1000).optional().nullable(),
});
export type UpdateDeclarationLineInput = z.infer<typeof updateDeclarationLineSchema>;

export const deleteDeclarationLineSchema = z.object({ id: z.string().uuid() });
export type DeleteDeclarationLineInput = z.infer<typeof deleteDeclarationLineSchema>;

// ────────────────────────────────────────────────────────────
// Status flip schemas
// ────────────────────────────────────────────────────────────

/** submit: draft → submitted. customs_office is required at submission. */
export const submitDeclarationSchema = z.object({
  id:             z.string().uuid(),
  customs_office: z.string().trim().min(1).max(100),
  broker_name:    z.string().trim().max(300).optional().nullable(),
});
export type SubmitDeclarationInput = z.infer<typeof submitDeclarationSchema>;

/** mark accepted: submitted → accepted. control_no optional (broker provides). */
export const markDeclarationAcceptedSchema = z.object({
  id:                  z.string().uuid(),
  customs_control_no:  z.string().trim().max(100).optional().nullable(),
});
export type MarkDeclarationAcceptedInput = z.infer<typeof markDeclarationAcceptedSchema>;

/** mark released: accepted → released. */
export const markDeclarationReleasedSchema = z.object({
  id: z.string().uuid(),
});
export type MarkDeclarationReleasedInput = z.infer<typeof markDeclarationReleasedSchema>;

/** cancel: any non-released → cancelled. reason required. */
export const cancelDeclarationSchema = z.object({
  id:               z.string().uuid(),
  cancelled_reason: z.string().trim().min(3).max(500),
});
export type CancelDeclarationInput = z.infer<typeof cancelDeclarationSchema>;

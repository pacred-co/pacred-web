/**
 * Zod schemas for V-E1 freight shipments + invoices.
 *
 * Per [docs/port-specs/freight-document-suite.md] + ADR-0016.
 *
 * V-E5 hardening (2026-05-25): explicit int32-overflow rejection layered
 * on top of the existing range bounds — `-2_146_826_xxx` legacy garbage
 * is now rejected with "int32_overflow_suspected" instead of falling
 * through to the generic "out of range".
 */

import { z } from "zod";
import { isInt32OverflowSuspect } from "./safe-numeric";

/**
 * Layer the int32-overflow guard on top of an existing range. Used inline
 * so the existing min/max bounds stay readable in their declarations.
 */
function notInt32(n: number): boolean {
  return !isInt32OverflowSuspect(n);
}
const INT32_MSG = { message: "int32_overflow_suspected — กรุณาตรวจค่าตัวเลขที่กรอก" };

// ────────────────────────────────────────────────────────────
// Enums (mirror DB CHECK)
// ────────────────────────────────────────────────────────────

export const FREIGHT_SHIPMENT_STATUSES = [
  "draft", "confirmed", "in_progress", "cleared", "delivered", "cancelled",
] as const;
export type FreightShipmentStatus = (typeof FREIGHT_SHIPMENT_STATUSES)[number];

export const FREIGHT_SHIPMENT_STATUS_LABEL: Record<FreightShipmentStatus, string> = {
  draft:       "ร่าง",
  confirmed:   "ยืนยันแล้ว",
  in_progress: "กำลังขนส่ง",
  cleared:     "ผ่านศุลกากร",
  delivered:   "ส่งมอบแล้ว",
  cancelled:   "ยกเลิก",
};

export const FREIGHT_TRANSPORT_MODES = ["sea_fcl", "sea_lcl", "truck", "air"] as const;
export type FreightTransportMode = (typeof FREIGHT_TRANSPORT_MODES)[number];
export const FREIGHT_TRANSPORT_MODE_LABEL: Record<FreightTransportMode, string> = {
  sea_fcl: "🚢 ทางเรือ (FCL)",
  sea_lcl: "🚢 ทางเรือ (LCL)",
  truck:   "🚚 ทางรถ",
  air:     "✈️ ทางอากาศ",
};

export const INCOTERMS = [
  "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP",
  "FAS", "FOB", "CFR", "CIF",
] as const;
export type Incoterm = (typeof INCOTERMS)[number];

export const FREIGHT_PARTY_ROLES = ["shipper", "consignee"] as const;
export type FreightPartyRole = (typeof FREIGHT_PARTY_ROLES)[number];

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

export function roundThb(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Computes the ADR-0016 derived figures from inputs.
 *   commercial_value_thb = commercial_value_usd × exchange_rate (round 2dp)
 *   vat_thb = round(vat_base_thb × 0.07, 2)
 */
export function computeValueBlock(args: {
  commercial_value_usd?: number | null;
  exchange_rate?:        number | null;
  declared_customs_value_thb?: number | null;
  duty_rate_pct?: number | null;
  vat_base_thb_override?: number | null;
}): {
  commercial_value_thb: number | null;
  duty_thb:             number | null;
  vat_base_thb:         number | null;
  vat_thb:              number | null;
} {
  const usd  = args.commercial_value_usd ?? null;
  const rate = args.exchange_rate        ?? null;
  const declared = args.declared_customs_value_thb ?? null;
  const dutyPct  = args.duty_rate_pct ?? 0;

  const commercial_value_thb = (usd !== null && rate !== null)
    ? roundThb(Number(usd) * Number(rate))
    : null;

  // Duty + VAT base default heuristic: use declared if set, else commercial.
  const dutyBase =
    declared !== null ? Number(declared)
    : commercial_value_thb !== null ? commercial_value_thb
    : null;
  const duty_thb = dutyBase !== null
    ? roundThb(dutyBase * (Number(dutyPct) / 100))
    : null;

  // VAT base = duty_base + duty (CIF + duty per Thai customs convention).
  // Override available if the team picks a different "VAT plan".
  const vat_base_thb = args.vat_base_thb_override ?? (
    dutyBase !== null && duty_thb !== null
      ? roundThb(dutyBase + duty_thb)
      : null
  );
  const vat_thb = vat_base_thb !== null
    ? roundThb(vat_base_thb * 0.07)
    : null;

  return { commercial_value_thb, duty_thb, vat_base_thb, vat_thb };
}

// ────────────────────────────────────────────────────────────
// Shipment CRUD
// ────────────────────────────────────────────────────────────

const TAX_ID_RE = /^\d{13}$/;

const valueBlockSchema = z.object({
  commercial_value_usd:       z.number().refine(notInt32, INT32_MSG).min(0).max(99_999_999.99).optional().nullable(),
  exchange_rate:              z.number().refine(notInt32, INT32_MSG).positive().max(9999).optional().nullable(),
  rate_date:                  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  declared_customs_value_thb: z.number().refine(notInt32, INT32_MSG).min(0).max(999_999_999.99).optional().nullable(),
  declared_value_basis:       z.string().trim().max(1000).optional().nullable(),
  hs_code:                    z.string().trim().min(1).max(20).optional().nullable(),
  duty_rate_pct:              z.number().refine(notInt32, INT32_MSG).min(0).max(100).optional().nullable(),
  vat_base_thb:               z.number().refine(notInt32, INT32_MSG).min(0).max(999_999_999.99).optional().nullable(),
  vat_plan_label:             z.string().trim().max(50).optional().nullable(),
  form_e_applied:             z.boolean().optional(),
});

export const createFreightShipmentSchema = z.object({
  profile_id:           z.string().uuid(),
  transport_mode:       z.enum(FREIGHT_TRANSPORT_MODES),
  container_code:       z.string().trim().max(50).optional(),
  carrier_container_no: z.string().trim().max(50).optional(),
  bl_no:                z.string().trim().max(80).optional(),
  vessel_voyage:        z.string().trim().max(120).optional(),
  port_loading:         z.string().trim().max(100).optional(),
  port_discharge:       z.string().trim().max(100).optional(),
  place_delivery:       z.string().trim().max(100).optional(),
  incoterm:             z.enum(INCOTERMS).optional(),
  payment_term:         z.string().trim().max(50).optional(),
  origin_country:       z.string().trim().max(50).optional().default("CHINA"),
  source_quote_id:      z.string().uuid().optional(),
  notes:                z.string().trim().max(2000).optional(),
}).merge(valueBlockSchema)
  .refine(
    (d) => (d.commercial_value_usd == null) === (d.exchange_rate == null),
    { message: "commercial_value_usd และ exchange_rate ต้องระบุพร้อมกัน หรือว่างพร้อมกัน", path: ["exchange_rate"] },
  )
  .refine(
    (d) => d.declared_customs_value_thb == null || (d.declared_value_basis ?? "").length > 0,
    { message: "ระบุ declared_customs_value_thb แล้ว ต้องระบุ declared_value_basis ด้วย (ADR-0016 audit)", path: ["declared_value_basis"] },
  );
export type CreateFreightShipmentInput = z.infer<typeof createFreightShipmentSchema>;

export const updateFreightShipmentSchema = z.object({
  id:                   z.string().uuid(),
  container_code:       z.string().trim().max(50).optional().nullable(),
  carrier_container_no: z.string().trim().max(50).optional().nullable(),
  bl_no:                z.string().trim().max(80).optional().nullable(),
  vessel_voyage:        z.string().trim().max(120).optional().nullable(),
  port_loading:         z.string().trim().max(100).optional().nullable(),
  port_discharge:       z.string().trim().max(100).optional().nullable(),
  place_delivery:       z.string().trim().max(100).optional().nullable(),
  incoterm:             z.enum(INCOTERMS).optional().nullable(),
  payment_term:         z.string().trim().max(50).optional().nullable(),
  origin_country:       z.string().trim().max(50).optional(),
  notes:                z.string().trim().max(2000).optional().nullable(),

  commercial_value_usd:       z.number().refine(notInt32, INT32_MSG).min(0).max(99_999_999.99).optional().nullable(),
  exchange_rate:              z.number().refine(notInt32, INT32_MSG).positive().max(9999).optional().nullable(),
  rate_date:                  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  declared_customs_value_thb: z.number().refine(notInt32, INT32_MSG).min(0).max(999_999_999.99).optional().nullable(),
  declared_value_basis:       z.string().trim().max(1000).optional().nullable(),
  hs_code:                    z.string().trim().min(1).max(20).optional().nullable(),
  duty_rate_pct:              z.number().refine(notInt32, INT32_MSG).min(0).max(100).optional().nullable(),
  vat_base_thb:               z.number().refine(notInt32, INT32_MSG).min(0).max(999_999_999.99).optional().nullable(),
  vat_plan_label:             z.string().trim().max(50).optional().nullable(),
  form_e_applied:             z.boolean().optional(),
});
export type UpdateFreightShipmentInput = z.infer<typeof updateFreightShipmentSchema>;

export const upsertPartySchema = z.object({
  freight_shipment_id: z.string().uuid(),
  role:                z.enum(FREIGHT_PARTY_ROLES),
  name:                z.string().trim().min(1).max(300),
  address:             z.string().trim().min(1).max(1000),
  tax_id:              z.string().trim().regex(TAX_ID_RE).optional().nullable(),
  branch:              z.string().trim().max(100).optional().nullable(),
});
export type UpsertPartyInput = z.infer<typeof upsertPartySchema>;

// Status flip schemas
export const shipmentIdOnlySchema = z.object({ id: z.string().uuid() });
export type ShipmentIdOnlyInput = z.infer<typeof shipmentIdOnlySchema>;

export const cancelShipmentSchema = z.object({
  id:               z.string().uuid(),
  cancelled_reason: z.string().trim().min(3).max(500),
});
export type CancelShipmentInput = z.infer<typeof cancelShipmentSchema>;

// ────────────────────────────────────────────────────────────
// Invoice CRUD
// ────────────────────────────────────────────────────────────

export const FREIGHT_INVOICE_STATUSES = ["draft", "issued", "cancelled"] as const;
export type FreightInvoiceStatus = (typeof FREIGHT_INVOICE_STATUSES)[number];

export const FREIGHT_INVOICE_STATUS_LABEL: Record<FreightInvoiceStatus, string> = {
  draft:     "ร่าง",
  issued:    "ออกแล้ว",
  cancelled: "ยกเลิก",
};

export const FREIGHT_LINE_UNITS = ["PCS", "LO", "MTK", "KGM", "CTN", "PAL", "SET"] as const;
export type FreightLineUnit = (typeof FREIGHT_LINE_UNITS)[number];

export const createFreightInvoiceSchema = z.object({
  freight_shipment_id: z.string().uuid(),
  notes:               z.string().trim().max(2000).optional(),
});
export type CreateFreightInvoiceInput = z.infer<typeof createFreightInvoiceSchema>;

export const addInvoiceLineSchema = z.object({
  freight_invoice_id: z.string().uuid(),
  position:           z.number().int().min(1).max(999).optional(),
  marks:              z.string().trim().max(200).optional(),
  description:        z.string().trim().min(1).max(500),
  qty:                z.number().refine(notInt32, INT32_MSG).positive().max(9_999_999),
  unit:               z.enum(FREIGHT_LINE_UNITS).default("PCS"),
  unit_price_usd:     z.number().refine(notInt32, INT32_MSG).min(0).max(99_999_999.99),
  cartons:            z.number().refine(notInt32, INT32_MSG).int().min(0).max(999_999).optional(),
  gross_weight_kg:    z.number().refine(notInt32, INT32_MSG).min(0).max(9_999_999.999).optional(),
  hs_code:            z.string().trim().max(20).optional(),
});
export type AddInvoiceLineInput = z.infer<typeof addInvoiceLineSchema>;

export const updateInvoiceLineSchema = z.object({
  id:              z.string().uuid(),
  marks:           z.string().trim().max(200).optional().nullable(),
  description:     z.string().trim().min(1).max(500).optional(),
  qty:             z.number().refine(notInt32, INT32_MSG).positive().max(9_999_999).optional(),
  unit:            z.enum(FREIGHT_LINE_UNITS).optional(),
  unit_price_usd:  z.number().refine(notInt32, INT32_MSG).min(0).max(99_999_999.99).optional(),
  cartons:         z.number().refine(notInt32, INT32_MSG).int().min(0).max(999_999).optional().nullable(),
  gross_weight_kg: z.number().refine(notInt32, INT32_MSG).min(0).max(9_999_999.999).optional().nullable(),
  hs_code:         z.string().trim().max(20).optional().nullable(),
});
export type UpdateInvoiceLineInput = z.infer<typeof updateInvoiceLineSchema>;

export const invoiceIdOnlySchema = z.object({ id: z.string().uuid() });
export type InvoiceIdOnlyInput = z.infer<typeof invoiceIdOnlySchema>;

export const cancelInvoiceSchema = z.object({
  id:                  z.string().uuid(),
  cancellation_reason: z.string().trim().min(3).max(500),
});
export type CancelInvoiceInput = z.infer<typeof cancelInvoiceSchema>;

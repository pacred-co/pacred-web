/**
 * Zod schemas for V-E6 freight quotes.
 *
 * Per port-spec [docs/port-specs/freight-quotation.md].
 */

import { z } from "zod";

export const QUOTE_STATUSES = [
  "draft", "pending_approval", "approved",
  "sent", "accepted", "rejected", "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft:            "ร่าง",
  pending_approval: "รออนุมัติ",
  approved:         "อนุมัติแล้ว",
  sent:             "ส่งให้ลูกค้า",
  accepted:         "ลูกค้ายืนยัน",
  rejected:         "ปฏิเสธ",
  expired:          "หมดอายุ",
};

export const TRANSPORT_MODES = ["sea_fcl", "sea_lcl", "truck", "air"] as const;
export type TransportMode = (typeof TRANSPORT_MODES)[number];
export const TRANSPORT_MODE_LABEL: Record<TransportMode, string> = {
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

export const QUOTE_UNITS = ["CBM", "KGM", "JOB", "PCS", "LO", "CTN", "PAL", "TEU", "FEU"] as const;
export type QuoteUnit = (typeof QUOTE_UNITS)[number];

const TAX_ID_RE = /^\d{13}$/;

// ────────────────────────────────────────────────────────────
// Create draft quote
// ────────────────────────────────────────────────────────────

export const createFreightQuoteSchema = z.object({
  profile_id:             z.string().uuid().optional(),                 // null = cold quote
  buyer_name_snapshot:    z.string().trim().min(1).max(300),
  buyer_tax_id_snapshot:  z.string().trim().regex(TAX_ID_RE).optional(),
  buyer_contact_snapshot: z.string().trim().max(1000).optional(),

  transport_mode:         z.enum(TRANSPORT_MODES),
  port_loading:           z.string().trim().max(100).optional(),
  port_discharge:         z.string().trim().max(100).optional(),
  place_delivery:         z.string().trim().max(100).optional(),
  incoterm:               z.enum(INCOTERMS).optional(),
  currency:               z.enum(["THB", "USD"]).optional().default("THB"),

  vat_pct:                z.number().min(0).max(30).optional().default(7.00),
  valid_until:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:                  z.string().trim().max(2000).optional(),
});
export type CreateFreightQuoteInput = z.infer<typeof createFreightQuoteSchema>;

// ────────────────────────────────────────────────────────────
// Update header (draft-status only enforced at action layer)
// ────────────────────────────────────────────────────────────

export const updateFreightQuoteSchema = z.object({
  id:                     z.string().uuid(),
  buyer_name_snapshot:    z.string().trim().min(1).max(300).optional(),
  buyer_tax_id_snapshot:  z.string().trim().regex(TAX_ID_RE).optional().nullable(),
  buyer_contact_snapshot: z.string().trim().max(1000).optional().nullable(),
  transport_mode:         z.enum(TRANSPORT_MODES).optional(),
  port_loading:           z.string().trim().max(100).optional().nullable(),
  port_discharge:         z.string().trim().max(100).optional().nullable(),
  place_delivery:         z.string().trim().max(100).optional().nullable(),
  incoterm:               z.enum(INCOTERMS).optional().nullable(),
  vat_pct:                z.number().min(0).max(30).optional(),
  valid_until:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes:                  z.string().trim().max(2000).optional().nullable(),
});
export type UpdateFreightQuoteInput = z.infer<typeof updateFreightQuoteSchema>;

// ────────────────────────────────────────────────────────────
// Line item create/update/delete
// ────────────────────────────────────────────────────────────

export const createQuoteItemSchema = z.object({
  freight_quote_id: z.string().uuid(),
  position:         z.number().int().min(1).max(999).optional(),
  description:      z.string().trim().min(1).max(500),
  quantity:         z.number().positive().max(999_999),
  unit:             z.enum(QUOTE_UNITS).default("JOB"),
  unit_price_thb:   z.number().min(0).max(999_999.99),
  note:             z.string().trim().max(500).optional(),
});
export type CreateQuoteItemInput = z.infer<typeof createQuoteItemSchema>;

export const updateQuoteItemSchema = z.object({
  id:             z.string().uuid(),
  description:    z.string().trim().min(1).max(500).optional(),
  quantity:       z.number().positive().max(999_999).optional(),
  unit:           z.enum(QUOTE_UNITS).optional(),
  unit_price_thb: z.number().min(0).max(999_999.99).optional(),
  note:           z.string().trim().max(500).optional().nullable(),
});
export type UpdateQuoteItemInput = z.infer<typeof updateQuoteItemSchema>;

export const deleteQuoteItemSchema = z.object({
  id: z.string().uuid(),
});
export type DeleteQuoteItemInput = z.infer<typeof deleteQuoteItemSchema>;

// ────────────────────────────────────────────────────────────
// Status flips
// ────────────────────────────────────────────────────────────

export const quoteIdOnlySchema = z.object({
  id: z.string().uuid(),
});
export type QuoteIdOnlyInput = z.infer<typeof quoteIdOnlySchema>;

export const rejectQuoteSchema = z.object({
  id:              z.string().uuid(),
  rejected_reason: z.string().trim().min(3, "เหตุผล ≥3 ตัวอักษร").max(500),
});
export type RejectQuoteInput = z.infer<typeof rejectQuoteSchema>;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

export function roundThb(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeQuoteTotals(args: {
  items: Array<{ quantity: number; unit_price_thb: number }>;
  vat_pct: number;
}): { subtotal: number; vat_amount: number; total: number } {
  const subtotal = roundThb(
    args.items.reduce((s, it) => s + (Number(it.quantity) * Number(it.unit_price_thb)), 0),
  );
  const vat_amount = roundThb(subtotal * (args.vat_pct / 100));
  const total      = roundThb(subtotal + vat_amount);
  return { subtotal, vat_amount, total };
}

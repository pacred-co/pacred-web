/**
 * Zod schemas for withholding-tax (ภาษีหัก ณ ที่จ่าย) admin flows — V-A6.
 *
 * Implementation contract per docs/decisions/0015-withholding-tax-model.md
 * (locked 2026-05-16 night).
 *
 * V1 scope (per ADR §"V1 scope"):
 *   - Admin records the WHT entry (rate + base + amount).
 *   - Admin marks cert received (uploads 50 ทวิ) or waived (reason).
 *   - Receipt + tax-invoice issuance gated on cert_status ∈ {received, waived}.
 *
 * Deferred to V1.1: customer self-upload of the certificate, line-level base.
 *
 * Rate set per ADR Q1 (resolved): {1, 1.5, 2, 3, 5}.
 * Cargo/forwarder default UI suggestion = 1. Pure-service default UI = 3.
 */

import { z } from "zod";

/** Allowed WHT rates (percent). DB CHECK constraint mirrors this set. */
export const WHT_RATES = [1, 1.5, 2, 3, 5] as const;
export type WhtRate = (typeof WHT_RATES)[number];

/**
 * Round-half-up to 2dp (THB cents). Matches `numeric(12,2)` storage.
 * `Math.round` rounds half-to-even in some edge cases; this is portable.
 */
export function roundThb(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Helper: compute wht_amount + net_expected from rate + gross + base. */
export function computeWhtNumbers(args: {
  gross_invoice_thb: number;
  wht_base_thb:      number;
  wht_rate_pct:      number;
}): { wht_amount_thb: number; net_expected_thb: number } {
  const wht_amount_thb   = roundThb(args.wht_base_thb * (args.wht_rate_pct / 100));
  const net_expected_thb = roundThb(args.gross_invoice_thb - wht_amount_thb);
  return { wht_amount_thb, net_expected_thb };
}

// ────────────────────────────────────────────────────────────
// Create / replace WHT entry (admin)
// ────────────────────────────────────────────────────────────

/**
 * Refine: exactly one parent order (forwarder XOR service_order).
 * Mirrors the DB constraint `wht_one_parent_order`.
 */
const oneParentOrder = (data: { order_type: string; order_id: string }) =>
  ["forwarder", "service_order"].includes(data.order_type) && data.order_id.length > 0;

export const createWhtEntrySchema = z
  .object({
    /** Which parent. EXACTLY ONE must be set. */
    order_type: z.enum(["forwarder", "service_order"]),
    /** f_no for forwarder, h_no for service_order. */
    order_id:   z.string().trim().min(1).max(100),

    /**
     * The full invoice total (receipt gross). NEVER mutated downstream —
     * WHT does not reduce the printed receipt amount.
     */
    gross_invoice_thb: z
      .number()
      .positive("gross_invoice_thb ต้อง > 0"),

    /**
     * The WHT-able service portion. Typically ≤ gross_invoice_thb (pass-through
     * costs like ค่าสินค้า excluded). Staff-confirmed in V1.
     */
    wht_base_thb: z
      .number()
      .positive("wht_base_thb ต้อง > 0"),

    /** One of WHT_RATES. */
    wht_rate_pct: z
      .number()
      .refine((v) => (WHT_RATES as readonly number[]).includes(v), {
        message: `wht_rate_pct ต้องอยู่ใน {${WHT_RATES.join(", ")}}`,
      }),
  })
  .refine(oneParentOrder, {
    message: "order_type/order_id invalid",
    path:    ["order_type"],
  })
  .refine((d) => d.wht_base_thb <= d.gross_invoice_thb + 0.01, {
    message: "wht_base_thb ต้องไม่เกิน gross_invoice_thb",
    path:    ["wht_base_thb"],
  });

export type CreateWhtEntryInput = z.infer<typeof createWhtEntrySchema>;

// ────────────────────────────────────────────────────────────
// Mark cert received (admin uploads 50 ทวิ PDF/image)
// ────────────────────────────────────────────────────────────

export const markCertReceivedSchema = z.object({
  id: z.string().uuid(),
  /**
   * Customer's 50 ทวิ running number (e.g. "WT-2026-00187").
   * Optional in DB — sometimes customers don't print one.
   */
  cert_number: z.string().trim().max(100).optional(),
  /**
   * Storage path inside bucket 'wht-certs' after admin upload completes.
   * Format: "{profile_id}/{parent_key}/cert-{timestamp}.pdf".
   * Server action sets this from the upload response — clients should NOT
   * pass an arbitrary path.
   */
  cert_storage_path: z.string().trim().min(1).max(500),
});
export type MarkCertReceivedInput = z.infer<typeof markCertReceivedSchema>;

// ────────────────────────────────────────────────────────────
// Waive cert (super + accounting only — gate enforced in action)
// ────────────────────────────────────────────────────────────

export const waiveCertSchema = z.object({
  id:            z.string().uuid(),
  waived_reason: z
    .string()
    .trim()
    .min(5,   "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร")
    .max(500, "เหตุผลยาวเกินไป"),
});
export type WaiveCertInput = z.infer<typeof waiveCertSchema>;

// ────────────────────────────────────────────────────────────
// Cancel WHT entry (created in error — only if cert_status='pending')
// ────────────────────────────────────────────────────────────

export const cancelWhtEntrySchema = z.object({
  id: z.string().uuid(),
});
export type CancelWhtEntryInput = z.infer<typeof cancelWhtEntrySchema>;

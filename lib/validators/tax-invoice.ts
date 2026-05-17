/**
 * Zod schemas for tax invoice flows (T-P4 G2b — customer request side).
 *
 * Implementation contract per docs/decisions/0006-tax-invoice-flow.md:
 *   - Customer requests from /(protected)/service-import/[fNo]/receipt
 *     OR /(protected)/service-order/[hNo]/receipt
 *   - One source order per request (forwarder OR service_order, not both)
 *   - Buyer snapshot frozen at request time (RD Code 86 — immutable)
 *
 * Buyer info is captured FROM the form (rather than auto-populated from
 * profiles) so customer can override per-invoice if profile data is stale
 * or differs from what the legal name registered with RD says.
 */

import { z } from "zod";

// Thai juristic / personal tax IDs are 13 digits.
const TAX_ID_RE = /^\d{13}$/;

export const requestTaxInvoiceSchema = z
  .object({
    /**
     * Which parent this invoice is for. EXACTLY ONE source row must be set.
     * U4-3b: `yuan_payment` added for ฝากโอน customers (juristic) — see
     * actions/tax-invoices.ts + migrations/0034_tax_invoices.sql.
     */
    order_type: z.enum(["forwarder", "service_order", "yuan_payment"]),
    /** f_no for forwarder, h_no for service_order, id (uuid) for yuan_payment. */
    order_id:   z.string().trim().min(1).max(100),

    /** Buyer snapshot — captured at request time. */
    buyer_name:    z.string().trim().min(1, "กรุณากรอกชื่อ/ชื่อบริษัท").max(300),
    buyer_address: z.string().trim().min(5, "กรุณากรอกที่อยู่").max(1000),
    buyer_tax_id:  z
      .string()
      .trim()
      .regex(TAX_ID_RE, "เลขประจำตัวผู้เสียภาษี ต้อง 13 หลัก (ตัวเลขเท่านั้น)"),
    buyer_branch: z
      .string()
      .trim()
      .max(100)
      .default("สำนักงานใหญ่"),
  });
export type RequestTaxInvoiceInput = z.infer<typeof requestTaxInvoiceSchema>;

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
import { thaiTaxIdSchema } from "./thai-tax-id";

export const requestTaxInvoiceSchema = z
  .object({
    /** Which order this invoice is for. EXACTLY ONE must be set. */
    order_type: z.enum(["forwarder", "service_order"]),
    /** f_no for forwarder, h_no for service_order. */
    order_id:   z.string().trim().min(1).max(100),

    /** Buyer snapshot — captured at request time. */
    buyer_name:    z.string().trim().min(1, "กรุณากรอกชื่อ/ชื่อบริษัท").max(300),
    buyer_address: z.string().trim().min(5, "กรุณากรอกที่อยู่").max(1000),
    // C-4: was a bare 13-digit regex — now format + mod-11 checksum so a
    // malformed tax id can't be snapshotted into the immutable RD Code-86 row.
    buyer_tax_id:  thaiTaxIdSchema,
    buyer_branch: z
      .string()
      .trim()
      .max(100)
      .default("สำนักงานใหญ่"),
  });
export type RequestTaxInvoiceInput = z.infer<typeof requestTaxInvoiceSchema>;

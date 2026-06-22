"use server";

/**
 * saveQuotationForShare — persist a ใบเสนอราคา snapshot so the sales rep gets a
 * PUBLIC share-link to send the customer (owner ภูม 2026-06-22).
 *
 * The ใบเสนอราคา tool (admin/customers/[id]/quote-tab.tsx) is otherwise pure-client
 * + ephemeral. This action stores the rendered `QuoteModel` payload in
 * `customer_quotations` (migration 0199) and returns an unguessable HMAC token
 * (lib/quote/quote-token.ts). The public `/q/[token]` page re-renders the STORED
 * payload (no recompute) — exactly the receipt `/r/[token]` model.
 *
 * Gated to the roles that reach the customer detail page where the tool lives.
 * Every share is audit-logged.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { signQuoteToken } from "@/lib/quote/quote-token";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// The payload is the serialized QuoteModel (components/quote/quote-paper.tsx).
// We validate the SHAPE we depend on for re-render, but keep it permissive
// (passthrough) so the stored jsonb carries the full model the card needs —
// the card renders the stored object, not a re-derived one.
const compareRowSchema = z
  .object({
    warehouse: z.string(),
    isYiwu: z.boolean(),
    truck: z.object({}).passthrough(),
    ship: z.object({}).passthrough(),
  })
  .passthrough();

const lineSchema = z
  .object({
    desc: z.string(),
    qtyLabel: z.string(),
    price: z.number(),
    amount: z.number(),
    vat: z.boolean(),
    whtApplicable: z.boolean(),
  })
  .passthrough();

const totalsSchema = z
  .object({
    subtotalNoVat: z.number(),
    subtotalVat: z.number(),
    vatAmount: z.number(),
    grandTotal: z.number(),
    whtAmount: z.number(),
    netPayable: z.number(),
  })
  .passthrough();

const payloadSchema = z
  .object({
    view: z.enum(["compare", "calc"]),
    refNo: z.string().min(1).max(120),
    dateLabel: z.string(),
    validUntil: z.string(),
    buyerName: z.string(),
    buyerTaxId: z.string(),
    buyerAddress: z.string(),
    buyerPhone: z.string(),
    salesName: z.string(),
    salesTel: z.string(),
    packageLabel: z.string(),
    juristic: z.boolean(),
    compareRows: z.array(compareRowSchema),
    routeLabel: z.string(),
    density: z.number().nullable(),
    basisLabel: z.string(),
    comparison: z.number(),
    lines: z.array(lineSchema),
    totals: totalsSchema,
    showCustomsInfo: z.boolean(),
    conditions: z.array(z.string()),
    notes: z.array(z.string()),
    extraNote: z.string(),
  })
  .passthrough();

const inputSchema = z.object({
  userid: z.string().min(1).max(40),
  refNo: z.string().min(1).max(120),
  payload: payloadSchema,
});

export type SaveQuotationInput = z.infer<typeof inputSchema>;

export async function saveQuotationForShare(
  input: unknown,
): Promise<AdminActionResult<{ token: string; id: number }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ token: string; id: number }>(
    ["super", "ops", "sales_admin", "accounting", "sales"],
    async ({ adminId }) => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("customer_quotations")
        .insert({
          userid: d.userid.toUpperCase(),
          ref_no: d.refNo,
          payload: d.payload,
          created_by_admin: adminId,
        })
        .select("id")
        .single();

      if (error || !data) {
        logger.error("quote", "saveQuotationForShare insert failed", error, {
          userid: d.userid,
        });
        return { ok: false, error: "บันทึกใบเสนอราคาไม่สำเร็จ" };
      }

      const id = Number(data.id);
      const token = signQuoteToken(id);
      await logAdminAction(adminId, "share_quotation", "customer_quotation", String(id), {
        userid: d.userid.toUpperCase(),
        refNo: d.refNo,
      });
      return { ok: true, data: { token, id } };
    },
  );
}

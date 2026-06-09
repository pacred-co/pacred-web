"use server";

// ════════════════════════════════════════════════════════════════════
// CARGO per-line COST + DECLARED capture — the `pricing` role's write-path.
// P2 of the tax-invoice platform (docs/research/tax-invoice-platform-build-
// plan-2026-06-09.md). The 3-number model that PCS + ไอแต้ม conflated:
//   SELLING  (CS → invoice + VAT)        · already captured (tb_order.cprice / fwd header)
//   COST     (Pricing → PEAK stock-in)   · THIS file
//   DECLARED / มูลค่าสำแดง (Docs → ใบขน)  · THIS file
//
// ⚠️ INTERNAL ONLY. Cost + declared are the company's stock-in / profit basis
// + the ใบขน declared value. These actions write ONLY the per-line cost+declared
// columns added by migration 0158. They do NOT:
//   - move customer money / wallet (cost ≠ selling)
//   - recompute the selling price / quote (that stays in service-orders-shop-
//     workflow.ts · adminSaveShopOrderItemsAndQuote)
//   - change order status or notify the customer
//   - roll up into the forwarder HEADER fcosttotalprice (it has an authoritative
//     writer — the ไอแต้ม container-cost-sheet sync · adminApplyContainerCostFromSheet;
//     the PEAK header rollup lands in P4 to avoid colliding with it)
//
// RBAC: write = super / accounting / pricing (the new role · mig 0158). Pricing
// captures, accounting reviews, super oversees. Every write is audit-logged.
// ════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// Roles allowed to capture cost (mirror the cargo cost domain).
const ROLES_COST = ["super", "accounting", "pricing"] as const;

// Optional numeric field: "" / undefined / null → null (clear); else coerce.
// (preprocess BEFORE coerce so "" maps to null rather than 0.)
const optNum = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.coerce.number().min(0).max(99_999_999).nullable(),
);
// Optional short text (HS code): trimmed, ≤ 40, "" → null.
const optText = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z.string().trim().max(40).nullable(),
);

// ────────────────────────────────────────────────────────────
// Import-forwarder line (tb_forwarder_item · COST in THB)
// ────────────────────────────────────────────────────────────
const forwarderItemCostSchema = z.object({
  itemId:           z.coerce.number().int().positive(),
  costUnitThb:      optNum,   // cost per unit (THB)
  costRateCny:      optNum,   // cost-side yuan rate snapshot
  declaredValueThb: optNum,   // มูลค่าสำแดง (ใบขน) — THB
  hsCode:           optText,
});

export async function setForwarderItemCost(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const parsed = forwarderItemCostSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_COST], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tb_forwarder_item")
      .update({
        cost_unit_thb:      d.costUnitThb,
        cost_rate_cny:      d.costRateCny,
        declared_value_thb: d.declaredValueThb,
        hs_code:            d.hsCode,
      })
      .eq("id", d.itemId);
    if (error) {
      console.error(`[cargo-cost setForwarderItemCost] failed`, {
        code: error.code, message: error.message, itemId: d.itemId,
      });
      return { ok: false, error: `บันทึกต้นทุนไม่สำเร็จ: ${error.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder_item.set_cost", "tb_forwarder_item", String(d.itemId), {
      cost_unit_thb: d.costUnitThb, cost_rate_cny: d.costRateCny,
      declared_value_thb: d.declaredValueThb, hs_code: d.hsCode,
    });

    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Shop-order line (tb_order · COST in CNY ¥) — gap #1: tb_order had only
// `cprice` (SELLING); this captures what we paid the supplier (COST).
// ────────────────────────────────────────────────────────────
const shopOrderItemCostSchema = z.object({
  orderId:          z.coerce.number().int().positive(),
  costUnitCny:      optNum,   // cost per unit (CNY ¥)
  costRateCny:      optNum,   // cost-side yuan rate snapshot
  declaredValueThb: optNum,   // มูลค่าสำแดง (ใบขน) — THB
  hsCode:           optText,
});

export async function setShopOrderItemCost(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const parsed = shopOrderItemCostSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_COST], async ({ adminId }) => {
    const admin = createAdminClient();
    const { error } = await admin
      .from("tb_order")
      .update({
        cost_unit_cny:      d.costUnitCny,
        cost_rate_cny:      d.costRateCny,
        declared_value_thb: d.declaredValueThb,
        hs_code:            d.hsCode,
      })
      .eq("id", d.orderId);
    if (error) {
      console.error(`[cargo-cost setShopOrderItemCost] failed`, {
        code: error.code, message: error.message, orderId: d.orderId,
      });
      return { ok: false, error: `บันทึกต้นทุนไม่สำเร็จ: ${error.message}` };
    }

    await logAdminAction(adminId, "tb_order.set_cost", "tb_order", String(d.orderId), {
      cost_unit_cny: d.costUnitCny, cost_rate_cny: d.costRateCny,
      declared_value_thb: d.declaredValueThb, hs_code: d.hsCode,
    });

    revalidatePath("/admin/service-orders");
    return { ok: true };
  });
}

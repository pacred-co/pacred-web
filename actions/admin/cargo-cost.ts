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
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
// GAP 4+7 — on cost capture, auto-enroll the taxdoc job + mark pricing started.
import { markCargoPricingStarted } from "./cargo-taxdoc-workspace";
// Range-guarded field schemas (per-kind bounds + int32-overflow reject). RATE
// fields get a sane ~5/~37 ceiling instead of the old generic ฿100M cap — a
// fat-finger rate silently mis-values declared_value_thb = amount × rate.
import {
  cargoCostAmount,
  cargoDeclaredThb,
  cargoDeclaredCcy,
  cargoCnyRate,
  cargoCustomsFx,
  cargoDutyPct,
  cargoDutyThb,
  nullableShortText,
} from "@/lib/validators/cargo-cost-fields";

// Roles allowed to capture cost. Owner 2026-06-18 (mig 0189): cost is an
// ultra/accounting/pricing domain — `super` is god for everything EXCEPT money
// internals, so it must NOT read or write cost. `withAdmin` lets god roles
// (ultra+super) bypass its list, so the REAL gate is `assertCostAccess()` below
// (canViewCostProfit excludes super); the list still admits accounting/pricing.
const ROLES_COST = ["ultra", "accounting", "pricing"] as const;

/** Server-side cost-access gate. Blocks `super` (which withAdmin would otherwise
 *  admit as a god role) from writing/pre-filling cost — money internals are
 *  visible to ultra/accounting/pricing only. */
async function assertCostAccess(): Promise<{ ok: false; error: string } | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) {
    return { ok: false, error: "ไม่มีสิทธิ์เข้าถึงข้อมูลต้นทุน (เฉพาะ Ultra Admin Z / บัญชี / Pricing)" };
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Import-forwarder line (tb_forwarder_item · COST in THB)
// ────────────────────────────────────────────────────────────
// Declared customs-FX fields (mig 0179): the declared value on the ใบขน is
// declared_amount_ccy × declared_fx_rate. When both are present the server
// recomputes declared_value_thb from them (don't trust a client-computed THB);
// otherwise declaredValueThb is taken as sent (back-compat / direct THB edit).
const declaredCcyText = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? "USD" : v),
  z.string().trim().toUpperCase().max(8),
);
function resolveDeclaredThb(amountCcy: number | null, fxRate: number | null, fallbackThb: number | null): number | null {
  if (amountCcy != null && fxRate != null && fxRate > 0) {
    return Math.round(amountCcy * fxRate * 100) / 100;
  }
  return fallbackThb;
}

const forwarderItemCostSchema = z.object({
  itemId:            z.coerce.number().int().positive(),
  costUnitThb:       cargoCostAmount,   // cost per unit (THB)
  costRateCny:       cargoCnyRate,      // cost-side yuan rate snapshot (≈5 · bounded)
  declaredValueThb:  cargoDeclaredThb,  // มูลค่าสำแดง (ใบขน) — THB (fallback / direct edit)
  declaredCurrency:  declaredCcyText,   // มูลค่าสำแดง สกุล (USD default · CNY · …)
  declaredFxRate:    cargoCustomsFx,    // เรทศุลกากร (THB ต่อ 1 หน่วยสกุล · bounded)
  declaredAmountCcy: cargoDeclaredCcy,  // มูลค่าสำแดง ในสกุล declared_currency (engineer-down)
  hsCode:            nullableShortText,
});

export async function setForwarderItemCost(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const denied = await assertCostAccess();
  if (denied) return denied;
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
        cost_unit_thb:       d.costUnitThb,
        cost_rate_cny:       d.costRateCny,
        declared_value_thb:  resolveDeclaredThb(d.declaredAmountCcy, d.declaredFxRate, d.declaredValueThb),
        declared_currency:   d.declaredCurrency,
        declared_fx_rate:    d.declaredFxRate,
        declared_amount_ccy: d.declaredAmountCcy,
        hs_code:             d.hsCode,
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
      declared_value_thb: resolveDeclaredThb(d.declaredAmountCcy, d.declaredFxRate, d.declaredValueThb),
      declared_currency: d.declaredCurrency, declared_fx_rate: d.declaredFxRate, declared_amount_ccy: d.declaredAmountCcy,
      hs_code: d.hsCode,
    });

    // GAP 4+7 — auto-enroll the taxdoc job + mark pricing started (best-effort,
    // NEVER fails the cost write). Resolve the parent forwarder id from the line.
    try {
      const { data: parent, error: pErr } = await admin
        .from("tb_forwarder_item").select("fid").eq("id", d.itemId)
        .maybeSingle<{ fid: number | null }>();
      if (pErr) console.error("[setForwarderItemCost parent lookup]", { code: pErr.code, message: pErr.message });
      else if (parent?.fid) await markCargoPricingStarted({ fid: parent.fid });
    } catch (e) {
      console.error("[setForwarderItemCost → markCargoPricingStarted]", e instanceof Error ? e.message : String(e));
    }

    revalidatePath("/admin/forwarders");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// Import-forwarder HEADER · อากรขาเข้า (import duty) — D-G2 (mig 0178).
// The xlsx SELL-block roll-up the owner did in Excel: ราคาขายสุทธิ (+อากร) →
// รวมราคาก่อน Vat → +VAT 7% → ราคารวม Vat (computed by
// lib/forwarder/import-duty-vat.ts). Captured PER-SHIPMENT on tb_forwarder.
// ⚠️ COST-SHEET ONLY (same isolation as the per-line editor above): writes ONLY
// import_duty_pct/import_duty_thb · does NOT change fTotalPrice / the customer's
// binding charge / pay-on-arrival total / status / notify. The duty BASE is
// HS/policy-sensitive (ADR-0016) → staff-entered, never auto-guessed.
// ────────────────────────────────────────────────────────────
const forwarderImportDutySchema = z.object({
  id:            z.coerce.number().int().positive(),  // tb_forwarder.id
  importDutyPct: cargoDutyPct,                        // อากรขาเข้า (%) — informational [0,100]
  importDutyThb: cargoDutyThb,                        // อากรขาเข้า (บาท) — authoritative
});

export async function setForwarderImportDuty(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const denied = await assertCostAccess();
  if (denied) return denied;
  const parsed = forwarderImportDutySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin([...ROLES_COST], async ({ adminId }) => {
    const admin = createAdminClient();
    // cols are NOT NULL DEFAULT 0 (mig 0178) → clearing maps to 0, not null.
    const { error } = await admin
      .from("tb_forwarder")
      .update({
        import_duty_pct: d.importDutyPct ?? 0,
        import_duty_thb: d.importDutyThb ?? 0,
      })
      .eq("id", d.id);
    if (error) {
      console.error(`[cargo-cost setForwarderImportDuty] failed`, {
        code: error.code, message: error.message, id: d.id,
      });
      return { ok: false, error: `บันทึกอากรขาเข้าไม่สำเร็จ: ${error.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder.set_import_duty", "tb_forwarder", String(d.id), {
      import_duty_pct: d.importDutyPct, import_duty_thb: d.importDutyThb,
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
  orderId:           z.coerce.number().int().positive(),
  costUnitCny:       cargoCostAmount,   // cost per unit (CNY ¥)
  costRateCny:       cargoCnyRate,      // cost-side yuan rate snapshot (≈5 · bounded)
  declaredValueThb:  cargoDeclaredThb,  // มูลค่าสำแดง (ใบขน) — THB (fallback / direct edit)
  declaredCurrency:  declaredCcyText,
  declaredFxRate:    cargoCustomsFx,    // เรทศุลกากร (bounded)
  declaredAmountCcy: cargoDeclaredCcy,
  hsCode:            nullableShortText,
});

export async function setShopOrderItemCost(
  raw: Record<string, FormDataEntryValue | undefined>,
): Promise<AdminActionResult> {
  const denied = await assertCostAccess();
  if (denied) return denied;
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
        cost_unit_cny:       d.costUnitCny,
        cost_rate_cny:       d.costRateCny,
        declared_value_thb:  resolveDeclaredThb(d.declaredAmountCcy, d.declaredFxRate, d.declaredValueThb),
        declared_currency:   d.declaredCurrency,
        declared_fx_rate:    d.declaredFxRate,
        declared_amount_ccy: d.declaredAmountCcy,
        hs_code:             d.hsCode,
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
      declared_value_thb: resolveDeclaredThb(d.declaredAmountCcy, d.declaredFxRate, d.declaredValueThb),
      declared_currency: d.declaredCurrency, declared_fx_rate: d.declaredFxRate, declared_amount_ccy: d.declaredAmountCcy,
      hs_code: d.hsCode,
    });

    // GAP 4+7 — auto-enroll the taxdoc job + mark pricing started (best-effort).
    // Resolve the parent shop-order hno from the line.
    try {
      const { data: parent, error: pErr } = await admin
        .from("tb_order").select("hno").eq("id", d.orderId)
        .maybeSingle<{ hno: string | null }>();
      if (pErr) console.error("[setShopOrderItemCost parent lookup]", { code: pErr.code, message: pErr.message });
      else if (parent?.hno) await markCargoPricingStarted({ hno: parent.hno });
    } catch (e) {
      console.error("[setShopOrderItemCost → markCargoPricingStarted]", e instanceof Error ? e.message : String(e));
    }

    revalidatePath("/admin/service-orders");
    return { ok: true };
  });
}

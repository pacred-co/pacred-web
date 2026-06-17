import "server-only";

/**
 * lib/forwarder/doc-tier-discount.ts — the owner-LOCKED cargo doc-tier discount
 * (owner 2026-06-16).
 *
 * ── THE LOCKED RULE (owner 2026-06-16, TIGHTENED to ALL THREE / AND) ─────────
 * The base/default cargo CBM rate is CORRECT on prod (เรือ 3,700 / รถ 5,700 per
 * คิว) and is NEVER changed. Instead, grant a FIXED ฿800/CBM discount off the
 * resolved CBM rate (→ เรือ 2,900 / รถ 4,900) ONLY when ALL THREE conditions hold
 * (owner verbatim: "ต้อง ฝากโอน ฝากนำเข้า และ เปิดใบกำกับ หรือใบขน · ต้องตรงสามเงื่อนไขนี้"):
 *
 *   1. ฝากโอน  = customer used OUR yuan-transfer (โอนหยวน/Alipay) service, AND
 *   2. ฝากนำเข้า = OUR import service, AND
 *   3. tax-doc = ใบกำกับ (tax_invoice) OR ใบขน (customs)
 *        tb_forwarder.tax_doc_pref ∈ {'tax_invoice','customs'}  (migration 0127;
 *        NOT 'receipt' / null).
 *
 * ⚠️ DORMANT — NOT yet faithfully enforced. The discount ships OFF
 * (`enabled:false`, see getDocTierDiscountCbm). Condition 1 (ฝากโอน) is NOT
 * cleanly detectable from a tb_forwarder row: ฝากโอน/ฝากสั่งซื้อ/ฝากนำเข้า are
 * mutually-exclusive ORIGIN services (tb_wallet_hs.typeservice 3/1/2) — an order
 * is ONE origin, and the ฝากโอน signal lives on the payment ledger with no FK to
 * the shipment. The clean fix = a persisted full-loop flag stamped at create/
 * confirm time (owner-decision pending). Until then the predicate below
 * (isDocTierEligible) only encodes C2+C3-tax-doc and is HELD OFF by the enable
 * gate so it can never under-charge. DO NOT flip enabled:true until the
 * mechanism is locked.
 *
 * ── THE CONDITION-2 SIGNAL (investigated from legacy source) ─────────────────
 * Every tb_forwarder row IS a cargo-import order. Legacy forwarder.php
 * (L378-382 / L623-624) classifies a tb_forwarder row into exactly THREE
 * mutually-exhaustive cargo-import sub-categories:
 *     • refOrder<>''                       → ฝากสั่งซื้อ (linked shop / yuan order)
 *     • refOrder=''  AND adminIDCreator<>''→ ฝากนำเข้า (admin-created import)
 *     • refOrder=''  AND adminIDCreator='' → ฝากนำเข้าจาก users (self-import)
 * All three ARE "โอนหยวน OR ฝากนำเข้า" (the full-loop import service). There is
 * no fourth, non-import category of tb_forwarder row. So for the LIVE
 * auto-pricing paths (MOMO commit · manual create · dimension-edit), which only
 * ever operate on tb_forwarder rows, condition 2 is satisfied by virtue of the
 * row being a cargo-import row.
 *
 * `isCargoImportServiceRow` encodes this with the SAFE reading the owner asked
 * for: it returns true when the row carries ANY positive import signal
 * (reforder set = ฝากสั่งซื้อ/โอนหยวน · adminidcreator set = admin import) AND
 * treats a self-import row (both empty) as eligible too, because that is still
 * the import service. The discount can never apply outside tb_forwarder (the kg
 * path + all non-import lanes are untouched), so the blast radius is bounded.
 *
 * 🟠 OWNER-CONFIRM: if "ฝากนำเข้าจาก users" self-import (reforder='' AND
 *    adminidcreator='') should NOT get the discount — i.e. the discount is meant
 *    ONLY for shop-linked (โอนหยวน/ฝากสั่งซื้อ) + admin-created imports — flip
 *    `SELF_IMPORT_ELIGIBLE` to false. Defaulted true (every tb_forwarder row is
 *    an import-service order). Flagged, not guessed.
 *
 * @see lib/forwarder/resolve-rate.ts  — the pure resolver that subtracts it
 * @see supabase/migrations/0127      — tax_doc_pref column
 */

import { getBusinessConfig } from "@/lib/business-config";

/**
 * Default discount config when business_config `cargo.doc_tier_discount` is
 * unseeded. **`enabled` defaults FALSE → the discount ships DORMANT (fail-closed).**
 * Reason (owner 2026-06-16, investigated): the owner-locked rule needs ALL THREE —
 * ฝากโอน AND ฝากนำเข้า AND (ใบกำกับ OR ใบขน) — but C3 (ฝากโอน / yuan-transfer) is
 * NOT cleanly detectable from a tb_forwarder row (it lives on tb_wallet_hs.
 * typeservice='3' / tb_payment, with no FK to the shipment), and ฝากโอน/ฝากสั่งซื้อ/
 * ฝากนำเข้า are mutually-exclusive origins (an order can't be two at once). So the
 * eligibility predicate cannot be enforced faithfully yet. Until the owner locks
 * the mechanism (a persisted full-loop flag at create/confirm time), the discount
 * stays OFF so it can never under-charge. Flip `enabled:true` only after that.
 */
export const DEFAULT_DOC_TIER_DISCOUNT = { cbm_thb: 800, enabled: false } as const;

/** business_config key — JSON `{ cbm_thb: number, enabled: boolean }`. Adjustable without deploy. */
export const DOC_TIER_DISCOUNT_KEY = "cargo.doc_tier_discount";

/**
 * Whether a self-import tb_forwarder row (reforder='' AND adminidcreator='')
 * qualifies. Defaulted true — a self-import is still the ฝากนำเข้า service.
 * Owner can flip this to scope the discount to shop-linked + admin imports.
 */
export const SELF_IMPORT_ELIGIBLE = true;

/** Tax-doc preferences that satisfy condition 1 (ใบกำกับ OR ใบขน). */
const ELIGIBLE_TAX_DOC = new Set(["tax_invoice", "customs"]);

/**
 * Condition 1 — tax-doc = ใบกำกับ OR ใบขน. NULL / '' / 'receipt' → not eligible.
 */
export function isDocTierTaxDoc(taxDocPref: string | null | undefined): boolean {
  return ELIGIBLE_TAX_DOC.has(String(taxDocPref ?? "").trim());
}

/**
 * Condition 2 — the order came via โอนหยวน OR ฝากนำเข้า (the full-loop
 * cargo-import service). Encodes the legacy 3-way tb_forwarder classification
 * (see module header). `reforder` set OR `adminidcreator` set is the positive
 * signal; a self-import (both empty) is governed by SELF_IMPORT_ELIGIBLE.
 */
export function isCargoImportServiceRow(opts: {
  reforder: string | null | undefined;
  adminidcreator: string | null | undefined;
}): boolean {
  const hasRefOrder = String(opts.reforder ?? "").trim() !== "";
  const hasAdminCreator = String(opts.adminidcreator ?? "").trim() !== "";
  if (hasRefOrder || hasAdminCreator) return true; // ฝากสั่งซื้อ/โอนหยวน · admin ฝากนำเข้า
  return SELF_IMPORT_ELIGIBLE;                       // ฝากนำเข้าจาก users (self-import)
}

/**
 * Combined eligibility — BOTH conditions. Pure (no IO).
 */
export function isDocTierEligible(opts: {
  taxDocPref: string | null | undefined;
  reforder: string | null | undefined;
  adminidcreator: string | null | undefined;
}): boolean {
  return (
    isDocTierTaxDoc(opts.taxDocPref) &&
    isCargoImportServiceRow({ reforder: opts.reforder, adminidcreator: opts.adminidcreator })
  );
}

/**
 * Read the config-driven THB/CBM discount amount. business_config-driven so the
 * owner can change ฿800 / flip on without a deploy; falls back to the seeded
 * default on a missing/unseeded key. **Returns 0 (no discount) unless
 * `enabled === true`** — fail-closed: the discount is dormant until the owner
 * explicitly turns it on (see DEFAULT_DOC_TIER_DISCOUNT). Floored at 0.
 */
export async function getDocTierDiscountCbm(): Promise<number> {
  const cfg = await getBusinessConfig<{ cbm_thb: number; enabled?: boolean }>(
    DOC_TIER_DISCOUNT_KEY,
    DEFAULT_DOC_TIER_DISCOUNT,
  );
  if (cfg?.enabled !== true) return 0; // dormant / fail-closed until owner enables
  const raw = typeof cfg?.cbm_thb === "number" ? cfg.cbm_thb : Number(cfg?.cbm_thb);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

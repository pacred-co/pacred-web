/**
 * lib/tax/tax-doc-mode.ts
 *
 * ── The 3 tax-document modes (Lane B — accounting) ────────────────────────
 *   เดฟ-agent · 2026-06-04 · Global Trade Group business model §3 + legacy.
 *
 * Each order (ฝากสั่งซื้อ + ฝากโอน + ฝากนำเข้า) carries ONE document mode that
 * decides BOTH what document the customer receives AND on what base VAT 7% is
 * charged. The DB column `tb_*.tax_doc_pref` (migration 0127, CHECK in
 * {'receipt','tax_invoice','customs'}) is the canonical store; this module is
 * the single source of truth for what those 3 values MEAN.
 *
 *   ┌──────────────┬──────────────┬─────────────────────────────────────────┐
 *   │ TaxDocMode   │ tax_doc_pref │ Meaning + VAT-7% base                     │
 *   ├──────────────┼──────────────┼─────────────────────────────────────────┤
 *   │ tax_invoice  │ tax_invoice  │ ใบกำกับภาษี — goods imported under OUR    │
 *   │  (ใบกำกับ)    │              │ name (we pay import tax + stock-in) →     │
 *   │              │              │ VAT 7% on the GOODS VALUE.                │
 *   │              │              │ ⚠ on ฝากโอน, only if customer ฝากโอน with │
 *   │              │              │   us (we are the importer-of-record).     │
 *   ├──────────────┼──────────────┼─────────────────────────────────────────┤
 *   │ customs      │ customs      │ ใบขนสินค้า — customs-brokerage SERVICE.   │
 *   │  (ใบขน)       │              │ Customer owns the goods; we invoice only  │
 *   │              │              │ our SERVICE FEE → VAT 7% on the SERVICE   │
 *   │              │              │ FEE (NOT on goods value).                 │
 *   ├──────────────┼──────────────┼─────────────────────────────────────────┤
 *   │ none         │ receipt /    │ ไม่รับเอกสาร — pay-facilitation service.  │
 *   │  (ไม่รับฯ)     │   NULL       │ No tax document to the customer; our      │
 *   │              │              │ MARGIN is the taxable profit (internal    │
 *   │              │              │ VAT-on-profit, legacy report-shops-       │
 *   │              │              │ profit.php:255/277 `profit*0.07`). Plain  │
 *   │              │              │ ใบเสร็จรับเงิน "(ไม่ใช่ใบกำกับภาษี)" only │
 *   │              │              │ (legacy create-f-receipt.php:252).        │
 *   └──────────────┴──────────────┴─────────────────────────────────────────┘
 *
 * Legacy reality (verified against source 2026-06-04): the legacy PCS system
 * ONLY ever issued the plain receipt (the `none` mode) to customers — flat 1%
 * WHT for juristic, no customer-facing VAT (create-f-receipt.php:252-253,353).
 * VAT 7% appears ONLY in internal profit reports as `profit*0.07`
 * (report-shops-profit.php:255 / :277). The ใบกำกับ / ใบขน customer-facing
 * VAT documents are the Pacred Phase-C enhancement governed by ADR-0006 /
 * ADR-0015 / ADR-0027 + the Global Trade Group model. Rates are owner-confirmed
 * (ADR-0015): transport 1% · service 3% · rental 5% · goods 0% WHT · VAT 7%.
 *
 * Pure module (no server-only) — unit-tested with tsx.
 */

import type { TaxBreakdown, TaxableParts, TaxRates } from "./wht";
import { computeTax } from "./wht";

// ────────────────────────────────────────────────────────────
// The canonical mode enum + the DB-column mapping
// ────────────────────────────────────────────────────────────

/** The 3 business modes (Lane B). */
export type TaxDocMode = "tax_invoice" | "customs" | "none";

/** The persisted `tb_*.tax_doc_pref` values (migration 0127 CHECK). */
export type TaxDocPref = "tax_invoice" | "customs" | "receipt";

/** Order in which the modes are presented to the customer/admin. */
export const TAX_DOC_MODES: readonly TaxDocMode[] = ["tax_invoice", "customs", "none"] as const;

/** Display metadata per mode (TH). The UI reads these so labels never drift. */
export const TAX_DOC_MODE_META: Record<
  TaxDocMode,
  { pref: TaxDocPref; title: string; short: string; hint: string; vatBase: string }
> = {
  tax_invoice: {
    pref: "tax_invoice",
    title: "ใบกำกับภาษี",
    short: "ใบกำกับ",
    hint: "นำเข้าในนามเรา · VAT 7% จากมูลค่าสินค้า · ใช้เครดิตภาษีได้",
    vatBase: "มูลค่าสินค้า (goods value)",
  },
  customs: {
    pref: "customs",
    title: "ใบขนสินค้า",
    short: "ใบขน",
    hint: "บริการเคลียร์ศุลกากร · ไม่มี VAT ในบิลลูกค้า (Non) · VAT 7% จากกำไรภายใน · ลูกค้าเป็นเจ้าของสินค้า",
    vatBase: "ไม่มีในบิล (VAT 7% จากกำไรภายใน · D5)",
  },
  none: {
    pref: "receipt",
    title: "ไม่รับเอกสาร",
    short: "ไม่รับฯ",
    hint: "บริการฝากจ่าย · ออกใบเสร็จรับเงิน (ไม่ใช่ใบกำกับภาษี) · ไม่มี VAT ในบิล",
    vatBase: "ไม่มี (กำไรเป็นฐานภาษีภายใน)",
  },
};

// ────────────────────────────────────────────────────────────
// pref ↔ mode coercion (single place; everywhere else calls these)
// ────────────────────────────────────────────────────────────

/**
 * Coerce a raw `tax_doc_pref` column value (any string / null / undefined)
 * into one of the 3 canonical modes. NULL / unknown → 'none' (the legacy
 * receipt-only default — fail-safe: never accidentally promote to a VAT doc).
 */
export function modeFromPref(pref: string | null | undefined): TaxDocMode {
  const p = (pref ?? "").trim();
  if (p === "tax_invoice") return "tax_invoice";
  if (p === "customs") return "customs";
  return "none"; // 'receipt', '', NULL, or any unexpected value
}

/** The `tax_doc_pref` column value to persist for a given mode. */
export function prefFromMode(mode: TaxDocMode): TaxDocPref {
  return TAX_DOC_MODE_META[mode].pref;
}

/** True when the mode produces a customer document needing billing details
 *  (ใบกำกับ has a customer VAT line · ใบขน is a customs declaration needing the
 *  consignee/billing snapshot — even though, per D5, ใบขน carries NO customer
 *  VAT line; its 7% is internal margin-VAT). 'none' = receipt only. */
export function modeRequiresBillingSnapshot(mode: TaxDocMode): boolean {
  return mode === "tax_invoice" || mode === "customs";
}

/**
 * Map the 4 raw <CartTaxDocPref> form fields to the `tax_doc_*` snapshot
 * columns (tb_header_order / tb_forwarder / tb_payment). Same mapping
 * cart.ts + forwarder-legacy.ts inline (billing name + " · " + address →
 * tax_doc_address; tax_id + address only kept for VAT-bearing modes). Captures
 * the choice only — never drives issuance (that stays flag-gated). Empty
 * billing fields persist as null (never blocks the parent flow).
 */
export function mapTaxDocColumns(raw: {
  taxDocPref?: string | null;
  taxDocTaxId?: string | null;
  taxDocBillingName?: string | null;
  taxDocAddress?: string | null;
}): { tax_doc_pref: TaxDocPref; tax_doc_tax_id: string | null; tax_doc_address: string | null } {
  const mode = modeFromPref(raw.taxDocPref);
  const needsBilling = modeRequiresBillingSnapshot(mode);
  const taxId = (raw.taxDocTaxId ?? "").trim();
  const name = (raw.taxDocBillingName ?? "").trim();
  const addr = (raw.taxDocAddress ?? "").trim();
  return {
    tax_doc_pref: prefFromMode(mode),
    tax_doc_tax_id: needsBilling ? (taxId || null) : null,
    tax_doc_address: needsBilling ? (`${name} · ${addr}`.trim() === "·" ? null : `${name} · ${addr}`.trim() || null) : null,
  };
}

// ────────────────────────────────────────────────────────────
// Mode-aware tax computation — the per-mode VAT BASE difference
// ────────────────────────────────────────────────────────────

/**
 * The same generic taxable parts the engine takes (lib/tax/wht.ts), with the
 * caller having already classified each charge. `goods` = the imported-goods
 * value (0 for a pure forwarder/transport bill — see ForwarderCharges note).
 */
export type ModeTaxableParts = TaxableParts;

/**
 * Compute tax for an order UNDER A SPECIFIC DOCUMENT MODE.
 *
 * The mode controls WHICH parts enter the VAT-7% base (this is the whole
 * point of Lane B's three modes). WHT is ALWAYS computed per-class on the
 * underlying service/transport charges (ADR-0015) — WHT is a payment-
 * settlement concept and does not depend on the document mode; only the
 * customer-facing VAT base does.
 *
 *   ── tax_invoice (ใบกำกับ) ──
 *     VAT base = the FULL post-discount base MINUS the zero-rated intl
 *     transport leg (ม.80/1). I.e. goods + domestic transport + service +
 *     rental are all VATable; the CN→TH / China-domestic transport legs are
 *     VAT-0%. This is the existing `computeTax` behaviour (vatable = total −
 *     transportIntl) → we delegate to it with withVat:true.
 *     ⚠ Goods enter the VAT base here because the goods were imported under
 *       OUR name (owner: "คิด VAT รวมค่าสินค้าด้วย", lib/tax/wht.ts header).
 *
 *   ── customs (ใบขน) ──
 *     VAT base = the SERVICE FEE ONLY (customs-brokerage). The customer owns
 *     the goods; we are NOT the importer-of-record, so goods value is NOT on
 *     our invoice and is NOT in our VAT base. Domestic transport + rental we
 *     bundle into the brokerage service base (they are our taxable services).
 *     The intl transport leg stays zero-rated. Goods → excluded from VAT base.
 *     ⚠ MONEY/TAX — see the line-tagged TODO below: whether ใบขน VAT should
 *       cover ONLY `service` or `service + domestic transport + rental` is an
 *       accounting policy call. We implement the conservative "service +
 *       domestic transport + rental, goods + intl excluded" and FLAG it.
 *
 *   ── none (ไม่รับเอกสาร) ──
 *     No customer-facing VAT (withVat:false). The customer gets a plain
 *     ใบเสร็จรับเงิน. The taxable VAT here is on Pacred's MARGIN, computed
 *     SEPARATELY from the order total (legacy report-shops-profit.php) — it is
 *     NOT a line on the customer's bill, so `vat` on this breakdown = 0 and
 *     `base.vatable` = 0. (Margin VAT is an internal-accounting figure that
 *     needs the cost basis, which this order-level function does not have →
 *     out of scope for the customer document; see computeMarginVat below.)
 */
export function computeTaxForMode(
  mode: TaxDocMode,
  parts: ModeTaxableParts,
  opts: { isJuristic: boolean; rates?: TaxRates },
): TaxBreakdown {
  if (mode === "tax_invoice") {
    // ใบกำกับ — full vatable base (goods + dom transport + service + rental;
    // intl transport zero-rated). This is exactly the engine's default.
    return computeTax(parts, { isJuristic: opts.isJuristic, withVat: true, rates: opts.rates });
  }

  if (mode === "customs") {
    // ใบขน — RESOLVED (owner 2026-06-21 · D5): ใบขน is a "Non" doc, same as
    // ไม่เอาเอกสาร — there is NO customer-facing VAT line. The 7% VAT is paid by
    // Pacred on its MARGIN (กำไร) internally to สรรพากร (computeMarginVat below),
    // NOT charged to the customer. Owner brief verbatim: "ใบขน Non (Vat7% จากกำไร
    // เสียภาษี)". (Previously this put customer VAT on the service base — wrong;
    // that was flagged as an unresolved policy call. Now decided = margin VAT.)
    // The customer ใบขน shows the goods/declared value + the brokerage charges,
    // with NO VAT line; WHT still applies per class (ADR-0015). Mirrors `none`.
    return computeTax(parts, { isJuristic: opts.isJuristic, withVat: false, rates: opts.rates });
  }

  // none (ไม่รับเอกสาร) — no customer-facing VAT. WHT still applies for juristic
  // (the legacy flat 1% lives in a separate receipt-specific path; the per-
  // class WHT here is the correct generalisation per ADR-0015).
  return computeTax(parts, { isJuristic: opts.isJuristic, withVat: false, rates: opts.rates });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Internal VAT-on-MARGIN for the `none` (ไม่รับเอกสาร) mode. This is NOT on
 * the customer document — it is the figure Pacred owes on its profit, mirroring
 * legacy report-shops-profit.php:255/277 (`profit * 0.07`). Requires the cost
 * basis (not part of the order total), so the caller supplies it.
 *
 *   marginVat = round2(max(0, profitThb) * vatPct/100)
 *
 * @param profitThb  Pacred's margin on the order (revenue − cost), THB.
 * @param vatPct     VAT %, default 7.
 */
export function computeMarginVat(profitThb: number, vatPct = 7): number {
  const p = Number.isFinite(profitThb) ? profitThb : 0;
  if (p <= 0) return 0; // legacy: `if($profit>0){ profit*0.07 } else { profit }` — no VAT on a loss
  return round2(p * (vatPct / 100));
}

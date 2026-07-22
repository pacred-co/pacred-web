/**
 * components/admin/tax-doc-badge.tsx — Workstream B (2026-06-11)
 *
 * Make the customer's tax-document choice VISIBLE to back-office staff.
 *
 * The owner's exact complaint: "คนทำงานหลังบ้านไม่รู้ว่าลูกค้าเลือกอะไร — ทำ
 * เอกสารมั้ย VAT/ไม่ VAT". Pacred ALREADY captures + persists the choice on
 * `tb_*.tax_doc_pref` (migration 0127) via the customer-side <CartTaxDocPref>,
 * and the VAT engine (`computeTaxForMode`) already decides VAT vs no-VAT — but
 * no admin surface RENDERED it. This shared badge fixes that: one glance tells
 * staff which document the order needs + whether it carries VAT.
 *
 * DISPLAY-ONLY. No money-logic, no schema, no mutation. Labels come from
 * `TAX_DOC_MODE_META` (the SOT in lib/tax/tax-doc-mode.ts) so the wording never
 * drifts from the customer-facing picker.
 *
 * Server-component-safe (no "use client") — renders on the forwarder detail +
 * edit pages and the order list.
 */

import {
  modeFromPref,
  TAX_DOC_MODE_META,
  type TaxDocMode,
} from "@/lib/tax/tax-doc-mode";

// Per-mode chip palette. ใบกำกับ (VAT, goods) = amber-red (the high-attention
// "must issue a VAT invoice" signal) · ใบขน (VAT, service) = blue · ไม่รับเอกสาร
// (no VAT) = grey. The colour reinforces the VAT/no-VAT read at a glance.
const MODE_CHIP: Record<
  TaxDocMode,
  { cls: string; vat: string }
> = {
  tax_invoice: {
    cls: "border-amber-300 bg-amber-50 text-amber-800",
    vat: "VAT 7%",
  },
  customs: {
    cls: "border-blue-300 bg-blue-50 text-blue-700",
    vat: "VAT 7%",
  },
  none: {
    cls: "border-gray-300 bg-gray-50 text-gray-600",
    vat: "ไม่มี VAT",
  },
};

/**
 * The customer's document choice as a single chip.
 *
 * @param pref     raw `tb_*.tax_doc_pref` value (string | null | undefined —
 *                 coerced via modeFromPref, so '' / NULL / unknown → ไม่รับเอกสาร).
 * @param size     "sm" (list rows · default "md" for detail/edit headers).
 * @param showVat  append the VAT base ("VAT 7% · มูลค่าสินค้า") — on by default
 *                 for the headers; pass false in dense list cells.
 */
export function TaxDocBadge({
  pref,
  size = "md",
  showVat = true,
}: {
  pref: string | null | undefined;
  size?: "sm" | "md";
  showVat?: boolean;
}) {
  const mode = modeFromPref(pref);
  const meta = TAX_DOC_MODE_META[mode];
  const chip = MODE_CHIP[mode];
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap ${chip.cls} ${pad}`}
      title={meta.hint}
    >
      <span aria-hidden>🧾</span>
      <span>{meta.title}</span>
      {showVat && (
        <span className="opacity-80">· {chip.vat}{mode !== "none" ? ` (${meta.vatBase.split(" (")[0]})` : ""}</span>
      )}
    </span>
  );
}

/**
 * Juristic (นิติบุคคล) + WHT-1% indicator chip.
 *
 * Mirrors legacy `hs-receipt-forwarder.php`'s corporate signal (the "ลูกค้า
 * บริษัท" tab/column). 🔴 owner 2026-07-22: the ฿1,000 minimum was ABOLISHED —
 * WHT 1% now applies to a juristic customer on ANY amount (unless the per-order
 * `fusercompany` exempts it). DISPLAY ONLY — never recomputes the tax.
 *
 * Renders nothing when the customer is not juristic (keeps non-corporate rows
 * uncluttered, same as legacy which only showed the company column for
 * userCompany==1).
 *
 * @param isJuristic   customer is นิติบุคคล (tb_users.userCompany==='1' OR the
 *                     per-order tb_forwarder.fusercompany==='1').
 * @param totalThb     order total — accepted for call-site compatibility; no
 *                     longer drives a threshold caveat (the ฿1,000 floor is gone).
 */
export function JuristicWhtChip({
  isJuristic,
  size = "md",
}: {
  isJuristic: boolean;
  totalThb?: number | null;
  size?: "sm" | "md";
}) {
  if (!isJuristic) return null;
  const pad = size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-[11px]";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap border-rose-300 bg-rose-50 text-rose-700 ${pad}`}
      title="ลูกค้านิติบุคคล — หัก ณ ที่จ่าย 1% ทุกยอด (ไม่มีขั้นต่ำ · owner 2026-07-22)"
    >
      <span aria-hidden>🏢</span>
      <span>นิติบุคคล · หัก ณ ที่จ่าย 1%</span>
    </span>
  );
}

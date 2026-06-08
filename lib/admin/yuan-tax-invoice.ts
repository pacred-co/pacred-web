/**
 * lib/admin/yuan-tax-invoice.ts
 *
 * ใบกำกับภาษี/ใบขน issuer for the LIVE ฝากโอน (tb_payment) lane.
 * MONEY/TAX-CRITICAL · migration 0152. Sibling of lib/admin/shop-tax-invoice.ts.
 *
 * ── The "ฝากโอนกับเราเท่านั้น" gate (CEO rule · enforced here) ──
 *   A ใบกำกับภาษี (tax_invoice mode) for a yuan transfer is only valid when the
 *   customer ฝากโอน WITH us — i.e. we are the party that actually moved the
 *   money (importer-of-record). We enforce this by requiring the tb_payment row
 *   to be COMPLETED (paystatus='2'): a pending/failed transfer was never done
 *   through us, so it can never get a tax_invoice. (customs/ใบขน has the same
 *   completed gate — there is no document for a transfer that never happened.)
 *
 * ── VAT base ──
 *   tax_invoice (ใบกำกับ) → VAT 7% on tb_payment.paythb (the THB value of the
 *     transfer = the goods value paid on the customer's behalf · goods mode).
 *   customs (ใบขน) → VAT 7% on the SERVICE FEE only. A yuan transfer's money
 *     model has no separately-billed customer service-fee bucket (the margin
 *     `payprofitthb` is Pacred's internal profit, NOT a customer-facing fee),
 *     so under customs mode the VAT base is 0 (goods stripped by
 *     computeTaxForMode, no service line). ใบกำกับ is the expected yuan mode.
 *
 *   ⚠ physical column note: the legacy table column is `paythb` (NOT
 *     `thb_amount` — that is the friendly/rebuilt field name in
 *     actions/payment.ts's mapper). We read the real column `paythb`.
 *
 * ── IDEMPOTENT + BEST-EFFORT (same contract as the shop/forwarder issuers) ──
 *   - One invoice per payment id (tb_shop_tax_invoice.payment_id partial-unique).
 *   - Migration 0152 not applied → log + ok:false WITHOUT throwing.
 *
 * ⚠ The CALLER checks the live-gate flag (isShopYuanTaxInvoiceEnabled) — this
 *   issuer is the compute+persist, matching the forwarder/shop pattern.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { TaxableParts } from "@/lib/tax/wht";
import { computeTaxForMode, type TaxDocMode } from "@/lib/tax/tax-doc-mode";
import { getTaxRates } from "@/lib/tax/rates";
import { mintTaxInvoiceDocNo } from "@/lib/admin/mint-receipt-doc-no";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createAdminClient>;

export interface IssueYuanTaxInvoiceOpts {
  /** tb_payment.id this tax invoice covers. */
  paymentId: number;
  /** Optional override userid (else read from the tb_payment row). */
  userid?: string;
  /** Who issued — adminID / 'system-auto' / 'customer-request'. */
  issuedBy?: string;
  /**
   * Document mode. 'tax_invoice' (ใบกำกับ · VAT on the transfer THB) or
   * 'customs' (ใบขน · VAT on service fee · ~0 for yuan). Defaults to
   * 'tax_invoice'. 'none' coerced to 'tax_invoice'.
   */
  mode?: TaxDocMode;
}

export type IssueYuanTaxInvoiceResult =
  | { ok: true; data: { invoiceId: number; serialNo: string | null; netPayable: number; vat: number; whtTotal: number } }
  | { ok: false; error: string; alreadyIssued?: boolean };

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
};
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Issue a ใบกำกับภาษี/ใบขน for ONE completed yuan transfer. Idempotent on payment id.
 */
export async function issueYuanTaxInvoice(
  admin: Admin,
  opts: IssueYuanTaxInvoiceOpts,
): Promise<IssueYuanTaxInvoiceResult> {
  const paymentId = Number(opts.paymentId);
  if (!Number.isFinite(paymentId) || paymentId <= 0) {
    return { ok: false, error: "missing_payment_id" };
  }

  // 1. Idempotency — payment already on a yuan tax invoice?
  const { data: existing, error: existErr } = await admin
    .from("tb_shop_tax_invoice")
    .select("id, serial_no")
    .eq("payment_id", paymentId)
    .maybeSingle<{ id: number; serial_no: string | null }>();
  if (existErr && existErr.code !== "PGRST116") {
    logger.warn("yuan-tax-invoice", "idempotency check failed (table missing?)", {
      code: existErr.code, message: existErr.message, paymentId,
    });
    return { ok: false, error: `db_error:${existErr.code ?? "unknown"}` };
  }
  if (existing) {
    return { ok: false, error: "already_issued", alreadyIssued: true };
  }

  // 2. Read the payment row + the "ฝากโอนกับเราเท่านั้น" completed gate.
  type PayRow = { id: number; userid: string | null; paystatus: string | null; paythb: number | string | null };
  const { data: payRow, error: payErr } = await admin
    .from("tb_payment")
    .select("id, userid, paystatus, paythb")
    .eq("id", paymentId)
    .maybeSingle<PayRow>();
  if (payErr && payErr.code !== "PGRST116") {
    logger.warn("yuan-tax-invoice", "tb_payment read failed", {
      code: payErr.code, message: payErr.message, paymentId,
    });
    return { ok: false, error: `db_error:${payErr.code ?? "unknown"}` };
  }
  if (!payRow) return { ok: false, error: "no_matching_payment" };

  const userid = (opts.userid ?? payRow.userid ?? "").trim();
  if (!userid) return { ok: false, error: "no_userid_on_payment" };
  // If a userid override was supplied it must match the row (ownership guard).
  if (opts.userid && payRow.userid && opts.userid !== payRow.userid) {
    return { ok: false, error: "not_your_payment" };
  }

  // The "ฝากโอนกับเราเท่านั้น" rule — only a COMPLETED transfer (paystatus='2')
  // is eligible for ANY tax document (the transfer must have been done through
  // Pacred). pending('1')/failed-or-refunded('3') → refuse.
  if ((payRow.paystatus ?? "").trim() !== "2") {
    return { ok: false, error: "payment_not_completed" };
  }

  // 3. Juristic identity + buyer snapshot.
  type CorpRow = { corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null };
  const { data: corpRow, error: corpErr } = await admin
    .from("tb_corporate")
    .select("corporatenumber, corporatename, corporateaddress")
    .eq("userid", userid)
    .maybeSingle<CorpRow>();
  if (corpErr && corpErr.code !== "PGRST116") {
    logger.warn("yuan-tax-invoice", "tb_corporate read failed", {
      code: corpErr.code, message: corpErr.message, userid,
    });
  }
  const isJuristic = !!corpRow?.corporatenumber;

  type UserRow = { userName: string | null; userLastName: string | null };
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userName, userLastName")
    .eq("userID", userid)
    .maybeSingle<UserRow>();
  if (userErr) {
    logger.warn("yuan-tax-invoice", "tb_users read failed", {
      code: userErr.code, message: userErr.message, userid,
    });
  }
  const buyerName = corpRow?.corporatename
    ?? `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim();
  const buyerTaxId = corpRow?.corporatenumber ?? "";
  const buyerAddress = corpRow?.corporateaddress ?? "";

  // 4. VAT base = paythb (goods value of the transfer). For 'customs' (ใบขน)
  //    the goods are stripped by computeTaxForMode → VAT base 0 (no service
  //    bucket on a yuan transfer). ใบกำกับ is the expected mode.
  const goodsThb = num(payRow.paythb);
  const parts: TaxableParts = {
    transportDomestic: 0,
    transportIntl:     0,
    service:           0,
    rental:            0,
    goods:             goodsThb,
    discount:          0,
  };

  const rates = await getTaxRates();
  const mode: TaxDocMode = (opts.mode && opts.mode !== "none") ? opts.mode : "tax_invoice";
  const tax = computeTaxForMode(mode, parts, { isJuristic, rates });

  // 5. Mint the serial (best-effort).
  let serialNo: string | null = null;
  try {
    serialNo = await mintTaxInvoiceDocNo(admin, { issueDate: new Date() });
  } catch (e) {
    logger.warn("yuan-tax-invoice", "serial mint threw (non-fatal · leaving serial null)", {
      error: e instanceof Error ? e.message : String(e), paymentId,
    });
  }

  // 6. INSERT header.
  const insertHeader = {
    service_type:        "yuan",
    serial_no:           serialNo,
    userid,
    hno:                 null,
    payment_id:          paymentId,
    receipt_id:          null,
    rid:                 null,
    doc_mode:            mode,
    buyer_name:          buyerName,
    buyer_tax_id:        buyerTaxId,
    buyer_address:       buyerAddress,
    is_juristic:         isJuristic,
    base_transport:      tax.base.transport,
    base_transport_intl: tax.base.transportIntl,
    base_service:        tax.base.service,
    base_rental:         tax.base.rental,
    base_goods:          tax.base.goods,
    base_total:          tax.base.total,
    vatable_base:        tax.base.vatable,
    vat_amount:          tax.vat,
    wht_total:           tax.wht.total,
    gross_before_wht:    tax.grossBeforeWht,
    net_payable:         tax.netPayable,
    vat_pct:             rates.vatPct,
    status:              "issued",
    issued_by:           opts.issuedBy ?? "system-auto",
  };
  const { data: hdr, error: hdrErr } = await admin
    .from("tb_shop_tax_invoice")
    .insert(insertHeader)
    .select("id")
    .single<{ id: number }>();
  if (hdrErr) {
    if (hdrErr.code === "23505") {
      return { ok: false, error: "already_issued", alreadyIssued: true };
    }
    logger.warn("yuan-tax-invoice", "header insert failed (migration 0152 applied?)", {
      code: hdrErr.code, message: hdrErr.message, userid, paymentId,
    });
    return { ok: false, error: `tax_invoice_insert:${hdrErr.code ?? "unknown"}` };
  }
  const invoiceId = hdr.id;

  // 7. INSERT the line item.
  const { error: itemErr } = await admin
    .from("tb_shop_tax_invoice_item")
    .insert({
      invoice_id:         invoiceId,
      hno:                null,
      payment_id:         paymentId,
      goods_thb:          round2(goodsThb),
      service_thb:        0,
      transport_thb:      0,
      transport_intl_thb: 0,
      discount_thb:       0,
    });
  if (itemErr) {
    logger.warn("yuan-tax-invoice", "item insert failed — rolling back header", {
      code: itemErr.code, message: itemErr.message, invoiceId,
    });
    await admin.from("tb_shop_tax_invoice").delete().eq("id", invoiceId);
    return { ok: false, error: `tax_invoice_items_insert:${itemErr.code ?? "unknown"}` };
  }

  // 8. INSERT per-CLASS WHT entries (juristic only · non-zero classes · goods
  //    is 0% so usually none for a pure-goods yuan transfer).
  if (isJuristic) {
    const whtRows = [
      { wht_class: "transport", base: tax.base.transport, rate: rates.transportPct, amt: tax.wht.transport },
      { wht_class: "service",   base: tax.base.service,   rate: rates.servicePct,   amt: tax.wht.service },
      { wht_class: "rental",    base: tax.base.rental,    rate: rates.rentalPct,    amt: tax.wht.rental },
      { wht_class: "goods",     base: tax.base.goods,     rate: rates.goodsPct,     amt: tax.wht.goods },
    ]
      .filter((w) => w.base > 0 && w.amt > 0)
      .map((w) => ({
        invoice_id:     invoiceId,
        userid,
        wht_class:      w.wht_class,
        wht_base_thb:   round2(w.base),
        wht_rate_pct:   w.rate,
        wht_amount_thb: round2(w.amt),
        cert_status:    "pending",
      }));
    if (whtRows.length > 0) {
      const { error: whtErr } = await admin
        .from("tb_shop_wht_entry")
        .insert(whtRows);
      if (whtErr) {
        logger.warn("yuan-tax-invoice", "WHT entries insert failed (non-fatal)", {
          code: whtErr.code, message: whtErr.message, invoiceId,
        });
      }
    }
  }

  // 9. Audit log (best-effort).
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    opts.issuedBy ?? "system-auto",
      action:      "yuan_tax_invoice.issued",
      target_type: "tb_shop_tax_invoice",
      target_id:   String(invoiceId),
      payload: {
        userid,
        payment_id:  paymentId,
        mode,
        is_juristic: isJuristic,
        base_total:  tax.base.total,
        vat:         tax.vat,
        wht_total:   tax.wht.total,
        net_payable: tax.netPayable,
        serial_no:   serialNo,
      },
    });
  } catch (e) {
    logger.warn("yuan-tax-invoice", "audit log insert failed (non-fatal)", {
      error: e instanceof Error ? e.message : String(e), invoiceId,
    });
  }

  return {
    ok: true,
    data: { invoiceId, serialNo, netPayable: tax.netPayable, vat: tax.vat, whtTotal: tax.wht.total },
  };
}

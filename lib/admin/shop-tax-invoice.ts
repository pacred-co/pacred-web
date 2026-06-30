/**
 * lib/admin/shop-tax-invoice.ts
 *
 * ใบกำกับภาษี/ใบขน issuer for the LIVE ฝากสั่งซื้อ (tb_header_order) lane.
 * MONEY/TAX-CRITICAL · migration 0152. Clone of lib/admin/forwarder-tax-invoice.ts.
 *
 * ── What it does ──
 *   Given a shop order (tb_header_order.hno owned by tb_users.userID) and a
 *   document mode ('tax_invoice' = ใบกำกับ · 'customs' = ใบขน), computes the
 *   VAT-7% + per-class WHT via the shared engine (lib/tax/tax-doc-mode.ts) and
 *   persists ONE invoice into the tb_*-native store (tb_shop_tax_invoice +
 *   _item + tb_shop_wht_entry · service_type='shop').
 *
 * ── VAT base (the whole point of the modes) ──
 *   tax_invoice (ใบกำกับ) → VAT 7% on the GOODS VALUE (tb_header_order
 *     .htotalpricechn — the THB goods value; we imported under our name).
 *     Service/transport ride along as VATable too (the engine's full base
 *     minus the zero-rated intl transport leg). htotalpricechn is mapped to
 *     `goods`; ค่าบริการ to `service`; ค่าขนส่งในจีน to the zero-rated `intl`.
 *   customs (ใบขน) → VAT 7% on the SERVICE FEE only (goods stripped by
 *     computeTaxForMode — the customer owns the goods).
 *
 * ── IDEMPOTENT + BEST-EFFORT (same contract as the forwarder issuer) ──
 *   - One invoice per hno (tb_shop_tax_invoice.hno partial-unique) — re-issue
 *     for an already-invoiced hno returns alreadyIssued (no double-mint).
 *   - If migration 0152 hasn't been applied, the INSERTs fail → log + return
 *     ok:false WITHOUT throwing so the caller's receipt/settle flow is never
 *     blocked (the money already moved; the tax document is a follow-on).
 *
 * ⚠ This issuer does NOT itself check the live-gate flag — the CALLER
 *   (actions/admin/wallet-hs.ts auto-issue hook · actions/tax-invoices.ts
 *   customer request) checks `isShopYuanTaxInvoiceEnabled()` first. Keeping the
 *   gate at the call site matches the forwarder pattern (the issuer is the
 *   compute+persist; the policy of WHETHER to call lives with the caller).
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { TaxableParts } from "@/lib/tax/wht";
import { computeTaxForMode, type TaxDocMode } from "@/lib/tax/tax-doc-mode";
import { getTaxRates } from "@/lib/tax/rates";
import { resolvePaymentAccount } from "@/lib/payment/bank-accounts";
import { mintTaxInvoiceDocNo } from "@/lib/admin/mint-receipt-doc-no";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createAdminClient>;

export interface IssueShopTaxInvoiceOpts {
  /** tb_users.userID of the customer (= tb_header_order.userid). */
  userid: string;
  /** tb_header_order.hno this tax invoice covers (owned by userid). */
  hno: string;
  /** The tb_receipt.id this invoice is issued alongside (auto path · optional). */
  receiptId?: number | null;
  /** The tb_receipt.rid mirror (optional). */
  rid?: string | null;
  /** Who issued — adminID / 'system-auto' / 'customer-request'. */
  issuedBy?: string;
  /**
   * Document mode (Lane B). 'tax_invoice' (ใบกำกับ · VAT on goods) or 'customs'
   * (ใบขน · VAT on service fee). Defaults to 'tax_invoice'. 'none' is coerced to
   * 'tax_invoice' (issuing a customer-facing VAT doc → there must be a VAT base).
   */
  mode?: TaxDocMode;
}

export type IssueShopTaxInvoiceResult =
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
 * Issue a ใบกำกับภาษี/ใบขน for ONE shop order. Idempotent on hno.
 */
export async function issueShopTaxInvoice(
  admin: Admin,
  opts: IssueShopTaxInvoiceOpts,
): Promise<IssueShopTaxInvoiceResult> {
  const hno = (opts.hno ?? "").trim();
  if (!opts.userid || !hno) {
    return { ok: false, error: "missing_userid_or_hno" };
  }

  // 1. Idempotency — hno already on a shop tax invoice?
  const { data: existing, error: existErr } = await admin
    .from("tb_shop_tax_invoice")
    .select("id, serial_no")
    .eq("hno", hno)
    .maybeSingle<{ id: number; serial_no: string | null }>();
  if (existErr && existErr.code !== "PGRST116") {
    logger.warn("shop-tax-invoice", "idempotency check failed (table missing?)", {
      code: existErr.code, message: existErr.message, userid: opts.userid, hno,
    });
    return { ok: false, error: `db_error:${existErr.code ?? "unknown"}` };
  }
  if (existing) {
    return { ok: false, error: "already_issued", alreadyIssued: true };
  }

  // 2. Read the shop order (same buckets the receipt sums) + ownership gate.
  type HoRow = {
    hno: string;
    userid: string;
    htotalpricechn: number | string | null;   // ค่าสินค้า (goods · THB)
    hshippingservice: number | string | null;  // ค่าบริการ Pacred (service)
    fshippingservice: number | string | null;  // service (alt bucket)
    hshippingchn: number | string | null;       // ค่าขนส่งในจีน (intl · zero-rated)
    hpriceupdate: number | string | null;        // price adjustment (service)
  };
  const { data: hoRow, error: hoErr } = await admin
    .from("tb_header_order")
    .select("hno, userid, htotalpricechn, hshippingservice, fshippingservice, hshippingchn, hpriceupdate")
    .eq("hno", hno)
    .eq("userid", opts.userid)
    .maybeSingle<HoRow>();
  if (hoErr && hoErr.code !== "PGRST116") {
    logger.warn("shop-tax-invoice", "tb_header_order read failed", {
      code: hoErr.code, message: hoErr.message, userid: opts.userid, hno,
    });
    return { ok: false, error: `db_error:${hoErr.code ?? "unknown"}` };
  }
  if (!hoRow) return { ok: false, error: "no_matching_shop_order" };

  // 3. Juristic identity + buyer snapshot (tb_corporate → tb_users).
  type CorpRow = { corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null };
  const { data: corpRow, error: corpErr } = await admin
    .from("tb_corporate")
    .select("corporatenumber, corporatename, corporateaddress")
    .eq("userid", opts.userid)
    .maybeSingle<CorpRow>();
  if (corpErr && corpErr.code !== "PGRST116") {
    logger.warn("shop-tax-invoice", "tb_corporate read failed", {
      code: corpErr.code, message: corpErr.message, userid: opts.userid,
    });
  }
  const isJuristic = !!corpRow?.corporatenumber;

  type UserRow = { userName: string | null; userLastName: string | null };
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userName, userLastName")
    .eq("userID", opts.userid)
    .maybeSingle<UserRow>();
  if (userErr) {
    logger.warn("shop-tax-invoice", "tb_users read failed", {
      code: userErr.code, message: userErr.message, userid: opts.userid,
    });
  }
  const buyerName = corpRow?.corporatename
    ?? `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim();
  const buyerTaxId = corpRow?.corporatenumber ?? "";
  const buyerAddress = corpRow?.corporateaddress ?? "";

  // 4. Map the shop buckets → generic taxable parts, then run the MODE-aware
  //    engine. Goods = htotalpricechn (the THB goods value · ใบกำกับ VAT base);
  //    service = ค่าบริการ Pacred + price-adjustment; intl transport = ค่าขนส่งในจีน
  //    (zero-rated). There is no domestic-transport line on a shop order's
  //    money model (the import leg is on the linked forwarder), so
  //    transportDomestic = 0.
  const goodsThb       = num(hoRow.htotalpricechn);
  const serviceThb     = num(hoRow.hshippingservice) + num(hoRow.fshippingservice) + num(hoRow.hpriceupdate);
  const transportIntl  = num(hoRow.hshippingchn);
  const parts: TaxableParts = {
    transportDomestic: 0,
    transportIntl,
    service:           serviceThb,
    rental:            0,
    goods:             goodsThb,
    discount:          0,
  };

  const rates = await getTaxRates();
  const mode: TaxDocMode = (opts.mode && opts.mode !== "none") ? opts.mode : "tax_invoice";
  const tax = computeTaxForMode(mode, parts, { isJuristic, rates });

  // 5. Mint the serial (best-effort — never block on it).
  let serialNo: string | null = null;
  try {
    serialNo = await mintTaxInvoiceDocNo(admin, { issueDate: new Date() });
  } catch (e) {
    logger.warn("shop-tax-invoice", "serial mint threw (non-fatal · leaving serial null)", {
      error: e instanceof Error ? e.message : String(e), hno,
    });
  }

  // 6. INSERT header.
  const insertHeader = {
    service_type:        "shop",
    serial_no:           serialNo,
    userid:              opts.userid,
    hno,
    payment_id:          null,
    receipt_id:          opts.receiptId ?? null,
    rid:                 opts.rid ?? null,
    doc_mode:            mode,
    bank_account_key:    resolvePaymentAccount({ issuesTaxInvoice: mode === "tax_invoice" }).key,
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
    // 23505 = the hno (or serial) raced another insert → treat as already-issued.
    if (hdrErr.code === "23505") {
      return { ok: false, error: "already_issued", alreadyIssued: true };
    }
    logger.warn("shop-tax-invoice", "header insert failed (migration 0152 applied?)", {
      code: hdrErr.code, message: hdrErr.message, userid: opts.userid, hno,
    });
    return { ok: false, error: `tax_invoice_insert:${hdrErr.code ?? "unknown"}` };
  }
  const invoiceId = hdr.id;

  // 7. INSERT the line item (one row per shop order).
  const { error: itemErr } = await admin
    .from("tb_shop_tax_invoice_item")
    .insert({
      invoice_id:         invoiceId,
      hno,
      payment_id:         null,
      goods_thb:          round2(goodsThb),
      service_thb:        round2(serviceThb),
      transport_thb:      0,
      transport_intl_thb: round2(transportIntl),
      discount_thb:       0,
    });
  if (itemErr) {
    logger.warn("shop-tax-invoice", "item insert failed — rolling back header", {
      code: itemErr.code, message: itemErr.message, invoiceId,
    });
    await admin.from("tb_shop_tax_invoice").delete().eq("id", invoiceId);
    return { ok: false, error: `tax_invoice_items_insert:${itemErr.code ?? "unknown"}` };
  }

  // 8. INSERT per-CLASS WHT entries (juristic only · non-zero classes).
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
        userid:         opts.userid,
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
        logger.warn("shop-tax-invoice", "WHT entries insert failed (non-fatal)", {
          code: whtErr.code, message: whtErr.message, invoiceId,
        });
      }
    }
  }

  // 9. Audit log (best-effort).
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    opts.issuedBy ?? "system-auto",
      action:      "shop_tax_invoice.issued",
      target_type: "tb_shop_tax_invoice",
      target_id:   String(invoiceId),
      payload: {
        userid:      opts.userid,
        hno,
        mode,
        is_juristic: isJuristic,
        base_total:  tax.base.total,
        vat:         tax.vat,
        wht_total:   tax.wht.total,
        net_payable: tax.netPayable,
        serial_no:   serialNo,
        rid:         opts.rid ?? null,
        receipt_id:  opts.receiptId ?? null,
      },
    });
  } catch (e) {
    logger.warn("shop-tax-invoice", "audit log insert failed (non-fatal)", {
      error: e instanceof Error ? e.message : String(e), invoiceId,
    });
  }

  return {
    ok: true,
    data: { invoiceId, serialNo, netPayable: tax.netPayable, vat: tax.vat, whtTotal: tax.wht.total },
  };
}

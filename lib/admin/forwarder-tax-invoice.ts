/**
 * lib/admin/forwarder-tax-invoice.ts
 *
 * P2 of the tax-billing-flow rebuild (เดฟ-agent · 2026-05-30).
 * Design: docs/research/tax-billing-flow-design-2026-05-30.md §3c.
 *
 * Bridges the per-line Thai tax engine (lib/tax/wht.ts) to the LIVE
 * tb_forwarder lane at payment-land. When an order's
 * `tb_forwarder.tax_doc_pref='tax_invoice'` (column from migration 0127),
 * this issues a ใบกำกับภาษี (VAT 7% · RD Code 86) and records per-CLASS
 * withholding-tax entries (transport 1% · service 3% · rental 5% · goods 0%).
 *
 * ── WHY A DEDICATED tb_* STORE (migration 0129), not the World-A tables ──
 *   The World-A `tax_invoices` (0034) + `withholding_tax_entries` (0044) are
 *   PROFILES-based: profile_id → profiles(id) NOT NULL, forwarder_f_no →
 *   forwarders(f_no) (the REBUILT near-empty table). withholding_tax_entries
 *   also enforces ONE row per order with a single wht_rate_pct.
 *   The live lane keys off tb_forwarder.id (bigint) + tb_users.userID (text)
 *   and most legacy customers have NO profiles row. AND the owner's per-line
 *   model needs transport-1% + service-3% + goods-0% co-existing on ONE order.
 *   → We CANNOT cleanly force tb_* data through the World-A FK/unique
 *     constraints. So this writes tb_*-native tables (migration 0129). The
 *     tax MATH is the shared engine. This is the "thin adapter, don't force
 *     it" the task asked for — flagged in the agent report.
 *
 * ── IDEMPOTENT + BEST-EFFORT ──
 *   - One invoice line per fid (tb_forwarder_tax_invoice_item.fid is unique) —
 *     re-issue for an already-invoiced fid returns alreadyIssued (no double).
 *   - If migration 0129 hasn't been applied yet, the INSERTs fail; we LOG +
 *     return ok:false WITHOUT throwing so the caller's receipt flow is never
 *     blocked (the receipt is the money-of-record; the tax invoice is a
 *     follow-on document).
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import type { ForwarderCharges, TaxableParts } from "@/lib/tax/wht";
import { computeTaxForMode, type TaxDocMode } from "@/lib/tax/tax-doc-mode";
import { getTaxRates } from "@/lib/tax/rates";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createAdminClient>;

export interface IssueForwarderTaxInvoiceOpts {
  /** tb_users.userID of the customer. */
  userid: string;
  /** tb_forwarder.id rows this tax invoice covers (all owned by userid). */
  fids: number[];
  /** The tb_receipt.id this invoice is issued alongside (auto-receipt path). */
  receiptId?: number | null;
  /** The tb_receipt.rid mirror (for joins / printing). */
  rid?: string | null;
  /** A pre-minted serial (optional). Null → left blank for later assignment. */
  serialNo?: string | null;
  /** Who issued — adminID or 'system-auto'. */
  issuedBy?: string;
  /**
   * The document mode (Lane B — lib/tax/tax-doc-mode.ts). Controls the VAT-7%
   * base: 'tax_invoice' (ใบกำกับ) = VAT on the full vatable base (goods +
   * domestic transport + service; intl leg zero-rated); 'customs' (ใบขน) =
   * VAT on the SERVICE FEE only (goods excluded). Defaults to 'tax_invoice'
   * to preserve the pre-3-mode behaviour. (A forwarder bill has no goods line
   * — goods=0 either way — so for pure forwarders the two modes coincide on
   * VAT; the mode still drives which RD document is issued + reported.)
   */
  mode?: TaxDocMode;
}

export type IssueForwarderTaxInvoiceResult =
  | { ok: true; data: { invoiceId: number; netPayable: number; vat: number; whtTotal: number } }
  | { ok: false; error: string; alreadyIssued?: boolean };

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
};
const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Issue a ใบกำกับภาษี for a batch of tb_forwarder rows (one customer).
 * Computes the aggregate per-line tax over all covered rows via the engine.
 *
 * Caller (auto-issue-receipt) decides WHETHER to call this (based on
 * tax_doc_pref); this function does the compute + persist.
 */
export async function issueForwarderTaxInvoice(
  admin: Admin,
  opts: IssueForwarderTaxInvoiceOpts,
): Promise<IssueForwarderTaxInvoiceResult> {
  if (!opts.userid || opts.fids.length === 0) {
    return { ok: false, error: "missing_userid_or_fids" };
  }
  const fids = Array.from(new Set(opts.fids));

  // 1. Idempotency — any of these fids already on a tax invoice line?
  const { data: existingItems, error: existErr } = await admin
    .from("tb_forwarder_tax_invoice_item")
    .select("fid")
    .in("fid", fids);
  if (existErr) {
    // Table missing (migration 0129 not applied) OR transient — log + bail,
    // never throw. The receipt flow proceeds regardless.
    logger.warn("forwarder-tax-invoice", "item idempotency check failed (table missing?)", {
      code: existErr.code, message: existErr.message, userid: opts.userid, fids,
    });
    return { ok: false, error: `db_error:${existErr.code ?? "unknown"}` };
  }
  if ((existingItems ?? []).length > 0) {
    return { ok: false, error: "already_issued", alreadyIssued: true };
  }

  // 2. Read the forwarder rows (same buckets the receipt sums).
  type FwRow = ForwarderCharges & { id: number; userid: string };
  const { data: fwRows, error: fwErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, ftotalprice, ftransportprice, ftransportpricechnthb, " +
      "fshippingservice, pricecrate, fpriceupdate, priceother, fdiscount",
    )
    .in("id", fids)
    .eq("userid", opts.userid);
  if (fwErr) {
    logger.warn("forwarder-tax-invoice", "tb_forwarder read failed", {
      code: fwErr.code, message: fwErr.message, userid: opts.userid, fids,
    });
    return { ok: false, error: `db_error:${fwErr.code ?? "unknown"}` };
  }
  const rows = (fwRows ?? []) as unknown as FwRow[];
  if (rows.length === 0) return { ok: false, error: "no_matching_forwarder_rows" };

  // 3. Juristic identity + buyer snapshot (tb_corporate → tb_users). Mirrors
  //    auto-issue-receipt's corporate detection (legacy functions.php L427-456).
  type CorpRow = { corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null };
  const { data: corpRow, error: corpErr } = await admin
    .from("tb_corporate")
    .select("corporatenumber, corporatename, corporateaddress")
    .eq("userid", opts.userid)
    .maybeSingle<CorpRow>();
  if (corpErr && corpErr.code !== "PGRST116") {
    logger.warn("forwarder-tax-invoice", "tb_corporate read failed", {
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
    logger.warn("forwarder-tax-invoice", "tb_users read failed", {
      code: userErr.code, message: userErr.message, userid: opts.userid,
    });
  }
  const buyerName = corpRow?.corporatename
    ?? `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim();
  const buyerTaxId = corpRow?.corporatenumber ?? "";
  const buyerAddress = corpRow?.corporateaddress ?? "";

  // 4. Aggregate charges across all covered rows → ONE engine call. The engine
  //    classifies each bucket (transport 1% · service 3% · goods 0% · intl
  //    VAT-0%) + applies VAT 7% on the vatable base.
  const agg: ForwarderCharges = {
    ftotalprice:           rows.reduce((s, r) => s + num(r.ftotalprice), 0),
    ftransportprice:       rows.reduce((s, r) => s + num(r.ftransportprice), 0),
    ftransportpricechnthb: rows.reduce((s, r) => s + num(r.ftransportpricechnthb), 0),
    fshippingservice:      rows.reduce((s, r) => s + num(r.fshippingservice), 0),
    pricecrate:            rows.reduce((s, r) => s + num(r.pricecrate), 0),
    fpriceupdate:          rows.reduce((s, r) => s + num(r.fpriceupdate), 0),
    priceother:            rows.reduce((s, r) => s + num(r.priceother), 0),
    fdiscount:             rows.reduce((s, r) => s + num(r.fdiscount), 0),
  };

  const rates = await getTaxRates();
  const mode: TaxDocMode = opts.mode ?? "tax_invoice";
  // Map the forwarder buckets → generic taxable parts (same classification
  // computeForwarderTax does internally), then run the MODE-aware engine so
  // 'customs' (ใบขน) charges VAT on the service fee only. A forwarder bill has
  // no goods line (goods=0), so for pure forwarders ใบกำกับ vs ใบขน differ only
  // by the document type, not the VAT amount — but routing through
  // computeTaxForMode keeps the behaviour correct if a goods bucket is ever
  // added to forwarder bills.
  const parts: TaxableParts = {
    transportDomestic: num(agg.ftransportprice),
    transportIntl:     num(agg.ftotalprice) + num(agg.ftransportpricechnthb),
    service:           num(agg.fshippingservice) + num(agg.pricecrate) + num(agg.fpriceupdate) + num(agg.priceother),
    rental:            0,
    goods:             0,
    discount:          num(agg.fdiscount),
  };
  // (For the default 'tax_invoice' mode this is identical to the previous
  //  computeForwarderTax(agg, {withVat:true}) — same classification + base.)
  const tax = computeTaxForMode(mode, parts, { isJuristic, rates });

  // 5. INSERT header.
  const insertHeader = {
    serial_no:           opts.serialNo ?? null,
    userid:              opts.userid,
    receipt_id:          opts.receiptId ?? null,
    rid:                 opts.rid ?? null,
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
    .from("tb_forwarder_tax_invoice")
    .insert(insertHeader)
    .select("id")
    .single<{ id: number }>();
  if (hdrErr) {
    logger.warn("forwarder-tax-invoice", "header insert failed (migration 0129 applied?)", {
      code: hdrErr.code, message: hdrErr.message, userid: opts.userid,
    });
    return { ok: false, error: `tax_invoice_insert:${hdrErr.code ?? "unknown"}` };
  }
  const invoiceId = hdr.id;

  // 6. INSERT line items (one per fid).
  const itemRows = rows.map((r) => ({
    invoice_id:            invoiceId,
    fid:                   r.id,
    ftotalprice:           num(r.ftotalprice),
    ftransportprice:       num(r.ftransportprice),
    ftransportpricechnthb: num(r.ftransportpricechnthb),
    fshippingservice:      num(r.fshippingservice),
    pricecrate:            num(r.pricecrate),
    priceother:            num(r.priceother),
    fpriceupdate:          num(r.fpriceupdate),
    fdiscount:             num(r.fdiscount),
  }));
  const { error: itemErr } = await admin
    .from("tb_forwarder_tax_invoice_item")
    .insert(itemRows);
  if (itemErr) {
    // Roll back the orphan header to keep the store clean.
    logger.warn("forwarder-tax-invoice", "item insert failed — rolling back header", {
      code: itemErr.code, message: itemErr.message, invoiceId,
    });
    await admin.from("tb_forwarder_tax_invoice").delete().eq("id", invoiceId);
    return { ok: false, error: `tax_invoice_items_insert:${itemErr.code ?? "unknown"}` };
  }

  // 7. INSERT per-CLASS WHT entries (only the classes with a non-zero base,
  //    and only when juristic — non-juristic withholds nothing). One row per
  //    class · the World-A single-rate table can't do this.
  if (isJuristic) {
    const whtRows = [
      { wht_class: "transport", base: tax.base.transport, rate: rates.transportPct, amt: tax.wht.transport },
      { wht_class: "service",   base: tax.base.service,   rate: rates.servicePct,   amt: tax.wht.service },
      { wht_class: "rental",    base: tax.base.rental,    rate: rates.rentalPct,    amt: tax.wht.rental },
      { wht_class: "goods",     base: tax.base.goods,     rate: rates.goodsPct,     amt: tax.wht.goods },
    ]
      // Skip classes with no base AND no withheld amount (keeps the table tidy;
      // goods at 0% with a base is still skipped — nothing to chase a cert for).
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
        .from("tb_forwarder_wht_entry")
        .insert(whtRows);
      if (whtErr) {
        // Non-fatal — the invoice + items are committed. Log so accounting can
        // backfill the WHT rows manually if needed.
        logger.warn("forwarder-tax-invoice", "WHT entries insert failed (non-fatal)", {
          code: whtErr.code, message: whtErr.message, invoiceId,
        });
      }
    }
  }

  // 8. Audit log (best-effort).
  try {
    await admin.from("admin_audit_log").insert({
      admin_id:    opts.issuedBy ?? "system-auto",
      action:      "forwarder_tax_invoice.issued",
      target_type: "tb_forwarder_tax_invoice",
      target_id:   String(invoiceId),
      payload: {
        userid:       opts.userid,
        fids:         rows.map((r) => r.id),
        is_juristic:  isJuristic,
        base_total:   tax.base.total,
        vat:          tax.vat,
        wht_total:    tax.wht.total,
        net_payable:  tax.netPayable,
        rid:          opts.rid ?? null,
        receipt_id:   opts.receiptId ?? null,
      },
    });
  } catch (e) {
    logger.warn("forwarder-tax-invoice", "audit log insert failed (non-fatal)", {
      error: e instanceof Error ? e.message : String(e), invoiceId,
    });
  }

  return {
    ok: true,
    data: { invoiceId, netPayable: tax.netPayable, vat: tax.vat, whtTotal: tax.wht.total },
  };
}

/**
 * /admin/wallet/pay-user/summary — printable "ใบแจ้งหนี้"
 * (payment-summary sheet). Faithful port of the legacy `exampleSummaryF.php`.
 *
 * READ-ONLY: this route only reads tb_forwarder / tb_users / tb_corporate /
 * tb_address and renders a print-CSS A4 document. It writes NOTHING.
 *
 * Route contract:
 *   /admin/wallet/pay-user/summary?fID=1,2,3&rDate=<iso>&rID=<optional>
 *     - fID   (required) — comma list of tb_forwarder.id. Empty/invalid → friendly "ไม่พบรายการ".
 *     - rDate (optional) — issue date, default now → displayed dd/mm/YYYY (Gregorian, per legacy d/m/Y).
 *     - rID   (optional) — doc number; "-" when absent.
 *
 * Money model (matches legacy): the GRAND total sums a per-row composite
 *   (ftotalprice + ftransportprice + fpriceupdate + fshippingservice +
 *    ftransportpricechnthb + pricecrate + priceother) − fdiscount
 * → totalPriceAll. WHT 1% applies only when the customer is นิติบุคคล AND
 * totalPriceAll ≥ 1000. Column 11 of the table shows fTotalPrice ONLY.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeForwarderDebitBatch, type ForwarderDebitRow } from "@/lib/forwarder/forwarder-debit-total";
import { resolveMaoAnchorIds } from "@/lib/forwarder/mao-anchor";
import { resolveDimsDisplay, type BoxDimInput } from "@/lib/forwarder/resolve-box-dims";
import { computeBillWht } from "@/lib/billing/wht";
import { loadCustomerBillingParty } from "@/lib/admin/customer-billing-party";
// ⚠️ MONEY-ROUTING: buildCompactPaymentQrDataUrl = the SAME QR the PayModal serves
// via getDepositQr → the static K-Shop QR for LOGISTICS 225-2-91144-0, which is the
// account this paper prints (serviceAccountFor("import_cargo")) — just cropped to
// the code alone so it stays scannable in a small printed box. NOT the SERVICE
// helper — that one points at 204-1-55856-6 (owner 2026-07-21).
import { buildCompactPaymentQrDataUrl } from "@/lib/promptpay";
import { PrintButton } from "./print-button";
import { PaymentSummaryDoc, type SummaryRow } from "./summary-doc";

export const dynamic = "force-dynamic";

/** Defensive string/number → number (never NaN). */
function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

/** Parse "1,2,3" → [1,2,3], dropping blanks + non-numeric, preserving order. */
function parseFidList(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** dd/mm/YYYY (Gregorian) to match legacy d/m/Y. Falls back to today on bad input. */
function formatDmY(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const dt = Number.isNaN(d.getTime()) ? new Date() : d;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const TRANSPORT_LABEL: Record<string, string> = { "1": "รถ", "2": "เรือ" };
const CITY_LABEL: Record<string, string> = { "1": "กวางโจว", "2": "อี้อู" };
const PRODUCT_TYPE_LABEL: Record<string, string> = {
  "1": "ทั่วไป",
  "2": "มอก.",
  "3": "อย.",
  "4": "พิเศษ",
};

type FwRow = {
  id: number;
  paymethod: string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  ftransportpricechnthb: number | string | null;
  pricecrate: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fshipby: string | null;
  famount: number | string | null;
  fvolume: number | string | null;
  fweight: number | string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  userid: string | null;
  fproductstype: string | null;
  fwarehousechina: string | null;
  ftransporttype: string | null;
  frefrate: number | string | null;
};

export default async function PaymentSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ fID?: string; rDate?: string; rID?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;

  const fids = parseFidList(sp.fID);
  const docNo = sp.rID?.trim() ? sp.rID.trim() : "-";
  const dateDisplay = formatDmY(sp.rDate);

  // Empty / missing / all-invalid fID → friendly empty doc (not a crash).
  if (fids.length === 0) {
    return (
      <>
        <title>ใบแจ้งหนี้ | PR Admin</title>
        <div className="no-print bg-gray-100 p-4 text-center print:hidden">
          <PrintButton />
        </div>
        <PaymentSummaryDoc
          docNo={docNo}
          dateDisplay={dateDisplay}
          customerName=""
          customerTaxId="-"
          customerAddress=""
          isJuristic={false}
          rows={[]}
          totalPriceAll={0}
          sumTotal={0}
          sumDeliveryChn={0}
          sumDeliveryTh={0}
          sumMaoFee={0}
          sumOther={0}
          sumDiscount={0}
          whtAmount={0}
          totalAmount={0}
        />
      </>
    );
  }

  const admin = createAdminClient();

  // 1. Forwarder rows.
  const { data: fwData, error: fwErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, paymethod, fpriceupdate, fshippingservice, ftransportpricechnthb, pricecrate, priceother, fdiscount, ftotalprice, ftransportprice, fshipby, famount, fvolume, fweight, ftrackingchn, fcabinetnumber, fwidth, flength, fheight, userid, fproductstype, fwarehousechina, ftransporttype, frefrate",
    )
    .in("id", fids);
  if (fwErr) {
    console.error("[pay-user/summary: tb_forwarder read] failed", {
      code: fwErr.code, message: fwErr.message, fids,
    });
    throw new Error("โหลดรายการฝากนำเข้าไม่สำเร็จ");
  }

  const fetched = (fwData ?? []) as unknown as FwRow[];
  // Keep the caller's fID order (the .in() result order is not guaranteed).
  const byId = new Map<number, FwRow>();
  for (const r of fetched) byId.set(r.id, r);
  const rowsFw = fids.map((id) => byId.get(id)).filter((r): r is FwRow => Boolean(r));

  if (rowsFw.length === 0) {
    return (
      <>
        <title>ใบแจ้งหนี้ | PR Admin</title>
        <div className="no-print bg-gray-100 p-4 text-center print:hidden">
          <PrintButton />
        </div>
        <PaymentSummaryDoc
          docNo={docNo}
          dateDisplay={dateDisplay}
          customerName=""
          customerTaxId="-"
          customerAddress=""
          isJuristic={false}
          rows={[]}
          totalPriceAll={0}
          sumTotal={0}
          sumDeliveryChn={0}
          sumDeliveryTh={0}
          sumMaoFee={0}
          sumOther={0}
          sumDiscount={0}
          whtAmount={0}
          totalAmount={0}
        />
      </>
    );
  }

  // 2. Customer header — via the SHARED party resolver
  //    (lib/admin/customer-billing-party). This was ~90 lines of inline
  //    tb_corporate → resolveBillingIdentity → tb_address_main → tb_address
  //    fallback; that exact logic MOVED into the resolver so this paper and the
  //    PayModal's ผู้รับใบแจ้งหนี้ block resolve the customer identically and can
  //    never drift (owner 2026-07-21 — the modal had been showing a hardcoded
  //    "—" for เลขที่ภาษี/ที่อยู่ while this paper resolved them properly).
  const userid = rowsFw[0].userid ?? "";
  const party = userid ? await loadCustomerBillingParty(admin, userid) : null;

  // ⚠️ MONEY — reCorporate is UNCHANGED: still resolveBillingIdentity's juristic
  // UNION (userCompany==='1' OR a corp tax-id), which the resolver computes from
  // the same inputs as before. It feeds computeForwarderDebitBatch({isCorporate})
  // + computeBillWht below, so it must stay the union, not the narrow test.
  const reCorporate = party?.isJuristic ?? false;
  const customerName = party?.name ?? "";
  const customerTaxId = party?.taxId || "-";
  const customerAddress = party?.address ?? "";

  // 2.5 ขนาดกล่อง (ก×ย×ส) fallback via momo_box_detail (owner 2026-07-23) — a
  // MULTI-BOX MOMO row leaves ก×ย×ส BLANK on its aggregate row on purpose (its boxes
  // differ in size · propagate-live-data.ts), and a single-box row can be blank
  // before Live propagates — the real per-box dims live in momo_box_detail. Best-
  // effort ENRICHMENT: load the per-box dims for the rows that carry NO own dim so
  // the printed ขนาด column shows the real sizes instead of "—". A lookup failure
  // must NEVER break the invoice → degrade to no-detail (→ "—", same as before).
  const baseOfTracking = (t: string) => (t ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
  const blankDimBases = Array.from(
    new Set(
      rowsFw
        .filter((r) => !(num(r.fwidth) > 0) && !(num(r.flength) > 0) && !(num(r.fheight) > 0))
        .map((r) => baseOfTracking(r.ftrackingchn ?? ""))
        .filter((b) => b.length > 0),
    ),
  );
  const boxDimsByBase = new Map<string, BoxDimInput[]>();
  if (blankDimBases.length > 0) {
    const { data: bdData, error: bdErr } = await admin
      .from("momo_box_detail")
      .select("base_tracking, width, length, height, quantity")
      .in("base_tracking", blankDimBases)
      .limit(50_000);
    if (bdErr) {
      console.error("[pay-user/summary: momo_box_detail dims] failed (degrading to '—')", {
        code: bdErr.code, message: bdErr.message,
      });
    } else {
      for (const b of (bdData ?? []) as unknown as Array<{
        base_tracking: string | null;
        width: number | string | null;
        length: number | string | null;
        height: number | string | null;
        quantity: number | string | null;
      }>) {
        const base = (b.base_tracking ?? "").trim();
        if (!base) continue;
        const box: BoxDimInput = {
          width: num(b.width),
          length: num(b.length),
          height: num(b.height),
          quantity: num(b.quantity),
        };
        const arr = boxDimsByBase.get(base);
        if (arr) arr.push(box);
        else boxDimsByBase.set(base, [box]);
      }
    }
  }

  // 3. Build display rows + grand-total buckets.
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  // เหมาๆ ต้อง elect anchor PER SHIPMENT เหมือน PayModal (pay-user-view.ts:348) — ไม่งั้น
  // maoFee=0 → ใบพิมพ์เก็บเงินขาด ฿100 เทียบ modal (owner 2026-07-22 · MONEY).
  const maoAnchorIds = await resolveMaoAnchorIds(admin, rowsFw.map((r) => r.ftrackingchn));
  const batch = computeForwarderDebitBatch(rowsFw as unknown as ForwarderDebitRow[], {
    userId: userid,
    isCorporate: reCorporate,
    maoAnchorIds,
  });
  // per-row "อื่นๆ" — the SAME breakdown.otherCharges the PayModal shows, so the
  // on-screen invoice table + this printed sheet quote one identical column.
  const otherById = new Map(batch.lines.map((l) => [String(l.id), round2(l.breakdown.otherCharges)]));
  const rows: SummaryRow[] = rowsFw.map((r, idx) => ({
    no: idx + 1,
    orderNo: String(r.id),
    tracking: (r.ftrackingchn ?? "").slice(0, 30),
    cabinet: (r.fcabinetnumber ?? "").trim(),
    transport: TRANSPORT_LABEL[String(r.ftransporttype ?? "")] ?? "-",
    fromCity: CITY_LABEL[String(r.fwarehousechina ?? "")] ?? "-",
    boxes: num(r.famount),
    weight: num(r.fweight),
    volume: num(r.fvolume),
    // ก×ย×ส — own dim, else the real per-box sizes from momo_box_detail, else "—"
    // (multi-box MOMO rows carry blank ก×ย×ส on the aggregate). SOT resolveDimsDisplay.
    dimsDisplay: resolveDimsDisplay({
      fwidth: num(r.fwidth),
      flength: num(r.flength),
      fheight: num(r.fheight),
      boxDims: boxDimsByBase.get(baseOfTracking(r.ftrackingchn ?? "")),
    }),
    productType: PRODUCT_TYPE_LABEL[String(r.fproductstype ?? "")] ?? "-",
    rate: num(r.frefrate),
    amount: num(r.ftotalprice),
    otherCharges: otherById.get(String(r.id)) ?? 0,
  }));

  // ⚠️ SINGLE SOURCE OF TRUTH — the ยอดที่ต้องชำระ + ค่าส่งเหมาๆ + หัก ณ ที่จ่าย on THIS
  // customer-facing PDF derive from the SAME SOTs as the ใบวางบิล + ใบเสร็จ:
  //   • gross + เหมาๆ  → computeForwarderDebitBatch breakdown (the mao/pricing SOT · owner
  //                       2026-07-15 · เหมาๆ ฿100 is a VIRTUAL flat fee, NOT a stored column)
  //   • WHT + net      → computeBillWht (the bill/receipt WHT SOT · F4 · single 1% of the
  //                       grand total when juristic · owner 2026-07-22 no ฿1,000 minimum).
  //                       The old per-row Σ 1% drifted by satang on multi-row juristic
  //                       bills → now all three docs match. This is a live pay preview
  //                       (no paidAt) → new rule.
  //   • COD (F1)       → a ปลายทาง row's domestic leg is excluded from the gross (the batch
  //                       is COD-aware via paymethod) so the PDF == the actual charge.
  const maoFeeTotal = round2(batch.lines.reduce((s, l) => s + l.breakdown.maoFee, 0));
  // GROSS (pre-WHT) from the SOT breakdown — freight + otherCharges (COD-aware · F1) + เหมาๆ − ส่วนลด.
  const totalPriceAll = round2(
    batch.lines.reduce(
      (s, l) => s + l.breakdown.freight + l.breakdown.otherCharges + l.breakdown.maoFee - l.breakdown.discount,
      0,
    ),
  );
  const wht = computeBillWht(reCorporate, totalPriceAll);
  const whtAmount = wht.wht_amount;
  const totalAmount = wht.net_payable;   // net = what the customer pays

  // QR ชำระเงิน — amount = the NET the customer actually transfers (same figure as
  // "ยอดที่ต้องชำระ" on the paper). Best-effort: a QR failure must never break the
  // document, so degrade to "" → the doc omits the QR and the bank-account text
  // beside it still carries the payment info.
  let payQrDataUrl = "";
  try {
    payQrDataUrl = await buildCompactPaymentQrDataUrl(totalAmount);
  } catch (e) {
    console.error("[pay-user/summary: payment QR] failed (degrading to bank text)", e);
  }

  const sumTotal = rowsFw.reduce((s, r) => s + num(r.ftotalprice), 0);
  const sumDeliveryChn = rowsFw.reduce((s, r) => s + num(r.ftransportpricechnthb), 0);
  // ค่าส่งในไทย: a COD (ปลายทาง · paymethod='2') row's ftransportprice is collected at the door by
  // the courier → excluded (F1), matching the COD-aware gross above. ค่าส่งเหมาๆ แยกเป็น sumMaoFee
  // (บรรทัด "ค่าส่งเหมาๆ" ของตัวเองในสรุป · ตรงกับ PayModal · owner 2026-07-22).
  const sumDeliveryTh = round2(
    rowsFw.reduce((s, r) => s + (num(r.paymethod) === 2 ? 0 : num(r.ftransportprice)), 0),
  );
  const sumOther = rowsFw.reduce(
    (s, r) => s + num(r.fpriceupdate) + num(r.fshippingservice) + num(r.pricecrate) + num(r.priceother),
    0,
  );
  const sumDiscount = rowsFw.reduce((s, r) => s + num(r.fdiscount), 0);

  return (
    <>
      <title>{`ใบแจ้งหนี้ ${docNo} | PR Admin`}</title>

      <div className="no-print bg-gray-100 p-4 text-center print:hidden">
        <PrintButton />
        <span className="ml-3 text-xs text-gray-600">
          กดปุ่ม &quot;พิมพ์&quot; หรือ Cmd+P / Ctrl+P — เลือกขนาด A4 portrait
        </span>
      </div>

      <PaymentSummaryDoc
        docNo={docNo}
        dateDisplay={dateDisplay}
        customerName={customerName}
        customerTaxId={customerTaxId}
        customerAddress={customerAddress}
        isJuristic={reCorporate}
        rows={rows}
        totalPriceAll={totalPriceAll}
        sumTotal={sumTotal}
        sumDeliveryChn={sumDeliveryChn}
        sumDeliveryTh={sumDeliveryTh}
        sumMaoFee={maoFeeTotal}
        sumOther={sumOther}
        sumDiscount={sumDiscount}
        whtAmount={whtAmount}
        totalAmount={totalAmount}
        payQrDataUrl={payQrDataUrl}
      />
    </>
  );
}

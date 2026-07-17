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
import { computeBillWht } from "@/lib/billing/wht";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
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
      "id, paymethod, fpriceupdate, fshippingservice, ftransportpricechnthb, pricecrate, priceother, fdiscount, ftotalprice, ftransportprice, fshipby, famount, fvolume, fweight, ftrackingchn, userid, fproductstype, fwarehousechina, ftransporttype, frefrate",
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
          sumOther={0}
          sumDiscount={0}
          whtAmount={0}
          totalAmount={0}
        />
      </>
    );
  }

  // 2. Customer header — from rows[0].userid.
  const userid = rowsFw[0].userid ?? "";

  type CorpRow = { corporatename: string | null; corporatenumber: string | null; corporateaddress: string | null };
  let corp: CorpRow | null = null;
  type UserRow = { userID: string; userName: string | null; userLastName: string | null; userCompany: string | number | null };
  let userRow: UserRow | null = null;

  if (userid) {
    const { data: corpData, error: corpErr } = await admin
      .from("tb_corporate")
      .select("corporatename, corporatenumber, corporateaddress")
      .eq("userid", userid)
      .maybeSingle<CorpRow>();
    if (corpErr && corpErr.code !== "PGRST116") {
      console.error("[pay-user/summary: tb_corporate read] failed", {
        code: corpErr.code, message: corpErr.message, userid,
      });
    }
    corp = corpData ?? null;

    const { data: uData, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany")
      .eq("userID", userid)
      .maybeSingle<UserRow>();
    if (uErr && uErr.code !== "PGRST116") {
      console.error("[pay-user/summary: tb_users read] failed", {
        code: uErr.code, message: uErr.message, userid,
      });
    }
    userRow = uData ?? null;
  }

  // name + juristic flag — via the billing-identity SOT (F5 + F6 · 2026-07-15). The old
  // block keyed juristic ONLY on corporatename presence (missing ~few migrated นิติบุคคล
  // that carry userCompany='1' with a blank corp name/number) AND prepended the PR code to
  // the name. resolveBillingIdentity is the union rule (userCompany==='1' OR a corp tax-id)
  // + a bare name (no PR prefix) — so this ใบสรุป classifies + names the customer EXACTLY
  // like the ใบวางบิล (billing-run-paper) + ใบเสร็จ (load-receipt-document). The PR code
  // stays in the อ้างอิง/order column of the table, not the identity line (owner 2026-07-10).
  const identity = resolveBillingIdentity({
    userCompany: userRow?.userCompany != null ? String(userRow.userCompany) : null,
    userName: userRow?.userName ?? null,
    userLastName: userRow?.userLastName ?? null,
    corp,
  });
  const reCorporate = identity.isJuristic;
  const customerName = identity.name;
  const customerTaxId = identity.taxId || "-";

  // address — corporate address, else fall back to the customer's main address.
  let customerAddress = corp?.corporateaddress || "";
  if (!customerAddress && userid) {
    const { data: addrMain, error: amErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", userid)
      .maybeSingle<{ addressid: number | null }>();
    if (amErr && amErr.code !== "PGRST116") {
      console.error("[pay-user/summary: tb_address_main read] failed", {
        code: amErr.code, message: amErr.message, userid,
      });
    }
    if (addrMain?.addressid) {
      const { data: addr, error: aErr } = await admin
        .from("tb_address")
        .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
        .eq("addressid", addrMain.addressid)
        .maybeSingle<{
          addressno: string | null;
          addresssubdistrict: string | null;
          addressdistrict: string | null;
          addressprovince: string | null;
          addresszipcode: string | null;
        }>();
      if (aErr && aErr.code !== "PGRST116") {
        console.error("[pay-user/summary: tb_address read] failed", {
          code: aErr.code, message: aErr.message, userid,
        });
      }
      if (addr) {
        customerAddress = [
          addr.addressno ?? "",
          addr.addresssubdistrict ? `ตำบล/แขวง ${addr.addresssubdistrict}` : "",
          addr.addressdistrict ? `อำเภอ/เขต ${addr.addressdistrict}` : "",
          addr.addressprovince ? `จังหวัด ${addr.addressprovince}` : "",
          addr.addresszipcode ?? "",
        ]
          .filter((s) => s && String(s).trim().length > 0)
          .join(" ")
          .trim();
      }
    }
  }

  // 3. Build display rows + grand-total buckets.
  const rows: SummaryRow[] = rowsFw.map((r, idx) => ({
    no: idx + 1,
    orderNo: String(r.id),
    tracking: (r.ftrackingchn ?? "").slice(0, 30),
    transport: TRANSPORT_LABEL[String(r.ftransporttype ?? "")] ?? "-",
    fromCity: CITY_LABEL[String(r.fwarehousechina ?? "")] ?? "-",
    boxes: num(r.famount),
    weight: num(r.fweight),
    volume: num(r.fvolume),
    productType: PRODUCT_TYPE_LABEL[String(r.fproductstype ?? "")] ?? "-",
    rate: num(r.frefrate),
    amount: num(r.ftotalprice),
  }));

  // ⚠️ SINGLE SOURCE OF TRUTH — the ยอดที่ต้องชำระ + ค่าส่งเหมาๆ + หัก ณ ที่จ่าย on THIS
  // customer-facing PDF derive from the SAME SOTs as the ใบวางบิล + ใบเสร็จ:
  //   • gross + เหมาๆ  → computeForwarderDebitBatch breakdown (the mao/pricing SOT · owner
  //                       2026-07-15 · เหมาๆ ฿100 is a VIRTUAL flat fee, NOT a stored column)
  //   • WHT + net      → computeBillWht (the bill/receipt WHT SOT · F4 · single 1% of the
  //                       grand total when juristic & ≥ ฿1,000). The old per-row Σ 1% drifted
  //                       by satang on multi-row juristic bills → now all three docs match.
  //   • COD (F1)       → a ปลายทาง row's domestic leg is excluded from the gross (the batch
  //                       is COD-aware via paymethod) so the PDF == the actual charge.
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const batch = computeForwarderDebitBatch(rowsFw as unknown as ForwarderDebitRow[], {
    userId: userid,
    isCorporate: reCorporate,
  });
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

  const sumTotal = rowsFw.reduce((s, r) => s + num(r.ftotalprice), 0);
  const sumDeliveryChn = rowsFw.reduce((s, r) => s + num(r.ftransportpricechnthb), 0);
  // ค่าส่งในไทย: a COD (ปลายทาง · paymethod='2') row's ftransportprice is collected at the door by
  // the courier → excluded (F1), matching the COD-aware gross above. + ค่าส่งเหมาๆ ฿100 folded here
  // so the Delivery-TH line shows it → Total + CHN + TH + Other − Discount − WHT reconciles to Total Amount.
  const sumDeliveryTh = round2(
    rowsFw.reduce((s, r) => s + (num(r.paymethod) === 2 ? 0 : num(r.ftransportprice)), 0) + maoFeeTotal,
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
        sumOther={sumOther}
        sumDiscount={sumDiscount}
        whtAmount={whtAmount}
        totalAmount={totalAmount}
      />
    </>
  );
}

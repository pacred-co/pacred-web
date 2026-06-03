/**
 * Admin > "ใบเสร็จรับเงิน" — print page (FAITHFUL PORT)
 *
 * Wave 29 P0 #3 · 2026-05-29.
 *
 * Replaces the prior generic "พิมพ์ใบแจ้งหนี้" surface with a 1:1 port of
 * legacy `pcs-admin/printReceipt.php` (the mPDF receipt). Two pages render:
 *   - Page 1 = ต้นฉบับ (Original)
 *   - Page 2 = สำเนา (Copy)
 * Per legacy convention. Browser `window.print()` produces both pages in
 * one go via CSS `page-break-after: always`.
 *
 * Workflow stolen from legacy printReceipt.php, polished with Tailwind chrome
 * (AGENTS.md §0a — workflow logic faithful · UI is our design). Element-by-
 * element parity with the PHP HTML table:
 *
 *   ✅ Pacred logo (top-left band)
 *   ✅ บริษัท แพคเรด (ประเทศไทย) จำกัด + Pacred (Thailand) Co., Ltd.
 *   ✅ ใบเสร็จรับเงิน (#8BC34A green)
 *   ✅ (ไม่ใช่ใบกำกับภาษี) red — mandatory disclaimer per Thai tax rules
 *   ✅ เลขที่ {rid}
 *   ✅ ต้นฉบับ / สำเนา stamp top-right per page
 *   ✅ Issuer block (Pacred · TaxID + address · tel — from components/seo/site.ts)
 *   ✅ Customer block (name + corporateNumber + corporateAddress)
 *   ✅ 7-col items table (ลำดับ · เลขที่ออเดอร์ · Tracking · กล่อง · น้ำหนัก · ปริมาตร · จำนวนเงิน)
 *   ✅ Footer summary 6-line (Total · Delivery CHN · Delivery TH · Other · Discount · WHT 1% conditional)
 *   ✅ WHT 1% — auto-shown only if isCorporate AND totalbeforewithholding ≥ 1000
 *      (legacy `printReceipt.php:385-399` logic)
 *   ✅ Thai-word grand total — readThaiBaht()
 *   ✅ 4 signature boxes (ผู้ออก · ผู้อนุมัติ · ตราประทับ + sin-wandee.jpg · ผู้รับ)
 *   ✅ On print: flip tb_receipt.statusprint='1' + stamp adminidprint + rdateprint
 *
 * BRANDING (2026-06-01 · owner GO/NO-GO = GO): the receipt issuer is now
 * Pacred (Thailand) Co., Ltd. — name / TaxID / address / phone / bank all
 * pulled from components/seo/site.ts (the single source of truth, AGENTS.md
 * §7). The legacy PCS Cargo issuer identity + the 2025-03-20 PCS address
 * cutover were retired. Doc-number format (FRC/FRG), WHT 1% logic, and the
 * 2-page ต้นฉบับ/สำเนา layout are unchanged — only the issuer identity swapped.
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readThaiBaht } from "@/lib/utils/thai-number";
import {
  SITE_LEGAL_NAME_TH,
  SITE_LEGAL_NAME,
  TAX_ID,
  CONTACT,
  ADDRESSES,
  BANK,
} from "@/components/seo/site";
import { Printer } from "lucide-react";
import PrintButton from "./print-button";
import BackfillItemsButton from "./backfill-items-button";

export const dynamic = "force-dynamic";

// ── Raw DB types ─────────────────────────────────────────────

type RawReceipt = {
  id:                     number;
  rid:                    string;
  refid:                  string | null;
  rdate:                  string | null;
  rdatecreate:            string | null;
  issuedate:              string | null;
  ramount:                number | string | null;
  totalbeforewithholding: number | string | null;
  rstatus:                string;
  userid:                 string;
  adminid:                string | null;
  statusprint:            string | null;
  rdateprint:             string | null;
  adminidprint:           string | null;
  corporatetype:          string | null;
  recompnumber:           string | null;
  recompname:             string | null;
  recompaddress:          string | null;
  documentissuer:         string | null;
  documentapprover:       string | null;
};

type RawReceiptItem = {
  id:  number;
  rid: string;
  fid: number;
};

type RawForwarder = {
  id:                    number;
  userid:                string;
  ftrackingchn:          string | null;
  fcabinetnumber:        string | null;
  fid:                   string | null;
  famount:               number | null;
  fweight:               number | string | null;
  fvolume:               number | string | null;
  fdate:                 string | null;
  ftotalprice:           number | string | null;
  ftransportprice:       number | string | null;
  fpriceupdate:          number | string | null;
  fshippingservice:      number | string | null;
  pricecrate:            number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother:            number | string | null;
  fdiscount:             number | string | null;
};

type RawUser = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
  userEmail:    string | null;
};

type RawAddressJoin = {
  addressno:          string | null;
  addresssubdistrict: string | null;
  addressdistrict:    string | null;
  addressprovince:    string | null;
  addresszipcode:     string | null;
  addresstel:         string | null;
};

// ── Number / format helpers ──────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmt5(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  });
}

function fmt0(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Format `dd/MM/yyyy` (legacy mPDF format — "%d/%m/%Y"). */
function fmtDateLegacy(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/**
 * Build customer address from tb_address + tb_address_main main row.
 * Legacy: `<addressno> ตำบล/แขวง <subdistrict> อำเภอ/เขต <district>
 *          จังหวัด <province> <zipcode> โทร. <tel>`
 */
function composeMainAddress(row: RawAddressJoin | null | undefined): string {
  if (!row) return "";
  const parts: string[] = [];
  if (row.addressno) parts.push(row.addressno);
  if (row.addresssubdistrict) parts.push(`ตำบล/แขวง ${row.addresssubdistrict}`);
  if (row.addressdistrict) parts.push(`อำเภอ/เขต ${row.addressdistrict}`);
  if (row.addressprovince) parts.push(`จังหวัด ${row.addressprovince}`);
  if (row.addresszipcode) parts.push(row.addresszipcode);
  if (row.addresstel) parts.push(`โทร. ${row.addresstel}`);
  return parts.join(" ");
}

/**
 * One full-bleed receipt page (ต้นฉบับ OR สำเนา). The whole document is two
 * of these stacked with `page-break-after: always` between them — mirrors
 * legacy mPDF AddPageByArray that pushed 2 PDF pages.
 */
function ReceiptPage({
  label,             // "ต้นฉบับ" | "สำเนา"
  rid,
  issuerAddress,     // address line for the Pacred issuer band
  issueDate,
  rDateCreate,
  customerName,
  customerTaxId,
  customerAddress,
  items,
  totals,
  showWht,
  whtAmount,
  grandTotal,
  grandTotalThaiWord,
  documentIssuer,
  documentApprover,
  pageNumber,
  pageCount,
}: {
  label:               string;
  rid:                 string;
  issuerAddress:       string;
  issueDate:           string;
  rDateCreate:         string;
  customerName:        string;
  customerTaxId:       string;
  customerAddress:     string;
  items: Array<{
    no:           number;
    fid:          string;
    tracking:     string;
    famount:      number;
    fweight:      number;
    fvolume:      number;
    ftotalprice:  number;
  }>;
  totals: {
    fTotal:                 number;
    fTransportCHNTHB:       number;
    fTransport:             number;
    priceOther:             number;
    fDiscount:              number;
  };
  showWht:             boolean;
  whtAmount:           number;
  grandTotal:          number;
  grandTotalThaiWord:  string;
  documentIssuer:      string;
  documentApprover:    string;
  pageNumber:          number;
  pageCount:           number;
}) {
  return (
    <div className="receipt-page bg-white text-black mx-auto" style={{ width: "210mm", minHeight: "267mm" }}>
      <div className="p-2" style={{ padding: "4mm" }}>
        {/* ── 2026-06-03 ภูม flag: visual chrome refreshed to match the
            ใบส่งสินค้า (combine-bill/print) standard — grid-cols-12 7/5
            header, clean bordered cards for issuer/customer, modern table
            with border-gray-400. All data + dual-page (ต้นฉบับ+สำเนา) +
            WHT + 4-sig + payment-checkbox content preserved verbatim. */}

        {/* ── Top band: grid-cols-12 split — Pacred identity (7) · doc badge (5) ── */}
        <div className="grid grid-cols-12 items-start gap-4 border-b-2 border-black pb-3">
          {/* Issuer identity (7/12) — logo inline with legal name */}
          <div className="col-span-7 flex items-start gap-3">
            <Image
              src="/images/pacred-logo-red.png"
              alt={SITE_LEGAL_NAME}
              width={76}
              height={76}
              unoptimized
              style={{ width: "18mm", height: "auto", flexShrink: 0 }}
            />
            <div>
              <div className="text-xl font-bold leading-tight">{SITE_LEGAL_NAME_TH}</div>
              <div className="text-sm font-semibold leading-tight text-gray-700">{SITE_LEGAL_NAME}</div>
            </div>
          </div>
          {/* Doc title + ต้นฉบับ/สำเนา badge (5/12) — right-aligned */}
          <div className="col-span-5 text-right">
            <div className="text-sm font-semibold text-gray-700">{label}</div>
            <div className="text-2xl font-bold leading-tight" style={{ color: "#8BC34A" }}>
              ใบเสร็จรับเงิน
            </div>
            <div className="text-xs font-bold leading-tight" style={{ color: "red" }}>
              (ไม่ใช่ใบกำกับภาษี)
            </div>
            <div className="text-base font-bold mt-1">
              เลขที่ : <span className="font-mono">{rid}</span>
            </div>
          </div>
        </div>

        {/* ── Issuer block ── */}
        <section className="border border-gray-400 rounded mt-2 p-2 text-sm">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3 text-gray-700">
              <div>ผู้ออก / issuer :</div>
              <div>เลขผู้เสียภาษี / Tax ID :</div>
              <div>ที่อยู่ / Address :</div>
              <div className="invisible">.</div>
              <div>โทรศัพท์ / tel :</div>
            </div>
            <div className="col-span-6">
              <div className="font-medium">{SITE_LEGAL_NAME_TH}</div>
              <div className="font-mono">{TAX_ID}</div>
              <div>{issuerAddress}</div>
              <div>{CONTACT.phoneCompanyDisplay}</div>
            </div>
            <div className="col-span-2 text-right text-gray-700">
              <div>วันที่ / date :</div>
              <div>หน้า / page :</div>
            </div>
            <div className="col-span-1 text-left">
              <div>{issueDate}</div>
              <div>{pageNumber}/{pageCount}</div>
            </div>
          </div>
        </section>

        {/* ── Customer block ── */}
        <section className="border border-gray-400 rounded mt-2 p-2 text-sm">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-3 text-gray-700">
              <div>ลูกค้า / Customer :</div>
              <div>เลขผู้เสียภาษี / Tax ID :</div>
              <div>ที่อยู่ / Address :</div>
            </div>
            <div className="col-span-9">
              <div className="font-medium">{customerName}</div>
              <div className="font-mono">{customerTaxId || "-"}</div>
              <div style={{ minHeight: "16mm" }}>{customerAddress || "-"}</div>
            </div>
          </div>
        </section>

        {/* ── Items table — delivery-note style (border-gray-400, clean
            header, bilingual 2-line labels with EN sublabels in gray) ── */}
        <table className="w-full border-collapse text-sm mt-3" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="bg-gray-100 text-center">
              <th className="border border-gray-400 px-1 py-1" style={{ width: "7%" }}>
                ลำดับ<br /><span className="text-[10px] font-normal text-gray-500">No.</span>
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ width: "11%" }}>
                เลขที่ออเดอร์<br /><span className="text-[10px] font-normal text-gray-500">Order No.</span>
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ width: "39%" }}>
                รหัสพัสดุ<br /><span className="text-[10px] font-normal text-gray-500">Tracking</span>
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ width: "7%" }}>
                จำนวน<br /><span className="text-[10px] font-normal text-gray-500">Box</span>
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ width: "10%" }}>
                น้ำหนัก<br /><span className="text-[10px] font-normal text-gray-500">Wt./kg</span>
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ width: "11%" }}>
                ปริมาตร<br /><span className="text-[10px] font-normal text-gray-500">Vol./CBM</span>
              </th>
              <th className="border border-gray-400 px-1 py-1" style={{ width: "15%" }}>
                ค่าขนส่ง<br /><span className="text-[10px] font-normal text-gray-500">Amount</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-gray-400 px-2 py-3 text-center text-gray-500">
                  ไม่พบรายการ
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={`${pageNumber}-${row.no}`}>
                  <td className="border border-gray-400 px-2 py-1 text-center">{row.no}</td>
                  <td className="border border-gray-400 px-2 py-1 text-center font-mono text-xs">#{row.fid}</td>
                  <td className="border border-gray-400 px-2 py-1 break-all font-mono text-xs">{row.tracking}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt0(row.famount)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt2(row.fweight)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt5(row.fvolume)}</td>
                  <td className="border border-gray-400 px-2 py-1 text-right font-mono">{fmt2(row.ftotalprice)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Footer summary + 4-signature row (only on LAST page of this side) ── */}
        {pageNumber === pageCount && (
          <div className="mt-3 text-sm space-y-3">
            {/* Summary: 2-col grid — left=notes+payment, right=totals stack */}
            <div className="grid grid-cols-12 gap-3">
              {/* Notes + payment options (8/12) */}
              <div className="col-span-8 border border-gray-400 rounded p-3 space-y-1.5 text-xs leading-relaxed">
                <p>
                  <b>หมายเหตุ :</b> *ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว
                </p>
                <p className="text-gray-600">**This is an electronic display of receipt data.</p>
                <div className="pt-1 space-y-1">
                  <div>
                    <input type="checkbox" /> เงินสด <span className="text-gray-400">_____________________</span> วันที่ <span className="text-gray-400">____________________________</span>
                  </div>
                  <div>
                    <input type="checkbox" /> เช็คธนาคาร/สาขา <span className="text-gray-400">_____________</span> วันที่ <span className="text-gray-400">________</span> เลขที่เช็ค <span className="text-gray-400">____________</span>
                  </div>
                  <div>
                    <input type="checkbox" defaultChecked /> โอนเข้าธนาคาร <b>{BANK.name}</b> เลขที่{" "}
                    <b>{BANK.accountNumber}</b> วันที่ {issueDate}
                  </div>
                  <div className="text-center pt-1">
                    จำนวนเงิน <b>{fmt2(grandTotal)} บาท</b> ผู้รับเงิน <span className="text-gray-400">________________________</span>
                  </div>
                  <div className="text-right bg-gray-100 -mx-2 px-2 py-0.5 rounded">
                    <b>({grandTotalThaiWord})</b>
                  </div>
                </div>
              </div>
              {/* Totals stack (4/12) — right-aligned label/value pairs */}
              <div className="col-span-4 border border-gray-400 rounded">
                <table className="w-full text-xs">
                  <tbody>
                    <tr>
                      <td className="px-2 py-1 text-right text-gray-700 border-b border-gray-300">Total</td>
                      <td className="px-2 py-1 text-right font-mono border-b border-gray-300">{fmt2(totals.fTotal)} บาท</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-right text-gray-700 border-b border-gray-300">Delivery Charge CHN</td>
                      <td className="px-2 py-1 text-right font-mono border-b border-gray-300">{fmt2(totals.fTransportCHNTHB)} บาท</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-right text-gray-700 border-b border-gray-300">Delivery Charge TH</td>
                      <td className="px-2 py-1 text-right font-mono border-b border-gray-300">{fmt2(totals.fTransport)} บาท</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-right text-gray-700 border-b border-gray-300">Other</td>
                      <td className="px-2 py-1 text-right font-mono border-b border-gray-300">{fmt2(totals.priceOther)} บาท</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 text-right text-gray-700 border-b border-gray-300">Discount</td>
                      <td className="px-2 py-1 text-right font-mono border-b border-gray-300">{fmt2(totals.fDiscount)} บาท</td>
                    </tr>
                    {showWht && (
                      <tr>
                        <td className="px-2 py-1 text-right text-gray-700 border-b border-gray-300">LESS WHT 1%</td>
                        <td className="px-2 py-1 text-right font-mono border-b border-gray-300">{fmt2(whtAmount)} บาท</td>
                      </tr>
                    )}
                    <tr className="bg-gray-100">
                      <td className="px-2 py-1.5 text-right font-bold">Total Amount</td>
                      <td className="px-2 py-1.5 text-right font-bold text-base font-mono" style={{ color: "red" }}>
                        {fmt2(grandTotal)} บาท
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4 signature boxes — grid-cols-4 with clean rounded borders */}
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="border border-gray-400 rounded p-2 text-center">
                <div className="font-semibold">ผู้ออกเอกสาร</div>
                <Image
                  src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                  alt="ลายมือชื่อ"
                  width={94}
                  height={48}
                  unoptimized
                  style={{ width: "25mm", height: "auto", display: "inline-block", margin: "4px 0" }}
                />
                <div className="text-xs">{documentIssuer}</div>
                <div className="text-[10px] text-gray-600">{rDateCreate}</div>
              </div>
              <div className="border border-gray-400 rounded p-2 text-center">
                <div className="font-semibold">ผู้อนุมัติเอกสาร</div>
                <Image
                  src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                  alt="ลายมือชื่อ"
                  width={94}
                  height={48}
                  unoptimized
                  style={{ width: "25mm", height: "auto", display: "inline-block", margin: "4px 0" }}
                />
                <div className="text-xs">{documentApprover || "_________________"}</div>
                <div className="text-[10px] text-gray-600">{rDateCreate}</div>
              </div>
              <div className="border border-gray-400 rounded p-2 text-center">
                <div className="font-semibold">ตราประทับ (ผู้ขาย)</div>
                <Image
                  src="/legacy/pcs/assets/images/theme/stamp.png"
                  alt="ตราประทับ"
                  width={94}
                  height={94}
                  unoptimized
                  style={{ width: "25mm", height: "auto", display: "inline-block", margin: "4px 0" }}
                />
              </div>
              <div className="border border-gray-400 rounded p-2 text-center">
                <div className="font-semibold">ผู้รับเอกสาร (ลูกค้า)</div>
                <div className="mt-8 border-t border-gray-400 pt-1 text-gray-500">วันที่ Date:</div>
                <div className="text-[10px] text-gray-600">__/__/____</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page entry ───────────────────────────────────────────────

export default async function ForwarderInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const { id: idStr } = await params;
  const receiptId = parseInt(idStr, 10);
  if (!Number.isFinite(receiptId) || receiptId <= 0) notFound();

  const admin = createAdminClient();

  // ── 1. Receipt header ────────────────────────────────────
  const { data: receiptData, error: rErr } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, issuedate, ramount, totalbeforewithholding, " +
        "rstatus, userid, adminid, statusprint, adminidprint, rdateprint, corporatetype, " +
        "recompnumber, recompname, recompaddress, documentissuer, documentapprover",
    )
    .eq("id", receiptId)
    .maybeSingle<RawReceipt>();
  if (rErr) {
    console.error(`[tb_receipt read] failed`, { code: rErr.code, message: rErr.message });
    throw new Error(`Failed to load receipt: ${rErr.message}`);
  }
  if (!receiptData) notFound();
  const receipt = receiptData;

  // ── 2. Receipt items ─────────────────────────────────────
  const { data: itemRows, error: itemsErr } = await admin
    .from("tb_receipt_item")
    .select("id, rid, fid")
    .eq("rid", receipt.rid);
  if (itemsErr) {
    console.error(`[tb_receipt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const receiptItems = (itemRows ?? []) as unknown as RawReceiptItem[];

  // ── 3. Forwarder rows (line items) ───────────────────────
  const fids = receiptItems.map((it) => it.fid);
  let forwarders: RawForwarder[] = [];
  if (fids.length > 0) {
    // 2026-06-03 ภูม flag — `fid` was in the select but doesn't exist on
    // tb_forwarder (only `id`; verified via information_schema). PostgREST
    // returned `code 42703 · column tb_forwarder.fid does not exist`, the
    // page swallowed the error (logged but not surfaced), the forwarders
    // array stayed empty, computedItems filtered everything out, and
    // staff saw "ไม่พบรายการ" even though tb_receipt_item DID have rows.
    // Removed `fid` from the select; the downstream `f.fid ?? String(f.id)`
    // fallback already used `String(f.id)` so the display is unchanged.
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, userid, ftrackingchn, fcabinetnumber, famount, fweight, fvolume, fdate, " +
          "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
          "pricecrate, ftransportpricechnthb, priceother, fdiscount",
      )
      .in("id", fids);
    if (fwdErr) {
      console.error(`[tb_forwarder list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    forwarders = (fwdRows ?? []) as unknown as RawForwarder[];
  }
  const forwardersById = new Map(forwarders.map((f) => [f.id, f]));

  // ── 4. Customer info ─────────────────────────────────────
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail")
    .eq("userID", receipt.userid)
    .maybeSingle<RawUser>();
  if (userErr) {
    console.error(`[tb_users read] failed`, { code: userErr.code, message: userErr.message });
  }

  // ── 5. Main address fallback (only used when no corporate address) ──
  //    Legacy: SELECT CONCAT(...) FROM tb_address_main am LEFT JOIN
  //            tb_address a ON am.addressID=a.addressID WHERE userID=?
  let mainAddressRow: RawAddressJoin | null = null;
  if (!receipt.recompaddress) {
    const { data: addrMain, error: addrErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", receipt.userid)
      .maybeSingle<{ addressid: number | null }>();
    if (addrErr) {
      console.error(`[tb_address_main read] failed`, { code: addrErr.code, message: addrErr.message });
    }
    if (addrMain?.addressid) {
      const { data: addr, error: addrFullErr } = await admin
        .from("tb_address")
        .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel")
        .eq("addressid", addrMain.addressid)
        .maybeSingle<RawAddressJoin>();
      if (addrFullErr) {
        console.error(`[tb_address read] failed`, { code: addrFullErr.code, message: addrFullErr.message });
      }
      mainAddressRow = addr ?? null;
    }
  }

  // ── 6. Customer name / tax-id / address resolution (legacy logic) ──
  const isCorporate = receipt.corporatetype === "1" && !!receipt.recompnumber;

  const fallbackPersonalName = userRow
    ? [userRow.userName, userRow.userLastName].filter(Boolean).join(" ").trim()
    : "";

  // Name: prefer recompname (legacy reCompName), then PCS<id>+corporate, then
  // PCS<id>+personal name, then bare userid.
  const customerName = (() => {
    if (receipt.recompname && receipt.recompname.trim()) {
      return `${receipt.userid} ${receipt.recompname.trim()}`;
    }
    if (fallbackPersonalName) {
      return `${receipt.userid} ${fallbackPersonalName}`;
    }
    return receipt.userid;
  })();

  const customerTaxId = receipt.recompnumber || "-";

  const customerAddress =
    (receipt.recompaddress && receipt.recompaddress.trim())
      ? receipt.recompaddress.trim()
      : composeMainAddress(mainAddressRow);

  // ── 7. Compute totals + WHT 1% (legacy printReceipt.php:357-399) ──
  const computedItems = receiptItems
    .map((it, idx) => {
      const f = forwardersById.get(it.fid);
      if (!f) {
        return null;
      }
      const fTotalPrice           = toNumber(f.ftotalprice);
      const fTransportPrice       = toNumber(f.ftransportprice);
      const fPriceUpdate          = toNumber(f.fpriceupdate);
      const fShippingService      = toNumber(f.fshippingservice);
      const fTransportPriceCHNTHB = toNumber(f.ftransportpricechnthb);
      const priceCrate            = toNumber(f.pricecrate);
      const priceOther            = toNumber(f.priceother);
      const fDiscount             = toNumber(f.fdiscount);

      // Line total (legacy: sum of all 7 components - discount)
      const totalPrice =
        fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
        fTransportPriceCHNTHB + priceCrate + priceOther - fDiscount;

      return {
        idx,
        no:           idx + 1,
        fid:          f.fid ?? String(f.id),
        tracking:     f.ftrackingchn ?? "",
        famount:      toNumber(f.famount),
        fweight:      toNumber(f.fweight),
        fvolume:      toNumber(f.fvolume),
        ftotalprice:  fTotalPrice,
        // running totals contribution
        _line: {
          fTotalPrice,
          fTransport:       fTransportPrice,
          fTransportCHNTHB: fTransportPriceCHNTHB,
          priceOther:       fPriceUpdate + fShippingService + priceCrate + priceOther,
          fDiscount,
          lineTotal:        totalPrice,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const totals = computedItems.reduce(
    (acc, row) => ({
      fTotal:           acc.fTotal           + row._line.fTotalPrice,
      fTransport:       acc.fTransport       + row._line.fTransport,
      fTransportCHNTHB: acc.fTransportCHNTHB + row._line.fTransportCHNTHB,
      priceOther:       acc.priceOther       + row._line.priceOther,
      fDiscount:        acc.fDiscount        + row._line.fDiscount,
      totalLineSum:     acc.totalLineSum     + row._line.lineTotal,
    }),
    {
      fTotal:           0,
      fTransport:       0,
      fTransportCHNTHB: 0,
      priceOther:       0,
      fDiscount:        0,
      totalLineSum:     0,
    },
  );

  // ── DATA-SYNC FALLBACK (2026-05-31 sitting-H-fix · ภูม flag #4) ──
  // ภูม screenshot of FRG2605-00219 showed "ไม่พบรายการ" + Total = 0.00 even
  // though the receipt header had a real ramount. Root cause: tb_receipt_item
  // rows are missing for that receipt (likely Wave 28 PR-format pollution OR
  // a legacy migration where items were stored differently). Without items,
  // the per-line `computedItems` reduce sums to 0, and the legacy receipt
  // chrome prints blank totals — useless to staff.
  //
  // Graceful degradation: when itemCount=0 BUT the receipt header itself
  // carries a non-zero amount (the source-of-record for the money), surface
  // the header amount on the totals row + flag the data gap with an
  // amber banner (only visible on screen, not in print — staff who reprint
  // see the warning; the customer copy stays clean).
  //
  // Sources of truth for the fallback:
  //   - tb_receipt.totalbeforewithholding = pre-WHT raw sum (preferred)
  //   - tb_receipt.ramount               = post-WHT net (what customer paid)
  // Both columns are populated by auto-issue-receipt.ts at insert time, so
  // when items go missing the header still has the answer.
  const headerTotalBefore  = toNumber(receipt.totalbeforewithholding);
  const headerRamount      = toNumber(receipt.ramount);
  const itemsMissing       = computedItems.length === 0 && (headerTotalBefore > 0 || headerRamount > 0);

  // WHT 1% — legacy: only for corporate AND totalbeforewithholding ≥ 1000
  const totalBeforeWithholding = headerTotalBefore || totals.totalLineSum;
  const showWht = isCorporate && totalBeforeWithholding >= 1000;
  // When items are missing, derive WHT from the header difference instead of
  // re-applying the 1% rule (the header values are post-fact authoritative).
  const whtAmount =
    itemsMissing
      ? Math.max(0, headerTotalBefore - headerRamount)
      : showWht
        ? totals.totalLineSum * 0.01
        : 0;
  const grandTotal =
    itemsMissing
      ? headerRamount
      : totals.totalLineSum - whtAmount;
  const grandTotalThaiWord = readThaiBaht(grandTotal);

  // When items are missing, also patch the totals BREAKDOWN to put the
  // header total under "Total" (the most-prominent row) — the per-leg
  // breakdown (CHN/TH/Other/Discount) stays zero because we have no way to
  // reconstruct it without the items. Staff will see "Total = ฿N" and "all
  // other rows = ฿0" — clear signal that this receipt has missing details.
  const totalsForRender = itemsMissing
    ? {
        fTotal:           headerTotalBefore,
        fTransport:       0,
        fTransportCHNTHB: 0,
        priceOther:       0,
        fDiscount:        0,
      }
    : {
        fTotal:           totals.fTotal,
        fTransport:       totals.fTransport,
        fTransportCHNTHB: totals.fTransportCHNTHB,
        priceOther:       totals.priceOther,
        fDiscount:        totals.fDiscount,
      };

  // ── 8. Issuer address (2026-06-01 brand swap · owner GO) ──
  // Legacy printReceipt.php:293-297 had a 2025-03-20 cutover between two PCS
  // Cargo addresses; under Pacred there is one office address (the SOT in
  // components/seo/site.ts ADDRESSES.office). The cutover is retired.
  const issuerAddress = ADDRESSES.office.full;

  // ── 9. Pagination — 13 rows per page (legacy `$rowsPerPage = 13`) ──
  const ROWS_PER_PAGE = 13;
  const pageCount = Math.max(1, Math.ceil(computedItems.length / ROWS_PER_PAGE));
  const pages: Array<{
    pageNumber: number;
    rows: typeof computedItems;
  }> = [];
  for (let p = 0; p < pageCount; p++) {
    pages.push({
      pageNumber: p + 1,
      rows: computedItems.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE),
    });
  }

  const issueDate     = fmtDateLegacy(receipt.issuedate ?? receipt.rdatecreate);
  const rDateCreate   = fmtDateLegacy(receipt.rdatecreate);
  const documentIssuer   = receipt.documentissuer  || receipt.adminid || "-";
  const documentApprover = receipt.documentapprover || "";

  const commonProps = {
    rid:                 receipt.rid,
    issuerAddress,
    issueDate,
    rDateCreate,
    customerName,
    customerTaxId,
    customerAddress,
    totals:              totalsForRender,
    showWht:             showWht || (itemsMissing && whtAmount > 0),
    whtAmount,
    grandTotal,
    grandTotalThaiWord,
    documentIssuer,
    documentApprover,
    pageCount,
  };

  return (
    <>
      {/*
        Print stylesheet — Tailwind @media print classes plus a few custom
        rules. A4 portrait, 1.5cm margins, hide admin chrome, force a page
        break between the ต้นฉบับ side and the สำเนา side.
      */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .receipt-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            page-break-after: always;
            page-break-inside: auto;
          }
          .receipt-page:last-child { page-break-after: auto; }
        }
        @media screen {
          .receipt-page {
            margin: 16px auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
            border: 1px solid #e5e7eb;
            border-radius: 4px;
          }
        }
      `}</style>

      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {/* ── Breadcrumb + actions (hidden on print) ── */}
          <div className="no-print">
            {/* 2026-05-30 ภูม flagged #7: was "ใบแจ้งหนี้ ฝากนำเข้า" —
                this page renders ใบเสร็จ (receipt) per Wave 29 pivot. */}
            <nav className="text-sm text-slate-500 mb-3">
              <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
              <span className="mx-1">/</span>
              <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
              <span className="mx-1">/</span>
              <Link href="/admin/accounting/forwarder-invoice" className="hover:text-indigo-700">
                ใบเสร็จ ฝากนำเข้า
              </Link>
              <span className="mx-1">/</span>
              <span className="text-slate-700">{receipt.rid}</span>
            </nav>

            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  ใบเสร็จรับเงิน {receipt.rid}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  ออกเมื่อ {issueDate} โดย {documentIssuer}
                  {receipt.statusprint === "1" && receipt.rdateprint && (
                    <> · พิมพ์ล่าสุด {fmtDateLegacy(receipt.rdateprint)} (โดย {receipt.adminidprint || "-"})</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/accounting/forwarder-invoice"
                  className="text-sm text-slate-600 hover:text-indigo-700"
                >
                  ← กลับไปรายการ
                </Link>
                <PrintButton receiptId={receipt.id}>
                  <Printer className="size-4" />
                  พิมพ์ใบเสร็จ
                </PrintButton>
              </div>
            </div>

            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <b>ตัวอย่างก่อนพิมพ์</b> — ใบเสร็จจะออกมา <b>2 หน้า</b> (ต้นฉบับ + สำเนา) เมื่อกดพิมพ์ ·
              กดปุ่ม &ldquo;พิมพ์ใบเสร็จ&rdquo; ด้านบนเพื่อบันทึกสถานะ <code>statusPrint=1</code> และเปิดหน้าต่างพิมพ์
            </div>

            {/* 2026-05-31 sitting-H-fix #4 (ภูม): data-gap banner.
                Shows ONLY on screen (not print). Surfaces the missing
                tb_receipt_item case so staff don't print a "blank" receipt
                without knowing the breakdown is reconstructed from header.

                2026-06-02 sitting Wave A (ภูม flag #1): added the
                <BackfillItemsButton> recovery hook — staff can trigger
                the wallet_hs + fdatestatus5 trail rebuild from this banner
                instead of opening a SQL editor. */}
            {itemsMissing && (
              <div className="mb-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                <b>⚠️ รายการพัสดุไม่พบใน tb_receipt_item</b> — ระบบจึงดึงยอดรวมจาก
                <code className="mx-1 px-1 bg-rose-100 rounded">tb_receipt.totalbeforewithholding</code>
                + <code className="mx-1 px-1 bg-rose-100 rounded">tb_receipt.ramount</code>
                มาแสดงในแถว Total / WHT / Total Amount แทน (รายละเอียดต่อ leg ขนส่งจีน-ไทย
                แสดงเป็น 0 เพราะไม่มี source).<br />
                <span className="text-rose-700 mt-1 inline-block">
                  สาเหตุที่เป็นไปได้: (1) Wave 28 PR-format pollution ·
                  (2) legacy migration ที่ tb_receipt_item ไม่ได้ port มาด้วย ·
                  (3) Wave 29 manual-create flow มี bug ตอน batch INSERT items.
                  ดูเพิ่ม <code>docs/runbook/wave-29-tb-receipt-pollution-audit.md</code>
                  หรือ query <code>tb_receipt_item WHERE rid=&lsquo;{receipt.rid}&rsquo;</code> ก่อน reprint.
                </span>
                <div className="mt-2 flex items-start gap-2">
                  <BackfillItemsButton receiptId={receipt.id} />
                  <span className="text-rose-700 text-[11px] mt-1.5 inline-block">
                    ลองดึงรายการจาก <code>tb_wallet_hs</code> (±7 วัน) +{" "}
                    <code>tb_forwarder.fdatestatus5</code> (±14 วัน) ที่ยอดรวมเท่ากัน ·
                    ถ้าหลายชุดเข้ากันได้ ระบบจะให้เลือกเอง
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── 2-side document — Originals first, then Copies ──
              Legacy printReceipt.php does the same: mPDF AddPage loop for
              ต้นฉบับ, then a second loop for สำเนา. Each side gets its own
              page-count (1/N, 2/N, ..., N/N), totalling 2N printed pages.
          */}
          {pages.map((p) => (
            <ReceiptPage
              key={`orig-${p.pageNumber}`}
              label="ต้นฉบับ"
              {...commonProps}
              pageNumber={p.pageNumber}
              items={p.rows}
            />
          ))}
          {pages.map((p) => (
            <ReceiptPage
              key={`copy-${p.pageNumber}`}
              label="สำเนา"
              {...commonProps}
              pageNumber={p.pageNumber}
              items={p.rows}
            />
          ))}
        </div>
      </div>
    </>
  );
}

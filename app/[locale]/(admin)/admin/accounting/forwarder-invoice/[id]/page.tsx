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
 *
 * 2026-06-09 ภูม flag round 2 — v2 redesign to match Peak Account's actual
 * borderless layout (v1's card-everywhere look was rejected: "ดูเละกว่า
 * peak อีก"). Key changes from v1:
 *   - NO card chrome around issuer/customer — stacked rows + thin gray dividers
 *   - Meta card top-right (3 rows: เลขที่ / วันที่ / อ้างอิง) — orange-tinted
 *   - Section headings inline with tiny icon + bold label, full-width gray rule
 *   - Items table — KEPT VERBATIM (7 Pacred-specific cargo columns)
 *   - Totals — RIGHT-aligned text rows (NO border box)
 *   - Payment — split L/R with thin vertical divider
 *   - Signatures — tiny (~80px), thin single underline (no thick boxes)
 *
 * Two-page output (ต้นฉบับ + สำเนา) preserved per legacy printReceipt.php.
 *
 * Per ภูม: "ภูมิเอาแค่ตารางที่เป็นของเรา แต่ส่วนอื่นการจัดวางเอาแบบ peak เลย"
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
  // Peak totals math: pre-tax baseline before WHT/VAT — used in the
  // "มูลค่าไม่รวมภาษีมูลค่าเพิ่ม" row at the top of the summary block.
  const preTax = totals.fTotal + totals.fTransportCHNTHB + totals.fTransport +
                 totals.priceOther - totals.fDiscount;
  const amountPaid = grandTotal - (showWht ? whtAmount : 0);

  // Peak palette (sampled from the owner's screenshot):
  //   issuer/customer roles labels  → text-gray-500 (#6b7280)
  //   role names                    → font-bold text-gray-900 (#111827)
  //   addresses + tax-id            → text-gray-700
  //   section dividers              → border-gray-200 (#e5e7eb)
  //   section heading icons         → text-gray-700
  //   meta card background          → bg-orange-50/40 (very pale tint)
  //   totals accent (paid+overdue)  → text-red-600 (#dc2626)
  //   grand total label/value       → text-gray-900 + 1px top rule

  return (
    <div className="receipt-page bg-white text-black mx-auto" style={{ width: "210mm", minHeight: "267mm" }}>
      <div style={{ padding: "10mm 12mm" }}>
        {/* ─────────────── Top band: orange Pacred wordmark · doc title right ─────────────── */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Image
              src="/images/pacred-logo-red.png"
              alt={SITE_LEGAL_NAME}
              width={48}
              height={48}
              unoptimized
              style={{ width: "12mm", height: "auto", flexShrink: 0 }}
            />
            <div className="text-2xl font-bold tracking-wide" style={{ color: "#C2410C" /* Pacred orange */ }}>
              Pacred
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-gray-500">({label})</div>
            <div className="text-lg font-bold text-gray-900">ใบเสร็จรับเงิน</div>
            <div className="text-[9px] text-gray-500 tracking-widest">RECEIPT</div>
            <div className="text-[9px] text-red-600 mt-0.5">(ไม่ใช่ใบกำกับภาษี)</div>
          </div>
        </div>

        {/* ─────────────── Issuer row: address + contact LEFT · meta card RIGHT ─────────────── */}
        <div className="flex items-start gap-4 mt-1">
          <div className="flex-1 min-w-0 text-[11px] leading-snug">
            <div className="text-[10px] text-gray-500">ผู้ขาย / Issuer</div>
            <div className="text-sm font-bold text-gray-900">{SITE_LEGAL_NAME_TH}</div>
            <div className="text-gray-700 mt-0.5">{issuerAddress}</div>
            <div className="text-gray-700">
              เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{TAX_ID}</span> <span className="text-gray-500">(สำนักงานใหญ่)</span>
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5">
              <span className="mr-3">โทร {CONTACT.phoneCompanyDisplay}</span>
              <span>อีเมล {CONTACT.emailAcc}</span>
            </div>
          </div>
          <div className="text-[10px] flex-shrink-0">
            <div className="border border-gray-300 rounded" style={{ minWidth: "62mm", backgroundColor: "#FFF7ED" }}>
              <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                <span className="text-gray-500">เลขที่</span>
                <span className="font-mono text-gray-900">{rid}</span>
              </div>
              <div className="flex justify-between px-2 py-1 border-b border-gray-200">
                <span className="text-gray-500">วันที่ออก</span>
                <span className="text-gray-900">{issueDate}</span>
              </div>
              <div className="flex justify-between px-2 py-1">
                <span className="text-gray-500">อ้างอิง</span>
                <span className="font-mono text-gray-900">{rid}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-b border-gray-200 my-2"></div>

        {/* ─────────────── Customer row ─────────────── */}
        <div className="text-[11px] leading-snug">
          <div className="text-[10px] text-gray-500">ลูกค้า / Customer</div>
          <div className="text-sm font-bold text-gray-900">{customerName}</div>
          <div className="text-gray-700 mt-0.5" style={{ minHeight: "10mm" }}>{customerAddress || "-"}</div>
          {customerTaxId && customerTaxId !== "-" && (
            <div className="text-gray-700">
              เลขประจำตัวผู้เสียภาษี: <span className="font-mono">{customerTaxId}</span> <span className="text-gray-500">(สำนักงานใหญ่)</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-b border-gray-200 my-2"></div>

        {/* ─────────────── Items table — KEPT VERBATIM (Pacred unique 7 cols) ─────────────── */}
        <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed" }}>
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

        {/* ─────────────── Footer block (last page only) — Peak v2 borderless ─────────────── */}
        {pageNumber === pageCount && (
          <div className="mt-3 text-[11px]">
            {/* ─── Section: สรุป (Summary) — right-aligned text rows, NO box ─── */}
            <div className="flex items-center gap-1.5 mt-2 mb-1">
              <span className="text-gray-700">📋</span>
              <span className="font-bold text-gray-900">สรุป  Summary</span>
            </div>
            <div className="flex justify-end">
              <table className="text-right">
                <tbody>
                  <tr>
                    <td className="px-2 py-0.5 text-gray-500">มูลค่าไม่รวมภาษีมูลค่าเพิ่ม</td>
                    <td className="px-2 py-0.5 font-mono w-[28mm] text-gray-900">{fmt2(preTax)}</td>
                  </tr>
                  <tr>
                    <td className="px-2 py-0.5 text-gray-500">ภาษีมูลค่าเพิ่ม 7%</td>
                    <td className="px-2 py-0.5 font-mono text-gray-500">0.00</td>
                  </tr>
                  <tr>
                    <td className="px-2 pt-1.5 pb-0.5 text-gray-700 font-bold border-t border-gray-300 text-base">
                      จำนวนเงินทั้งสิ้น
                    </td>
                    <td className="px-2 pt-1.5 pb-0.5 font-mono font-bold text-gray-900 border-t border-gray-300 text-base">
                      {fmt2(grandTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="px-2 pb-1.5 text-[10px] text-gray-500 italic">
                      ({grandTotalThaiWord})
                    </td>
                  </tr>
                  {showWht && (
                    <tr>
                      <td className="px-2 py-0.5 text-gray-500">หัก ภาษี ณ ที่จ่าย 1%</td>
                      <td className="px-2 py-0.5 font-mono">{fmt2(whtAmount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-2 py-0.5 text-gray-500">จำนวนเงินที่ชำระ</td>
                    <td className="px-2 py-0.5 font-mono text-red-600 font-semibold">
                      {fmt2(amountPaid)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Optional breakdown drawer (small, gray) — Pacred's per-leg details */}
            <div className="flex justify-end mt-0.5 text-[10px] text-gray-500">
              <div className="grid grid-cols-2 gap-x-3 gap-y-0" style={{ width: "65mm" }}>
                <span>ค่าขนส่งจีน-ไทย:</span><span className="text-right font-mono">{fmt2(totals.fTransportCHNTHB)}</span>
                <span>ค่าขนส่งในไทย:</span><span className="text-right font-mono">{fmt2(totals.fTransport)}</span>
                <span>ค่าใช้จ่ายอื่น:</span><span className="text-right font-mono">{fmt2(totals.priceOther)}</span>
                <span>ส่วนลด:</span><span className="text-right font-mono">{fmt2(totals.fDiscount)}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="border-b border-gray-200 my-2"></div>

            {/* ─── Section: ชำระเงิน (Payment) — split L/R, thin vertical divider ─── */}
            <div className="flex items-center gap-1.5 mt-1 mb-1">
              <span className="text-gray-700">💳</span>
              <span className="font-bold text-gray-900">ชำระเงิน  Payment</span>
            </div>
            <div className="flex">
              <div className="flex-1 pr-3 border-r border-gray-200 leading-relaxed">
                <div className="text-gray-700">
                  วันที่ชำระ: <span className="text-gray-900">{issueDate}</span>
                </div>
                <div className="text-gray-700">
                  วิธีชำระ: <span className="text-gray-900">โอนผ่านธนาคาร</span>
                </div>
                <div className="text-gray-700">
                  จำนวนเงินรวม: <span className="font-bold text-gray-900">{fmt2(grandTotal)} บาท</span>
                </div>
              </div>
              <div className="flex-1 pl-3 leading-relaxed">
                <div className="text-gray-900">{BANK.name}</div>
                <div className="text-gray-700">เลขที่บัญชี <span className="font-mono font-semibold">{BANK.accountNumber}</span></div>
                <div className="text-gray-700">ชื่อบัญชี {BANK.accountName}</div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-b border-gray-200 my-2"></div>

            {/* ─── Section: หมายเหตุ (Notes) — borderless paragraph ─── */}
            <div className="flex items-center gap-1.5 mt-1 mb-1">
              <span className="text-gray-700">📝</span>
              <span className="font-bold text-gray-900">หมายเหตุ  Notes</span>
            </div>
            <div className="text-gray-700 leading-relaxed">
              *ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว
            </div>

            {/* Divider */}
            <div className="border-b border-gray-200 my-2"></div>

            {/* ─── Section: รับรอง (Authorisation) — QR + 4 tiny thin-line sigs ─── */}
            <div className="flex items-center gap-1.5 mt-1 mb-1">
              <span className="text-gray-700">✍</span>
              <span className="font-bold text-gray-900">รับรอง  Authorisation</span>
            </div>
            <div className="flex items-end gap-3 mt-1">
              {/* QR — small, no border around the label */}
              <div className="text-center" style={{ width: "22mm" }}>
                <div
                  className="mx-auto bg-gray-50 border border-gray-300 flex items-center justify-center"
                  style={{ width: "20mm", height: "20mm" }}
                >
                  <span className="text-[8px] text-gray-400 px-1 text-center leading-tight">
                    QR<br/>PromptPay
                  </span>
                </div>
                <div className="text-[8px] text-gray-500 mt-0.5">ชำระสะดวก</div>
              </div>
              {/* 4 mini signature boxes — single thin gray line at bottom */}
              <div className="flex-1 grid grid-cols-4 gap-2 text-[10px]">
                <div className="text-center">
                  <div className="flex items-center justify-center" style={{ height: "12mm" }}>
                    <Image
                      src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                      alt="ลายมือชื่อ"
                      width={70}
                      height={28}
                      unoptimized
                      style={{ width: "16mm", height: "auto", display: "inline-block" }}
                    />
                  </div>
                  <div className="border-b border-gray-700 mx-1"></div>
                  <div className="mt-0.5 text-gray-900">ผู้ออกเอกสาร</div>
                  <div className="text-[9px] text-gray-500">{rDateCreate}</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center" style={{ height: "12mm" }}>
                    <Image
                      src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                      alt="ลายมือชื่อ"
                      width={70}
                      height={28}
                      unoptimized
                      style={{ width: "16mm", height: "auto", display: "inline-block" }}
                    />
                  </div>
                  <div className="border-b border-gray-700 mx-1"></div>
                  <div className="mt-0.5 text-gray-900">ผู้อนุมัติเอกสาร</div>
                  <div className="text-[9px] text-gray-500">{rDateCreate}</div>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center" style={{ height: "12mm" }}>
                    <Image
                      src="/legacy/pcs/assets/images/theme/stamp.png"
                      alt="ตราประทับ"
                      width={48}
                      height={48}
                      unoptimized
                      style={{ width: "12mm", height: "auto", display: "inline-block" }}
                    />
                  </div>
                  <div className="border-b border-gray-700 mx-1"></div>
                  <div className="mt-0.5 text-gray-900">ตราประทับ</div>
                  <div className="text-[9px] text-gray-500">(ผู้ขาย)</div>
                </div>
                <div className="text-center">
                  <div style={{ height: "12mm" }}></div>
                  <div className="border-b border-gray-700 mx-1"></div>
                  <div className="mt-0.5 text-gray-900">ผู้รับ</div>
                  <div className="text-[9px] text-gray-500">(ลูกค้า)</div>
                </div>
              </div>
            </div>

            {/* Quietly carry the per-staff stamp info that v1 had (issuer/approver
                names + page number). Tiny, far-bottom — does not crowd the layout. */}
            <div className="flex justify-between items-center mt-3 text-[9px] text-gray-400">
              <div>
                ผู้ออก: <span className="text-gray-600">{documentIssuer}</span>
                {documentApprover && (
                  <> · ผู้อนุมัติ: <span className="text-gray-600">{documentApprover}</span></>
                )}
              </div>
              <div>หน้า {pageNumber} / {pageCount}</div>
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
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles view + print
  // receipts (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);

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

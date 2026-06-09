/**
 * Admin > "ใบเสร็จรับเงิน" — print page (FAITHFUL PORT)
 *
 * Wave 29 P0 #3 · 2026-05-29.
 * v3 — 2026-06-09 ภูม flag round 3: literal port of Peak Account HTML structure.
 *
 * Two pages render:
 *   - Page 1 = ต้นฉบับ (Original) — orange title #FFA30A
 *   - Page 2 = สำเนา (Copy) — gray title #5F5D5A
 *
 * Layout matches Peak's id="paperTransaction" structure exactly:
 *   1. headerFormatOne — logo LEFT · (ต้นฉบับ) label + orange title RIGHT
 *   2. d-inline-flex info row — issuer+customer LEFT stacked · meta-box RIGHT
 *      (each issuer/customer block has TEXT col + CONTACT icon col)
 *   3. items table — OUR 7-col Pacred cargo table (kept verbatim)
 *   4. big spacer (height:563px equivalent) pushing summary to bottom
 *   5. summary 2-col — amountInfo LEFT · big amount box RIGHT
 *   6. payment 2-col — date+total LEFT · bank+WHT RIGHT
 *   7. remark
 *   8. certified 6 boxes — QR·ผู้ออก·ผู้อนุมัติ·ตราประทับ(ผู้ขาย)·ผู้รับ·ตราประทับ(ลูกค้า)
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
 * One full-bleed receipt page (ต้นฉบับ OR สำเนา).
 *
 * v3 — 2026-06-09 ภูม flag round 3: literal port of Peak Account HTML.
 * Layout follows id="paperTransaction" > .subpage structure exactly:
 *
 *   [headerFormatOne]  logo LEFT · (ต้นฉบับ/สำเนา) label + title RIGHT
 *   [info row]         issuer+customer LEFT · meta-box RIGHT (same flex row)
 *                      each block = TEXT col + CONTACT col side-by-side
 *   [items table]      OUR Pacred 7-col cargo table (verbatim — do not change)
 *   [spacer]           flex:1 fills remaining space, pushes summary to bottom
 *   [summary 2-col]    amountInfo LEFT (สรุป + Thai words) · amount box RIGHT
 *   [payment 2-col]    date+total LEFT · bank+WHT RIGHT
 *   [remark]           one-line note
 *   [certified 6 box]  QR · ผู้ออก · ผู้อนุมัติ · ตราประทับ(ผู้ขาย) · ผู้รับ · ตราประทับ(ลูกค้า)
 *
 * Peak palette:
 *   orange title (ต้นฉบับ): #FFA30A
 *   gray title (สำเนา):    #5F5D5A
 *   orange tint bg:        rgba(255, 163, 10, 0.165) → #FFF0CC approximation
 *   gray tint bg (สำเนา):  rgba(95, 93, 90, 0.165)  → #EBEBEA approximation
 *   body:                  #111827 · secondary: #6b7280
 */
function ReceiptPage({
  label,
  rid,
  issuerAddress,
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
  const isOriginal = label === "ต้นฉบับ";
  // Peak: orange #FFA30A on ต้นฉบับ, gray #5F5D5A on สำเนา
  const titleColor   = isOriginal ? "#FFA30A" : "#5F5D5A";
  // Peak orange tint bg: rgba(255,163,10,0.165) ≈ #FFF0CC; gray tint ≈ #EBEBEA
  const tintBg       = isOriginal ? "rgba(255,163,10,0.165)" : "rgba(95,93,90,0.165)";

  const preTax = totals.fTotal + totals.fTransportCHNTHB + totals.fTransport +
                 totals.priceOther - totals.fDiscount;
  // amount the customer actually pays (grand total minus WHT if applicable)
  const netPaid = grandTotal - (showWht ? whtAmount : 0);

  return (
    <div
      id="paperTransaction"
      className="receipt-page bg-white text-black mx-auto"
      style={{ width: "210mm", minHeight: "277mm", display: "flex", flexDirection: "column" }}
    >
      <div className="paperTransaction subpage" style={{ padding: "10mm 12mm", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── headerFormatOne: logo LEFT · (label) + title RIGHT ─────────── */}
        <div id="headerFormatOne" style={{ marginBottom: "4mm" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {/* LEFT: merchant logo — single wordmark image, Peak-sized (ภูม flag round 7) */}
            <div id="merchantLogo" style={{ display: "flex", alignItems: "center" }}>
              <Image
                src="/images/pacred-logo-red.png"
                alt={SITE_LEGAL_NAME}
                width={300}
                height={90}
                unoptimized
                style={{ width: "auto", height: "22mm", display: "block" }}
              />
            </div>

            {/* RIGHT: (ต้นฉบับ) label ABOVE title */}
            <div id="etaxWording" style={{ textAlign: "right" }}>
              <div style={{ fontSize: "10px", color: "#6b7280" }}>({label})</div>
              <div id="documentName">
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", color: titleColor }}>
                  <span>ใบเสร็จรับเงิน</span>
                </h2>
              </div>
            </div>
          </div>
        </div>

        {/* ── INFO ROW: issuer+customer LEFT · meta-box RIGHT ─────────────── */}
        <div style={{ display: "flex", gap: "8mm", marginBottom: "3mm" }}>

          {/* LEFT PAIR: issuer on top, customer below */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ISSUER BLOCK */}
            <div id="merchantInfo" style={{ marginBottom: "3mm" }}>
              <div style={{ display: "flex", gap: "6mm" }}>
                {/* TEXT column */}
                <div className="merchentInfo" style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ผู้ขาย :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>
                        {SITE_LEGAL_NAME_TH}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ที่อยู่ :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{issuerAddress}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>เลขที่ภาษี :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{TAX_ID} (สำนักงานใหญ่)</p>
                    </div>
                  </div>
                </div>
                {/* CONTACT column */}
                <div className="merchentContact" style={{ minWidth: "38mm" }}>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center", marginBottom: "1px" }}>
                    <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>📞</div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{CONTACT.phoneCompanyDisplay}</p>
                  </div>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center", marginBottom: "1px" }}>
                    <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>✉</div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{CONTACT.emailAcc}</p>
                  </div>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                    <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>🌐</div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>pacred.co.th</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CUSTOMER BLOCK */}
            <div id="contactInfo">
              <div style={{ display: "flex", gap: "6mm" }}>
                {/* TEXT column */}
                <div className="contactInfo" style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ลูกค้า :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>
                        {customerName}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ที่อยู่ :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "10px", color: "#374151", whiteSpace: "pre-wrap" }}>
                        {customerAddress || "-"}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>เลขที่ภาษี :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{customerTaxId || "-"}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "3px" }}>
                    <div style={{ minWidth: "30px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>เรียน :</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>-</p>
                    </div>
                  </div>
                </div>
                {/* CONTACT column (customer — typically empty) */}
                <div className="contactContact" style={{ minWidth: "38mm" }}>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center", marginBottom: "1px" }}>
                    <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>📞</div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>-</p>
                  </div>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center", marginBottom: "1px" }}>
                    <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>✉</div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>-</p>
                  </div>
                  <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
                    <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>🌐</div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>-</p>
                  </div>
                </div>
              </div>
            </div>

          </div>{/* end LEFT PAIR */}

          {/* RIGHT: meta-box (เลขที่/วันที่/อ้างอิง) */}
          <div>
            <div id="documentInfo">
              <div style={{ background: tintBg, borderRadius: "2px", minWidth: "55mm" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", marginBottom: "2px" }}>
                  <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>เลขที่เอกสาร :</p>
                  <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{rid}</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", marginBottom: "2px" }}>
                  <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>วันที่ออก :</p>
                  <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{issueDate}</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px" }}>
                  <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>อ้างอิง :</p>
                  <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{rid}</p>
                </div>
              </div>
            </div>
          </div>

        </div>{/* end INFO ROW */}

        {/* ── ITEMS TABLE — Pacred 7-col cargo table (verbatim — do not modify) ── */}
        <div className="detail" style={{ height: "182px", overflow: "visible" }}>
          <div id="product">
            {/* Header row with orange tint bg */}
            <div id="headerItemColumn">
              <table style={{ width: "100%", borderCollapse: "collapse", background: tintBg }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 4px", width: "7%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      ลำดับ<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>No.</span>
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 4px", width: "11%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      เลขที่ออเดอร์<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>Order No.</span>
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 4px", width: "39%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      รหัสพัสดุ<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>Tracking</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 4px", width: "7%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      จำนวน<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>Box</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 4px", width: "10%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      น้ำหนัก<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>Wt./kg</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 4px", width: "11%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      ปริมาตร<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>Vol./CBM</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 4px", width: "15%", fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
                      ค่าขนส่ง<br /><span style={{ fontSize: "9px", fontWeight: "normal", color: "#6b7280" }}>Amount</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", color: "#6b7280", background: "#fff" }}>
                        ไม่พบรายการ
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr key={`${pageNumber}-${row.no}`} style={{ background: "#fff" }}>
                        <td style={{ padding: "3px 4px", fontSize: "10px", textAlign: "center", borderTop: "0.5px solid #e5e7eb" }}>{row.no}</td>
                        <td style={{ padding: "3px 4px", fontSize: "9px", textAlign: "center", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>#{row.fid}</td>
                        <td style={{ padding: "3px 4px", fontSize: "9px", wordBreak: "break-all", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{row.tracking}</td>
                        <td style={{ padding: "3px 4px", fontSize: "10px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt0(row.famount)}</td>
                        <td style={{ padding: "3px 4px", fontSize: "10px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt2(row.fweight)}</td>
                        <td style={{ padding: "3px 4px", fontSize: "10px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt5(row.fvolume)}</td>
                        <td style={{ padding: "3px 4px", fontSize: "10px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt2(row.ftotalprice)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── SPACER: flex:1 pushes summary to bottom of the page ─────────── */}
        <div style={{ flex: 1 }} />

        {/* ── SUMMARY + PAYMENT + REMARK + CERTIFIED (last page only) ─────── */}
        {pageNumber === pageCount && (
          <div>
            {/* SUMMARY — 2 columns: amountInfo LEFT · big amount box RIGHT */}
            <div style={{ display: "flex", gap: "6mm", marginBottom: "3mm" }}>
              {/* LEFT: สรุป + Thai words */}
              <div id="amountInfo" style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "4mm" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>สรุป</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>มูลค่าไม่มีหรือยกเว้นภาษี</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(preTax)} บาท</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderTop: "0.5px solid #e5e7eb", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>จำนวนเงินทั้งสิ้น</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", maxWidth: "55mm", textAlign: "right" }}>
                        {grandTotalThaiWord}บาทถ้วน
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: big amount box + WHT rows */}
              <div id="summary">
                <div>
                  {/* Big orange-tint amount box */}
                  <div style={{ background: tintBg, borderRadius: "2px", padding: "4px 8px", marginBottom: "2px", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>จำนวนเงินทั้งสิ้น</p>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#111827" }}>
                      {fmt2(grandTotal)} <span style={{ fontSize: "12px" }}>บาท</span>
                    </h3>
                  </div>
                  {/* WHT + net rows below the box */}
                  <div className="withholding">
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", textAlign: "right" }}>
                        จำนวนเงินที่ถูกหัก ณ ที่จ่าย
                      </p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", minWidth: "22mm", textAlign: "right" }}>
                        {fmt2(showWht ? whtAmount : 0)} บาท
                      </p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", textAlign: "right" }}>
                        จำนวนเงินที่ชำระ
                      </p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", minWidth: "22mm", textAlign: "right" }}>
                        {fmt2(netPaid)} บาท
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* PAYMENT — 2 columns inside paymentGroupShort */}
            <div style={{ display: "flex", gap: "6mm", marginBottom: "3mm", minHeight: "20mm" }}>
              <div id="payment" style={{ flex: 1 }}>
                <div id="paymentGroupShort">
                  <div className="paymentGroup" style={{ display: "flex", gap: "4mm" }}>
                    {/* Heading */}
                    <div>
                      <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>ชำระเงิน</p>
                    </div>
                    <div className="contentPayment" style={{ flex: 1, display: "flex", gap: "6mm" }}>
                      {/* LEFT: date + total */}
                      <div className="total" style={{ minWidth: "40mm" }}>
                        <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
                          <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>วันที่ชำระ :</p>
                          <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{issueDate}</p>
                        </div>
                        <div style={{ display: "flex", gap: "3px" }}>
                          <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>จำนวนเงินรวม :</p>
                          <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(grandTotal)} บาท</p>
                        </div>
                      </div>
                      {/* RIGHT: bank + WHT */}
                      <div className="detail" style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
                          <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
                            <div className="bankNumber">
                              <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>ธ.กสิกรไทย</p>
                              <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#111827" }}>
                                ออมทรัพย์ {BANK.accountNumber}
                              </p>
                              <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>{BANK.accountName}</p>
                            </div>
                          </div>
                          <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(netPaid)} บาท</p>
                        </div>
                        {/* WHT row */}
                        {showWht && (
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <div>
                              <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>ภาษีหัก ณ ที่จ่าย</p>
                            </div>
                            <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(whtAmount)} บาท</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* REMARK */}
            <div style={{ display: "flex", gap: "4mm", marginBottom: "3mm" }}>
              <div id="remark">
                <div style={{ display: "flex", gap: "4mm" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>หมายเหตุ</p>
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>
                      *ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CERTIFIED — 6 boxes in one row */}
            <div style={{ display: "flex", gap: "4mm" }}>
              <div id="certified" style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "2mm" }}>

                  {/* Heading */}
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minWidth: "14mm" }}>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>รับรอง</p>
                  </div>

                  {/* Box 1: QR */}
                  <div className="certifiedBox qrCode" style={{ flex: 1, textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      สแกนเพื่อเปิดด้วยเว็บไซต์
                    </p>
                    <div className="image" style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "center" }}>
                      <div style={{ width: "18mm", height: "18mm", background: "#f9fafb", border: "0.5px solid #d1d5db", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: "7px", color: "#9ca3af", textAlign: "center" }}>QR</span>
                      </div>
                    </div>
                  </div>

                  {/* Box 2: ผู้ออกเอกสาร (ผู้ขาย) */}
                  <div className="certifiedBox userCreate" style={{ flex: 1, textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ผู้ออกเอกสาร (ผู้ขาย)</p>
                    <div className="image" style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "flex-end" }}>
                      <Image
                        src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                        alt="ลายมือชื่อ"
                        width={70}
                        height={28}
                        unoptimized
                        style={{ width: "20mm", height: "auto" }}
                      />
                    </div>
                    <div className="detail" style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{documentIssuer}</p>
                      <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>{rDateCreate}</p>
                    </div>
                  </div>

                  {/* Box 3: ผู้อนุมัติเอกสาร (ผู้ขาย) */}
                  <div className="certifiedBox userApprove" style={{ flex: 1, textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ผู้อนุมัติเอกสาร (ผู้ขาย)</p>
                    <div className="image" style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "flex-end" }}>
                      <Image
                        src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                        alt="ลายมือชื่อ"
                        width={70}
                        height={28}
                        unoptimized
                        style={{ width: "20mm", height: "auto" }}
                      />
                    </div>
                    <div className="detail" style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>
                        {documentApprover || documentIssuer}
                      </p>
                      <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>{rDateCreate}</p>
                    </div>
                  </div>

                  {/* Box 4: ตราประทับ (ผู้ขาย) */}
                  <div className="certifiedBox merchantStamp" style={{ flex: 1, textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ตราประทับ (ผู้ขาย)</p>
                    <div className="image" style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "center" }}>
                      <Image
                        src="/images/pacred-stamp.png"
                        alt="ตราประทับ"
                        width={48}
                        height={48}
                        unoptimized
                        style={{ width: "14mm", height: "auto" }}
                      />
                    </div>
                    <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>&nbsp;</p>
                    </div>
                  </div>

                  {/* Box 5: ผู้รับเอกสาร (ลูกค้า) */}
                  <div className="certifiedBox received" style={{ flex: 1, textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ผู้รับเอกสาร (ลูกค้า)</p>
                    <div className="emptyBoxRemainingSignature" style={{ height: "18mm", border: "0.5px solid #d1d5db" }}></div>
                    <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{customerName}</p>
                    </div>
                  </div>

                  {/* Box 6: ตราประทับ (ลูกค้า) */}
                  <div className="certifiedBox stamp" style={{ flex: 1, textAlign: "center" }}>
                    <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ตราประทับ (ลูกค้า)</p>
                    <div className="stampBox" style={{ height: "18mm", border: "0.5px solid #d1d5db" }}></div>
                    <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>&nbsp;</p>
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Page stamp (tiny) */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4mm", fontSize: "8px", color: "#9ca3af" }}>
              <div>
                ผู้ออก: <span style={{ color: "#6b7280" }}>{documentIssuer}</span>
                {documentApprover && (
                  <> · ผู้อนุมัติ: <span style={{ color: "#6b7280" }}>{documentApprover}</span></>
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
        Print stylesheet — A4 portrait · 1.5cm margins · two-page output
        (ต้นฉบับ + สำเนา). Peak uses a single paperTransaction wrapper per page;
        we replicate that with page-break-after between ReceiptPage instances.
        flex column on .subpage ensures the spacer pushes content to the bottom.
      */}
      <style>{`
        @media print {
          /* 2026-06-09 ภูม flag round 6: receipt content stopped halfway
             down page 1 with the bottom ~150mm blank. Round-5 had
             min-height:auto on .receipt-page that overrode the inline
             minHeight:277mm — so the page collapsed to content height
             and the flex:1 spacer (between table and summary) had no room
             to grow. Solution: drop that override + give .receipt-page an
             explicit print height = the A4 printable area minus the @page
             safe margin (297mm − 2*8mm = 281mm). The flex:1 spacer then
             pushes the summary/payment/cert block to the bottom of the
             page as designed.

             @page margin = 8mm (printer-safe edge, single layer — no
             padding stacking with .subpage's internal 10mm/12mm gutter).
             Chrome's datetime/URL/page-# header/footer is dialog-only
             ("Headers and footers: off"). Sidebar is print:hidden via the
             admin layout. */
          @page { size: A4 portrait; margin: 8mm; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .no-print, .no-print * { display: none !important; }
          .receipt-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
            width: 100% !important;
            /* A4 portrait inner area = 297mm − 2×8mm @page margin = 281mm.
               Use both height and min-height so the flex:1 spacer has a
               concrete target to grow into. */
            height: 281mm !important;
            min-height: 281mm !important;
            page-break-after: always;
            page-break-inside: avoid;
          }
          .receipt-page:last-child { page-break-after: auto; }
          /* Inner subpage takes the full receipt-page height and zeros its
             own padding (the @page margin is the safe edge). */
          .receipt-page .subpage {
            padding: 0 !important;
            height: 100% !important;
            min-height: 100% !important;
          }
        }
        @media screen {
          .receipt-page {
            margin: 16px auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
            border: 1px solid #e5e7eb;
            border-radius: 4px;
          }
        }
        /* ensure flex column inside subpage so spacer works on screen too */
        .subpage {
          display: flex;
          flex-direction: column;
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
              <br />
              <b className="mt-1 inline-block">หน้าต่างพิมพ์ Chrome:</b> ตั้ง <b>&ldquo;More settings → Headers and footers: ปิด&rdquo;</b> +
              <b>&ldquo;Margins: None&rdquo;</b> เพื่อตัดวันที่/URL/เลขหน้าของ browser ออกจากเอกสาร
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

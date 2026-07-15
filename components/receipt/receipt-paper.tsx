/**
 * Shared receipt "paper" render (FAITHFUL PORT) — used by BOTH:
 *   - admin   `/admin/accounting/forwarder-invoice/[id]`  (gated · staff reprint)
 *   - public  `/r/[token]`                                 (login-free · QR opens)
 *
 * 2026-06-10 ภูม flag round 8 (point 4): the receipt render + its print/screen
 * CSS were inlined in the admin page (~1250 lines). They are MOVED here verbatim
 * so the admin page and the public page render BYTE-IDENTICALLY — no duplicated
 * JSX, no drifting money figures. The data-load + money math live in
 * `lib/receipt/load-receipt-document.ts` (one source); the per-surface QR URL is
 * passed in as `qrDataUrl`.
 *
 * Two pages render per side:
 *   - ต้นฉบับ (Original) — orange title #FFA30A
 *   - สำเนา   (Copy)     — gray title #5F5D5A
 *
 * Layout matches Peak's id="paperTransaction" structure exactly:
 *   1. headerFormatOne — logo LEFT · (ต้นฉบับ) label + orange title RIGHT
 *   2. d-inline-flex info row — issuer+customer LEFT stacked · meta-box RIGHT
 *   3. items table — OUR 7-col Pacred cargo table (kept verbatim)
 *   4. big spacer (flex:1) pushing summary to bottom
 *   5. summary 2-col — amountInfo LEFT · big amount box RIGHT
 *   6. payment 2-col — date+total LEFT · bank+WHT RIGHT
 *   7. remark
 *   8. certified 6 boxes — QR·ผู้ออก·ผู้อนุมัติ·ตราประทับ(ผู้ขาย)·ผู้รับ·ตราประทับ(ลูกค้า)
 *
 * This module is a Server Component (no "use client"/"use server"). It imports
 * ONLY site constants + next/image — never supabase/auth/QRCode/readThaiBaht.
 */

import Image from "next/image";
import {
  SITE_LEGAL_NAME_TH,
  SITE_LEGAL_NAME,
  TAX_ID,
  CONTACT,
  DOC_SIGNATORY,
} from "@/components/seo/site";
import { serviceAccountFor } from "@/lib/services/service-catalog";
import { DocSectionLabel } from "./doc-section-label";
import { DocCertRow } from "./doc-cert-row";

// ใบเสร็จ ฝากนำเข้าคาร์โก้ (ไม่ออกใบกำกับ) → เก็บเข้าบัญชี LOGISTICS 225-2-91144-0,
// resolved through serviceAccountFor("import_cargo") (owner 2026-07-07 v2: cargo
// import = งานขนส่งผ่านบริษัทเฟรทเจ้าอื่น = logistics) so the bill, the receipt, AND
// the forwarder-invoice all show the SAME account for the same order. A ใบกำกับ
// receipt would override to TRADING (+ VAT 7%). Mirrors BILL_ACCOUNT in
// billing-run-paper.tsx.
const RECEIPT_ACCOUNT = serviceAccountFor("import_cargo");

// ── Shared render types (single source of truth) ─────────────

/** One line in the cargo items table. */
export type ReceiptPageRow = {
  no:           number;
  fid:          string;
  tracking:     string;
  cabinet:      string;
  transport:    string;
  rateBasis:    string;
  rate:         number;
  famount:      number;
  fweight:      number;
  fvolume:      number;
  ftotalprice:  number;
};

/** The receipt-level totals breakdown (per-leg sums, pre-WHT).
 *  Each leg is its OWN named fee (owner 2026-07-07 · money-accounting rule):
 *  ค่าขนส่งในไทย (fTransport · LOGISTICS) and ค่าอื่นๆ MUST be distinct lines — never
 *  lumped into one opaque "บริการอื่นๆ". `priceOther` now carries ONLY
 *  fshippingservice + priceother (crate + update split out). */
export type ReceiptTotals = {
  fTotal:           number; // ค่าขนส่งสินค้า  (freight · ftotalprice)
  fTransportCHNTHB: number; // ค่าขนส่งจีน+    (ftransportpricechnthb)
  fTransport:       number; // ค่าขนส่งในไทย   (ftransportprice · LOGISTICS)
  crate:            number; // ค่าตีลัง        (pricecrate)
  update:           number; // ค่าอัปเดต       (fpriceupdate)
  priceOther:       number; // ค่าอื่นๆ        (fshippingservice + priceother)
  fDiscount:        number; // ส่วนลด          (fdiscount · subtracted)
};

/**
 * Everything that is identical across every page + both sides of a receipt.
 * NOTE: does NOT include `qrDataUrl` (that is per-surface — admin vs public).
 */
export type ReceiptCommonProps = {
  rid:                string;
  issuerAddress:      string;
  issueDate:          string;
  rDateCreate:        string;
  customerName:       string;
  customerTaxId:      string;
  customerAddress:    string;
  totals:             ReceiptTotals;
  /** ค่าส่งเหมาๆ (PCSF flat ฿100/shipment) — its own line · already in grandTotal/preTax. */
  maoFee:             number;
  showWht:            boolean;
  whtAmount:          number;
  grandTotal:         number;
  /**
   * The STORED, frozen pre-WHT total (= `tb_receipt.totalbeforewithholding`,
   * incl เหมาๆ). A receipt is a document-of-record: its printed totals must
   * equal what was stored at issuance (and match its ใบวางบิล) — NOT a live
   * re-sum of the forwarder rows, which drift if a price is edited after the
   * doc is issued (ภูม flag 2026-07-01 · บิล 2,135.43 vs ใบเสร็จ 2,057).
   * When supplied, the "มูลค่าไม่มีหรือยกเว้นภาษี / จำนวนเงินทั้งสิ้น" figure
   * renders this stored value instead of recomputing `preTax` from `totals`.
   * Optional so the other surfaces that reuse this render (quote / bill / shop
   * doc) — which pass no such prop — keep their existing live-derived behaviour.
   */
  preTaxTotal?:       number;
  grandTotalThaiWord: string;
  documentIssuer:     string;
  documentApprover:   string;
  pageCount:          number;
  /** Order reference for the meta-box "อ้างอิง" — the forwarder order-no(s) this
   *  receipt covers (e.g. "#52114" or "#52114, #52120"). Empty → falls back to
   *  the receipt no. (rid) so the box is never blank. */
  referenceOrder:     string;
};

/** Props for the full `<ReceiptPaper>` wrapper. */
export type ReceiptPaperProps = ReceiptCommonProps & {
  pages:     Array<{ pageNumber: number; rows: ReceiptPageRow[] }>;
  qrDataUrl: string;
  /**
   * Render the สำเนา (Copy) set after the ต้นฉบับ set. Default `true` (=
   * legacy: ต้นฉบับ + สำเนา · 2N pages). Pass `false` for a ต้นฉบับ-only print
   * (the "พิมพ์ใบเสร็จ ต้นฉบับ" button · legacy had the two separate buttons).
   */
  withCopy?: boolean;
};

// ── Number / format helpers (render-time) ────────────────────

export function fmt2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmt5(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  });
}

export function fmt0(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
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
export function ReceiptPage({
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
  maoFee,
  showWht,
  whtAmount,
  grandTotal,
  preTaxTotal,
  grandTotalThaiWord,
  referenceOrder,
  pageNumber,
  pageCount,
  qrDataUrl,
}: ReceiptCommonProps & {
  label:      string;
  items:      ReceiptPageRow[];
  pageNumber: number;
  qrDataUrl:  string;
}) {
  const isOriginal = label === "ต้นฉบับ";
  // Peak: orange #FFA30A on ต้นฉบับ, gray #5F5D5A on สำเนา
  const titleColor   = isOriginal ? "#FFA30A" : "#5F5D5A";
  // Peak orange tint bg: rgba(255,163,10,0.165) ≈ #FFF0CC; gray tint ≈ #EBEBEA
  const tintBg       = isOriginal ? "rgba(255,163,10,0.165)" : "rgba(95,93,90,0.165)";

  // preTax = the PRE-WHT grand total (incl เหมาๆ). A receipt is a FROZEN
  // document-of-record: when the loader supplies the stored
  // `preTaxTotal` (= tb_receipt.totalbeforewithholding), render THAT verbatim
  // so the printed doc equals what was issued (and its ใบวางบิล) and can't
  // drift when a forwarder price is edited later (ภูม flag 2026-07-01). Only
  // when no stored value is passed (the quote / bill / shop-doc surfaces) do we
  // fall back to the live per-leg re-sum (= lineSumWithMao upstream).
  const preTax = (preTaxTotal !== undefined && preTaxTotal !== null)
    ? preTaxTotal
    : totals.fTotal + totals.fTransportCHNTHB + totals.fTransport +
      totals.crate + totals.update + totals.priceOther - totals.fDiscount + maoFee;
  // netPaid = the real amount the customer settles. `grandTotal` is ALREADY
  // net of WHT upstream (grandTotal = totalLineSum − whtAmount), so netPaid IS
  // grandTotal — do NOT subtract WHT again (that double-counted it). This is
  // the figure ภูม wants highlighted (point 6: "ยอดจริงที่ลูกค้าต้องชำระ").
  const netPaid = grandTotal;

  // ── Named fee split (owner 2026-07-07 · money-accounting rule) ──
  // The สรุป lists each fee under its CORRECT label — never lumping
  // ค่าขนส่งในไทย (ftransportprice · LOGISTICS account) into a generic "อื่นๆ",
  // never conflating it with ค่าส่งเหมาๆ (SERVICE · promo). The ค่าขนส่งสินค้า
  // (freight) line is the BALANCING remainder so the itemized lines re-sum to
  // preTax to the satang regardless of any post-issue drift (totals = detail;
  // preTax = the frozen authoritative total). Pure re-presentation — no new money.
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const feeThaiShipping = r2(totals.fTransport);
  const feeChnPlus      = r2(totals.fTransportCHNTHB);
  const feeCrate        = r2(totals.crate);
  const feeUpdate       = r2(totals.update);
  const feeOther        = r2(totals.priceOther);
  const feeDiscount     = r2(totals.fDiscount);
  const feeMao          = r2(maoFee);
  const feeFreight      = r2(
    r2(preTax) - feeMao -
      (feeThaiShipping + feeChnPlus + feeCrate + feeUpdate + feeOther - feeDiscount),
  );

  return (
    <div
      id="paperTransaction"
      className="receipt-page bg-white text-black mx-auto"
      style={{ width: "210mm", minHeight: "277mm", display: "flex", flexDirection: "column" }}
    >
      <div className="paperTransaction subpage" style={{ padding: "10mm 12mm", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── headerFormatOne: logo LEFT · (label) + title RIGHT ─────────── */}
        <div id="headerFormatOne" style={{ marginBottom: "2mm" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            {/* LEFT: merchant logo — TIGHT-cropped wordmark (whitespace trimmed
                so it renders ~3× larger at the same height). ภูม flag round 8:
                the square 140×140 PNG had ~75% vertical whitespace, so a 22mm
                box only showed a ~6mm-tall wordmark. The tight 134×36 asset
                fills its box → height 17mm = a genuine Peak-scale wordmark. */}
            <div id="merchantLogo" style={{ display: "flex", alignItems: "center" }}>
              <Image
                src="/images/pacred-logo-tight.png"
                alt={SITE_LEGAL_NAME}
                width={268}
                height={72}
                unoptimized
                style={{ width: "auto", height: "14mm", display: "block" }}
              />
            </div>

            {/* RIGHT: (ต้นฉบับ) label ABOVE title — Peak-scale 28px title */}
            <div id="etaxWording" style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>({label})</div>
              <div id="documentName">
                <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "bold", color: titleColor, lineHeight: 1.1 }}>
                  <span>ใบเสร็จรับเงิน</span>
                </h2>
              </div>
            </div>
          </div>
        </div>

        {/* ── INFO ROW: issuer+customer LEFT · meta-box RIGHT ─────────────── */}
        <div style={{ display: "flex", gap: "8mm", marginBottom: "1.5mm" }}>

          {/* LEFT PAIR: issuer on top, customer below */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* ISSUER BLOCK */}
            <div id="merchantInfo" style={{ marginBottom: "1.5mm" }}>
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
                  {/* Order-no(s) this receipt covers — falls back to the receipt
                      no. only when no order is resolvable (never blank). */}
                  <p style={{ margin: 0, fontSize: "10px", color: "#111827", maxWidth: "32mm", textAlign: "right", wordBreak: "break-word" }}>
                    {referenceOrder || rid}
                  </p>
                </div>
                {/* หน้า X/N — re-added 2026-06-26 (the height is now flex, so it
                    no longer overflows the page box like the old footer strip
                    that printed a 2-page receipt as 4). Lives in the meta-box so
                    it appears on EVERY page, only when the receipt has >1 page. */}
                {pageCount > 1 && (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>หน้า :</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{pageNumber}/{pageCount}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>{/* end INFO ROW */}

        {/* ── ITEMS TABLE — Pacred 7-col cargo table (verbatim — do not modify) ──
            2026-06-26: was a FIXED height:"182px" + overflow:"visible" — 13 rows
            grew taller than 182px and SPILLED OUT, colliding with the summary /
            falling off the page (a 13-row receipt printed across 4 pages). Now
            the items area FLEX-GROWS to fill the space above the bottom summary
            (flex:1 minHeight:0), so the rows lay out naturally and the page-chunk
            (ROWS_PER_PAGE) decides where a page breaks. The separate flex:1
            spacer below is removed (this area is the grower now). */}
        <div className="detail" style={{ flex: 1, minHeight: 0, overflow: "visible" }}>
          <div id="product">
            {/* Header row with orange tint bg */}
            <div id="headerItemColumn">
              {/* ภูม flag round 8: extended 11-col cargo table — added เลขตู้
                  (cabinet GZE/GZS) · ขนส่ง (EK/SEA) · คิดตาม (KG/CBM basis) ·
                  เรท (฿/unit) between Tracking and Amount. Fonts 9/8px + tuned
                  width% so the wider table still fits A4 portrait. */}
              <table style={{ width: "100%", borderCollapse: "collapse", background: tintBg, tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 3px", width: "4%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      ลำดับ<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>No.</span>
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 3px", width: "8%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      ออเดอร์<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Order</span>
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 3px", width: "17%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      รหัสพัสดุ<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Tracking</span>
                    </th>
                    <th style={{ textAlign: "left", padding: "4px 3px", width: "13%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      เลขตู้<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Cabinet</span>
                    </th>
                    <th style={{ textAlign: "center", padding: "4px 3px", width: "6%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      ขนส่ง<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Ship</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 3px", width: "5%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      ลัง<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Box</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 3px", width: "8%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      น้ำหนัก<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Kg</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 3px", width: "9%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      ปริมาตร<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>CBM</span>
                    </th>
                    <th style={{ textAlign: "center", padding: "4px 3px", width: "7%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      คิดตาม<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Basis</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 3px", width: "9%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      เรท<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Rate ฿</span>
                    </th>
                    <th style={{ textAlign: "right", padding: "4px 3px", width: "14%", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
                      ค่าขนส่ง<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>Amount</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", color: "#6b7280", background: "#fff" }}>
                        ไม่พบรายการ
                      </td>
                    </tr>
                  ) : (
                    items.map((row) => (
                      <tr
                        key={`${pageNumber}-${row.no}`}
                        style={{ background: "#fff", breakInside: "avoid", pageBreakInside: "avoid" }}
                      >
                        <td style={{ padding: "3px 3px", fontSize: "9px", textAlign: "center", borderTop: "0.5px solid #e5e7eb" }}>{row.no}</td>
                        <td style={{ padding: "3px 3px", fontSize: "8px", textAlign: "center", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>#{row.fid}</td>
                        <td style={{ padding: "3px 3px", fontSize: "8px", wordBreak: "break-all", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{row.tracking}</td>
                        <td style={{ padding: "3px 3px", fontSize: "8px", wordBreak: "break-all", fontFamily: "monospace", color: "#374151", borderTop: "0.5px solid #e5e7eb" }}>{row.cabinet || "—"}</td>
                        <td style={{ padding: "3px 3px", fontSize: "8px", textAlign: "center", fontWeight: "bold", color: row.transport === "SEA" ? "#1d4ed8" : "#b45309", borderTop: "0.5px solid #e5e7eb" }}>{row.transport || "—"}</td>
                        <td style={{ padding: "3px 3px", fontSize: "9px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt0(row.famount)}</td>
                        <td style={{ padding: "3px 3px", fontSize: "9px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt2(row.fweight)}</td>
                        <td style={{ padding: "3px 3px", fontSize: "9px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt5(row.fvolume)}</td>
                        <td style={{ padding: "3px 3px", fontSize: "8px", textAlign: "center", color: "#374151", borderTop: "0.5px solid #e5e7eb" }}>{row.rateBasis || "—"}</td>
                        <td style={{ padding: "3px 3px", fontSize: "9px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{row.rate > 0 ? fmt2(row.rate) : "—"}</td>
                        <td style={{ padding: "3px 3px", fontSize: "9px", textAlign: "right", fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" }}>{fmt2(row.ftotalprice)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── (spacer removed 2026-06-26 — the .detail items area above is now the
              flex-grower that pushes the summary to the bottom of the page) ──── */}

        {/* ── SUMMARY + PAYMENT + REMARK + CERTIFIED (last page only) ─────── */}
        {pageNumber === pageCount && (
          <div>
            {/* SUMMARY — 2 columns: amountInfo LEFT · big amount box RIGHT */}
            <div style={{ display: "flex", gap: "6mm", marginBottom: "1.5mm" }}>
              {/* LEFT: สรุป — the SAME full breakdown as the ใบวางบิล (owner
                  2026-07-06: the receipt summary was the OLD truncated form —
                  it jumped straight to the total, hiding the base freight line).
                  Now: ค่าขนส่งรายการ(base) → + ค่าส่งเหมาๆ(PRF) → รวมทั้งสิ้น(preTax)
                  → หัก ณ ที่จ่าย(WHT) → the spelled-out NET the customer pays.
                  base = preTax − เหมาๆ (preTax is the pre-WHT total incl เหมาๆ). */}
              <div id="amountInfo" style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "4mm" }}>
                  <div>
                    <DocSectionLabel section="summary" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ค่าขนส่งสินค้า</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeFreight)} บาท</p>
                    </div>
                    {/* Each non-freight fee under its OWN correct label (ค่าขนส่งในไทย
                        = LOGISTICS · distinct from ค่าส่งเหมาๆ = SERVICE promo). */}
                    {feeThaiShipping > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>+ ค่าขนส่งในไทย</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeThaiShipping)} บาท</p>
                      </div>
                    )}
                    {feeChnPlus > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>+ ค่าขนส่งจีน+</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeChnPlus)} บาท</p>
                      </div>
                    )}
                    {feeCrate > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>+ ค่าตีลัง</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeCrate)} บาท</p>
                      </div>
                    )}
                    {feeUpdate > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>+ ค่าอัปเดต</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeUpdate)} บาท</p>
                      </div>
                    )}
                    {feeOther > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>+ ค่าอื่นๆ</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeOther)} บาท</p>
                      </div>
                    )}
                    {feeDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#b91c1c" }}>− ส่วนลด</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#b91c1c" }}>{fmt2(feeDiscount)} บาท</p>
                      </div>
                    )}
                    {feeMao > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>+ ค่าส่งเหมาๆ (PRF)</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(feeMao)} บาท</p>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px", borderTop: "0.5px solid #e5e7eb", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>รวมทั้งสิ้น</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827" }}>{fmt2(preTax)} บาท</p>
                    </div>
                    {showWht && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                        <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>หัก ณ ที่จ่าย 1%</p>
                        <p style={{ margin: 0, fontSize: "10px", color: "#b91c1c" }}>−{fmt2(whtAmount)} บาท</p>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderTop: "0.5px solid #e5e7eb", paddingTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>จำนวนเงินที่ชำระ</p>
                      {/* grandTotalThaiWord = readThaiBaht(grandTotal) = the NET
                          (post-WHT) — the same figure highlighted at RIGHT + on
                          the ใบวางบิล. Rendered bare (readThaiBaht already ends in
                          บาทถ้วน / สตางค์); the old "…บาทถ้วน" here double-suffixed
                          it AND sat on the preTax row (value↔label mismatch). */}
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", maxWidth: "55mm", textAlign: "right" }}>
                        {grandTotalThaiWord}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT: total + WHT rows · big highlight box on จำนวนเงินที่ชำระ
                  (ภูม flag round 8: the orange highlight moved from grandTotal
                  to NET-PAID — that's the real amount the customer settles, so
                  it's the figure that must stand out). */}
              <div id="summary">
                <div>
                  {/* Plain rows: total + WHT (no highlight) */}
                  <div className="withholding" style={{ marginBottom: "2px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", textAlign: "right" }}>
                        จำนวนเงินทั้งสิ้น
                      </p>
                      {/* PRE-WHT total (preTax) — so the breakdown reads
                          total − WHT = net paid (the highlighted box below). */}
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", minWidth: "26mm", textAlign: "right" }}>
                        {fmt2(preTax)} บาท
                      </p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", textAlign: "right" }}>
                        จำนวนเงินที่ถูกหัก ณ ที่จ่าย
                      </p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", minWidth: "26mm", textAlign: "right" }}>
                        {fmt2(showWht ? whtAmount : 0)} บาท
                      </p>
                    </div>
                  </div>
                  {/* Big orange-tint highlight box → NET PAID (the real figure) */}
                  <div style={{ background: tintBg, borderRadius: "2px", padding: "5px 10px", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>จำนวนเงินที่ชำระ</p>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#111827" }}>
                      {fmt2(netPaid)} <span style={{ fontSize: "12px" }}>บาท</span>
                    </h3>
                  </div>
                </div>
              </div>
            </div>

            {/* PAYMENT — 2 columns inside paymentGroupShort */}
            <div style={{ display: "flex", gap: "6mm", marginBottom: "1.5mm", minHeight: "13mm" }}>
              <div id="payment" style={{ flex: 1 }}>
                <div id="paymentGroupShort">
                  <div className="paymentGroup" style={{ display: "flex", gap: "4mm" }}>
                    {/* Heading */}
                    <div>
                      <DocSectionLabel section="payment" />
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
                              <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{RECEIPT_ACCOUNT.bankName}</p>
                              <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#111827" }}>
                                {RECEIPT_ACCOUNT.accountType} {RECEIPT_ACCOUNT.accountNo}
                              </p>
                              <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>{RECEIPT_ACCOUNT.accountName}</p>
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
            <div style={{ display: "flex", gap: "4mm", marginBottom: "1.5mm" }}>
              <div id="remark">
                <div style={{ display: "flex", gap: "4mm" }}>
                  <div>
                    <DocSectionLabel section="remark" />
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>
                      *ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CERTIFIED — the SHARED ✍️ รับรอง cert row (root-fix 2026-07-05):
                boxes = ผู้ออก · ผู้อนุมัติ · ตราประทับ(ผู้ขาย) · ผู้รับ(ขีดเซ็น) ·
                ตราประทับ(ลูกค้า) · QR-last. One <DocCertRow> for every paper. */}
            <div style={{ display: "flex", gap: "4mm" }}>
              <div id="certified" style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "2mm" }}>
                  {/* Heading (left) */}
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", minWidth: "14mm" }}>
                    <DocSectionLabel section="certify" />
                  </div>
                  <DocCertRow
                    qrDataUrl={qrDataUrl}
                    qrAlt={`QR เปิดใบเสร็จ ${rid}`}
                    customerName={customerName}
                    signatoryName={DOC_SIGNATORY.name}
                    dateIssued={rDateCreate}
                    approverName={DOC_SIGNATORY.name}
                    boxHeight="13mm"
                  />
                </div>
              </div>
            </div>
            {/* ภูม flag round 9 (point 2): removed the tiny "ผู้ออก/ผู้อนุมัติ ·
                หน้า X/N" footer strip — its marginTop pushed each side past the
                281mm page box, spilling a near-empty 2nd page (so a 2-page
                receipt printed as 4). The issuer/approver already appear in the
                certified boxes above, so nothing is lost. */}
          </div>
        )}

      </div>
    </div>
  );
}

/**
 * The full printable receipt: the print/screen CSS + every ต้นฉบับ page then
 * every สำเนา page (Originals first, then Copies — same as legacy
 * printReceipt.php: one mPDF AddPage loop for ต้นฉบับ, a second for สำเนา).
 * Each side gets its own page-count (1/N … N/N), totalling 2N printed pages.
 *
 * `qrDataUrl` is passed per-surface (admin → admin URL · public → public /r URL).
 * `common` is the shared object both surfaces compute identically.
 */
export function ReceiptPaper({ pages, qrDataUrl, withCopy = true, ...common }: ReceiptPaperProps) {
  return (
    <>
      {/*
        Print stylesheet — A4 portrait · two-page output (ต้นฉบับ + สำเนา).
        Peak uses a single paperTransaction wrapper per page; we replicate that
        with page-break-after between ReceiptPage instances. flex column on
        .subpage ensures the spacer pushes content to the bottom.
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
          @page { size: A4 portrait; margin: 3mm; }
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
            /* A4 portrait usable = 297mm − 2×3mm @page margin = 291mm. Reserve
               285mm (6mm slack) so a full receipt (incl. the ค่าส่งเหมาๆ row)
               NEVER spills a hair onto a 2nd sheet — the old 287mm@5mm was
               exactly the usable height (zero slack) so one extra summary row
               tipped each copy to 2 pages (2→4 sheets · owner 2026-07-02).
               The flex:1 spacer still pushes the summary/cert block to the
               bottom of this 285mm page. */
            height: 285mm !important;
            min-height: 285mm !important;
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
          /* ภูม flag round 8 (point 3): drop the hard 1px outline — it boxed
             the receipt like a table. Keep ONLY the soft drop-shadow so the
             page still floats as white "paper" on the gray bg (the Peak look),
             with no visible border line. */
          .receipt-page {
            margin: 16px auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
            border-radius: 4px;
          }
          /* ภูม flag round 8 (point 4 · public): the "เต็มจอ / fit" mode — the
             public toolbar toggles the receipt-fit class on the wrapper so the
             210mm paper scales to a narrow (mobile) viewport instead of
             overflowing. Desktop default is true paper (no class); mobile
             defaults to fit. */
          .receipt-fit .receipt-page {
            width: 100% !important;
            max-width: 210mm;
            margin-left: auto;
            margin-right: auto;
          }
        }
        /* ensure flex column inside subpage so spacer works on screen too */
        .subpage {
          display: flex;
          flex-direction: column;
        }
      `}</style>

      {pages.map((p) => (
        <ReceiptPage
          key={`orig-${p.pageNumber}`}
          label="ต้นฉบับ"
          {...common}
          pageNumber={p.pageNumber}
          items={p.rows}
          qrDataUrl={qrDataUrl}
        />
      ))}
      {withCopy && pages.map((p) => (
        <ReceiptPage
          key={`copy-${p.pageNumber}`}
          label="สำเนา"
          {...common}
          pageNumber={p.pageNumber}
          items={p.rows}
          qrDataUrl={qrDataUrl}
        />
      ))}
    </>
  );
}

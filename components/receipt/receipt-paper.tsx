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
  BANK,
} from "@/components/seo/site";

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

/** The receipt-level totals breakdown (per-leg sums, pre-WHT). */
export type ReceiptTotals = {
  fTotal:           number;
  fTransportCHNTHB: number;
  fTransport:       number;
  priceOther:       number;
  fDiscount:        number;
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
  showWht:            boolean;
  whtAmount:          number;
  grandTotal:         number;
  grandTotalThaiWord: string;
  documentIssuer:     string;
  documentApprover:   string;
  pageCount:          number;
};

/** Props for the full `<ReceiptPaper>` wrapper. */
export type ReceiptPaperProps = ReceiptCommonProps & {
  pages:     Array<{ pageNumber: number; rows: ReceiptPageRow[] }>;
  qrDataUrl: string;
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
  showWht,
  whtAmount,
  grandTotal,
  grandTotalThaiWord,
  documentIssuer,
  documentApprover,
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

  // preTax = sum of every charge leg − discount = the PRE-WHT grand total
  // (= totalLineSum upstream). For cargo freight there's no VAT, so this is
  // also the VAT-exempt value shown on the left.
  const preTax = totals.fTotal + totals.fTransportCHNTHB + totals.fTransport +
                 totals.priceOther - totals.fDiscount;
  // netPaid = the real amount the customer settles. `grandTotal` is ALREADY
  // net of WHT upstream (grandTotal = totalLineSum − whtAmount), so netPaid IS
  // grandTotal — do NOT subtract WHT again (that double-counted it). This is
  // the figure ภูม wants highlighted (point 6: "ยอดจริงที่ลูกค้าต้องชำระ").
  const netPaid = grandTotal;

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
                      <tr key={`${pageNumber}-${row.no}`} style={{ background: "#fff" }}>
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
                      <Image
                        src={qrDataUrl}
                        alt={`QR เปิดใบเสร็จ ${rid}`}
                        width={120}
                        height={120}
                        unoptimized
                        style={{ width: "18mm", height: "18mm", display: "block" }}
                      />
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
                        src="/images/pacred-stamp-tight.png"
                        alt="ตราประทับ"
                        width={106}
                        height={58}
                        unoptimized
                        style={{ width: "auto", height: "18mm" }}
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
export function ReceiptPaper({ pages, qrDataUrl, ...common }: ReceiptPaperProps) {
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
      {pages.map((p) => (
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

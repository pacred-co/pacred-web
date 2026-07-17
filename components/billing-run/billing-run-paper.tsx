/**
 * Peak-styled ใบวางบิล "paper" render (ภูม flag 2026-06-10: "ฟอร์มใบวางบิลเอาแบบ
 * peak ที่เราทำ" — make the billing-run document look like the Peak ใบเสร็จ we
 * already built in `components/receipt/receipt-paper.tsx`).
 *
 * Mirrors the receipt's Peak structure EXACTLY (same logo / 28px title /
 * orange-tint meta-box / 11-col cargo table / flex-spacer-to-bottom / big
 * highlight box / certified row with QR + stamp), adapted for a BILL:
 *   - title       = ใบวางบิล (instead of ใบเสร็จรับเงิน)
 *   - meta-box    = เลขที่ · วันที่ออก · ครบกำหนดชำระ (the credit term)
 *   - highlight   = ยอดชำระสุทธิ (net payable = total − WHT)
 *   - payment box = bank + "ชำระภายใน {due}" (the bill is pre-payment)
 *   - remark      = staff note + the 50-ทวิ instruction when WHT applies
 *   - certified   = QR · ผู้วางบิล(ผู้ขาย) · ตราประทับ(ผู้ขาย) · ผู้รับวางบิล(ลูกค้า)
 *
 * Renders ต้นฉบับ (orange) + สำเนา (gray) — two A4 pages, same as the receipt.
 * Reuses the receipt's fmt helpers + the SAME `.receipt-page`/`.subpage` print
 * CSS (one-page-fit math, @page 5mm) so both documents print identically.
 *
 * Server Component — imports ONLY site constants + next/image + the receipt
 * fmt helpers. Money is computed upstream (lib/billing/wht.ts) + passed in.
 */

import Image from "next/image";
import {
  SITE_LEGAL_NAME_TH,
  SITE_LEGAL_NAME,
  TAX_ID,
  CONTACT,
  DOC_SIGNATORY,
} from "@/components/seo/site";
import { fmt2, fmt5, fmt0 } from "@/components/receipt/receipt-paper";
import { DocSectionLabel } from "@/components/receipt/doc-section-label";
import { DocCertRow } from "@/components/receipt/doc-cert-row";
import { serviceAccountFor } from "@/lib/services/service-catalog";

// ใบวางบิล = ฝากนำเข้าคาร์โก้ billing (ไม่ออกใบกำกับ) → เก็บเข้าบัญชี LOGISTICS
// 225-2-91144-0 per the 3-account routing SOT (owner 2026-07-07 v2: cargo import =
// งานขนส่งผ่านบริษัทเฟรทเจ้าอื่น = logistics; freight + เหมาๆ + ค่าขนส่งในไทยรวมกัน).
// Resolved through serviceAccountFor("import_cargo") so it follows the lane SOT
// (a ใบกำกับ bill would override to TRADING). Same account the receipt uses
// (receipt-paper.tsx RECEIPT_ACCOUNT) so bill + receipt show the SAME account.
const BILL_ACCOUNT = serviceAccountFor("import_cargo");

export type BillingRunPaperRow = {
  no:          number;
  fid:         string;
  tracking:    string;
  cabinet:     string;
  transport:   string;
  rateBasis:   string;
  rate:        number;
  famount:     number;
  fweight:     number;
  fvolume:     number;
  /** ค่าขนส่งสินค้า (freight-only · ftotalprice) — the row Amount so Rate × Kg
   *  reconciles on the paper. The GROSS amount_thb is unchanged in storage. */
  freight:     number;
  amount:      number;
};

/**
 * Everything identical across every page + both sides of a bill (the summary
 * money is ALWAYS the full-bill total, computed upstream — NOT a per-page sum).
 * NOTE: does NOT carry the item rows — those are paginated (`pages`).
 */
export type BillingRunCommonProps = {
  docNo:         string;
  issuerAddress: string;
  dateIssued:    string;
  /**
   * ครบกำหนดชำระ = **เทอมเครดิตเท่านั้น**.
   * 🔴 owner 2026-07-17 (ด่วน · ลูกค้ารอจ่ายเงิน · บิล 122 PR134): "งานนี้ลูกค้าเป็นเงินสด
   * ไม่ต้องใส่ครบกำหนดชำระ **เอาหัวข้อออกไปเลย** · ลูกค้าเป็นเงินสดหรือเครดิต **ลิงค์กันด้วยสิ**
   * ลูกค้าเครดิตเรามีนิดเดียวเอง"
   * ลูกค้าเงินสด = จ่ายก่อนรับของ → "ครบกำหนดชำระ" ไม่มีความหมาย และทำให้ลูกค้าเข้าใจว่า
   * "ค่อยจ่ายวันนั้นก็ได้" = ชะลอการเก็บเงินเอง.
   * prod 2026-07-17: `tb_credit` = **0 แถวทั้งระบบ** แต่ใบวางบิล **122/122 ใบใส่วันครบกำหนดไว้หมด**
   * → เดิมใส่มาโดยไม่เคยเช็คว่าลูกค้าเป็นเครดิตไหม.
   * **null / "" = ลูกค้าเงินสด → ซ่อนทั้ง "ครบกำหนดชำระ" (meta) และ "กรุณาชำระภายใน" (ท้ายบิล)**
   */
  dateDue:       string | null;
  buyerName:     string;
  buyerTaxId:    string;
  buyerAddress:  string;
  /** DISPLAY-only ship-to snapshot (mig 0247) — rendered only when non-empty. */
  deliveryAddress: string;
  isJuristic:    boolean;
  subtotal:      number;
  /** ค่าส่งเหมาๆ (PCSF flat ฿100/shipment) — own summary line · included in total. */
  maoFee:        number;
  deliveryChn:   number;
  deliveryTh:    number;
  other:         number;
  discount:      number;
  /** Σ per-ROW named fees folded inside `subtotal` (owner 2026-07-07) — so the
   *  สรุป splits "ค่าขนส่งรายการ" into its correctly-labeled parts. Each is MERGED
   *  with the matching admin-typed header adjustment (ค่าขนส่งในไทย = sumThaiShipping
   *  + deliveryTh · etc.). The ค่าขนส่งสินค้า line is the balancing remainder so the
   *  itemized lines re-sum to `total` to the satang. Totals storage is unchanged. */
  sumThaiShipping: number; // ค่าขนส่งในไทย (LOGISTICS)
  sumChnPlus:      number; // ค่าขนส่งจีน+
  sumCrate:        number; // ค่าตีลัง
  sumUpdate:       number; // ค่าอัปเดต
  sumOtherRows:    number; // ค่าอื่นๆ
  sumDiscountRows: number; // ส่วนลด (per-row)
  total:         number;
  whtAmount:     number;
  netPayable:    number;
  netThaiWord:   string;
  note:          string;
  issuedBy:      string;
  qrDataUrl:     string;
};

/** Props for the full `<BillingRunPaper>` wrapper — items pre-chunked into pages. */
export type BillingRunPaperProps = BillingRunCommonProps & {
  pages: Array<{ pageNumber: number; rows: BillingRunPaperRow[] }>;
};

function BillingRunPage({
  label,
  qrDataUrl,
  rows,
  pageNumber,
  pageCount,
  ...p
}: BillingRunCommonProps & {
  label:      string;
  rows:       BillingRunPaperRow[];
  pageNumber: number;
  pageCount:  number;
}) {
  const isOriginal = label === "ต้นฉบับ";
  const titleColor = isOriginal ? "#FFA30A" : "#5F5D5A";
  const tintBg     = isOriginal ? "rgba(255,163,10,0.165)" : "rgba(95,93,90,0.165)";
  const showWht    = p.whtAmount > 0;
  const isLast     = pageNumber === pageCount;
  /** เครดิตเท่านั้นถึงมีวันครบกำหนด — เงินสดส่ง null/"" มา → ซ่อนทุกที่ที่พูดถึงวันครบกำหนด */
  const hasDueDate = String(p.dateDue ?? "").trim() !== "";

  // ── Named fee lines (owner 2026-07-07 · money-accounting rule) ──
  // Each per-row Σ is merged with the matching admin-typed header adjustment and
  // shown under its CORRECT label — ค่าขนส่งในไทย (LOGISTICS) is a distinct line,
  // never lumped into "อื่นๆ" nor conflated with ค่าส่งเหมาๆ (SERVICE promo).
  // ค่าขนส่งสินค้า is the BALANCING remainder so the itemized lines re-sum to
  // `total` to the satang (mig 0138 storage untouched — pure re-presentation).
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const feeThai     = r2(p.sumThaiShipping + p.deliveryTh); // ค่าขนส่งในไทย (LOGISTICS)
  const feeChn      = r2(p.sumChnPlus + p.deliveryChn);     // ค่าขนส่งจีน+
  const feeCrate    = r2(p.sumCrate);                       // ค่าตีลัง
  const feeUpdate   = r2(p.sumUpdate);                      // ค่าอัปเดต
  const feeOther    = r2(p.sumOtherRows + p.other);         // ค่าอื่นๆ
  const feeDiscount = r2(p.sumDiscountRows + p.discount);   // ส่วนลด
  const feeMao      = r2(p.maoFee);                         // ค่าส่งเหมาๆ (SERVICE)
  const feeFreight  = r2(
    r2(p.total) - feeMao - (feeThai + feeChn + feeCrate + feeUpdate + feeOther - feeDiscount),
  );

  return (
    <div
      className="receipt-page bg-white text-black mx-auto"
      style={{ width: "210mm", minHeight: "277mm", display: "flex", flexDirection: "column" }}
    >
      <div className="subpage" style={{ padding: "10mm 12mm", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── headerFormatOne: logo LEFT · (label) + title RIGHT ─────────── */}
        <div style={{ marginBottom: "2mm" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <Image
                src="/images/pacred-logo-tight.png"
                alt={SITE_LEGAL_NAME}
                width={268}
                height={72}
                unoptimized
                style={{ width: "auto", height: "14mm", display: "block" }}
              />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>({label})</div>
              <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "bold", color: titleColor, lineHeight: 1.1 }}>
                ใบวางบิล
              </h2>
              <div style={{ fontSize: "10px", color: "#9ca3af", letterSpacing: "0.5px" }}>BILLING NOTE</div>
            </div>
          </div>
        </div>

        {/* ── INFO ROW: issuer+customer LEFT · meta-box RIGHT ─────────────── */}
        <div style={{ display: "flex", gap: "8mm", marginBottom: "1.5mm" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ISSUER */}
            <div style={{ marginBottom: "1.5mm" }}>
              <div style={{ display: "flex", gap: "6mm" }}>
                <div style={{ flex: 1 }}>
                  <InfoLine k="ผู้ขาย :" v={SITE_LEGAL_NAME_TH} bold />
                  <InfoLine k="ที่อยู่ :" v={p.issuerAddress} />
                  <InfoLine k="เลขที่ภาษี :" v={`${TAX_ID} (สำนักงานใหญ่)`} />
                </div>
                <div style={{ minWidth: "38mm" }}>
                  <IconLine icon="📞" v={CONTACT.phoneCompanyDisplay} />
                  <IconLine icon="✉" v={CONTACT.emailAcc} />
                  <IconLine icon="🌐" v="pacred.co.th" />
                </div>
              </div>
            </div>
            {/* CUSTOMER */}
            <div>
              <InfoLine k="ลูกค้า :" v={p.buyerName || "-"} bold />
              {/* ONE address slot (owner 2026-07-13): a swapped delivery_address
                  REPLACES the address here — never a second "ที่อยู่จัดส่ง" heading. */}
              <InfoLine k="ที่อยู่ :" v={p.deliveryAddress || p.buyerAddress || "-"} pre />
              <InfoLine k="เลขที่ภาษี :" v={p.buyerTaxId || "-"} />
              <InfoLine k="ประเภท :" v={p.isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"} />
            </div>
          </div>

          {/* RIGHT meta-box */}
          <div>
            <div style={{ background: tintBg, borderRadius: "2px", minWidth: "55mm" }}>
              <MetaLine k="เลขที่เอกสาร :" v={p.docNo} />
              <MetaLine k="วันที่ออก :" v={p.dateIssued} />
              {/* เครดิตเท่านั้น — เงินสด (dateDue ว่าง) เอาหัวข้อออกทั้งบรรทัด (owner 2026-07-17) */}
              {hasDueDate && <MetaLine k="ครบกำหนดชำระ :" v={p.dateDue as string} strong />}
              {/* หน้า X/N — only when the bill spans >1 page (mirrors the ใบเสร็จ
                  meta-box). Lives here so it appears on EVERY page. */}
              {pageCount > 1 && <MetaLine k="หน้า :" v={`${pageNumber}/${pageCount}`} />}
            </div>
          </div>
        </div>

        {/* ── ITEMS TABLE — Pacred 11-col cargo table (same as the receipt) ──
            2026-07-04: was a FIXED height:"182px" — a 25-row bill grew taller
            than 182px and SPILLED OUT, colliding with the summary block below
            (owner report · /admin/billing-run/47/print). Now the items area
            FLEX-GROWS to fill the space above the bottom summary (flex:1
            minHeight:0), and the caller chunks the rows ROWS_PER_PAGE per page
            (=13, same as the ใบเสร็จ) so a long bill lays out across pages with
            the summary on the last page only. The separate flex:1 spacer below
            is removed (this area is the grower now). */}
        <div style={{ flex: 1, minHeight: 0, overflow: "visible", borderTop: "1px solid #d8dade", paddingTop: "1.5mm" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", background: tintBg, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <Th w="4%"  th="ลำดับ"   en="No." left />
                <Th w="8%"  th="ออเดอร์"  en="Order" left />
                <Th w="17%" th="รหัสพัสดุ" en="Tracking" left />
                <Th w="13%" th="เลขตู้"   en="Cabinet" left />
                <Th w="6%"  th="ขนส่ง"    en="Ship" center />
                <Th w="5%"  th="ลัง"      en="Box" right />
                <Th w="8%"  th="น้ำหนัก"  en="Kg" right />
                <Th w="9%"  th="ปริมาตร"  en="CBM" right />
                <Th w="7%"  th="คิดตาม"   en="Basis" center />
                <Th w="9%"  th="เรท"      en="Rate ฿" right />
                <Th w="14%" th="ค่าขนส่ง" en="Amount" right />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", color: "#6b7280", background: "#fff" }}>
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.no} style={{ background: "#fff", breakInside: "avoid", pageBreakInside: "avoid" }}>
                    <td style={tdC}>{row.no}</td>
                    <td style={tdMonoC}>#{row.fid}</td>
                    <td style={tdMono}>{row.tracking}</td>
                    <td style={{ ...tdMono, color: "#374151" }}>{row.cabinet || "—"}</td>
                    <td style={{ ...tdMonoC, fontWeight: "bold", color: row.transport === "SEA" ? "#1d4ed8" : "#b45309" }}>{row.transport || "—"}</td>
                    <td style={tdNum}>{fmt0(row.famount)}</td>
                    <td style={tdNum}>{fmt2(row.fweight)}</td>
                    <td style={tdNum}>{fmt5(row.fvolume)}</td>
                    <td style={{ ...tdC, fontSize: "8px", color: "#374151" }}>{row.rateBasis || "—"}</td>
                    <td style={tdNum}>{row.rate > 0 ? fmt2(row.rate) : "—"}</td>
                    {/* Amount = ค่าขนส่งสินค้า (freight-only) so Rate × Kg reconciles;
                        the non-freight fees are itemized in the สรุป below. */}
                    <td style={tdNum}>{fmt2(row.freight)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── (spacer removed 2026-07-04 — the items area above is now the
              flex-grower that pushes the summary to the bottom of the page) ── */}

        {/* ── SUMMARY + PAYMENT + REMARK + CERTIFIED (last page only) ──────
            On a multi-page bill the summary/payment/remark/certified block
            must render only on the LAST page (mirrors the ใบเสร็จ). The money
            here is ALWAYS the full-bill total (p.total / p.netPayable / etc.,
            computed upstream over ALL items) — never a per-page subset. */}
        {/* Peak section dividers (ภูม flag): thin full-width rules separate each
            band — สรุป · การชำระเงิน · หมายเหตุ · รับรอง — like the ใบเสร็จ. */}
        {isLast && (
        <div style={{ borderTop: "1px solid #d8dade" }}>
          {/* SUMMARY 2-col */}
          <div style={{ display: "flex", gap: "6mm", marginBottom: "1.5mm", paddingTop: "2mm" }}>
            {/* LEFT: charge breakdown + Thai words */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: "4mm" }}>
                <DocSectionLabel section="summary" />
                <div style={{ flex: 1 }}>
                  <SumLine k="ค่าขนส่งสินค้า" v={`${fmt2(feeFreight)} บาท`} />
                  {/* ค่าขนส่งในไทย (LOGISTICS) — distinct from ค่าส่งเหมาๆ (SERVICE promo). */}
                  {feeThai > 0 && <SumLine k="+ ค่าขนส่งในไทย" v={`${fmt2(feeThai)} บาท`} />}
                  {feeChn > 0 && <SumLine k="+ ค่าขนส่งจีน+" v={`${fmt2(feeChn)} บาท`} />}
                  {feeCrate > 0 && <SumLine k="+ ค่าตีลัง" v={`${fmt2(feeCrate)} บาท`} />}
                  {feeUpdate > 0 && <SumLine k="+ ค่าอัปเดต" v={`${fmt2(feeUpdate)} บาท`} />}
                  {feeOther > 0 && <SumLine k="+ ค่าอื่นๆ" v={`${fmt2(feeOther)} บาท`} />}
                  {feeDiscount > 0 && <SumLine k="− ส่วนลด" v={`${fmt2(feeDiscount)} บาท`} red />}
                  {feeMao > 0 && <SumLine k="+ ค่าส่งเหมาๆ (PRF)" v={`${fmt2(feeMao)} บาท`} />}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderTop: "0.5px solid #e5e7eb", paddingTop: "2px", marginTop: "2px" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ยอดชำระสุทธิ</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#111827", maxWidth: "55mm", textAlign: "right" }}>
                      {/* p.netThaiWord = readThaiBaht(net_payable) — already a
                          COMPLETE baht-text (…บาทถ้วน / …สตางค์). Render it bare;
                          appending "บาทถ้วน" here double-suffixed it (owner 2026-07-06). */}
                      {p.netThaiWord}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: total + WHT + big highlight on ยอดชำระสุทธิ */}
            <div>
              <div style={{ marginBottom: "2px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
                  <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", textAlign: "right" }}>รวมทั้งสิ้น</p>
                  <p style={{ margin: 0, fontSize: "10px", color: "#111827", minWidth: "26mm", textAlign: "right" }}>{fmt2(p.total)} บาท</p>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", textAlign: "right" }}>หัก ณ ที่จ่าย 1%</p>
                  <p style={{ margin: 0, fontSize: "10px", color: showWht ? "#b91c1c" : "#111827", minWidth: "26mm", textAlign: "right" }}>
                    {showWht ? "−" : ""}{fmt2(p.whtAmount)} บาท
                  </p>
                </div>
              </div>
              <div style={{ background: tintBg, borderRadius: "2px", padding: "5px 10px", textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ยอดชำระสุทธิ</p>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "bold", color: "#111827" }}>
                  {fmt2(p.netPayable)} <span style={{ fontSize: "12px" }}>บาท</span>
                </h3>
              </div>
            </div>
          </div>

          {/* PAYMENT box — bank + ชำระภายใน */}
          <div style={{ display: "flex", gap: "6mm", marginBottom: "1.5mm", minHeight: "13mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: "4mm" }}>
                <DocSectionLabel emoji="💵" text="การชำระเงิน" />
                <div style={{ flex: 1, display: "flex", gap: "6mm" }}>
                  <div style={{ minWidth: "44mm" }}>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{BILL_ACCOUNT.bankName}</p>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#111827" }}>{BILL_ACCOUNT.accountType} {BILL_ACCOUNT.accountNo}</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>{BILL_ACCOUNT.accountName}</p>
                  </div>
                  {/* owner 2026-07-06: label + value were spread across a too-wide
                      column (big gap). Cap the width + push right so each row reads
                      as a tight "label : value" pair aligned under the สรุป amounts. */}
                  <div style={{ width: "62mm", marginLeft: "auto" }}>
                    {/* เครดิตเท่านั้น — เงินสดไม่มี "กรุณาชำระภายใน" (owner 2026-07-17 · ด่วน) */}
                    {hasDueDate && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm", marginBottom: "1px" }}>
                        <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>กรุณาชำระภายใน :</p>
                        <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#b45309" }}>{p.dateDue}</p>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ยอดที่ต้องชำระ :</p>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#111827" }}>{fmt2(p.netPayable)} บาท</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* REMARK — staff note + 50-ทวิ instruction */}
          <div style={{ display: "flex", gap: "4mm", marginBottom: "1.5mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
            <DocSectionLabel section="remark" style={{ minWidth: "14mm" }} />
            <div style={{ flex: 1 }}>
              {p.note && <p style={{ margin: 0, fontSize: "10px", color: "#374151", whiteSpace: "pre-wrap" }}>{p.note}</p>}
              {showWht && (
                <p style={{ margin: 0, fontSize: "9px", color: "#6b7280", lineHeight: 1.5 }}>
                  * ลูกค้าหักภาษี ณ ที่จ่าย 1% (ค่าขนส่ง) จำนวน {fmt2(p.whtAmount)} บาท —
                  กรุณาออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ในนาม <b>{SITE_LEGAL_NAME_TH}</b> เลขประจำตัวผู้เสียภาษี {TAX_ID}
                </p>
              )}
            </div>
          </div>

          {/* CERTIFIED — the SHARED ✍️ รับรอง cert row (root-fix 2026-07-05):
              ผู้วางบิล · ผู้อนุมัติ · ตราประทับ(ผู้ขาย) · ผู้รับวางบิล(ขีดเซ็น) ·
              ตราประทับ(ลูกค้า) · QR-last. Same <DocCertRow> as the ใบเสร็จ. */}
          <div style={{ display: "flex", gap: "2mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", minWidth: "14mm" }}>
              <DocSectionLabel section="certify" />
            </div>
            <DocCertRow
              qrDataUrl={qrDataUrl}
              qrAlt={`QR ${p.docNo}`}
              customerName={p.buyerName}
              signatoryName={DOC_SIGNATORY.name}
              dateIssued={p.dateIssued}
              approverName={DOC_SIGNATORY.name}
              issuerLabel="ผู้วางบิล (ผู้ขาย)"
              approverLabel="ผู้อนุมัติวางบิล (ผู้ขาย)"
              receiverLabel="ผู้รับวางบิล (ลูกค้า)"
              boxHeight="18mm"
            />
          </div>
        </div>
        )}

      </div>
    </div>
  );
}

// ── small render helpers (kept local — same look as the receipt) ──
const tdC      = { padding: "3px 3px", fontSize: "9px", textAlign: "center" as const, borderTop: "0.5px solid #e5e7eb" };
const tdMono   = { padding: "3px 3px", fontSize: "8px", wordBreak: "break-all" as const, fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" };
const tdMonoC  = { ...tdMono, textAlign: "center" as const };
const tdNum    = { padding: "3px 3px", fontSize: "9px", textAlign: "right" as const, fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" };

function Th({ w, th, en, left, center, right }: { w: string; th: string; en: string; left?: boolean; center?: boolean; right?: boolean }) {
  const align = left ? "left" : center ? "center" : right ? "right" : "left";
  return (
    <th style={{ textAlign: align as "left" | "center" | "right", padding: "4px 3px", width: w, fontSize: "9px", fontWeight: "bold", color: "#374151" }}>
      {th}<br /><span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>{en}</span>
    </th>
  );
}

function InfoLine({ k, v, bold, pre }: { k: string; v: string; bold?: boolean; pre?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "3px", marginBottom: "1px" }}>
      <div style={{ minWidth: "30px" }}>
        <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>{k}</p>
      </div>
      <div>
        <p style={{ margin: 0, fontSize: bold ? "11px" : "10px", fontWeight: bold ? "bold" : "normal", color: bold ? "#111827" : "#374151", whiteSpace: pre ? "pre-wrap" : "normal" }}>{v}</p>
      </div>
    </div>
  );
}

function IconLine({ icon, v }: { icon: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: "3px", alignItems: "center", marginBottom: "1px" }}>
      <div style={{ minWidth: "14px", color: "#6b7280", fontSize: "9px" }}>{icon}</div>
      <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{v}</p>
    </div>
  );
}

function MetaLine({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", marginBottom: "2px" }}>
      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>{k}</p>
      <p style={{ margin: 0, fontSize: "10px", fontWeight: strong ? "bold" : "normal", color: strong ? "#b45309" : "#111827" }}>{v}</p>
    </div>
  );
}

function SumLine({ k, v, red }: { k: string; v: string; red?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: red ? "#b91c1c" : "#6b7280" }}>{k}</p>
      <p style={{ margin: 0, fontSize: "10px", color: red ? "#b91c1c" : "#111827" }}>{v}</p>
    </div>
  );
}

/**
 * The full printable ใบวางบิล: print/screen CSS + ต้นฉบับ then สำเนา.
 * Reuses the receipt's `.receipt-page`/`.subpage` CSS verbatim (one-page-fit
 * math, @page 5mm, screen drop-shadow paper, .receipt-fit mobile mode).
 */
export function BillingRunPaper({ pages, ...common }: BillingRunPaperProps) {
  const pageCount = Math.max(1, pages.length);
  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print, .no-print * { display: none !important; }
          .receipt-page {
            box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important;
            max-width: none !important; width: 100% !important;
            height: 287mm !important; min-height: 287mm !important;
            page-break-after: always; page-break-inside: avoid;
          }
          .receipt-page:last-child { page-break-after: auto; }
          .receipt-page .subpage { padding: 0 !important; height: 100% !important; min-height: 100% !important; }
        }
        @media screen {
          .receipt-page { margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06); border-radius: 4px; }
          .receipt-fit .receipt-page { width: 100% !important; max-width: 210mm; margin-left: auto; margin-right: auto; }
        }
        .subpage { display: flex; flex-direction: column; }
      `}</style>

      {pages.map((pg) => (
        <BillingRunPage
          key={`orig-${pg.pageNumber}`}
          label="ต้นฉบับ"
          {...common}
          rows={pg.rows}
          pageNumber={pg.pageNumber}
          pageCount={pageCount}
        />
      ))}
      {pages.map((pg) => (
        <BillingRunPage
          key={`copy-${pg.pageNumber}`}
          label="สำเนา"
          {...common}
          rows={pg.rows}
          pageNumber={pg.pageNumber}
          pageCount={pageCount}
        />
      ))}
    </>
  );
}

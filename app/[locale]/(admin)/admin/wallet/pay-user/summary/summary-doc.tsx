/**
 * <PaymentSummaryDoc> — the printable "ใบแจ้งหนี้" (payment-summary sheet).
 * Faithful port of the legacy `exampleSummaryF.php`, rendered in the **Peak
 * house style** shared with `components/billing-run/billing-run-paper.tsx`
 * (ใบวางบิล) and `components/receipt/receipt-paper.tsx` (ใบเสร็จ).
 *
 * 🎨 owner 2026-07-21: "ทำใบแจ้งหนี้ให้เหมือนใบวางบิล — พวกสี พวกการวางรายละเอียด".
 * Before this the doc hand-rolled its own look (cream #FFF0CC title box · gray
 * gridlined table · plain bordered totals box · lone signature line) so it read
 * as a different company's paper next to the ใบวางบิล/ใบเสร็จ. It now mirrors the
 * SAME structure, band-for-band:
 *   header (logo · 28px orange title · EN subtitle) → info row (issuer+customer
 *   LEFT · tinted meta-box RIGHT) → tinted 11-col cargo table (flex-grows) →
 *   📋 สรุป 2-col + big ยอดชำระสุทธิ highlight → 💵 ชำระเงิน (bank) →
 *   💬 หมายเหตุ → ✍️ รับรอง (<DocCertRow>)
 * and it IMPORTS the shared pieces (`DocSectionLabel` · `DocCertRow` · the
 * receipt `fmt*` helpers · the `.receipt-page`/`.subpage` print CSS) rather than
 * re-typing them — so a future fix to the house style lands here for free.
 *
 * 💰 DISPLAY-ONLY — the restyle changed NO money. Every figure is still the value
 * computed upstream in `page.tsx` from the same SOTs the ใบวางบิล/ใบเสร็จ use
 * (computeForwarderDebitBatch · computeBillWht). READ-ONLY, no DB writes.
 *
 * ⚠️ Print height stays `min-height` (NOT the ใบวางบิล's fixed `height: 287mm`)
 * because this sheet is NOT paginated upstream — a long fID list must flow onto
 * extra pages instead of being clipped at one page.
 *
 * Server Component — imports only site constants, next/image and the shared
 * doc primitives.
 */

import Image from "next/image";
import {
  SITE_LEGAL_NAME_TH,
  SITE_LEGAL_NAME,
  TAX_ID,
  ADDRESSES,
  CONTACT,
  DOC_SIGNATORY,
} from "@/components/seo/site";
import { fmt2, fmt5, fmt0 } from "@/components/receipt/receipt-paper";
import { DocSectionLabel } from "@/components/receipt/doc-section-label";
import { DocCertRow } from "@/components/receipt/doc-cert-row";
import { serviceAccountFor } from "@/lib/services/service-catalog";
import { readThaiBaht } from "@/lib/utils/thai-number";

// ใบแจ้งหนี้ = ฝากนำเข้าคาร์โก้ → บัญชี LOGISTICS 225-2-91144-0, resolved through
// the SAME lane SOT the ใบวางบิล + ใบเสร็จ use so all three papers quote ONE account.
const SUMMARY_ACCOUNT = serviceAccountFor("import_cargo");

/** ต้นฉบับ orange — the same title/tint pair the ใบวางบิล uses for its ต้นฉบับ side. */
const TITLE_COLOR = "#FFA30A";
const TINT_BG = "rgba(255,163,10,0.165)";

export type SummaryRow = {
  no: number;
  /** tb_forwarder.id — the "Oder No" (legacy spelling). */
  orderNo: string;
  /** ftrackingchn (truncated). */
  tracking: string;
  /** fcabinetnumber — เลขตู้; "" when not yet assigned. */
  cabinet: string;
  /** ftransporttype label — รถ / เรือ / -. */
  transport: string;
  /** fwarehousechina label — กวางโจว / อี้อู / -. */
  fromCity: string;
  /** famount — box count. */
  boxes: number;
  /** fweight (kg). */
  weight: number;
  /** fvolume (CBM). */
  volume: number;
  /** fwidth/flength/fheight — ขนาดกล่อง ก×ย×ส (ซม.); 0 when unset. */
  width: number;
  length: number;
  height: number;
  /** fproductstype label — ทั่วไป / มอก. / อย. / พิเศษ / -. */
  productType: string;
  /** frefrate. */
  rate: number;
  /** ftotalprice — the ค่าขนส่ง column (China→TH freight; not the composite). */
  amount: number;
  /** breakdown.otherCharges — the อื่นๆ column (same SOT as the PayModal). */
  otherCharges: number;
};

export type PaymentSummaryDocProps = {
  /** Doc number — rID; "-" when absent. */
  docNo: string;
  /** Issue date already formatted dd/mm/YYYY (Gregorian, matching legacy d/m/Y). */
  dateDisplay: string;
  /** Customer header. */
  customerName: string;
  customerTaxId: string;
  customerAddress: string;
  isJuristic: boolean;
  rows: SummaryRow[];
  /** Grand-total buckets (all coerced numbers). */
  totalPriceAll: number;
  sumTotal: number;
  sumDeliveryChn: number;
  sumDeliveryTh: number;
  /** ค่าส่งเหมาๆ (PCSF/PRF ฿100) — บรรทัดแยกในสรุป (ตรงกับ PayModal · owner 2026-07-22). */
  sumMaoFee: number;
  sumOther: number;
  sumDiscount: number;
  whtAmount: number;
  /** totalPriceAll − wht. */
  totalAmount: number;
  /**
   * Payment QR as a `data:image/png;base64,…` (owner 2026-07-21 "เพิ่ม qr code
   * ที่ต้องชำระให้ในใบแจ้งหนี้ด้วย").
   *
   * ⚠️ MONEY-ROUTING — the caller MUST build this with
   * `buildCompactPaymentQrDataUrl` (lib/promptpay.ts), the print-sized crop of
   * the SAME image the PayModal serves via `getDepositQr`. With
   * PROMPTPAY_DYNAMIC_ENABLED off (the default) that is the static K-Shop QR for
   * **LOGISTICS 225-2-91144-0** — the exact account this paper prints beside it.
   * Do NOT swap in `buildServicePromptPayQrDataUrl`: that one encodes the
   * **SERVICE** account 204-1-55856-6, so the QR and the printed account number
   * would send the customer's money to two different places.
   *
   * Empty string → the QR block is omitted and the bank-account text alone
   * carries the payment info (lib/promptpay.ts degrades this way by design).
   */
  payQrDataUrl?: string;
};

export function PaymentSummaryDoc(p: PaymentSummaryDocProps) {
  const showWht = p.whtAmount > 0;

  // ── สรุป lines (mirrors billing-run-paper's named-fee block) ──────────────
  // ค่าขนส่งสินค้า is the BALANCING REMAINDER so the itemized lines always re-sum
  // to รวมทั้งสิ้น to the satang — the same technique the ใบวางบิล uses. In the
  // normal case this equals `sumTotal` exactly (both are Σ ftotalprice); it only
  // differs if the batch SOT and the raw column sums drift, and then footing the
  // paper is what a "ใช้เพื่อตรวจสอบรายการชำระเงิน" sheet must do.
  const r2 = (n: number) => {
    const v = Number(n);
    return Math.round(((Number.isFinite(v) ? v : 0) + Number.EPSILON) * 100) / 100;
  };
  const feeChn = r2(p.sumDeliveryChn);
  const feeThaiShip = r2(p.sumDeliveryTh);
  const feeMao = r2(p.sumMaoFee); // ค่าส่งเหมาๆ (PCSF/PRF ฿100) — บรรทัดของตัวเอง (ตรงกับ PayModal)
  const feeOther = r2(p.sumOther);
  const feeDiscount = r2(p.sumDiscount);
  const feeFreight = r2(
    r2(p.totalPriceAll) - (feeChn + feeThaiShip + feeMao + feeOther - feeDiscount),
  );

  // อ้างอิง — the order numbers this sheet covers (mirrors the ใบวางบิล meta-box).
  // Capped so a long fID list can't blow out the meta column.
  const refOrders =
    p.rows.length === 0
      ? p.docNo
      : p.rows.length <= 4
        ? p.rows.map((r) => `#${r.orderNo}`).join(", ")
        : `${p.rows.slice(0, 4).map((r) => `#${r.orderNo}`).join(", ")} +${p.rows.length - 4}`;

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
            min-height: 287mm !important;
            page-break-after: auto;
          }
          .receipt-page .subpage { padding: 0 !important; }
        }
        @media screen {
          .receipt-page { margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06); border-radius: 4px; }
          .receipt-fit .receipt-page { width: 100% !important; max-width: 210mm; margin-left: auto; margin-right: auto; }
        }
        .subpage { display: flex; flex-direction: column; }
        /* faint "ตัวอย่างเอกสาร" wash — this sheet is a preview, never an issued doc */
        .receipt-page { position: relative; }
        .summary-watermark {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 0; overflow: hidden;
        }
        .summary-watermark span {
          font-size: 72px; font-weight: bold; color: rgba(180,120,120,0.10);
          transform: rotate(-30deg); white-space: nowrap; letter-spacing: 6px;
        }
        .subpage { position: relative; z-index: 1; }
      `}</style>

      <div
        className="receipt-page bg-white text-black mx-auto"
        style={{ width: "210mm", minHeight: "277mm", display: "flex", flexDirection: "column" }}
      >
        <div className="summary-watermark" aria-hidden>
          <span>ตัวอย่างเอกสาร</span>
        </div>

        <div className="subpage" style={{ padding: "10mm 12mm", flex: 1, display: "flex", flexDirection: "column" }}>

          {/* ── HEADER: logo LEFT · (ตัวอย่าง) + title RIGHT ───────────────── */}
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
                <div style={{ fontSize: "11px", color: "#6b7280" }}>(ตัวอย่าง)</div>
                <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "bold", color: TITLE_COLOR, lineHeight: 1.1 }}>
                  ใบแจ้งหนี้
                </h2>
                <div style={{ fontSize: "10px", color: "#9ca3af", letterSpacing: "0.5px" }}>INVOICE</div>
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
                    <InfoLine k="ที่อยู่ :" v={ADDRESSES.office.full} />
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
                <InfoLine k="ลูกค้า :" v={p.customerName || "-"} bold />
                <InfoLine k="ที่อยู่ :" v={p.customerAddress || "-"} pre />
                <InfoLine k="เลขที่ภาษี :" v={p.customerTaxId || "-"} />
                <InfoLine k="ประเภท :" v={p.isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"} />
              </div>
            </div>

            {/* RIGHT meta-box */}
            <div>
              <div style={{ background: TINT_BG, borderRadius: "2px", minWidth: "55mm" }}>
                <MetaLine k="เลขที่เอกสาร :" v={p.docNo} />
                <MetaLine k="วันที่ออก :" v={p.dateDisplay} />
                <MetaLine k="อ้างอิง :" v={refOrders} />
                <MetaLine k="สถานะ :" v="ตรวจสอบรายการ" strong />
              </div>
            </div>
          </div>

          {/* ── ITEMS TABLE — Pacred cargo table (same shape as ใบวางบิล/ใบเสร็จ) ── */}
          <div style={{ flex: 1, minHeight: 0, overflow: "visible", borderTop: "1px solid #d8dade", paddingTop: "1.5mm" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: TINT_BG, tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <Th w="3%"  th="ลำดับ"        en="No." center />
                  <Th w="9%"  th="เลขที่ออเดอร์" en="Order" center nowrap />
                  <Th w="9%"  th="เลขตู้"        en="Container" center />
                  <Th w="5%"  th="ขนส่ง"        en="Ship" center />
                  <Th w="11%" th="รหัสพัสดุ"     en="Tracking" left />
                  <Th w="5%"  th="จำนวน"        en="Box" right />
                  <Th w="10%" th="ขนาด(ก×ย×ส)"  en="W×L×H·ซม." center />
                  <Th w="8%"  th="ปริมาตร"      en="CBM" right />
                  <Th w="7%"  th="น้ำหนัก"       en="Wt·kg" right />
                  <Th w="6%"  th="ประเภท"       en="Type" center />
                  <Th w="7%"  th="เรทราคา"      en="Rate" right />
                  <Th w="7%"  th="ค่าขนส่ง"      en="Amount" right />
                  <Th w="8%"  th="อื่นๆ"         en="Other" right />
                </tr>
              </thead>
              <tbody>
                {p.rows.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", color: "#6b7280", background: "#fff" }}>
                      ไม่พบรายการ
                    </td>
                  </tr>
                ) : (
                  p.rows.map((r) => (
                    <tr key={r.no} style={{ background: "#fff", breakInside: "avoid", pageBreakInside: "avoid" }}>
                      <td style={tdC}>{r.no}</td>
                      <td style={tdMonoC}>#{r.orderNo}</td>
                      <td style={{ ...tdMonoC, color: "#374151" }}>{r.cabinet || "—"}</td>
                      <td style={{ ...tdMonoC, fontWeight: "bold", color: r.transport === "เรือ" ? "#1d4ed8" : r.transport === "รถ" ? "#b45309" : "#6b7280" }}>
                        {r.transport || "—"}
                      </td>
                      <td style={tdMono}>{r.tracking || "—"}</td>
                      <td style={tdNum}>{fmt0(r.boxes)}</td>
                      <td style={{ ...tdC, fontSize: "8px", color: "#374151", fontFamily: "monospace" }}>{dimsCm(r.width, r.length, r.height)}</td>
                      <td style={tdNum}>{fmt5(r.volume)}</td>
                      <td style={tdNum}>{fmt2(r.weight)}</td>
                      <td style={{ ...tdC, fontSize: "8px", color: "#374151" }}>{r.productType || "—"}</td>
                      <td style={tdNum}>{r.rate > 0 ? fmt2(r.rate) : "—"}</td>
                      <td style={tdNum}>{fmt2(r.amount)}</td>
                      <td style={tdNum}>{r.otherCharges > 0 ? fmt2(r.otherCharges) : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* ── SUMMARY + PAYMENT + REMARK + CERTIFIED ───────────────────────
              Peak section dividers: a thin full-width rule opens each band, the
              same rhythm as the ใบวางบิล. */}
          <div style={{ borderTop: "1px solid #d8dade" }}>
            {/* SUMMARY + PAYMENT — ONE two-column block (owner 2026-07-21, ตามภาพ)
                LEFT  : สรุป ซ้อน ชำระเงิน
                RIGHT : รางเงิน — รวมทั้งสิ้น → หัก ณ ที่จ่าย → QR → ยอดที่ต้องชำระ
                ทำไมรวมเป็นบล็อกเดียวแทนที่จะเป็นสองแถบซ้อนกันเหมือนเดิม: QR สูงกว่า
                บรรทัดยอดรวมมาก ถ้ายังแยกแถบ QR จะดันแถบ "ชำระเงิน" ตกลงไปอยู่ใต้ตัวเอง
                แล้วเลขบัญชีจะหลุดจากแนวเดียวกับ QR — ในภาพที่ owner ต้องการ บรรทัด
                "ธนาคารกสิกรไทย" อยู่ระดับกลางตัว QR พอดี ซึ่งเป็นไปได้ทางเดียวคือ
                คอลัมน์ขวาต้องพาดยาวคร่อมทั้งสองแถบ */}
            <div style={{ display: "flex", gap: "6mm", marginBottom: "1.5mm", paddingTop: "2mm" }}>
              {/* LEFT: charge breakdown + Thai words, then the bank block */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: "4mm" }}>
                  <DocSectionLabel section="summary" />
                  <div style={{ flex: 1 }}>
                    <SumLine k="ค่าขนส่งสินค้า" v={`${fmt2(feeFreight)} บาท`} />
                    {feeThaiShip > 0 && <SumLine k="+ ค่าขนส่งไทย" v={`${fmt2(feeThaiShip)} บาท`} />}
                    {feeMao > 0 && <SumLine k="+ ค่าส่งเหมาๆ" v={`${fmt2(feeMao)} บาท`} />}
                    {feeChn > 0 && <SumLine k="+ ค่าขนส่งจีน+" v={`${fmt2(feeChn)} บาท`} />}
                    {feeOther > 0 && <SumLine k="+ ค่าอื่นๆ" v={`${fmt2(feeOther)} บาท`} />}
                    {feeDiscount > 0 && <SumLine k="− ส่วนลด" v={`${fmt2(feeDiscount)} บาท`} red />}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderTop: "0.5px solid #e5e7eb", paddingTop: "2px", marginTop: "2px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ยอดชำระสุทธิ</p>
                      <p style={{ margin: 0, fontSize: "10px", color: "#111827", maxWidth: "55mm", textAlign: "right" }}>
                        {readThaiBaht(p.totalAmount)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ชำระเงิน — bank only. The amount that used to sit here moved to
                    the right rail so it lands directly under the QR (ตามภาพ). */}
                <div style={{ display: "flex", gap: "4mm", borderTop: "1px solid #e5e7eb", marginTop: "2.5mm", paddingTop: "2mm", minHeight: "13mm" }}>
                  <DocSectionLabel section="payment" />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>{SUMMARY_ACCOUNT.bankName}</p>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#111827" }}>{SUMMARY_ACCOUNT.accountType} {SUMMARY_ACCOUNT.accountNo}</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>{SUMMARY_ACCOUNT.accountName}</p>
                  </div>
                </div>
              </div>

              {/* RIGHT: the money rail — totals → QR → ยอดที่ต้องชำระ.
                  Fixed 40mm so the rail lines up with the QR box under it; the
                  rows are space-between + nowrap rather than a minWidth column,
                  because a Thai label like "หัก ณ ที่จ่าย 1%" is wide enough that
                  a fixed number-column would squeeze it onto two lines. */}
              <div style={{ width: "40mm" }}>
                <div style={{ marginBottom: "2px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm", marginBottom: "1px" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", whiteSpace: "nowrap" }}>รวมทั้งสิ้น</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#111827", whiteSpace: "nowrap" }}>{fmt2(p.totalPriceAll)} บาท</p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", whiteSpace: "nowrap" }}>หัก ณ ที่จ่าย 1%</p>
                    <p style={{ margin: 0, fontSize: "10px", color: showWht ? "#b91c1c" : "#111827", whiteSpace: "nowrap" }}>
                      {showWht ? "−" : ""}{fmt2(p.whtAmount)} บาท
                    </p>
                  </div>
                </div>
                {/* QR ชำระเงิน — บัญชีเดียวกับเลขที่พิมพ์ฝั่งซ้าย (LOGISTICS) ·
                    ตัวเดียวกับที่ PayModal โชว์ แต่ครอปเหลือเฉพาะตัวโค้ด.
                    ขนาด 30mm ไม่ใช่ตัวเลข "พอสวย" — โค้ดนี้ 69 โมดูล ที่ 30mm
                    (ตัวโค้ด ~25.8mm หลังหักขอบขาว) ได้โมดูลละ ~0.37mm ซึ่งใกล้ขนาด
                    ต่ำสุดที่มือถือสแกนกระดาษติดแน่ ๆ (~0.4mm). เล็กกว่านี้ = พิมพ์แล้ว
                    สแกนไม่ขึ้น. ไม่มีรูป → ซ่อนทั้งก้อน (เลขบัญชีฝั่งซ้ายรับหน้าที่แทน). */}
                {p.payQrDataUrl ? (
                  <div style={{ textAlign: "center", marginTop: "1.5mm" }}>
                    <p style={{ margin: "0 0 1px", fontSize: "8px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      สแกนเพื่อชำระเงิน
                    </p>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: "2px", padding: "1mm", display: "inline-block", background: "#ffffff" }}>
                      <Image
                        src={p.payQrDataUrl}
                        alt="QR ชำระเงิน"
                        width={260}
                        height={260}
                        unoptimized
                        style={{ width: "30mm", height: "30mm", display: "block" }}
                      />
                    </div>
                  </div>
                ) : null}

                {/* ยอดที่ต้องชำระ — the one figure the customer actually transfers,
                    so it gets the highlight and sits directly under the QR. */}
                <div style={{ background: TINT_BG, borderRadius: "2px", padding: "4px 8px", marginTop: "1.5mm", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "3mm" }}>
                  <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", whiteSpace: "nowrap" }}>ยอดที่ต้องชำระ</p>
                  <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827", whiteSpace: "nowrap" }}>
                    {fmt2(p.totalAmount)} บาท
                  </p>
                </div>
              </div>
            </div>

            {/* REMARK — preview disclaimer + 50-ทวิ instruction */}
            <div style={{ display: "flex", gap: "4mm", marginBottom: "1.5mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
              <DocSectionLabel section="remark" style={{ minWidth: "14mm" }} />
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>
                  เอกสารนี้ใช้เพื่อตรวจสอบรายการชำระเงิน — ไม่ใช่ใบเสร็จรับเงิน
                </p>
                {showWht && (
                  <p style={{ margin: 0, fontSize: "9px", color: "#6b7280", lineHeight: 1.5 }}>
                    * ลูกค้าหักภาษี ณ ที่จ่าย 1% (ค่าขนส่ง) จำนวน {fmt2(p.whtAmount)} บาท —
                    กรุณาออกหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ในนาม <b>{SITE_LEGAL_NAME_TH}</b> เลขประจำตัวผู้เสียภาษี {TAX_ID}
                  </p>
                )}
              </div>
            </div>

            {/* CERTIFIED — the SHARED ✍️ รับรอง row (no QR: this sheet has no public view) */}
            <div style={{ display: "flex", gap: "2mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-start", minWidth: "14mm" }}>
                <DocSectionLabel section="certify" />
              </div>
              <DocCertRow
                customerName={p.customerName}
                signatoryName={DOC_SIGNATORY.name}
                dateIssued={p.dateDisplay}
                approverName=""
                issuerLabel="ผู้ออกเอกสาร (ผู้ขาย)"
                receiverLabel="ผู้รับเอกสาร (ลูกค้า)"
                boxHeight="18mm"
              />
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ── small render helpers (same look as the ใบวางบิล / ใบเสร็จ) ──
const tdC     = { padding: "3px 3px", fontSize: "9px", textAlign: "center" as const, borderTop: "0.5px solid #e5e7eb" };
const tdMono  = { padding: "3px 3px", fontSize: "8px", wordBreak: "break-all" as const, fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" };
const tdMonoC = { ...tdMono, textAlign: "center" as const };
const tdNum   = { padding: "3px 3px", fontSize: "9px", textAlign: "right" as const, fontFamily: "monospace", borderTop: "0.5px solid #e5e7eb" };

/** ขนาดกล่อง กว้าง×ยาว×สูง (ซม.) — "—" when no dimension is set (owner ปอน 2026-07-22). */
function dimsCm(w: number, l: number, h: number): string {
  return w > 0 || l > 0 || h > 0 ? `${w}×${l}×${h}` : "—";
}

function Th({ w, th, en, left, center, right, nowrap }: { w: string; th: string; en: string; left?: boolean; center?: boolean; right?: boolean; nowrap?: boolean }) {
  const align = left ? "left" : center ? "center" : right ? "right" : "left";
  return (
    <th style={{ textAlign: align as "left" | "center" | "right", padding: "4px 3px", width: w, fontSize: "9px", fontWeight: "bold", color: "#374151", whiteSpace: nowrap ? "nowrap" : undefined }}>
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
    <div style={{ display: "flex", justifyContent: "space-between", gap: "4mm", padding: "3px 8px", marginBottom: "2px" }}>
      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280", whiteSpace: "nowrap" }}>{k}</p>
      <p style={{ margin: 0, fontSize: "10px", fontWeight: strong ? "bold" : "normal", color: strong ? "#b45309" : "#111827", maxWidth: "34mm", textAlign: "right", wordBreak: "break-word" }}>{v}</p>
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

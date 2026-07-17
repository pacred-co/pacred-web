/**
 * <PaymentSummaryDoc> — the printable "ใบสรุปรายการที่ต้องชำระเงิน"
 * (payment-summary sheet) paper. Faithful port of the legacy
 * `exampleSummaryF.php` document, rendered in the Pacred print-CSS house style
 * (A4 portrait · @page 5mm · gridlined 11-col table · pink title band · faint
 * "ตัวอย่างเอกสาร" watermark). READ-ONLY — no DB writes; every number is a
 * display value coerced defensively upstream.
 *
 * Server Component — imports ONLY site constants + next/image. The baht-in-words
 * line reuses `readThaiBaht` from lib/utils/thai-number (the same PHP `ReadNumber`
 * port the receipt/billing-run docs use).
 */

import Image from "next/image";
import {
  SITE_LEGAL_NAME_TH,
  SITE_LEGAL_NAME,
  TAX_ID,
  ADDRESSES,
  CONTACT,
} from "@/components/seo/site";
import { readThaiBaht } from "@/lib/utils/thai-number";

export type SummaryRow = {
  no: number;
  /** tb_forwarder.id — the "Oder No" (legacy spelling). */
  orderNo: string;
  /** ftrackingchn (truncated). */
  tracking: string;
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
  /** fproductstype label — ทั่วไป / มอก. / อย. / พิเศษ / -. */
  productType: string;
  /** frefrate. */
  rate: number;
  /** ftotalprice — column 11 shows fTotalPrice ONLY (not the composite). */
  amount: number;
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
  sumOther: number;
  sumDiscount: number;
  whtAmount: number;
  /** totalPriceAll − wht. */
  totalAmount: number;
};

/** 2-decimal money with thousands separators. */
function fmtMoney(n: number): string {
  return (Number(n) || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Integer with thousands separators (box count). */
function fmtInt(n: number): string {
  return (Number(n) || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function PaymentSummaryDoc(p: PaymentSummaryDocProps) {
  const showWht = p.whtAmount > 0;

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .no-print, .no-print * { display: none !important; }
          .summary-page {
            box-shadow: none !important; border: none !important; margin: 0 !important;
            max-width: none !important; width: 100% !important;
            min-height: 287mm !important;
            page-break-after: auto;
          }
        }
        @media screen {
          .summary-page { margin: 16px auto; box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06); border-radius: 4px; }
        }
        .summary-page { position: relative; }
        .summary-watermark {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          pointer-events: none; z-index: 0; overflow: hidden;
        }
        .summary-watermark span {
          font-size: 72px; font-weight: bold; color: rgba(180,120,120,0.10);
          transform: rotate(-30deg); white-space: nowrap; letter-spacing: 6px;
        }
        .summary-body { position: relative; z-index: 1; }
        .summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .summary-table th, .summary-table td { border: 1px solid #9ca3af; padding: 3px 4px; font-size: 9px; word-break: break-word; }
        .summary-table thead th { background: #FFF0CC; text-align: center; font-weight: bold; }
      `}</style>

      <div
        className="summary-page bg-white text-black mx-auto"
        style={{ width: "210mm", minHeight: "277mm" }}
      >
        {/* faint sample watermark */}
        <div className="summary-watermark" aria-hidden>
          <span>ตัวอย่างเอกสาร</span>
        </div>

        <div className="summary-body" style={{ padding: "10mm 12mm" }}>
          {/* ── HEADER BAND: logo+company LEFT · pink title box RIGHT ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: "6mm", marginBottom: "3mm" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <Image
                src="/images/pacred-logo-tight.png"
                alt={SITE_LEGAL_NAME}
                width={268}
                height={72}
                unoptimized
                style={{ width: "auto", height: "14mm", display: "block", marginBottom: "1.5mm" }}
              />
              <div style={{ fontSize: "12px", fontWeight: "bold", color: "#111827" }}>{SITE_LEGAL_NAME_TH}</div>
              <div style={{ fontSize: "10px", color: "#6b7280" }}>{SITE_LEGAL_NAME}</div>
            </div>
            <div style={{ background: "#FFF0CC", borderRadius: "3px", padding: "4px 12px", textAlign: "right", minWidth: "70mm", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: "10px", color: "#b45309", fontWeight: "bold" }}>ตัวอย่าง</div>
              <h2 style={{ margin: 0, fontSize: "26px", fontWeight: "bold", color: "#FFA30A", lineHeight: 1.15 }}>
                ใบแจ้งหนี้
              </h2>
              <div style={{ fontSize: "11px", color: "#b45309" }}>(ใช้เพื่อตรวจสอบรายการชำระเงิน)</div>
              <div style={{ fontSize: "11px", color: "#374151", marginTop: "2px" }}>เลขที่ : {p.docNo}</div>
            </div>
          </div>

          {/* ── ISSUER (Pacred) · date/page RIGHT ── */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "6mm", marginBottom: "2mm" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InfoLine k="ผู้ออก / issuer :" v={SITE_LEGAL_NAME_TH} />
              <InfoLine k="เลขผู้เสียภาษี / Tax ID :" v={`${TAX_ID}`} />
              <InfoLine k="ที่อยู่ / Address :" v={ADDRESSES.office.full} />
              <InfoLine k="โทรศัพท์ / tel :" v={CONTACT.phoneDisplay} />
            </div>
            <div style={{ textAlign: "right", minWidth: "40mm" }}>
              <InfoLine k="วันที่ / date :" v={p.dateDisplay} right />
              <InfoLine k="หน้า / page :" v="1/1" right />
            </div>
          </div>

          {/* ── CUSTOMER ── */}
          <div style={{ borderTop: "1px solid #d8dade", paddingTop: "2mm", marginBottom: "2.5mm" }}>
            <InfoLine k="ลูกค้า / Customer :" v={p.customerName || "-"} bold />
            <InfoLine k="เลขผู้เสียภาษี / Tax ID :" v={p.customerTaxId || "-"} />
            <InfoLine k="ที่อยู่ / Address :" v={p.customerAddress || "-"} />
          </div>

          {/* ── TABLE (11 columns) ── */}
          <table className="summary-table">
            <colgroup>
              <col style={{ width: "5%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                <ThCell th="ลำดับ" en="No." />
                <ThCell th="เลขที่ออเดอร์" en="Oder No" />
                <ThCell th="รหัสพัสดุ" en="Tracking" />
                <ThCell th="ขนส่ง" en="ทาง" />
                <ThCell th="จากเมือง" en="" />
                <ThCell th="จำนวน" en="กล่อง" />
                <ThCell th="น้ำหนัก" en="Wt./kg" />
                <ThCell th="ปริมาตร" en="Vol./CBM" />
                <ThCell th="ประเภท" en="สินค้า" />
                <ThCell th="เรทราคา" en="" />
                <ThCell th="ค่าขนส่ง" en="Amount" />
              </tr>
            </thead>
            <tbody>
              {p.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", color: "#6b7280", padding: "8px 4px" }}>
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                p.rows.map((r) => (
                  <tr key={r.no}>
                    <td style={{ textAlign: "center" }}>{r.no}</td>
                    <td style={{ textAlign: "center", fontFamily: "monospace" }}>{r.orderNo}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "8px" }}>{r.tracking || "-"}</td>
                    <td style={{ textAlign: "center" }}>{r.transport}</td>
                    <td style={{ textAlign: "center" }}>{r.fromCity}</td>
                    <td style={{ textAlign: "right" }}>{fmtInt(r.boxes)}</td>
                    <td style={{ textAlign: "right" }}>{(Number(r.weight) || 0).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>{(Number(r.volume) || 0).toFixed(5)}</td>
                    <td style={{ textAlign: "center" }}>{r.productType}</td>
                    <td style={{ textAlign: "right" }}>{(Number(r.rate) || 0).toFixed(2)}</td>
                    <td style={{ textAlign: "right" }}>{(Number(r.amount) || 0).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ── FOOTER TOTALS (bordered box, right) ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "3mm" }}>
            <div style={{ border: "1px solid #9ca3af", borderRadius: "2px", minWidth: "78mm" }}>
              <TotalLine k="Total" v={`${fmtMoney(p.sumTotal)} บาท`} />
              <TotalLine k="Delivery Charge CHN" v={`${fmtMoney(p.sumDeliveryChn)} บาท`} />
              <TotalLine k="Delivery Charge TH" v={`${fmtMoney(p.sumDeliveryTh)} บาท`} />
              <TotalLine k="Other" v={`${fmtMoney(p.sumOther)} บาท`} />
              {p.sumDiscount > 0 && <TotalLine k="Discount" v={`${fmtMoney(p.sumDiscount)} บาท`} red />}
              {showWht && (
                <TotalLine k="LESS WITHHOLDING TAX 1%" v={`−${fmtMoney(p.whtAmount)} บาท`} red />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", borderTop: "1px solid #9ca3af", background: "#FFF0CC" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "#111827" }}>Total Amount</span>
                <span style={{ fontSize: "16px", fontWeight: "bold", color: "#b45309" }}>{fmtMoney(p.totalAmount)} บาท</span>
              </div>
            </div>
          </div>

          {/* ── baht-in-words ── */}
          <div style={{ marginTop: "2.5mm", fontSize: "10px", color: "#374151" }}>
            <span style={{ fontWeight: "bold" }}>หมายเหตุ : </span>
            <span>({readThaiBaht(p.totalAmount)})</span>
          </div>

          {/* ── signature row (customer receiver, last cell) ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "10mm" }}>
            <div style={{ textAlign: "center", minWidth: "60mm" }}>
              <div style={{ borderTop: "1px dotted #6b7280", margin: "0 auto 2px", width: "55mm" }} />
              <div style={{ fontSize: "10px", color: "#374151" }}>ผู้รับเอกสาร (ลูกค้า)</div>
              <div style={{ fontSize: "10px", color: "#6b7280", marginTop: "6px" }}>__/__/____</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ── local render helpers ──
function InfoLine({ k, v, bold, right }: { k: string; v: string; bold?: boolean; right?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "4px", marginBottom: "1px", justifyContent: right ? "flex-end" : "flex-start" }}>
      <span style={{ fontSize: "10px", fontWeight: "bold", color: "#6b7280", whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ fontSize: bold ? "11px" : "10px", fontWeight: bold ? "bold" : "normal", color: bold ? "#111827" : "#374151" }}>{v}</span>
    </div>
  );
}

function ThCell({ th, en }: { th: string; en: string }) {
  return (
    <th>
      <div style={{ fontSize: "9px" }}>{th}</div>
      {en ? <div style={{ fontSize: "8px", fontWeight: "normal", color: "#4b5563" }}>{en}</div> : null}
    </th>
  );
}

function TotalLine({ k, v, red }: { k: string; v: string; red?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10mm", padding: "3px 10px", borderBottom: "1px solid #e5e7eb" }}>
      <span style={{ fontSize: "10px", fontWeight: "bold", color: red ? "#b91c1c" : "#6b7280" }}>{k}</span>
      <span style={{ fontSize: "10px", color: red ? "#b91c1c" : "#111827" }}>{v}</span>
    </div>
  );
}

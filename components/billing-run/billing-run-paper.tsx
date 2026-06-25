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
  BANK,
  DOC_SIGNATORY,
} from "@/components/seo/site";
import { fmt2, fmt5, fmt0 } from "@/components/receipt/receipt-paper";

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
  amount:      number;
};

export type BillingRunPaperProps = {
  docNo:         string;
  issuerAddress: string;
  dateIssued:    string;
  dateDue:       string;
  buyerName:     string;
  buyerTaxId:    string;
  buyerAddress:  string;
  isJuristic:    boolean;
  subtotal:      number;
  /** ค่าส่งเหมาๆ (PCSF flat ฿100/shipment) — own summary line · included in total. */
  maoFee:        number;
  deliveryChn:   number;
  deliveryTh:    number;
  other:         number;
  discount:      number;
  total:         number;
  whtAmount:     number;
  netPayable:    number;
  netThaiWord:   string;
  note:          string;
  issuedBy:      string;
  items:         BillingRunPaperRow[];
  qrDataUrl:     string;
};

function BillingRunPage({
  label,
  qrDataUrl,
  ...p
}: BillingRunPaperProps & { label: string }) {
  const isOriginal = label === "ต้นฉบับ";
  const titleColor = isOriginal ? "#FFA30A" : "#5F5D5A";
  const tintBg     = isOriginal ? "rgba(255,163,10,0.165)" : "rgba(95,93,90,0.165)";
  const showWht    = p.whtAmount > 0;

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
              <InfoLine k="ที่อยู่ :" v={p.buyerAddress || "-"} pre />
              <InfoLine k="เลขที่ภาษี :" v={p.buyerTaxId || "-"} />
              <InfoLine k="ประเภท :" v={p.isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"} />
            </div>
          </div>

          {/* RIGHT meta-box */}
          <div>
            <div style={{ background: tintBg, borderRadius: "2px", minWidth: "55mm" }}>
              <MetaLine k="เลขที่เอกสาร :" v={p.docNo} />
              <MetaLine k="วันที่ออก :" v={p.dateIssued} />
              <MetaLine k="ครบกำหนดชำระ :" v={p.dateDue} strong />
            </div>
          </div>
        </div>

        {/* ── ITEMS TABLE — Pacred 11-col cargo table (same as the receipt) ── */}
        <div style={{ height: "182px", overflow: "visible", borderTop: "1px solid #d8dade", paddingTop: "1.5mm" }}>
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
              {p.items.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", color: "#6b7280", background: "#fff" }}>
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                p.items.map((row) => (
                  <tr key={row.no} style={{ background: "#fff" }}>
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
                    <td style={tdNum}>{fmt2(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── SPACER pushes summary to bottom ─────────── */}
        <div style={{ flex: 1 }} />

        {/* ── SUMMARY + PAYMENT + REMARK + CERTIFIED ─────── */}
        {/* Peak section dividers (ภูม flag): thin full-width rules separate each
            band — สรุป · การชำระเงิน · หมายเหตุ · รับรอง — like the ใบเสร็จ. */}
        <div style={{ borderTop: "1px solid #d8dade" }}>
          {/* SUMMARY 2-col */}
          <div style={{ display: "flex", gap: "6mm", marginBottom: "1.5mm", paddingTop: "2mm" }}>
            {/* LEFT: charge breakdown + Thai words */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: "4mm" }}>
                <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>สรุป</p>
                <div style={{ flex: 1 }}>
                  <SumLine k="ค่าขนส่งรายการ" v={`${fmt2(p.subtotal)} บาท`} />
                  {p.maoFee > 0 && <SumLine k="+ ค่าส่งเหมาๆ (PRF)" v={`${fmt2(p.maoFee)} บาท`} />}
                  {p.deliveryChn > 0 && <SumLine k="+ ค่าขนส่งจีน" v={`${fmt2(p.deliveryChn)} บาท`} />}
                  {p.deliveryTh > 0 && <SumLine k="+ ค่าขนส่งไทย" v={`${fmt2(p.deliveryTh)} บาท`} />}
                  {p.other > 0 && <SumLine k="+ อื่นๆ" v={`${fmt2(p.other)} บาท`} />}
                  {p.discount > 0 && <SumLine k="− ส่วนลด" v={`${fmt2(p.discount)} บาท`} red />}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderTop: "0.5px solid #e5e7eb", paddingTop: "2px", marginTop: "2px" }}>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ยอดชำระสุทธิ</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#111827", maxWidth: "55mm", textAlign: "right" }}>
                      {p.netThaiWord}บาทถ้วน
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
                <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>การชำระเงิน</p>
                <div style={{ flex: 1, display: "flex", gap: "6mm" }}>
                  <div style={{ minWidth: "44mm" }}>
                    <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>ธ.กสิกรไทย</p>
                    <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#111827" }}>ออมทรัพย์ {BANK.accountNumber}</p>
                    <p style={{ margin: 0, fontSize: "10px", color: "#6b7280" }}>{BANK.accountName}</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>กรุณาชำระภายใน :</p>
                      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#b45309" }}>{p.dateDue}</p>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
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
            <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827", minWidth: "14mm" }}>หมายเหตุ</p>
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

          {/* CERTIFIED — 4 boxes: QR · ผู้วางบิล · ตราประทับ · ผู้รับวางบิล */}
          <div style={{ display: "flex", gap: "2mm", borderTop: "1px solid #e5e7eb", paddingTop: "2mm" }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minWidth: "14mm" }}>
              <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>รับรอง</p>
            </div>

            {/* QR */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>สแกนเพื่อเปิดด้วยเว็บไซต์</p>
              <div style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "center" }}>
                <Image src={qrDataUrl} alt={`QR ${p.docNo}`} width={120} height={120} unoptimized style={{ width: "18mm", height: "18mm", display: "block" }} />
              </div>
            </div>

            {/* ผู้วางบิล (ผู้ขาย) */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ผู้วางบิล (ผู้ขาย)</p>
              <div style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "flex-end" }}>
                <Image src="/legacy/pcs/assets/images/theme/sin-wandee.jpg" alt="ลายมือชื่อ" width={70} height={28} unoptimized style={{ width: "20mm", height: "auto" }} />
              </div>
              <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{DOC_SIGNATORY.name}</p>
                <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>{p.dateIssued}</p>
              </div>
            </div>

            {/* ตราประทับ (ผู้ขาย) */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ตราประทับ (ผู้ขาย)</p>
              <div style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "center" }}>
                <Image src="/images/pacred-stamp-tight.png" alt="ตราประทับ" width={106} height={58} unoptimized style={{ width: "auto", height: "18mm" }} />
              </div>
              <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                <p style={{ margin: 0, fontSize: "8px", color: "#6b7280" }}>&nbsp;</p>
              </div>
            </div>

            {/* ผู้รับวางบิล (ลูกค้า) */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>ผู้รับวางบิล (ลูกค้า)</p>
              <div style={{ height: "18mm", border: "0.5px solid #d1d5db" }}></div>
              <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
                <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{p.buyerName}</p>
              </div>
            </div>
          </div>
        </div>

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
export function BillingRunPaper(props: BillingRunPaperProps) {
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

      <BillingRunPage label="ต้นฉบับ" {...props} />
      <BillingRunPage label="สำเนา" {...props} />
    </>
  );
}

/**
 * <ShopDocumentPaper> — the PEAK-style skin of the ฝากสั่งซื้อ (shop-order)
 * print document (ใบเสร็จรับเงิน / ใบแจ้งหนี้). Owner directive 2026-06-22:
 * the admin shop print page now offers a Toggle to flip the SAME document
 * between the legacy/PCS form (default) and this PEAK form.
 *
 * VISUAL TEMPLATE = `components/receipt/receipt-paper.tsx` (the forwarder
 * receipt's PEAK render) — same headerFormatOne (logo LEFT · label+title
 * RIGHT) · same issuer/customer info row · same orange-tint meta box · same
 * print/screen CSS (A4 portrait, page-break per doc). The items table is
 * the SHOP 6-col table (ลำดับ / ข้อมูลสินค้า / จำนวน / ราคาต่อชิ้น /
 * ค่าขนส่งจีน / ราคารวม) — NOT the forwarder 11-col cargo table.
 *
 * ── MONEY FAITHFULNESS (the critical contract) ──────────────────────────
 * The rows + per-line totals + grand total come from `computeShopDocument`
 * (shop-document-data.ts), the SAME function the legacy skin's `ShopItemRows`
 * now uses. So whatever the legacy form prints as a line total / grand total,
 * this form prints the SAME number — same formula, same iteration order,
 * same rounding. A PEAK document whose total ≠ the legacy's would be a
 * money defect; sharing the computation makes that impossible.
 *
 * One <ShopDocumentPaper> renders ALL docs (one A4 page each), matching the
 * legacy page's "one mPDF page per id" loop. `kind` ("receipt" | "invoice")
 * drives the title — receipt → ใบเสร็จรับเงิน (orange) + payment meta;
 * invoice → ใบแจ้งหนี้ (gray) + due-date meta — mirroring the legacy
 * print=1 vs print≠1 distinction.
 *
 * Server Component — imports only site constants + next/image + the shared
 * shop computation/format helpers. No supabase/auth/QRCode.
 */

import Image from "next/image";
import {
  SITE_LEGAL_NAME,
  SITE_LEGAL_NAME_TH,
  TAX_ID,
  CONTACT,
  ADDRESSES,
} from "@/components/seo/site";
import type { PrintDoc } from "@/app/[locale]/(admin)/admin/service-orders/print/shop-document-types";
import { computeShopDocument } from "@/app/[locale]/(admin)/admin/service-orders/print/shop-document-data";
import {
  numberFormat,
  nameProvider,
  convert,
} from "@/app/[locale]/(admin)/admin/service-orders/print/shop-document-format";

type ShopDocKind = "receipt" | "invoice";

export function ShopDocumentPaper({
  docs,
  kind,
}: {
  docs: PrintDoc[];
  kind: ShopDocKind;
}) {
  return (
    <>
      {/* Print + screen CSS — A4 portrait, one page per doc. Mirrors the
          receipt-paper.tsx print stylesheet so the shop PEAK doc prints with
          the same safe @page margin + no chrome bleed-through. */}
      <style>{`
        /* screen-only gray gutter so the white A4 paper floats (Peak look).
           Must be a FULLSCREEN overlay (like the legacy .print-fullscreen-overlay)
           so it escapes the admin layout's sidebar+content column — otherwise the
           A4 paper renders inside the .subpage column and gets squeezed off the
           right edge (fixed 2026-06-22 · was position:static). overflow:auto (not
           hidden) because the PEAK A4 paper is full-height and must scroll. */
        .shop-peak-gutter {
          position: fixed;
          inset: 0;
          z-index: 99999;
          overflow: auto;
          background: #555;
          padding: 16px 0 64px;
        }
        /* float the toggle + print button top-right, always visible while
           scrolling (mirrors .print-fullscreen-overlay > .no-print). */
        .shop-peak-gutter > .no-print {
          position: fixed;
          top: 1rem;
          right: 1rem;
          z-index: 100000;
          margin-bottom: 0 !important;
        }
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          /* drop the gray gutter on print — no backdrop bleeds onto the page */
          .shop-peak-gutter {
            background: white !important;
            min-height: 0 !important;
            padding: 0 !important;
          }
          .no-print, .no-print * { display: none !important; }
          .shop-peak-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: none !important;
            width: 100% !important;
            min-height: 287mm !important;
            page-break-after: always;
            page-break-inside: avoid;
          }
          .shop-peak-page:last-child { page-break-after: auto; }
          .shop-peak-page .subpage {
            padding: 0 !important;
          }
        }
        @media screen {
          .shop-peak-page {
            margin: 16px auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
            border-radius: 4px;
          }
        }
        .shop-peak-page .subpage {
          display: flex;
          flex-direction: column;
        }
      `}</style>

      {docs.map((doc) => (
        <ShopDocumentPage key={doc.hNo} doc={doc} kind={kind} />
      ))}
    </>
  );
}

/** Peak palette — receipt orange (#FFA30A) for ใบเสร็จ, gray (#5F5D5A) for
 *  ใบแจ้งหนี้ — the same two-tone Peak look the forwarder receipt uses. */
function ShopDocumentPage({
  doc,
  kind,
}: {
  doc: PrintDoc;
  kind: ShopDocKind;
}) {
  const isReceipt = kind === "receipt";
  const titleColor = isReceipt ? "#FFA30A" : "#5F5D5A";
  const tintBg = isReceipt ? "rgba(255,163,10,0.165)" : "rgba(95,93,90,0.165)";
  const title = isReceipt ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้";

  // ── MONEY — the SAME computation the legacy skin uses ──
  const { rows, grandTotalRaw, grandTotalRounded } = computeShopDocument(doc);
  const showRaw = Math.abs(grandTotalRaw - grandTotalRounded) > 0.0001;

  const issuerAddress = ADDRESSES.office.full;
  const customerName = `${doc.fName}${doc.header.userfullname ?? ""}`.trim();

  return (
    <div
      className="shop-peak-page bg-white text-black mx-auto"
      style={{ width: "210mm", minHeight: "287mm", display: "flex", flexDirection: "column" }}
    >
      <div className="subpage" style={{ padding: "10mm 12mm", flex: 1, display: "flex", flexDirection: "column" }}>

        {/* ── headerFormatOne: logo LEFT · title RIGHT ─────────────────── */}
        <div style={{ marginBottom: "3mm" }}>
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
              <div style={{ fontSize: "11px", color: "#6b7280" }}>(ต้นฉบับ)</div>
              <h2 style={{ margin: 0, fontSize: "28px", fontWeight: "bold", color: titleColor, lineHeight: 1.1 }}>
                {title}
              </h2>
              <div style={{ fontSize: "11px", color: "#6b7280", marginTop: "2px" }}>
                เลขที่ฝากสั่งซื้อ #{doc.dataTitleEntry}
              </div>
            </div>
          </div>
        </div>

        {/* ── INFO ROW: issuer+customer LEFT · meta-box RIGHT ───────────── */}
        <div style={{ display: "flex", gap: "8mm", marginBottom: "2mm" }}>
          {/* LEFT PAIR */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* ISSUER */}
            <div style={{ marginBottom: "2mm" }}>
              <InfoLine label="ผู้ขาย :" value={SITE_LEGAL_NAME_TH} valueBold />
              <InfoLine label="ที่อยู่ :" value={issuerAddress} />
              <InfoLine label="เลขที่ภาษี :" value={`${TAX_ID} (สำนักงานใหญ่)`} />
              <InfoLine label="ติดต่อ :" value={`${CONTACT.phoneCompanyDisplay} · ${CONTACT.emailAcc}`} />
            </div>
            {/* CUSTOMER */}
            <div>
              <InfoLine label="ลูกค้า :" value={customerName || "-"} valueBold />
              {doc.header.usercompany === "1" && (
                <InfoLine label="เลขที่ภาษี :" value={doc.corporateNumber || "-"} />
              )}
              <InfoLine label="รหัสสมาชิก :" value={doc.header.userid} />
              <InfoLine label="ที่อยู่ :" value={doc.header.fulladdress || "-"} preWrap />
              <InfoLine label="อีเมล :" value={doc.header.useremail || "-"} />
            </div>
          </div>

          {/* RIGHT meta-box */}
          <div>
            <div style={{ background: tintBg, borderRadius: "2px", minWidth: "58mm" }}>
              <MetaLine label="เลขที่เอกสาร :" value={doc.header.hno} />
              <MetaLine label="วันที่สั่ง :" value={doc.dateCreate || "-"} />
              {isReceipt ? (
                <>
                  <MetaLine label="วันที่ชำระเงิน :" value={doc.datePay || "-"} />
                  <MetaLine label="ชำระโดย :" value="โอนผ่านธนาคาร" last />
                </>
              ) : (
                <MetaLine label="วันที่ครบกำหนดชำระ :" value={doc.datePayExp || "-"} last />
              )}
            </div>
          </div>
        </div>

        {/* ── ITEMS TABLE — shop 6-col (ลำดับ/สินค้า/จำนวน/ราคาต่อชิ้น/ค่าขนส่งจีน/รวม) ── */}
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: tintBg }}>
                <Th width="8%" align="center">ลำดับ<br /><ThSub>No.</ThSub></Th>
                <Th width="46%" align="left">ข้อมูลสินค้า<br /><ThSub>Product</ThSub></Th>
                <Th width="10%" align="right">จำนวน<br /><ThSub>Qty</ThSub></Th>
                <Th width="12%" align="right">ราคาต่อชิ้น<br /><ThSub>Unit ฿</ThSub></Th>
                <Th width="12%" align="right">ค่าขนส่งจีน<br /><ThSub>Ship CN ฿</ThSub></Th>
                <Th width="12%" align="right">ราคารวม<br /><ThSub>Total ฿</ThSub></Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "10px 4px", textAlign: "center", fontSize: "11px", color: "#6b7280" }}>
                    ไม่พบรายการ
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.no} style={{ background: "#fff" }}>
                    <td style={cellStyle("center")}>{row.no}</td>
                    <td style={{ ...cellStyle("left"), fontSize: "10px" }} lang="zh">
                      <span style={{ color: "#9ca3af", fontSize: "9px" }}>[{nameProvider(row.cProvider)}] </span>
                      {row.cTitle}
                      {(row.cColor || row.cSize) && (
                        <div style={{ color: "#6b7280", fontSize: "9px" }}>
                          {row.cColor}{row.cColor && row.cSize ? " : " : ""}{row.cSize}
                        </div>
                      )}
                    </td>
                    <td style={{ ...cellStyle("right"), fontFamily: "monospace" }}>{row.cAmount}</td>
                    <td style={{ ...cellStyle("right"), fontFamily: "monospace" }}>{numberFormat(row.unitPriceThb)}</td>
                    <td style={{ ...cellStyle("right"), fontFamily: "monospace" }}>{numberFormat(row.shippingChnThb)}</td>
                    <td style={{ ...cellStyle("right"), fontFamily: "monospace", fontWeight: "bold" }}>{numberFormat(row.rowTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── SPACER pushes the summary to the bottom ──────────────────── */}
        <div style={{ flex: 1 }} />

        {/* ── SUMMARY — Thai-word LEFT · big total box RIGHT ───────────── */}
        <div style={{ display: "flex", gap: "6mm", marginBottom: "2mm", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>สรุป</p>
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#374151" }}>
              ({convert(grandTotalRaw)})
            </p>
          </div>
          <div style={{ background: tintBg, borderRadius: "2px", padding: "6px 14px", textAlign: "center", minWidth: "55mm" }}>
            <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>ราคารวมทั้งหมด</p>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "bold", color: "#111827" }}>
              {numberFormat(grandTotalRaw)} <span style={{ fontSize: "12px" }}>บาท</span>
            </h3>
            {showRaw && (
              <p style={{ margin: "1px 0 0", fontSize: "10px", color: "#6b7280" }}>
                ({numberFormat(grandTotalRaw, 4)})
              </p>
            )}
          </div>
        </div>

        {/* ── REMARK ───────────────────────────────────────────────────── */}
        <div style={{ marginBottom: "3mm" }}>
          <p style={{ margin: 0, fontSize: "10px", color: "#374151" }}>
            {isReceipt
              ? "*ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว"
              : "*กรุณาชำระเงินภายในวันที่ครบกำหนด เพื่อให้ทางบริษัทดำเนินการสั่งซื้อสินค้าให้ท่าน"}
          </p>
        </div>

        {/* ── CERTIFIED — issuer stamp/sign + customer receive box ──────── */}
        <div style={{ display: "flex", gap: "4mm" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", minWidth: "14mm" }}>
            <p style={{ margin: 0, fontSize: "11px", fontWeight: "bold", color: "#111827" }}>รับรอง</p>
          </div>
          {/* ผู้ออกเอกสาร */}
          <CertBox label="ผู้ออกเอกสาร (ผู้ขาย)">
            <div style={{ display: "flex", justifyContent: "center", height: "18mm", alignItems: "center" }}>
              <Image
                src="/images/pacred-stamp-tight.png"
                alt="ตราประทับ Pacred"
                width={106}
                height={58}
                unoptimized
                style={{ width: "auto", height: "16mm" }}
              />
            </div>
            <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
              <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{SITE_LEGAL_NAME_TH}</p>
            </div>
          </CertBox>
          {/* ผู้รับเอกสาร */}
          <CertBox label="ผู้รับเอกสาร (ลูกค้า)">
            <div style={{ height: "18mm", border: "0.5px solid #d1d5db" }} />
            <div style={{ borderTop: "0.5px solid #374151", paddingTop: "2px" }}>
              <p style={{ margin: 0, fontSize: "9px", fontWeight: "bold", color: "#111827" }}>{customerName || "-"}</p>
            </div>
          </CertBox>
        </div>

      </div>
    </div>
  );
}

// ── Small presentational helpers (keep the page readable) ─────────────

function InfoLine({
  label,
  value,
  valueBold,
  preWrap,
}: {
  label: string;
  value: string;
  valueBold?: boolean;
  preWrap?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "4px", marginBottom: "1px" }}>
      <div style={{ minWidth: "20mm" }}>
        <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>{label}</p>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: valueBold ? "11px" : "10px",
            fontWeight: valueBold ? "bold" : "normal",
            color: valueBold ? "#111827" : "#374151",
            whiteSpace: preWrap ? "pre-wrap" : "normal",
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function MetaLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 8px", marginBottom: last ? 0 : "2px" }}>
      <p style={{ margin: 0, fontSize: "10px", fontWeight: "bold", color: "#6b7280" }}>{label}</p>
      <p style={{ margin: 0, fontSize: "10px", color: "#111827", textAlign: "right" }}>{value}</p>
    </div>
  );
}

function Th({ children, width, align }: { children: React.ReactNode; width: string; align: "left" | "right" | "center" }) {
  return (
    <th style={{ textAlign: align, padding: "5px 4px", width, fontSize: "10px", fontWeight: "bold", color: "#374151" }}>
      {children}
    </th>
  );
}

function ThSub({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: "8px", fontWeight: "normal", color: "#6b7280" }}>{children}</span>;
}

function cellStyle(align: "left" | "right" | "center"): React.CSSProperties {
  return {
    padding: "4px 4px",
    fontSize: "10px",
    textAlign: align,
    borderTop: "0.5px solid #e5e7eb",
    verticalAlign: "top",
  };
}

function CertBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <p style={{ margin: "0 0 2px", fontSize: "9px", fontWeight: "bold", color: "#374151" }}>{label}</p>
      {children}
    </div>
  );
}

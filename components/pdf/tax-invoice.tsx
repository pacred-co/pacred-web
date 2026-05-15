/**
 * Tax invoice (ใบกำกับภาษี) — Pacred PDF template per Thai Revenue
 * Department Code 86.
 *
 * Server-rendered via `@react-pdf/renderer` from the issuance action
 * (`actions/admin/tax-invoices.ts::issueTaxInvoice`) and the customer
 * download route (`app/api/tax-invoice/[id]/route.tsx`).
 *
 * Required RD fields covered (per ADR-0006 §2):
 *   ✓ "ใบกำกับภาษี" header
 *   ✓ Serial number (INV-YYYYMM-NNNN)
 *   ✓ Issue date (Thai พ.ศ. format)
 *   ✓ Seller info: Pacred legal name, address, tax ID, branch (สำนักงานใหญ่)
 *   ✓ Buyer info: name, address, tax ID, branch — snapshot from tax_invoices row
 *   ✓ Line items: description, qty, unit price, amount (VAT-exclusive subtotal)
 *   ✓ VAT 7% — explicit row
 *   ✓ Total + readThaiBaht spell-out
 *   ✓ Payment method
 *   ✓ Authorised signature footer
 *
 * Cancellation watermark: when status='cancelled', a diagonal "ยกเลิก"
 * stamp overlays the page (ADR-0006 §7 — original PDF stays in storage,
 * append CANCELLED watermark on re-render).
 *
 * Server-only: imports `register-fonts` which is `server-only`.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS, fmtBaht } from "./styles";
import { readThaiBaht } from "@/lib/utils/thai-number";
import {
  CONTACT,
  ADDRESSES,
  SITE_LEGAL_NAME_TH,
  TAX_ID,
} from "@/components/seo/site";

export type TaxInvoiceData = {
  /** Serial — null when status='pending' (we don't render a PDF for pending). */
  serial_no:    string | null;
  status:       "pending" | "issued" | "cancelled";
  issued_at:    string | null;
  created_at:   string;

  /** Buyer snapshot at issuance (immutable per RD Code 86). */
  buyer_name:    string;
  buyer_address: string;
  buyer_tax_id:  string;
  buyer_branch:  string;

  /** Financial snapshot. */
  subtotal_thb: number;
  vat_thb:      number;
  total_thb:    number;
  vat_mode:     "inclusive" | "exclusive";
  payment_method: string;

  /** Line items — typically one summary row, but admin can split. */
  lines: Array<{
    position:       number;
    description:    string;
    qty:            number;
    unit_price_thb: number;
    amount_thb:     number;
    vat_thb:        number;
  }>;

  /** Source order pointer (for ref text on the invoice). */
  order_h_no:     string | null;
  forwarder_f_no: string | null;
};

// ── Helpers ─────────────────────────────────────────────────────────

/** Format ISO date as "วันที่ DD เดือนชื่อ พ.ศ. YYYY+543". */
function formatDateThaiBE(iso: string): string {
  const d = new Date(iso);
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** Format tax ID as `X-XXXX-XXXXX-XX-X` for display (RD standard grouping). */
function formatTaxId(id: string): string {
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

// ── Component ───────────────────────────────────────────────────────

export function TaxInvoice({ data }: { data: TaxInvoiceData }) {
  const isCancelled = data.status === "cancelled";
  const issueDate = data.issued_at ?? data.created_at;
  const refLabel = data.order_h_no
    ? `อ้างอิง: ฝากสั่งซื้อ ${data.order_h_no}`
    : data.forwarder_f_no
      ? `อ้างอิง: ฝากนำเข้า ${data.forwarder_f_no}`
      : "";

  return (
    <Document
      title={`Pacred Tax Invoice ${data.serial_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Tax invoice ${data.serial_no ?? "draft"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header — seller info + invoice meta */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Pacred</Text>
            <Text style={styles.brandTagline}>{SITE_LEGAL_NAME_TH}</Text>
            <Text style={styles.brandAddress}>
              {ADDRESSES.office.full}{"\n"}
              เลขประจำตัวผู้เสียภาษี: {formatTaxId(TAX_ID)} (สำนักงานใหญ่){"\n"}
              โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.emailAcc}
            </Text>
          </View>
          <View style={styles.receiptMeta}>
            <Text style={styles.receiptTitle}>ใบกำกับภาษี / ใบเสร็จรับเงิน</Text>
            <Text style={styles.receiptTitleEn}>TAX INVOICE / RECEIPT</Text>
            <Text style={styles.receiptNo}>
              เลขที่: {data.serial_no ?? "(รอออก)"}
            </Text>
            <Text style={styles.receiptDate}>
              วันที่ {formatDateThaiBE(issueDate)}
            </Text>
            {data.status === "issued" && (
              <Text style={styles.originalCopy}>(ต้นฉบับ / ORIGINAL)</Text>
            )}
          </View>
        </View>

        {/* Buyer block + ref */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol, styles.buyerColWide]}>
            <Text style={styles.customerLabel}>ผู้ซื้อ / BUYER</Text>
            <Text style={styles.customerName}>{data.buyer_name}</Text>
            <Text style={styles.customerLine}>{data.buyer_address}</Text>
            <Text style={styles.customerLine}>
              เลขประจำตัวผู้เสียภาษี: {formatTaxId(data.buyer_tax_id)}
            </Text>
            <Text style={styles.customerLine}>สาขา: {data.buyer_branch}</Text>
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>การชำระเงิน</Text>
            <Text style={styles.customerName}>{data.payment_method}</Text>
            {refLabel && <Text style={styles.customerLine}>{refLabel}</Text>}
            <Text style={styles.customerLine}>
              VAT: {data.vat_mode === "inclusive" ? "รวมในราคา" : "แยกต่างหาก"} 7%
            </Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.6, textAlign: "center" }]}>
              ลำดับ
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 5 }]}>
              รายละเอียด / DESCRIPTION
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 0.8, textAlign: "right" }]}>
              จำนวน
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 1.2, textAlign: "right" }]}>
              ราคาต่อหน่วย
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
              จำนวนเงิน (บาท)
            </Text>
          </View>
          {data.lines.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 9, textAlign: "center", color: COLORS.muted }]}>
                ไม่มีรายการ
              </Text>
            </View>
          ) : (
            data.lines.map((it, i) => (
              <View
                key={`${it.position}-${i}`}
                style={[
                  styles.tableRow,
                  i === data.lines.length - 1 ? styles.tableRowLast : {},
                ]}
              >
                <Text style={[styles.tableCell, { flex: 0.6, textAlign: "center" }]}>
                  {it.position}
                </Text>
                <Text style={[styles.tableCell, { flex: 5 }]}>{it.description}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.8 }]}>
                  {Number(it.qty).toLocaleString("en-US")}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.2 }]}>
                  {fmtBaht(Number(it.unit_price_thb))}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.4 }]}>
                  {fmtBaht(Number(it.amount_thb))}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Totals block — subtotal / VAT / grand total */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>มูลค่าสินค้า / บริการ</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.subtotal_thb))}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              ภาษีมูลค่าเพิ่ม 7%
              {data.vat_mode === "inclusive" ? " (รวมในราคา)" : ""}
            </Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.vat_thb))}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>รวมทั้งสิ้น</Text>
            <Text style={styles.grandTotalValue}>฿{fmtBaht(Number(data.total_thb))}</Text>
          </View>
          <Text style={styles.amountInWords}>
            ({readThaiBaht(Number(data.total_thb))})
          </Text>
        </View>

        {/* Signature lines */}
        <View style={styles.signature}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>ผู้รับเงิน / RECEIVED BY</Text>
            </View>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>ผู้มีอำนาจ / AUTHORISED BY</Text>
            </View>
          </View>
        </View>

        {/* Cancelled watermark — diagonal overlay drawn LAST so it sits on top */}
        {isCancelled && (
          <View style={styles.cancelledOverlay} fixed>
            <Text style={styles.cancelledText}>ยกเลิก / CANCELLED</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            เอกสารนี้ออกโดย Pacred — สอบถาม {CONTACT.emailAcc} · {CONTACT.phoneCompanyDisplay}
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

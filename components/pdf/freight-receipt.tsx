/**
 * Freight receipt (ใบเสร็จรับเงิน / ใบกำกับภาษี) — Pacred PDF template
 * per Thai Revenue Department Code 86.
 *
 * V-E7 — the receipt-side document for a freight invoice (migration
 * 0051 `freight_invoices`). Server-rendered via `@react-pdf/renderer`
 * from the download route `app/api/freight-receipt/[id]/route.tsx`.
 *
 * Mirrors `components/pdf/tax-invoice.tsx` (RD Code 86) closely — same
 * seller block, line table, totals, bank block, signatures, watermark.
 *
 * Required RD Code 86 fields covered (per ADR-0006 §2):
 *   ✓ Document title — "ใบกำกับภาษี / ใบเสร็จรับเงิน"
 *   ✓ Document number — the freight invoice_no (FI{YYMMDD}-{NNNN})
 *   ✓ Issue date (Thai พ.ศ. format)
 *   ✓ Seller: Pacred legal name, address, tax ID, branch (สำนักงานใหญ่)
 *   ✓ Buyer: consignee name, address, tax ID, branch — snapshot from
 *     freight_invoices at issuance (immutable per RD Code 86)
 *   ✓ Line items: description, qty, unit, amount
 *   ✓ VAT 7% — explicit row
 *   ✓ Grand total + readThaiBaht spell-out
 *   ✓ Payment ledger (method / date / amount per partial payment)
 *   ✓ Authorised signature footer
 *
 * State display:
 *   - payment_status='paid'|'overpaid' → "ได้รับเงินแล้ว" green stamp +
 *     the latest payment date; title reads as a RECEIPT.
 *   - payment_status='unpaid'|'partial' → title reads as INVOICE; the
 *     outstanding amount is printed.
 *   - document status='cancelled' → diagonal "ยกเลิก / CANCELLED"
 *     watermark (mirror tax-invoice §7 immutability — re-render, never
 *     edit the stored original).
 *
 * Server-only: imports from `./styles` which the route registers fonts for.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS, fmtBaht } from "./styles";
import { readThaiBaht } from "@/lib/utils/thai-number";
import {
  CONTACT,
  ADDRESSES,
  SITE_LEGAL_NAME_TH,
  TAX_ID,
  BANK,
} from "@/components/seo/site";

export type FreightReceiptLine = {
  position:     number;
  description:  string;
  qty:          number;
  unit:         string;
  /** Line amount in THB (USD line × frozen exchange rate). */
  amount_thb:   number;
};

export type FreightReceiptPayment = {
  method:      string;       // localised label, e.g. "โอนผ่านธนาคาร"
  amount_thb:  number;
  paid_at:     string;       // ISO
  bank_ref:    string | null;
};

export type FreightReceiptData = {
  /** Freight invoice number — FI{YYMMDD}-{NNNN}. Null only for an un-issued draft (not rendered). */
  invoice_no:     string | null;
  /** Document lifecycle — draws the CANCELLED watermark when 'cancelled'. */
  status:         "draft" | "issued" | "cancelled";
  /** Payment settlement axis — drives the RECEIPT vs INVOICE title + the paid stamp. */
  payment_status: "unpaid" | "partial" | "paid" | "overpaid";
  issued_at:      string | null;
  created_at:     string;

  /** Reference shipment job number — printed as a cross-ref line. */
  job_no:         string | null;

  /** Buyer (consignee) snapshot at issuance — immutable per RD Code 86. */
  buyer_name:     string;
  buyer_address:  string;
  buyer_tax_id:   string | null;
  buyer_branch:   string | null;

  /** Financial snapshot (THB). */
  subtotal_thb:   number;     // Σ line amounts (commercial value in THB)
  duty_thb:       number;     // import duty
  vat_thb:        number;     // 7% import VAT
  total_thb:      number;     // grand total = subtotal + duty + vat
  paid_thb:       number;     // Σ recorded payments
  outstanding_thb: number;    // total − paid (>= 0)

  lines:          FreightReceiptLine[];
  payments:       FreightReceiptPayment[];
};

// ── Helpers ─────────────────────────────────────────────────────────

/** Format ISO date as "DD เดือนชื่อ พ.ศ. YYYY+543". */
function formatDateThaiBE(iso: string): string {
  const d = new Date(iso);
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/** Format tax ID as `X-XXXX-XXXXX-XX-X` (RD standard grouping). */
function formatTaxId(id: string): string {
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

// ── Component ───────────────────────────────────────────────────────

export function FreightReceipt({ data }: { data: FreightReceiptData }) {
  const isCancelled = data.status === "cancelled";
  const isPaid      = data.payment_status === "paid" || data.payment_status === "overpaid";
  const issueDate   = data.issued_at ?? data.created_at;

  // The latest recorded payment date drives the "ได้รับเงินแล้ว" stamp.
  const latestPaymentIso = data.payments.length > 0
    ? data.payments
        .map((p) => p.paid_at)
        .sort()
        .at(-1) ?? null
    : null;

  // RD Code 86 combined doc: title reads as a RECEIPT once fully paid,
  // otherwise as an INVOICE awaiting payment.
  const titleTh = isPaid
    ? "ใบกำกับภาษี / ใบเสร็จรับเงิน"
    : "ใบกำกับภาษี / ใบแจ้งหนี้";
  const titleEn = isPaid ? "TAX INVOICE / RECEIPT" : "TAX INVOICE";

  return (
    <Document
      title={`Pacred Freight Receipt ${data.invoice_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Freight receipt ${data.invoice_no ?? "draft"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header — seller info + document meta */}
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
            <Text style={styles.receiptTitle}>{titleTh}</Text>
            <Text style={styles.receiptTitleEn}>{titleEn}</Text>
            <Text style={styles.receiptNo}>
              เลขที่: {data.invoice_no ?? "(รอออก)"}
            </Text>
            <Text style={styles.receiptDate}>
              วันที่ {formatDateThaiBE(issueDate)}
            </Text>
            {data.status === "issued" && (
              <Text style={styles.originalCopy}>(ต้นฉบับ / ORIGINAL)</Text>
            )}
          </View>
        </View>

        {/* Buyer block + shipment ref */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol, styles.buyerColWide]}>
            <Text style={styles.customerLabel}>ผู้ซื้อ / BUYER</Text>
            <Text style={styles.customerName}>{data.buyer_name}</Text>
            <Text style={styles.customerLine}>{data.buyer_address}</Text>
            {data.buyer_tax_id && (
              <Text style={styles.customerLine}>
                เลขประจำตัวผู้เสียภาษี: {formatTaxId(data.buyer_tax_id)}
              </Text>
            )}
            {data.buyer_branch && (
              <Text style={styles.customerLine}>สาขา: {data.buyer_branch}</Text>
            )}
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>อ้างอิงงานขนส่ง</Text>
            <Text style={styles.customerName}>{data.job_no ?? "—"}</Text>
            <Text style={styles.customerLine}>
              สถานะการชำระ: {paymentStatusLabel(data.payment_status)}
            </Text>
            <Text style={styles.customerLine}>VAT แยกต่างหาก 7%</Text>
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
            <Text style={[styles.tableHeadCell, { flex: 0.9, textAlign: "right" }]}>
              จำนวน
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 0.9, textAlign: "center" }]}>
              หน่วย
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
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.9 }]}>
                  {Number(it.qty).toLocaleString("en-US")}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.9, textAlign: "center" }]}>
                  {it.unit}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.4 }]}>
                  {fmtBaht(Number(it.amount_thb))}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Totals block — subtotal / duty / VAT / grand total */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>มูลค่าสินค้า / บริการ</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.subtotal_thb))}</Text>
          </View>
          {Number(data.duty_thb) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>อากรขาเข้า</Text>
              <Text style={styles.totalValue}>฿{fmtBaht(Number(data.duty_thb))}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ภาษีมูลค่าเพิ่ม 7%</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.vat_thb))}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>รวมทั้งสิ้น</Text>
            <Text style={styles.grandTotalValue}>฿{fmtBaht(Number(data.total_thb))}</Text>
          </View>
          <Text style={styles.amountInWords}>
            ({readThaiBaht(Number(data.total_thb))})
          </Text>

          {/* Payment progress — paid + outstanding rows below the total. */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ชำระแล้ว</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.paid_thb))}</Text>
          </View>
          {Number(data.outstanding_thb) > 0 && (
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>คงค้างชำระ</Text>
              <Text style={styles.grandTotalValue}>฿{fmtBaht(Number(data.outstanding_thb))}</Text>
            </View>
          )}
        </View>

        {/* Payment ledger — every recorded partial payment */}
        {data.payments.length > 0 && (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { flex: 2 }]}>วันที่ชำระ</Text>
              <Text style={[styles.tableHeadCell, { flex: 2 }]}>วิธีชำระ</Text>
              <Text style={[styles.tableHeadCell, { flex: 2.5 }]}>อ้างอิง</Text>
              <Text style={[styles.tableHeadCell, { flex: 1.8, textAlign: "right" }]}>
                จำนวนเงิน (บาท)
              </Text>
            </View>
            {data.payments.map((p, i) => (
              <View
                key={`pay-${i}`}
                style={[
                  styles.tableRow,
                  i === data.payments.length - 1 ? styles.tableRowLast : {},
                ]}
              >
                <Text style={[styles.tableCell, { flex: 2 }]}>
                  {formatDateThaiBE(p.paid_at)}
                </Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>{p.method}</Text>
                <Text style={[styles.tableCell, { flex: 2.5 }]}>{p.bank_ref ?? "—"}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.8 }]}>
                  {fmtBaht(Number(p.amount_thb))}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Bank-transfer payment info */}
        <View style={styles.bankBlock}>
          <Text style={styles.bankTitle}>ช่องทางการชำระเงิน / PAYMENT — โอนผ่านธนาคาร / Bank transfer</Text>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>ธนาคาร / Bank</Text>
            <Text style={styles.bankValue}>{BANK.name} ({BANK.nameEn})</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>ชื่อบัญชี / Account</Text>
            <Text style={styles.bankValue}>{BANK.accountName} / {BANK.accountNameEn}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>เลขที่ / No.</Text>
            <Text style={[styles.bankValue, styles.bankAccountNumber]}>{BANK.accountNumber}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>ประเภท / Type</Text>
            <Text style={styles.bankValue}>{BANK.accountType} / {BANK.accountTypeEn}</Text>
          </View>
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

        {/* "ได้รับเงินแล้ว" stamp — drawn when fully paid (not cancelled). */}
        {isPaid && !isCancelled && (
          <View style={styles.cancelledOverlay} fixed>
            <Text style={[styles.cancelledText, { color: COLORS.muted }]}>
              ได้รับเงินแล้ว{latestPaymentIso ? `\n${formatDateThaiBE(latestPaymentIso)}` : ""}
            </Text>
          </View>
        )}

        {/* Cancelled watermark — drawn LAST so it sits on top of everything. */}
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

/** Thai label for the payment settlement status (PDF-local — keeps the
 *  component self-contained; the validators file has the canonical map
 *  but importing it here would pull a client-bound module into the PDF). */
function paymentStatusLabel(s: FreightReceiptData["payment_status"]): string {
  switch (s) {
    case "unpaid":   return "ยังไม่ชำระ";
    case "partial":  return "ชำระบางส่วน";
    case "paid":     return "ชำระครบแล้ว";
    case "overpaid": return "ชำระเกิน";
    default:         return s;
  }
}

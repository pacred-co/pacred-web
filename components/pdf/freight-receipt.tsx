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
import { styles, peakStyles, COLORS, fmtBaht } from "./styles";
import { readThaiBaht } from "@/lib/utils/thai-number";
import {
  CONTACT,
  ADDRESSES,
  SITE_LEGAL_NAME_TH,
  SITE_LEGAL_NAME,
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

  // Two-page output (ต้นฉบับ + สำเนา) — Peak's pattern (ภูม screenshot 4).
  // Each page renders the same body via PeakFreightReceiptPage with the
  // copy-label differing.
  return (
    <Document
      title={`Pacred Freight Receipt ${data.invoice_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Freight receipt ${data.invoice_no ?? "draft"}`}
      creator="Pacred Web (Next.js)"
    >
      <PeakFreightReceiptPage
        data={data}
        copyLabel="ต้นฉบับ / ORIGINAL"
        titleTh={titleTh}
        titleEn={titleEn}
        issueDate={issueDate}
        latestPaymentIso={latestPaymentIso}
        isPaid={isPaid}
        isCancelled={isCancelled}
      />
      <PeakFreightReceiptPage
        data={data}
        copyLabel="สำเนา / COPY"
        titleTh={titleTh}
        titleEn={titleEn}
        issueDate={issueDate}
        latestPaymentIso={latestPaymentIso}
        isPaid={isPaid}
        isCancelled={isCancelled}
      />
    </Document>
  );
}

/**
 * One A4 page in the Peak format. Rendered TWICE per document — once for
 * ต้นฉบับ, once for สำเนา (only the copy-label differs).
 */
function PeakFreightReceiptPage({
  data,
  copyLabel,
  titleTh,
  titleEn,
  issueDate,
  latestPaymentIso,
  isPaid,
  isCancelled,
}: {
  data: FreightReceiptData;
  copyLabel: string;
  titleTh: string;
  titleEn: string;
  issueDate: string;
  latestPaymentIso: string | null;
  isPaid: boolean;
  isCancelled: boolean;
}) {
  const preTax = Number(data.subtotal_thb) + Number(data.duty_thb);

  return (
    <Page size="A4" style={styles.page}>
      {/* ── Peak top header: brand left · doc badge right ── */}
      <View style={peakStyles.peakHeader}>
        <View style={peakStyles.peakBrandBlock}>
          <Text style={peakStyles.peakBrandName}>Pacred</Text>
          <Text style={peakStyles.peakBrandLegal}>{SITE_LEGAL_NAME_TH}</Text>
          <Text style={peakStyles.peakBrandLegalEn}>{SITE_LEGAL_NAME}</Text>
        </View>
        <View style={peakStyles.peakDocMeta}>
          <Text style={peakStyles.peakDocTitle}>{titleTh}</Text>
          <Text style={peakStyles.peakDocTitleEn}>{titleEn}</Text>
          <Text style={peakStyles.peakCopyBadge}>{copyLabel}</Text>
        </View>
      </View>

      {/* ── Two-card info row: issuer | customer ── */}
      <View style={peakStyles.peakInfoRow}>
        <View style={peakStyles.peakInfoCard}>
          <Text style={peakStyles.peakInfoLabel}>ผู้ออก / ISSUER</Text>
          <Text style={peakStyles.peakInfoName}>{SITE_LEGAL_NAME_TH}</Text>
          <Text style={peakStyles.peakInfoLine}>
            เลขผู้เสียภาษี: {formatTaxId(TAX_ID)} (สำนักงานใหญ่)
          </Text>
          <Text style={peakStyles.peakInfoLine}>{ADDRESSES.office.full}</Text>
          <Text style={peakStyles.peakInfoLine}>
            โทร {CONTACT.phoneCompanyDisplay}
          </Text>
          <Text style={peakStyles.peakInfoLineMuted}>{CONTACT.emailAcc}</Text>
        </View>
        <View style={[peakStyles.peakInfoCard, peakStyles.peakInfoCardLast]}>
          <Text style={peakStyles.peakInfoLabel}>ผู้รับ / CUSTOMER</Text>
          <Text style={peakStyles.peakInfoName}>{data.buyer_name}</Text>
          {data.buyer_tax_id && (
            <Text style={peakStyles.peakInfoLine}>
              เลขผู้เสียภาษี: {formatTaxId(data.buyer_tax_id)}
              {data.buyer_branch ? ` · สาขา: ${data.buyer_branch}` : ""}
            </Text>
          )}
          <Text style={peakStyles.peakInfoLine}>{data.buyer_address}</Text>
        </View>
      </View>

      {/* ── Right-aligned key:value meta box (เลขที่ · วันที่ · ผู้ขาย · เครดิต) ── */}
      <View style={peakStyles.peakMetaWrap}>
        <View style={peakStyles.peakMetaBox}>
          <View style={peakStyles.peakMetaRow}>
            <Text style={peakStyles.peakMetaLabel}>เลขที่</Text>
            <Text style={peakStyles.peakMetaValue}>{data.invoice_no ?? "(รอออก)"}</Text>
          </View>
          <View style={peakStyles.peakMetaRow}>
            <Text style={peakStyles.peakMetaLabel}>วันที่</Text>
            <Text style={peakStyles.peakMetaValue}>{formatDateThaiBE(issueDate)}</Text>
          </View>
          <View style={peakStyles.peakMetaRow}>
            <Text style={peakStyles.peakMetaLabel}>อ้างอิงงาน</Text>
            <Text style={peakStyles.peakMetaValue}>{data.job_no ?? "—"}</Text>
          </View>
          <View style={[peakStyles.peakMetaRow, peakStyles.peakMetaRowLast]}>
            <Text style={peakStyles.peakMetaLabel}>สถานะชำระ</Text>
            <Text style={peakStyles.peakMetaValue}>{paymentStatusLabel(data.payment_status)}</Text>
          </View>
        </View>
      </View>

      {/* ── Items table — kept as freight description/qty/unit/amount ── */}
      <View style={peakStyles.peakTable}>
        <View style={peakStyles.peakTableHead}>
          <Text style={[peakStyles.peakTableHeadCell, { flex: 0.6, textAlign: "center" }]}>ลำดับ</Text>
          <Text style={[peakStyles.peakTableHeadCell, { flex: 5 }]}>รายละเอียด</Text>
          <Text style={[peakStyles.peakTableHeadCell, { flex: 0.9, textAlign: "right" }]}>จำนวน</Text>
          <Text style={[peakStyles.peakTableHeadCell, { flex: 0.9, textAlign: "center" }]}>หน่วย</Text>
          <Text style={[peakStyles.peakTableHeadCell, { flex: 1.4, textAlign: "right" }]}>จำนวนเงิน (บาท)</Text>
        </View>
        {data.lines.length === 0 ? (
          <View style={peakStyles.peakTableRow}>
            <Text style={[peakStyles.peakTableCell, { flex: 9, textAlign: "center", color: COLORS.muted }]}>
              ไม่มีรายการ
            </Text>
          </View>
        ) : (
          data.lines.map((it, i) => (
            <View
              key={`${it.position}-${i}`}
              style={[
                peakStyles.peakTableRow,
                i === data.lines.length - 1 ? peakStyles.peakTableRowLast : {},
              ]}
            >
              <Text style={[peakStyles.peakTableCell, { flex: 0.6, textAlign: "center" }]}>
                {it.position}
              </Text>
              <Text style={[peakStyles.peakTableCell, { flex: 5 }]}>{it.description}</Text>
              <Text style={[peakStyles.peakTableCell, peakStyles.peakTableCellRight, { flex: 0.9 }]}>
                {Number(it.qty).toLocaleString("en-US")}
              </Text>
              <Text style={[peakStyles.peakTableCell, { flex: 0.9, textAlign: "center" }]}>
                {it.unit}
              </Text>
              <Text style={[peakStyles.peakTableCell, peakStyles.peakTableCellRight, { flex: 1.4 }]}>
                {fmtBaht(Number(it.amount_thb))}
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ── Bottom row: orange notes block (left) + totals stack (right) ── */}
      <View style={peakStyles.peakBottomRow}>
        <View style={peakStyles.peakNotesBlock}>
          <Text style={peakStyles.peakNotesLabel}>หมายเหตุ / NOTES</Text>
          <Text style={peakStyles.peakNotesText}>
            PCS# {data.invoice_no ?? "—"}
            {"\n"}INVOICE: {data.invoice_no ?? "—"}
            {data.job_no && `\nอ้างอิงงานขนส่ง: ${data.job_no}`}
            {"\n"}ภาษีมูลค่าเพิ่มแยกต่างหาก 7%
            {"\n"}({readThaiBaht(Number(data.total_thb))})
          </Text>
        </View>
        <View style={peakStyles.peakTotalsBlock}>
          <View style={peakStyles.peakTotalsRow}>
            <Text style={peakStyles.peakTotalsLabel}>มูลค่าก่อนหักภาษีฯ</Text>
            <Text style={peakStyles.peakTotalsValue}>{fmtBaht(preTax)}</Text>
          </View>
          {Number(data.duty_thb) > 0 && (
            <View style={peakStyles.peakTotalsRow}>
              <Text style={peakStyles.peakTotalsLabel}>อากรขาเข้า</Text>
              <Text style={peakStyles.peakTotalsValue}>{fmtBaht(Number(data.duty_thb))}</Text>
            </View>
          )}
          <View style={peakStyles.peakTotalsRow}>
            <Text style={peakStyles.peakTotalsLabel}>ภาษีมูลค่าเพิ่ม 7%</Text>
            <Text style={peakStyles.peakTotalsValue}>{fmtBaht(Number(data.vat_thb))}</Text>
          </View>
          <View style={[peakStyles.peakTotalsRow, peakStyles.peakTotalsRowLast]}>
            <Text style={[peakStyles.peakTotalsLabel, peakStyles.peakTotalsLabelBold]}>ภาษีคงเหลือ</Text>
            <Text style={[peakStyles.peakTotalsValue, peakStyles.peakTotalsValueBold]}>
              {fmtBaht(Number(data.total_thb))}
            </Text>
          </View>
          {Number(data.outstanding_thb) > 0 && (
            <View style={peakStyles.peakTotalsRow}>
              <Text style={peakStyles.peakTotalsLabel}>คงค้างชำระ</Text>
              <Text style={[peakStyles.peakTotalsValue, { color: COLORS.primary }]}>
                {fmtBaht(Number(data.outstanding_thb))}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Compact "ชำระโดย" strip ── */}
      <View style={peakStyles.peakPayStrip}>
        <Text style={peakStyles.peakPayLabel}>ชำระโดย</Text>
        <Text style={peakStyles.peakPayItem}>☐ เงินสด</Text>
        <Text style={peakStyles.peakPayItem}>☐ เช็ค</Text>
        <Text style={peakStyles.peakPayItem}>
          ☑ โอน {BANK.name} {BANK.accountNumber}
        </Text>
      </View>

      {/* ── Payment ledger (if any) ── */}
      {data.payments.length > 0 && (
        <View style={peakStyles.peakTable}>
          <View style={peakStyles.peakTableHead}>
            <Text style={[peakStyles.peakTableHeadCell, { flex: 2 }]}>วันที่ชำระ</Text>
            <Text style={[peakStyles.peakTableHeadCell, { flex: 2 }]}>วิธีชำระ</Text>
            <Text style={[peakStyles.peakTableHeadCell, { flex: 2.5 }]}>อ้างอิง</Text>
            <Text style={[peakStyles.peakTableHeadCell, { flex: 1.8, textAlign: "right" }]}>
              จำนวนเงิน (บาท)
            </Text>
          </View>
          {data.payments.map((p, i) => (
            <View
              key={`pay-${i}`}
              style={[
                peakStyles.peakTableRow,
                i === data.payments.length - 1 ? peakStyles.peakTableRowLast : {},
              ]}
            >
              <Text style={[peakStyles.peakTableCell, { flex: 2 }]}>{formatDateThaiBE(p.paid_at)}</Text>
              <Text style={[peakStyles.peakTableCell, { flex: 2 }]}>{p.method}</Text>
              <Text style={[peakStyles.peakTableCell, { flex: 2.5 }]}>{p.bank_ref ?? "—"}</Text>
              <Text style={[peakStyles.peakTableCell, peakStyles.peakTableCellRight, { flex: 1.8 }]}>
                {fmtBaht(Number(p.amount_thb))}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Bottom: QR + 4 signature mini-boxes (Peak format) ── */}
      <View style={peakStyles.peakBottomFooter}>
        <View style={peakStyles.peakQrBox}>
          <Text style={peakStyles.peakQrLabel}>QR Code</Text>
          <View style={peakStyles.peakQrPlaceholder}>
            <Text style={peakStyles.peakQrPlaceholderText}>
              PromptPay{"\n"}{fmtBaht(Number(data.outstanding_thb))} ฿
            </Text>
          </View>
          <Text style={peakStyles.peakQrCaption}>ชำระผ่าน PromptPay</Text>
        </View>
        <View style={peakStyles.peakSigGroup}>
          <View style={peakStyles.peakSigBox}>
            <Text style={peakStyles.peakSigLabel}>ผู้รับเงิน</Text>
            <Text style={peakStyles.peakSigName}>_____________</Text>
            <Text style={peakStyles.peakSigDate}>__/__/____</Text>
          </View>
          <View style={peakStyles.peakSigBox}>
            <Text style={peakStyles.peakSigLabel}>ผู้มีอำนาจ</Text>
            <Text style={peakStyles.peakSigName}>_____________</Text>
            <Text style={peakStyles.peakSigDate}>__/__/____</Text>
          </View>
          <View style={peakStyles.peakSigBox}>
            <Text style={peakStyles.peakSigLabel}>ตราประทับ</Text>
            <Text style={peakStyles.peakSigName}>(ผู้ขาย)</Text>
          </View>
          <View style={[peakStyles.peakSigBox, peakStyles.peakSigBoxLast]}>
            <Text style={peakStyles.peakSigLabel}>ผู้รับเอกสาร</Text>
            <Text style={peakStyles.peakSigName}>_____________</Text>
            <Text style={peakStyles.peakSigDate}>__/__/____</Text>
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

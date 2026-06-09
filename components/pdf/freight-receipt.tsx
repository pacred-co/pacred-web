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
 * One A4 page in the Peak format (v2 · 2026-06-09 ภูม flag round 2).
 *
 * v2 redesign:
 *   - NO card chrome around issuer/customer — stacked rows + thin dividers
 *   - Orange "Pacred" wordmark top-left
 *   - Small 3-row meta card top-right (เลขที่/วันที่/อ้างอิง)
 *   - Inline contact lines (โทร / อีเมล) — text labels, not emoji glyphs
 *     (react-pdf can't reliably render emoji)
 *   - Section headings inline (no colored bars)
 *   - Totals = right-aligned text rows (NO border box)
 *   - Payment split L/R with thin vertical divider
 *   - Signatures = tiny, thin underline only (no thick border)
 *
 * Rendered TWICE per document — once for ต้นฉบับ, once for สำเนา.
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
  const preTax     = Number(data.subtotal_thb) + Number(data.duty_thb);
  const grandTotal = Number(data.total_thb);
  // Freight receipts don't carry WHT by default (the freight invoice's WHT
  // is buyer-juristic-type-driven and applied upstream); the row stays here
  // only as a layout-fidelity placeholder. Tax-invoice doc handles WHT.
  const showWht    = false;
  const whtAmount  = 0;
  const amountPaid = grandTotal - whtAmount;

  return (
    <Page size="A4" style={styles.page}>
      {/* ── Top band: Pacred orange wordmark left · doc title + copy right ── */}
      <View style={peakStyles.peakTopBand}>
        <View>
          <Text style={peakStyles.peakBrandWord}>Pacred</Text>
        </View>
        <View>
          <Text style={peakStyles.peakCopyLabel}>({copyLabel})</Text>
          <Text style={peakStyles.peakDocTitleRight}>{titleTh}</Text>
          <Text style={peakStyles.peakDocTitleEnRight}>{titleEn}</Text>
        </View>
      </View>

      {/* ── Issuer row (legal name + address + tax-id · meta card right) ── */}
      <View style={peakStyles.peakSectionRow}>
        <View style={peakStyles.peakSectionMain}>
          <Text style={peakStyles.peakRoleLabel}>ผู้ขาย / Issuer</Text>
          <Text style={peakStyles.peakRoleName}>{SITE_LEGAL_NAME_TH}</Text>
          <Text style={peakStyles.peakContactLine}>{ADDRESSES.office.full}</Text>
          <Text style={peakStyles.peakContactLine}>
            เลขประจำตัวผู้เสียภาษี: {formatTaxId(TAX_ID)}  (สำนักงานใหญ่)
          </Text>
          <View style={peakStyles.peakContactInline}>
            <Text style={peakStyles.peakContactItem}>โทร {CONTACT.phoneCompanyDisplay}</Text>
            <Text style={peakStyles.peakContactItem}>อีเมล {CONTACT.emailAcc}</Text>
          </View>
        </View>
        <View style={peakStyles.peakSectionSide}>
          <View style={peakStyles.peakMetaCard}>
            <View style={peakStyles.peakMetaRow}>
              <Text style={peakStyles.peakMetaLabel}>เลขที่</Text>
              <Text style={peakStyles.peakMetaValue}>{data.invoice_no ?? "(รอออก)"}</Text>
            </View>
            <View style={peakStyles.peakMetaRow}>
              <Text style={peakStyles.peakMetaLabel}>วันที่ออก</Text>
              <Text style={peakStyles.peakMetaValue}>{formatDateThaiBE(issueDate)}</Text>
            </View>
            <View style={[peakStyles.peakMetaRow, peakStyles.peakMetaRowLast]}>
              <Text style={peakStyles.peakMetaLabel}>อ้างอิง</Text>
              <Text style={peakStyles.peakMetaValue}>{data.job_no ?? "—"}</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={peakStyles.peakDivider} />

      {/* ── Customer row ── */}
      <View style={peakStyles.peakSectionRow}>
        <View style={peakStyles.peakSectionMain}>
          <Text style={peakStyles.peakRoleLabel}>ลูกค้า / Customer</Text>
          <Text style={peakStyles.peakRoleName}>{data.buyer_name}</Text>
          <Text style={peakStyles.peakContactLine}>{data.buyer_address}</Text>
          {data.buyer_tax_id && (
            <Text style={peakStyles.peakContactLine}>
              เลขประจำตัวผู้เสียภาษี: {formatTaxId(data.buyer_tax_id)}
              {data.buyer_branch ? `  (${data.buyer_branch})` : "  (สำนักงานใหญ่)"}
            </Text>
          )}
        </View>
        <View style={peakStyles.peakSectionSide} />
      </View>

      <View style={peakStyles.peakDivider} />

      {/* ── Items table (Pacred-specific freight description/qty/unit/amount) ── */}
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

      {/* ── Section: สรุป (Summary) — RIGHT-aligned text rows, no box ── */}
      <View style={peakStyles.peakSectionHead}>
        <Text style={peakStyles.peakSectionHeadLabel}>สรุป  Summary</Text>
      </View>
      <View style={peakStyles.peakTotalsWrap}>
        <View style={peakStyles.peakTotalsRow}>
          <Text style={peakStyles.peakTotalsLabel}>มูลค่าไม่รวมภาษีมูลค่าเพิ่ม</Text>
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
        <View style={peakStyles.peakTotalsGrandRow}>
          <Text style={peakStyles.peakTotalsGrandLabel}>จำนวนเงินทั้งสิ้น</Text>
          <Text style={peakStyles.peakTotalsGrandValue}>{fmtBaht(grandTotal)}</Text>
        </View>
        <Text style={peakStyles.peakAmountInWords}>
          ({readThaiBaht(grandTotal)})
        </Text>
        {showWht && (
          <View style={peakStyles.peakTotalsRow}>
            <Text style={peakStyles.peakTotalsLabel}>หัก ภาษี ณ ที่จ่าย 1%</Text>
            <Text style={peakStyles.peakTotalsValue}>{fmtBaht(whtAmount)}</Text>
          </View>
        )}
        <View style={peakStyles.peakTotalsRow}>
          <Text style={peakStyles.peakTotalsLabel}>จำนวนเงินที่ชำระ</Text>
          <Text style={[peakStyles.peakTotalsValue, peakStyles.peakTotalsAccent]}>
            {fmtBaht(amountPaid)}
          </Text>
        </View>
        {Number(data.outstanding_thb) > 0 && (
          <View style={peakStyles.peakTotalsRow}>
            <Text style={peakStyles.peakTotalsLabel}>คงค้างชำระ</Text>
            <Text style={[peakStyles.peakTotalsValue, peakStyles.peakTotalsAccent]}>
              {fmtBaht(Number(data.outstanding_thb))}
            </Text>
          </View>
        )}
      </View>

      <View style={peakStyles.peakDivider} />

      {/* ── Section: ชำระเงิน (Payment) — split L/R ── */}
      <View style={peakStyles.peakSectionHead}>
        <Text style={peakStyles.peakSectionHeadLabel}>ชำระเงิน  Payment</Text>
      </View>
      <View style={peakStyles.peakPaymentRow}>
        <View style={peakStyles.peakPaymentLeft}>
          <Text style={peakStyles.peakPaymentLine}>
            วันที่ชำระ: {latestPaymentIso ? formatDateThaiBE(latestPaymentIso) : "—"}
          </Text>
          <Text style={peakStyles.peakPaymentLine}>
            จำนวนเงินรวม: {fmtBaht(grandTotal)} บาท
          </Text>
          <Text style={peakStyles.peakPaymentLineMuted}>
            ({readThaiBaht(grandTotal)})
          </Text>
        </View>
        <View style={peakStyles.peakPaymentRight}>
          <Text style={peakStyles.peakPaymentLine}>{BANK.name}</Text>
          <Text style={peakStyles.peakPaymentLine}>เลขที่บัญชี {BANK.accountNumber}</Text>
          <Text style={peakStyles.peakPaymentLine}>ชื่อบัญชี {BANK.accountName}</Text>
        </View>
      </View>

      {/* ── Payment ledger (inline, if any payments recorded) ── */}
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

      <View style={peakStyles.peakDivider} />

      {/* ── Section: หมายเหตุ (Notes) — borderless paragraph ── */}
      <View style={peakStyles.peakSectionHead}>
        <Text style={peakStyles.peakSectionHeadLabel}>หมายเหตุ  Notes</Text>
      </View>
      <Text style={peakStyles.peakContactLine}>
        ภาษีมูลค่าเพิ่มแยกต่างหาก 7%
        {data.job_no ? `  ·  อ้างอิงงานขนส่ง: ${data.job_no}` : ""}
        {"\n"}สถานะการชำระเงิน: {paymentStatusLabel(data.payment_status)}
      </Text>

      <View style={peakStyles.peakDivider} />

      {/* ── Section: รับรอง (Authorisation) — tiny sigs + QR ── */}
      <View style={peakStyles.peakSectionHead}>
        <Text style={peakStyles.peakSectionHeadLabel}>รับรอง  Authorisation</Text>
      </View>
      <View style={peakStyles.peakSigRow}>
        <View style={peakStyles.peakQrSmall}>
          <View style={peakStyles.peakQrSmallBox}>
            <Text style={peakStyles.peakQrSmallText}>QR{"\n"}PromptPay</Text>
          </View>
          <Text style={peakStyles.peakQrSmallLabel}>ชำระสะดวก</Text>
        </View>
        <View style={peakStyles.peakSigBox}>
          <View style={peakStyles.peakSigContent} />
          <View style={peakStyles.peakSigLine} />
          <Text style={peakStyles.peakSigRoleLabel}>ผู้ออกเอกสาร</Text>
          <Text style={peakStyles.peakSigDateLabel}>
            {formatDateThaiBE(issueDate)}
          </Text>
        </View>
        <View style={peakStyles.peakSigBox}>
          <View style={peakStyles.peakSigContent} />
          <View style={peakStyles.peakSigLine} />
          <Text style={peakStyles.peakSigRoleLabel}>ผู้อนุมัติเอกสาร</Text>
          <Text style={peakStyles.peakSigDateLabel}>
            {formatDateThaiBE(issueDate)}
          </Text>
        </View>
        <View style={peakStyles.peakSigBox}>
          <View style={peakStyles.peakSigContent} />
          <View style={peakStyles.peakSigLine} />
          <Text style={peakStyles.peakSigRoleLabel}>ตราประทับ</Text>
          <Text style={peakStyles.peakSigDateLabel}>(ผู้ขาย)</Text>
        </View>
        <View style={[peakStyles.peakSigBox, peakStyles.peakSigBoxLast]}>
          <View style={peakStyles.peakSigContent} />
          <View style={peakStyles.peakSigLine} />
          <Text style={peakStyles.peakSigRoleLabel}>ผู้รับ</Text>
          <Text style={peakStyles.peakSigDateLabel}>(ลูกค้า)</Text>
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

/**
 * Commission withdrawal receipt PDF — V-E8/H1/H2.
 *
 * Server-rendered via `@react-pdf/renderer` from the download route
 * `app/api/commission-withdrawal/[id]/route.tsx`. Mirrors the
 * freight-receipt + tax-invoice patterns (RD Code 86 spirit, even though
 * a commission payout is technically not a "tax invoice" — it's an
 * internal payout document with a WHT 50 ทวิ note).
 *
 * Sections (top → bottom):
 *   1. Seller / Pacred block (legal name · address · tax ID)
 *   2. Document meta — title "ใบสำคัญรับเงินค่าคอม" + withdrawal_no + date
 *   3. Payee block — earner name + payee bank snapshot
 *   4. Bundled accruals table — one row per accrual included
 *   5. Totals — gross / WHT / net
 *   6. WHT 50 ทวิ block — Revenue Code §50(1) note (printed when wht > 0)
 *   7. Status footer — pending / approved / paid + slip ref
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

export type CommissionReceiptItem = {
  position:           number;
  /** Localised label e.g. "ฝากสั่ง (Service order)". */
  source_label:       string;
  /** Source order reference (h_no / f_no / quote_no). */
  source_ref:         string;
  /** Frozen amount at request time. */
  included_amount_thb: number;
  accrued_at:         string;
};

export type CommissionReceiptData = {
  /** CW-{YYMM}-{NNNN}. */
  withdrawal_no:      string;
  status:             "pending" | "approved" | "rejected" | "paid";
  title:              string;
  role_label:         string;
  requested_at:       string;
  approved_at:        string | null;
  paid_at:            string | null;

  earner_name:        string;
  earner_code:        string | null;
  payee_bank_name:    string;
  payee_account_name: string;
  payee_account_no:   string;

  gross_thb:          number;
  wht_rate_pct:       number;
  wht_amount_thb:     number;
  net_thb:            number;

  items:              CommissionReceiptItem[];

  notes:              string | null;
  slip_storage_path:  string | null;
};

function formatDateThaiBE(iso: string): string {
  const d = new Date(iso);
  const months = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function formatTaxId(id: string): string {
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

const STATUS_LABEL: Record<CommissionReceiptData["status"], string> = {
  pending:  "รอตรวจสอบ",
  approved: "อนุมัติแล้ว — รอการโอน",
  paid:     "จ่ายเรียบร้อย",
  rejected: "ปฏิเสธ",
};

export function CommissionReceipt({ data }: { data: CommissionReceiptData }) {
  const isPaid       = data.status === "paid";
  const hasWht       = Number(data.wht_amount_thb) > 0;
  const dateForTitle = data.paid_at ?? data.approved_at ?? data.requested_at;

  return (
    <Document
      title={`Pacred Commission Withdrawal ${data.withdrawal_no}`}
      author="Pacred"
      subject={`ใบสำคัญรับเงินค่าคอม ${data.withdrawal_no}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header — seller (Pacred) + doc meta */}
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
            <Text style={styles.receiptTitle}>ใบสำคัญรับเงินค่าคอม</Text>
            <Text style={styles.brandTagline}>COMMISSION PAYOUT VOUCHER</Text>
            <Text style={styles.receiptNo}>เลขที่: {data.withdrawal_no}</Text>
            <Text style={styles.receiptDate}>วันที่ {formatDateThaiBE(dateForTitle)}</Text>
            <Text style={styles.receiptDate}>สถานะ: {STATUS_LABEL[data.status]}</Text>
          </View>
        </View>

        {/* Payee block */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol, styles.buyerColWide]}>
            <Text style={styles.customerLabel}>ผู้รับเงิน / PAYEE</Text>
            <Text style={styles.customerName}>
              {data.earner_name}
              {data.earner_code ? `  (${data.earner_code})` : ""}
            </Text>
            <Text style={styles.customerLine}>บทบาท: {data.role_label}</Text>
            <Text style={styles.customerLine}>หัวข้อ: {data.title}</Text>
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>บัญชีรับเงิน / BANK</Text>
            <Text style={styles.customerName}>{data.payee_bank_name}</Text>
            <Text style={styles.customerLine}>ชื่อบัญชี: {data.payee_account_name}</Text>
            <Text style={styles.customerLine}>เลขที่บัญชี: {data.payee_account_no}</Text>
          </View>
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.6, textAlign: "center" }]}>
              ลำดับ
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 2 }]}>
              ที่มา / SOURCE
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 2.2 }]}>
              เลขที่อ้างอิง / REF
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>
              วันที่
            </Text>
            <Text style={[styles.tableHeadCell, { flex: 1.6, textAlign: "right" }]}>
              ค่าคอม (บาท)
            </Text>
          </View>
          {data.items.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 9, textAlign: "center", color: COLORS.muted }]}>
                ไม่มีรายการ
              </Text>
            </View>
          ) : (
            data.items.map((it, i) => (
              <View
                key={`${it.position}-${i}`}
                style={[
                  styles.tableRow,
                  i === data.items.length - 1 ? styles.tableRowLast : {},
                ]}
              >
                <Text style={[styles.tableCell, { flex: 0.6, textAlign: "center" }]}>
                  {it.position}
                </Text>
                <Text style={[styles.tableCell, { flex: 2 }]}>{it.source_label}</Text>
                <Text style={[styles.tableCell, { flex: 2.2 }]}>{it.source_ref}</Text>
                <Text style={[styles.tableCell, { flex: 1.4, textAlign: "right" }]}>
                  {formatDateThaiBE(it.accrued_at)}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.6 }]}>
                  {fmtBaht(Number(it.included_amount_thb))}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ยอดรวม (Gross)</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.gross_thb))}</Text>
          </View>
          {hasWht && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                หัก ณ ที่จ่าย {Number(data.wht_rate_pct).toFixed(2)}%
              </Text>
              <Text style={[styles.totalValue, { color: COLORS.primary }]}>
                -฿{fmtBaht(Number(data.wht_amount_thb))}
              </Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>รับสุทธิ / NET</Text>
            <Text style={styles.grandTotalValue}>฿{fmtBaht(Number(data.net_thb))}</Text>
          </View>
        </View>

        {/* Amount-in-words */}
        <Text style={styles.amountInWords}>
          จำนวนเงิน (ตัวอักษร): {readThaiBaht(Number(data.net_thb))}
        </Text>

        {/* WHT 50 ทวิ block — only when WHT was withheld */}
        {hasWht && (
          <View style={styles.bankBlock}>
            <Text style={styles.bankTitle}>
              หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)
            </Text>
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>อ้างอิงตาม:</Text>
              <Text style={styles.bankValue}>
                ประมวลรัษฎากร มาตรา 50(1) — ค่าบริการที่จ่ายเกิน 1,000 บาท
              </Text>
            </View>
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>ยอดก่อนหัก:</Text>
              <Text style={styles.bankValue}>฿{fmtBaht(Number(data.gross_thb))}</Text>
            </View>
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>อัตรา WHT:</Text>
              <Text style={styles.bankValue}>{Number(data.wht_rate_pct).toFixed(2)}%</Text>
            </View>
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>หักไว้:</Text>
              <Text style={[styles.bankValue, styles.bankAccountNumber]}>
                ฿{fmtBaht(Number(data.wht_amount_thb))}
              </Text>
            </View>
            <Text style={styles.bankNote}>
              Pacred นำส่ง ภ.ง.ด.53 ภายในวันที่ 7 ของเดือนถัดไป —
              ผู้รับเงินสามารถนำสำเนาใบนี้ใช้เป็นหลักฐานเครดิตภาษีในการยื่นภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90/91)
            </Text>
          </View>
        )}

        {/* Notes */}
        {data.notes && (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.customerLabel, { marginBottom: 2 }]}>หมายเหตุ</Text>
            <Text style={styles.customerLine}>{data.notes}</Text>
          </View>
        )}

        {/* Paid stamp — when status=paid */}
        {isPaid && (
          <View style={{ marginTop: 12, padding: 8, borderWidth: 1, borderColor: "#16a34a", borderStyle: "solid", backgroundColor: "#dcfce7" }}>
            <Text style={{ fontSize: 11, fontWeight: "bold", color: "#15803d" }}>
              ✓ จ่ายแล้ว / PAID
            </Text>
            {data.paid_at && (
              <Text style={{ fontSize: 9, color: "#15803d", marginTop: 2 }}>
                วันที่จ่าย {formatDateThaiBE(data.paid_at)}
              </Text>
            )}
            {data.slip_storage_path && (
              <Text style={{ fontSize: 8, color: COLORS.muted, marginTop: 2 }}>
                หลักฐานสลิป: {data.slip_storage_path}
              </Text>
            )}
          </View>
        )}

        {/* Signature block */}
        <View style={styles.signature}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ผู้รับเงิน / Payee</Text>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>ผู้จ่ายเงิน / Payer (Pacred)</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Pacred · เร็ว ไว ไม่มีคำว่าทำไม่ได้
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
}

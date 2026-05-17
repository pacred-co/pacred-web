/**
 * V-E11 — Thai Customs Declaration (ใบขนสินค้า) PDF template.
 *
 * Internal-only V2 layout. NOT the official government-issued ใบขนสินค้า
 * format (which the broker generates from NetBay / Customs Trader
 * Portal); this is Pacred's working draft that admin staff print, take
 * to the customs office, and let the broker key into the official
 * system. Layout decoded from the legacy "แผน VAT" worksheets seen in
 * [docs/audit/cargo-ops-forensics-2026-05-16.md] §3.5.
 *
 * Sections:
 *   - Header: Pacred broker block + customs office + entry date
 *   - Shipment block: job_no, transport mode, B/L, container, ports
 *   - Body: per-HS-code line table
 *   - Totals: declared value + duty + VAT + other taxes
 *   - Footer: broker signature
 *   - CANCELLED watermark when status='cancelled'
 *
 * Server-only.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS, fmtBaht } from "./styles";
import {
  CONTACT, ADDRESSES, SITE_LEGAL_NAME, TAX_ID,
} from "@/components/seo/site";

export type CustomsDeclarationPdfData = {
  // Header
  declaration_no:    string | null;    // CD-YYMMDD-NNNN (null while draft)
  status:            "draft" | "submitted" | "accepted" | "released" | "cancelled";
  declaration_type:  "import" | "export" | "transit";
  declared_at:       string | null;
  submitted_at:      string | null;
  accepted_at:       string | null;
  released_at:       string | null;
  customs_office:    string | null;
  customs_control_no: string | null;
  broker_name:       string | null;
  broker_license_no: string | null;
  ship_or_truck_arrival_date: string | null;
  port_of_entry:     string | null;
  paid_through_promptpay: boolean;
  notes:             string | null;

  // Shipment snapshot (from parent freight_shipments)
  job_no:            string | null;
  transport_mode:    string | null;
  container_code:    string | null;
  carrier_container_no: string | null;
  bl_no:             string | null;
  vessel_voyage:     string | null;
  port_loading:      string | null;
  port_discharge:    string | null;
  origin_country:    string;

  // Consignee snapshot (Thai importer — for "ผู้นำเข้า" block)
  consignee_name:    string | null;
  consignee_address: string | null;
  consignee_tax_id:  string | null;
  consignee_branch:  string | null;

  // Shipper snapshot (China exporter — for "ผู้ส่งออก" block)
  shipper_name:      string | null;
  shipper_address:   string | null;

  // Per-HS-code lines
  lines: Array<{
    position:           number;
    hs_code:            string | null;
    description:        string;
    country_of_origin:  string;
    qty:                number;
    unit:               string;
    gross_weight_kg:    number | null;
    net_weight_kg:      number | null;
    declared_value_thb: number;
    duty_rate_pct:      number;
    duty_thb:           number;
    vat_thb:            number;
    fta_applied:        boolean;
  }>;

  // Totals
  total_declared_value_thb: number;
  total_duty_thb:           number;
  total_vat_thb:            number;
  total_other_taxes_thb:    number;
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatDateTh(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTaxId(id: string | null): string {
  if (!id) return "—";
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

const MODE_LABEL: Record<string, string> = {
  sea_fcl: "ทางเรือ FCL",
  sea_lcl: "ทางเรือ LCL",
  truck:   "ทางรถยนต์",
  air:     "ทางอากาศ",
};

const TYPE_LABEL: Record<string, string> = {
  import:  "นำเข้า",
  export:  "ส่งออก",
  transit: "ผ่านแดน",
};

const STATUS_LABEL: Record<string, string> = {
  draft:     "ร่าง (DRAFT)",
  submitted: "ยื่นแล้ว",
  accepted:  "ตรวจรับแล้ว",
  released:  "ตรวจปล่อย",
  cancelled: "ยกเลิก",
};

// ── Component ───────────────────────────────────────────────────────

export function CustomsDeclarationPdf({ data }: { data: CustomsDeclarationPdfData }) {
  const isCancelled = data.status === "cancelled";
  const isDraft     = data.status === "draft";
  const entryDate   = data.submitted_at ?? data.declared_at;
  const grandTotalTax =
    Number(data.total_duty_thb ?? 0) +
    Number(data.total_vat_thb ?? 0) +
    Number(data.total_other_taxes_thb ?? 0);

  return (
    <Document
      title={`Pacred ใบขนสินค้า ${data.declaration_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Customs declaration for job ${data.job_no ?? "—"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header — Pacred broker info + declaration meta */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Pacred</Text>
            <Text style={styles.brandTagline}>{SITE_LEGAL_NAME} (Customs Broker)</Text>
            <Text style={styles.brandAddress}>
              {ADDRESSES.office.full}{"\n"}
              เลขผู้เสียภาษี: {formatTaxId(TAX_ID)}{"\n"}
              โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </Text>
          </View>
          <View style={styles.receiptMeta}>
            <Text style={styles.receiptTitle}>ใบขนสินค้า</Text>
            <Text style={styles.receiptTitleEn}>CUSTOMS DECLARATION</Text>
            <Text style={styles.receiptNo}>
              เลขที่: {data.declaration_no ?? "(ร่าง — DRAFT)"}
            </Text>
            <Text style={styles.receiptDate}>
              ประเภท: {TYPE_LABEL[data.declaration_type] ?? data.declaration_type}
            </Text>
            <Text style={styles.receiptDate}>วันที่: {formatDateTh(entryDate)}</Text>
            <Text style={styles.receiptDate}>สถานะ: {STATUS_LABEL[data.status] ?? data.status}</Text>
            {data.customs_control_no && (
              <Text style={[styles.receiptDate, { color: COLORS.primary, fontWeight: "bold" }]}>
                เลขที่ใบขนฯ ศุลฯ: {data.customs_control_no}
              </Text>
            )}
            {!isDraft && (
              <Text style={styles.originalCopy}>(ฉบับสำเนา)</Text>
            )}
          </View>
        </View>

        {/* Customs office + arrival */}
        <View style={{ marginBottom: 8, fontSize: 9 }}>
          <Text>
            ด่านศุลกากร: <Text style={{ fontWeight: "bold" }}>{data.customs_office ?? "—"}</Text>
            {data.port_of_entry && `  ·  สถานที่ตรวจ: ${data.port_of_entry}`}
          </Text>
          {data.ship_or_truck_arrival_date && (
            <Text>วันที่เรือ/รถเข้า: {formatDateTh(data.ship_or_truck_arrival_date)}</Text>
          )}
        </View>

        {/* Shipper + Consignee */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol, styles.buyerColWide]}>
            <Text style={styles.customerLabel}>ผู้ส่งออก (SHIPPER)</Text>
            <Text style={styles.customerName}>{data.shipper_name ?? "—"}</Text>
            {data.shipper_address && (
              <Text style={styles.customerLine}>{data.shipper_address}</Text>
            )}
            <Text style={styles.customerLine}>ประเทศกำเนิด: {data.origin_country}</Text>
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>ผู้นำเข้า (CONSIGNEE)</Text>
            <Text style={styles.customerName}>{data.consignee_name ?? "—"}</Text>
            {data.consignee_address && (
              <Text style={styles.customerLine}>{data.consignee_address}</Text>
            )}
            {data.consignee_tax_id && (
              <Text style={styles.customerLine}>
                เลขผู้เสียภาษี: {formatTaxId(data.consignee_tax_id)}
                {data.consignee_branch && ` · สาขา: ${data.consignee_branch}`}
              </Text>
            )}
          </View>
        </View>

        {/* Logistics block */}
        <View style={{ marginBottom: 8, fontSize: 9 }}>
          <Text>
            งาน: <Text style={{ fontWeight: "bold" }}>{data.job_no ?? "—"}</Text>
            {data.transport_mode && `  ·  ขนส่ง: ${MODE_LABEL[data.transport_mode] ?? data.transport_mode}`}
          </Text>
          {(data.port_loading || data.port_discharge) && (
            <Text>
              {data.port_loading   && `From ${data.port_loading}`}
              {data.port_loading && data.port_discharge && " → "}
              {data.port_discharge && `To ${data.port_discharge}`}
            </Text>
          )}
          {(data.container_code || data.carrier_container_no || data.bl_no || data.vessel_voyage) && (
            <Text>
              {data.container_code       && `Container ${data.container_code} · `}
              {data.carrier_container_no && `Carrier ${data.carrier_container_no} · `}
              {data.bl_no                && `B/L ${data.bl_no} · `}
              {data.vessel_voyage        && `Vessel ${data.vessel_voyage}`}
            </Text>
          )}
        </View>

        {/* Broker info */}
        {(data.broker_name || data.broker_license_no) && (
          <View style={{ marginBottom: 8, fontSize: 9 }}>
            <Text>
              ตัวแทนออกของ: <Text style={{ fontWeight: "bold" }}>{data.broker_name ?? "—"}</Text>
              {data.broker_license_no && ` · ใบอนุญาต ${data.broker_license_no}`}
            </Text>
          </View>
        )}

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.4, textAlign: "center" }]}>#</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>HS CODE</Text>
            <Text style={[styles.tableHeadCell, { flex: 3.2 }]}>รายการสินค้า</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.6, textAlign: "center" }]}>กำเนิด</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.7, textAlign: "right" }]}>จำนวน</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.6 }]}>หน่วย</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.8, textAlign: "right" }]}>นน. กก.</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.3, textAlign: "right" }]}>ราคา THB</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.7, textAlign: "right" }]}>อากร %</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.1, textAlign: "right" }]}>อากร THB</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.0, textAlign: "right" }]}>VAT THB</Text>
          </View>
          {data.lines.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 12, textAlign: "center", color: COLORS.muted }]}>
                — ไม่มีรายการ —
              </Text>
            </View>
          ) : (
            data.lines.map((l, i) => (
              <View
                key={`${l.position}-${i}`}
                style={[styles.tableRow, i === data.lines.length - 1 ? styles.tableRowLast : {}]}
              >
                <Text style={[styles.tableCell, { flex: 0.4, textAlign: "center" }]}>{l.position}</Text>
                <Text style={[styles.tableCell, { flex: 1.2, fontFamily: "Sarabun" }]}>
                  {l.hs_code ?? "—"}
                </Text>
                <Text style={[styles.tableCell, { flex: 3.2 }]}>
                  {l.description}
                  {l.fta_applied && (
                    <Text style={{ color: COLORS.primary, fontSize: 8 }}>{"\n"}(FTA / Form E)</Text>
                  )}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.6, textAlign: "center" }]}>{l.country_of_origin}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.7 }]}>
                  {Number(l.qty).toLocaleString("en-US")}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.6 }]}>{l.unit}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.8 }]}>
                  {l.gross_weight_kg != null ? Number(l.gross_weight_kg).toFixed(2) : "—"}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.3 }]}>
                  {fmtBaht(Number(l.declared_value_thb))}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.7 }]}>
                  {Number(l.duty_rate_pct).toFixed(2)}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.1 }]}>
                  {fmtBaht(Number(l.duty_thb))}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.0 }]}>
                  {fmtBaht(Number(l.vat_thb))}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ราคารวมสำแดง</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.total_declared_value_thb))}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>อากรขาเข้า (รวม)</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.total_duty_thb))}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>VAT 7% (รวม)</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.total_vat_thb))}</Text>
          </View>
          {Number(data.total_other_taxes_thb ?? 0) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>ภาษีอื่นๆ</Text>
              <Text style={styles.totalValue}>฿{fmtBaht(Number(data.total_other_taxes_thb))}</Text>
            </View>
          )}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>รวมภาษีทั้งสิ้น</Text>
            <Text style={styles.grandTotalValue}>฿{fmtBaht(grandTotalTax)}</Text>
          </View>
          {data.paid_through_promptpay && (
            <Text style={{ fontSize: 8, color: COLORS.muted, marginTop: 4 }}>
              💚 ชำระภาษีผ่าน PromptPay
            </Text>
          )}
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={{ marginTop: 12, padding: 8, backgroundColor: COLORS.surfaceAlt, borderRadius: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 2 }}>หมายเหตุ</Text>
            <Text style={{ fontSize: 9 }}>{data.notes}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={styles.signature}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>ผู้นำเข้า / ผู้ส่งออก</Text>
            </View>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>
                ตัวแทนออกของ (Pacred){data.broker_license_no && ` — ใบอนุญาต ${data.broker_license_no}`}
              </Text>
            </View>
          </View>
        </View>

        {/* CANCELLED watermark */}
        {isCancelled && (
          <View style={styles.cancelledOverlay} fixed>
            <Text style={styles.cancelledText}>CANCELLED</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Pacred · {CONTACT.phoneCompanyDisplay} · {CONTACT.email} ·
            ใบขนฯ ภายในของ Pacred (ไม่ใช่แบบฟอร์มราชการ — สำหรับใช้ภายในเพื่อยื่นที่ด่านศุลกากร)
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

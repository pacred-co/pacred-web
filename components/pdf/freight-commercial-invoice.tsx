/**
 * Freight Commercial Invoice (CI) — Pacred PDF template.
 *
 * V-E1.1 — companion to the V-E1 freight_invoices schema (migrations
 * 0050 + 0051). Renders the standard China→Thailand commercial-invoice
 * layout: shipper / consignee header → line items (description + qty +
 * unit + unit_price USD + amount USD) → THB conversion + duty + VAT
 * block (per ADR-0016) → totals → signature.
 *
 * Server-rendered via `@react-pdf/renderer` from the download route
 * `app/api/freight-invoice/[id]/route.tsx` and (later) from the
 * issuance action that uploads the rendered PDF to Storage.
 *
 * The snapshot fields on `freight_invoices` (shipper_*_snapshot,
 * consignee_*_snapshot, transport_mode_snapshot, ports, value block)
 * are FROZEN at issuance per ADR-0016 — this component renders those
 * snapshot values, never live-joined data.
 *
 * Cancellation watermark: when status='cancelled', a diagonal "CANCELLED"
 * stamp overlays the page (mirror tax-invoice.tsx pattern).
 *
 * Server-only.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS, fmtBaht } from "./styles";
import {
  CONTACT, ADDRESSES, SITE_LEGAL_NAME, TAX_ID,
} from "@/components/seo/site";

export type FreightCommercialInvoiceData = {
  invoice_no:    string | null;            // FI{YYMMDD}-{NNNN}; null while draft
  status:        "draft" | "issued" | "cancelled";
  issued_at:     string | null;
  created_at:    string;

  // Reference to parent shipment
  job_no:        string | null;            // A{YY}{NNNNN}

  // Shipper snapshot (China company)
  shipper_name:    string;
  shipper_address: string;

  // Consignee snapshot (Thai importer)
  consignee_name:    string;
  consignee_address: string;
  consignee_tax_id:  string | null;
  consignee_branch:  string | null;

  // Logistics snapshot
  transport_mode:  "sea_fcl" | "sea_lcl" | "truck" | "air" | string;
  container_code:  string | null;
  bl_no:           string | null;
  vessel_voyage:   string | null;
  port_loading:    string | null;
  port_discharge:  string | null;
  incoterm:        string | null;
  payment_term:    string | null;
  origin_country:  string;

  // Lines (the goods) — USD-denominated
  lines: Array<{
    position:        number;
    marks:           string | null;
    description:     string;
    qty:             number;
    unit:            string;
    unit_price_usd:  number;
    amount_usd:      number;
    hs_code:         string | null;
  }>;

  // Value block (ADR-0016 frozen snapshot)
  commercial_value_usd:       number;     // Σ line amounts (re-verified)
  exchange_rate:              number;     // frozen at issuance
  rate_date:                  string | null;
  commercial_value_thb:       number;     // = usd × rate (frozen)
  declared_customs_value_thb: number | null;
  declared_value_basis:       string | null;
  hs_code:                    string | null;
  duty_rate_pct:              number | null;
  duty_thb:                   number | null;
  vat_base_thb:               number | null;
  vat_thb:                    number | null;
  vat_plan_label:             string | null;
  form_e_applied:             boolean;

  notes: string | null;
};

// ── Helpers ─────────────────────────────────────────────────────────

function formatDateEn(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTaxId(id: string | null): string {
  if (!id) return "—";
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

function fmtUsd(n: number): string {
  return Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MODE_LABEL: Record<string, string> = {
  sea_fcl: "BY SEA (FCL)",
  sea_lcl: "BY SEA (LCL)",
  truck:   "BY TRUCK",
  air:     "BY AIR",
};

// ── Component ───────────────────────────────────────────────────────

export function FreightCommercialInvoice({ data }: { data: FreightCommercialInvoiceData }) {
  const isCancelled = data.status === "cancelled";
  const issueDate = data.issued_at ?? data.created_at;
  const linesTotalUsd = data.lines.reduce((s, l) => s + Number(l.amount_usd ?? 0), 0);

  return (
    <Document
      title={`Pacred Commercial Invoice ${data.invoice_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Commercial Invoice for job ${data.job_no ?? "—"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header — seller info + invoice meta */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Pacred</Text>
            <Text style={styles.brandTagline}>{SITE_LEGAL_NAME}</Text>
            <Text style={styles.brandAddress}>
              {ADDRESSES.office.full}{"\n"}
              TAX ID: {formatTaxId(TAX_ID)}{"\n"}
              TEL {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </Text>
          </View>
          <View style={styles.receiptMeta}>
            <Text style={styles.receiptTitle}>COMMERCIAL INVOICE</Text>
            <Text style={styles.receiptNo}>
              No.: {data.invoice_no ?? "(DRAFT)"}
            </Text>
            <Text style={styles.receiptDate}>
              Date: {formatDateEn(issueDate)}
            </Text>
            {data.job_no && (
              <Text style={styles.receiptDate}>Job: {data.job_no}</Text>
            )}
            {data.status === "issued" && (
              <Text style={styles.originalCopy}>(ORIGINAL)</Text>
            )}
          </View>
        </View>

        {/* Shipper + Consignee blocks */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol, styles.buyerColWide]}>
            <Text style={styles.customerLabel}>SHIPPER (FROM)</Text>
            <Text style={styles.customerName}>{data.shipper_name}</Text>
            <Text style={styles.customerLine}>{data.shipper_address}</Text>
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>CONSIGNEE (TO)</Text>
            <Text style={styles.customerName}>{data.consignee_name}</Text>
            <Text style={styles.customerLine}>{data.consignee_address}</Text>
            {data.consignee_tax_id && (
              <Text style={styles.customerLine}>
                TAX ID: {formatTaxId(data.consignee_tax_id)}
              </Text>
            )}
            {data.consignee_branch && (
              <Text style={styles.customerLine}>Branch: {data.consignee_branch}</Text>
            )}
          </View>
        </View>

        {/* Logistics info row */}
        <View style={{ marginBottom: 8, fontSize: 9 }}>
          <Text>
            Mode: {MODE_LABEL[data.transport_mode] ?? data.transport_mode} ·
            {data.incoterm        && ` Incoterm: ${data.incoterm} ·`}
            {data.payment_term    && ` Payment: ${data.payment_term} ·`}
            {data.origin_country  && ` Origin: ${data.origin_country}`}
          </Text>
          {(data.port_loading || data.port_discharge) && (
            <Text>
              {data.port_loading   && `From ${data.port_loading}`}
              {data.port_loading && data.port_discharge && " → "}
              {data.port_discharge && `To ${data.port_discharge}`}
            </Text>
          )}
          {(data.container_code || data.bl_no || data.vessel_voyage) && (
            <Text>
              {data.container_code  && `Container ${data.container_code} · `}
              {data.bl_no           && `B/L ${data.bl_no} · `}
              {data.vessel_voyage   && `Vessel ${data.vessel_voyage}`}
            </Text>
          )}
        </View>

        {/* Line items */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.5, textAlign: "center" }]}>ITEM</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.2 }]}>MARKS</Text>
            <Text style={[styles.tableHeadCell, { flex: 3.5 }]}>DESCRIPTION</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.8, textAlign: "right" }]}>QTY</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.6 }]}>UNIT</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.2, textAlign: "right" }]}>U/PRICE USD</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>AMOUNT USD</Text>
          </View>
          {data.lines.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 9, textAlign: "center", color: COLORS.muted }]}>
                — no lines —
              </Text>
            </View>
          ) : (
            data.lines.map((it, i) => (
              <View
                key={`${it.position}-${i}`}
                style={[styles.tableRow, i === data.lines.length - 1 ? styles.tableRowLast : {}]}
              >
                <Text style={[styles.tableCell, { flex: 0.5, textAlign: "center" }]}>{it.position}</Text>
                <Text style={[styles.tableCell, { flex: 1.2 }]}>{it.marks ?? ""}</Text>
                <Text style={[styles.tableCell, { flex: 3.5 }]}>
                  {it.description}
                  {it.hs_code && (
                    <Text style={{ color: COLORS.muted, fontSize: 8 }}>
                      {"\n"}HS: {it.hs_code}
                    </Text>
                  )}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.8 }]}>
                  {Number(it.qty).toLocaleString("en-US")}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.6 }]}>{it.unit}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.2 }]}>
                  {fmtUsd(Number(it.unit_price_usd))}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.4 }]}>
                  {fmtUsd(Number(it.amount_usd))}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* USD totals + THB conversion + duty + VAT block */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL COMMERCIAL VALUE (USD)</Text>
            <Text style={styles.totalValue}>${fmtUsd(linesTotalUsd)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>
              Exchange rate ({data.rate_date ?? "frozen"})
            </Text>
            <Text style={styles.totalValue}>{Number(data.exchange_rate).toFixed(4)} THB/USD</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>COMMERCIAL VALUE (THB)</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(Number(data.commercial_value_thb))}</Text>
          </View>

          {data.declared_customs_value_thb != null && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>
                  DECLARED CUSTOMS VALUE (CIF)
                  {data.declared_value_basis && (
                    <Text style={{ fontSize: 8, color: COLORS.muted }}>{"\n"}— {data.declared_value_basis}</Text>
                  )}
                </Text>
                <Text style={styles.totalValue}>฿{fmtBaht(Number(data.declared_customs_value_thb))}</Text>
              </View>
            </>
          )}

          {data.duty_thb != null && data.duty_rate_pct != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                Import duty {Number(data.duty_rate_pct).toFixed(2)}%
                {data.hs_code && ` (HS ${data.hs_code})`}
                {data.form_e_applied && " — Form E claimed"}
              </Text>
              <Text style={styles.totalValue}>฿{fmtBaht(Number(data.duty_thb))}</Text>
            </View>
          )}

          {data.vat_thb != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                VAT 7%
                {data.vat_plan_label && ` (${data.vat_plan_label})`}
              </Text>
              <Text style={styles.totalValue}>฿{fmtBaht(Number(data.vat_thb))}</Text>
            </View>
          )}

          {data.duty_thb != null && data.vat_thb != null && data.declared_customs_value_thb != null && (
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>TOTAL LANDED VALUE (THB)</Text>
              <Text style={styles.grandTotalValue}>
                ฿{fmtBaht(
                  Number(data.declared_customs_value_thb) +
                  Number(data.duty_thb) +
                  Number(data.vat_thb)
                )}
              </Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {data.notes && (
          <View style={{ marginTop: 12, padding: 8, backgroundColor: COLORS.surfaceAlt, borderRadius: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: "bold", marginBottom: 2 }}>NOTES</Text>
            <Text style={{ fontSize: 9 }}>{data.notes}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={styles.signature}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>For SHIPPER</Text>
            </View>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>For PACRED (Authorised)</Text>
            </View>
          </View>
        </View>

        {/* Cancelled watermark */}
        {isCancelled && (
          <View style={styles.cancelledOverlay} fixed>
            <Text style={styles.cancelledText}>CANCELLED</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Pacred · {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
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

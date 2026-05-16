/**
 * Freight Packing List (PL) — Pacred PDF template.
 *
 * V-E1.1 — companion to V-E1 Commercial Invoice (freight-commercial-invoice.tsx).
 * Same `freight_invoices` + `freight_invoice_lines` data, different view:
 *
 *   - Commercial Invoice = description + price (what + how much)
 *   - Packing List       = marks + cartons + weight (how much physical)
 *
 * Both render from the same snapshot fields per ADR-0016. The Packing
 * List has NO USD/THB prices (it's a logistics doc, not a financial doc).
 *
 * Server-only.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS } from "./styles";
import {
  CONTACT, ADDRESSES, SITE_LEGAL_NAME, TAX_ID,
} from "@/components/seo/site";

export type FreightPackingListData = {
  invoice_no:  string | null;
  status:      "draft" | "issued" | "cancelled";
  issued_at:   string | null;
  created_at:  string;
  job_no:      string | null;

  shipper_name:    string;
  shipper_address: string;
  consignee_name:    string;
  consignee_address: string;

  transport_mode:  string;
  container_code:  string | null;
  bl_no:           string | null;
  vessel_voyage:   string | null;
  port_loading:    string | null;
  port_discharge:  string | null;
  origin_country:  string;

  lines: Array<{
    position:        number;
    marks:           string | null;
    description:     string;
    qty:             number;
    unit:            string;
    cartons:         number | null;
    gross_weight_kg: number | null;
    hs_code:         string | null;
  }>;
};

function formatDateEn(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTaxId(id: string): string {
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

const MODE_LABEL: Record<string, string> = {
  sea_fcl: "BY SEA (FCL)",
  sea_lcl: "BY SEA (LCL)",
  truck:   "BY TRUCK",
  air:     "BY AIR",
};

export function FreightPackingList({ data }: { data: FreightPackingListData }) {
  const isCancelled = data.status === "cancelled";
  const issueDate = data.issued_at ?? data.created_at;
  const totalCartons = data.lines.reduce((s, l) => s + (Number(l.cartons) || 0), 0);
  const totalQty     = data.lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalKg      = data.lines.reduce((s, l) => s + Number(l.gross_weight_kg || 0), 0);

  return (
    <Document
      title={`Pacred Packing List ${data.invoice_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Packing List for job ${data.job_no ?? "—"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Pacred</Text>
            <Text style={styles.brandTagline}>{SITE_LEGAL_NAME}</Text>
            <Text style={styles.brandAddress}>
              {ADDRESSES.office.full}{"\n"}
              TAX ID: {formatTaxId(TAX_ID)}{"\n"}
              TEL {CONTACT.phoneCompanyDisplay}
            </Text>
          </View>
          <View style={styles.receiptMeta}>
            <Text style={styles.receiptTitle}>PACKING LIST</Text>
            <Text style={styles.receiptNo}>No.: {data.invoice_no ?? "(DRAFT)"}</Text>
            <Text style={styles.receiptDate}>Date: {formatDateEn(issueDate)}</Text>
            {data.job_no && (
              <Text style={styles.receiptDate}>Job: {data.job_no}</Text>
            )}
          </View>
        </View>

        {/* Shipper + Consignee */}
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
          </View>
        </View>

        {/* Logistics */}
        <View style={{ marginBottom: 8, fontSize: 9 }}>
          <Text>
            Mode: {MODE_LABEL[data.transport_mode] ?? data.transport_mode} ·
            Origin: {data.origin_country}
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

        {/* Packing table */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.5, textAlign: "center" }]}>ITEM</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.5 }]}>MARKS & NO.</Text>
            <Text style={[styles.tableHeadCell, { flex: 1, textAlign: "right" }]}>CARTONS</Text>
            <Text style={[styles.tableHeadCell, { flex: 3 }]}>DESCRIPTION</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.8, textAlign: "right" }]}>QTY</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.6 }]}>UNIT</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.2, textAlign: "right" }]}>GROSS KG</Text>
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
                <Text style={[styles.tableCell, { flex: 1.5 }]}>{it.marks ?? ""}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1 }]}>
                  {it.cartons != null ? Number(it.cartons).toLocaleString("en-US") : "—"}
                </Text>
                <Text style={[styles.tableCell, { flex: 3 }]}>
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
                  {it.gross_weight_kg != null ? Number(it.gross_weight_kg).toFixed(2) : "—"}
                </Text>
              </View>
            ))
          )}

          {/* Totals row */}
          <View style={[styles.tableRow, styles.tableRowLast, { backgroundColor: COLORS.surfaceAlt }]}>
            <Text style={[styles.tableCell, { flex: 2, fontWeight: "bold" }]}>TOTAL</Text>
            <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1, fontWeight: "bold" }]}>
              {totalCartons.toLocaleString("en-US")}
            </Text>
            <Text style={[styles.tableCell, { flex: 3 }]}></Text>
            <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.8, fontWeight: "bold" }]}>
              {totalQty.toLocaleString("en-US")}
            </Text>
            <Text style={[styles.tableCell, { flex: 0.6 }]}></Text>
            <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.2, fontWeight: "bold" }]}>
              {totalKg.toFixed(2)}
            </Text>
          </View>
        </View>

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

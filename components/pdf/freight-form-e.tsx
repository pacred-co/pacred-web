/**
 * Freight Form E — ASEAN-China FTA Certificate of Origin (V-E3).
 *
 * Standard 12-box government form decoded from `DRAFT_FE` (see
 * `docs/port-specs/freight-document-suite.md` §V-E3):
 *
 *   1  exporter                       7  packages + description
 *   2  consignee                      8  origin criterion (default "WO")
 *   3  means of transport + route     9  gross weight / quantity
 *   4  official use (blank)          10  invoice no. + date
 *   5  item no.                      11  exporter declaration (Pacred)
 *   6  marks & numbers               12  certification (issuing authority)
 *
 * Per the spec's open-question note, Pacred renders a **draft** that the
 * customer lodges with the issuing authority — header banner makes this
 * explicit. Boxes 4 + 12 stay blank for the authority to fill.
 *
 * Data flow mirrors `freight-commercial-invoice.tsx` and the existing
 * `app/api/freight-invoice/[id]/route.tsx` snapshot/live-fallback pattern.
 *
 * Cancellation: when status='cancelled' the diagonal "CANCELLED" stamp
 * overlays the page (`styles.cancelledOverlay`).
 *
 * Server-only.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS } from "./styles";
import {
  CONTACT, ADDRESSES, SITE_LEGAL_NAME, TAX_ID,
} from "@/components/seo/site";

export type FreightFormEData = {
  invoice_no:  string | null;
  status:      "draft" | "issued" | "cancelled";
  issued_at:   string | null;
  created_at:  string;
  job_no:      string | null;

  // Box 1 — exporter (shipper)
  shipper_name:    string;
  shipper_address: string;

  // Box 2 — consignee
  consignee_name:    string;
  consignee_address: string;
  consignee_tax_id:  string | null;

  // Box 3 — transport + route
  transport_mode:  string;
  vessel_voyage:   string | null;
  bl_no:           string | null;
  port_loading:    string | null;
  port_discharge:  string | null;

  // Origin (printed in Box 11 declaration)
  origin_country:  string;

  // Boxes 5-9 — per item
  lines: Array<{
    position:        number;
    marks:           string | null;
    description:     string;
    qty:             number;
    unit:            string;
    cartons:         number | null;
    gross_weight_kg: number | null;
    hs_code:         string | null;
    /** Per-line origin criterion. Defaults to "WO" (Wholly Obtained). */
    origin_criterion: string;
  }>;
};

// ── Helpers (module scope — React Compiler purity) ──────────────────

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

const MODE_LABEL: Record<string, string> = {
  sea_fcl: "BY SEA (FCL)",
  sea_lcl: "BY SEA (LCL)",
  truck:   "BY TRUCK",
  air:     "BY AIR",
};

// ── Component ───────────────────────────────────────────────────────

export function FreightFormE({ data }: { data: FreightFormEData }) {
  const isCancelled = data.status === "cancelled";
  const issueDate = data.issued_at ?? data.created_at;
  const totalCartons = data.lines.reduce((s, l) => s + (Number(l.cartons) || 0), 0);
  const totalQty     = data.lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalKg      = data.lines.reduce((s, l) => s + Number(l.gross_weight_kg || 0), 0);

  // Build a transport+route line for Box 3.
  const routeLine = [
    data.port_loading && `From ${data.port_loading}`,
    data.port_discharge && `To ${data.port_discharge}`,
  ].filter(Boolean).join(" → ");

  return (
    <Document
      title={`Pacred Form E ${data.invoice_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`ASEAN-China FTA Certificate of Origin (Form E) for job ${data.job_no ?? "—"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header — title + draft banner */}
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
            <Text style={styles.receiptTitle}>FORM E</Text>
            <Text style={styles.receiptTitleEn}>
              ASEAN-CHINA FTA{"\n"}CERTIFICATE OF ORIGIN
            </Text>
            <Text style={styles.receiptNo}>Ref.: {data.invoice_no ?? "(DRAFT)"}</Text>
            <Text style={styles.receiptDate}>Date: {formatDateEn(issueDate)}</Text>
            {data.job_no && (
              <Text style={styles.receiptDate}>Job: {data.job_no}</Text>
            )}
          </View>
        </View>

        {/* Draft banner */}
        <View style={{
          marginBottom: 10,
          padding: 6,
          borderWidth: 1,
          borderColor: COLORS.primary,
          borderStyle: "solid",
          backgroundColor: COLORS.surfaceAlt,
          borderRadius: 3,
        }}>
          <Text style={{ fontSize: 9, fontWeight: "bold", color: COLORS.primary, textAlign: "center" }}>
            DRAFT — for filing with issuing authority
          </Text>
        </View>

        {/* Boxes 1 + 2 — Exporter + Consignee */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol]}>
            <Text style={styles.customerLabel}>
              1 · GOODS CONSIGNED FROM (EXPORTER)
            </Text>
            <Text style={styles.customerName}>{data.shipper_name}</Text>
            <Text style={styles.customerLine}>{data.shipper_address}</Text>
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>
              2 · GOODS CONSIGNED TO (CONSIGNEE)
            </Text>
            <Text style={styles.customerName}>{data.consignee_name}</Text>
            <Text style={styles.customerLine}>{data.consignee_address}</Text>
            {data.consignee_tax_id && (
              <Text style={styles.customerLine}>
                TAX ID: {formatTaxId(data.consignee_tax_id)}
              </Text>
            )}
          </View>
        </View>

        {/* Boxes 3 + 4 — Means of transport / Official use */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol]}>
            <Text style={styles.customerLabel}>
              3 · MEANS OF TRANSPORT AND ROUTE
            </Text>
            <Text style={styles.customerLine}>
              Mode: {MODE_LABEL[data.transport_mode] ?? data.transport_mode}
            </Text>
            {data.vessel_voyage && (
              <Text style={styles.customerLine}>Vessel/Voy: {data.vessel_voyage}</Text>
            )}
            {data.bl_no && (
              <Text style={styles.customerLine}>B/L No.: {data.bl_no}</Text>
            )}
            {routeLine && (
              <Text style={styles.customerLine}>{routeLine}</Text>
            )}
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>
              4 · FOR OFFICIAL USE
            </Text>
            <Text style={[styles.customerLine, { color: COLORS.muted, marginTop: 6 }]}>
              (To be completed by the issuing authority)
            </Text>
          </View>
        </View>

        {/* Boxes 5-9 — Item table */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.5, textAlign: "center" }]}>5 · ITEM</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4 }]}>6 · MARKS &amp; NO.</Text>
            <Text style={[styles.tableHeadCell, { flex: 3.5 }]}>7 · DESCRIPTION OF GOODS</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.8, textAlign: "center" }]}>8 · ORIGIN</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: "right" }]}>9 · GROSS KG / QTY</Text>
          </View>
          {data.lines.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 7.6, textAlign: "center", color: COLORS.muted }]}>
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
                <Text style={[styles.tableCell, { flex: 1.4 }]}>{it.marks ?? ""}</Text>
                <Text style={[styles.tableCell, { flex: 3.5 }]}>
                  {it.cartons != null && (
                    <Text style={{ fontWeight: "bold" }}>
                      {Number(it.cartons).toLocaleString("en-US")} CTN{"\n"}
                    </Text>
                  )}
                  {it.description}
                  {it.hs_code && (
                    <Text style={{ color: COLORS.muted, fontSize: 8 }}>
                      {"\n"}HS: {it.hs_code}
                    </Text>
                  )}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8, textAlign: "center", fontWeight: "bold" }]}>
                  {it.origin_criterion}
                </Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.4 }]}>
                  {it.gross_weight_kg != null ? `${Number(it.gross_weight_kg).toFixed(2)} kg` : "—"}
                  {"\n"}
                  <Text style={{ fontSize: 8, color: COLORS.muted }}>
                    {Number(it.qty).toLocaleString("en-US")} {it.unit}
                  </Text>
                </Text>
              </View>
            ))
          )}

          {/* Totals row */}
          {data.lines.length > 0 && (
            <View style={[styles.tableRow, styles.tableRowLast, { backgroundColor: COLORS.surfaceAlt }]}>
              <Text style={[styles.tableCell, { flex: 0.5 }]}></Text>
              <Text style={[styles.tableCell, { flex: 1.4, fontWeight: "bold" }]}>
                TOTAL {totalCartons.toLocaleString("en-US")} CTN
              </Text>
              <Text style={[styles.tableCell, { flex: 3.5 }]}></Text>
              <Text style={[styles.tableCell, { flex: 0.8 }]}></Text>
              <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.4, fontWeight: "bold" }]}>
                {totalKg.toFixed(2)} kg{"\n"}
                <Text style={{ fontSize: 8, fontWeight: "normal" }}>
                  {totalQty.toLocaleString("en-US")} units
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* Box 10 — Invoice no + date */}
        <View style={{
          marginBottom: 10,
          padding: 8,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderStyle: "solid",
          borderRadius: 3,
        }}>
          <Text style={styles.customerLabel}>10 · NUMBER AND DATE OF INVOICES</Text>
          <Text style={styles.customerLine}>
            Invoice No.: {data.invoice_no ?? "(DRAFT)"}
            {"  ·  "}
            Date: {formatDateEn(issueDate)}
          </Text>
        </View>

        {/* Boxes 11 + 12 — Declaration + Certification */}
        <View style={styles.customerBlock}>
          <View style={[styles.customerCol]}>
            <Text style={styles.customerLabel}>11 · DECLARATION BY THE EXPORTER</Text>
            <Text style={[styles.customerLine, { marginBottom: 6 }]}>
              The undersigned hereby declares that the above details and
              statements are correct; that all the goods were produced in{" "}
              <Text style={{ fontWeight: "bold" }}>{data.origin_country}</Text>
              {" "}and that they comply with the Rules of Origin, as provided in
              Chapter 3 of the ACFTA, for the goods exported to{" "}
              <Text style={{ fontWeight: "bold" }}>THAILAND</Text>.
            </Text>
            <Text style={[styles.customerLine, { color: COLORS.muted, fontSize: 8 }]}>
              For and on behalf of:
            </Text>
            <Text style={[styles.customerLine, { fontWeight: "bold" }]}>
              {SITE_LEGAL_NAME}
            </Text>
            <Text style={[styles.customerLine, { fontSize: 8 }]}>
              {ADDRESSES.office.full}
            </Text>
            <View style={[styles.signatureLine, { marginTop: 28 }]}>
              <Text style={styles.signatureLabel}>
                Authorised signature · Place &amp; date
              </Text>
            </View>
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>12 · CERTIFICATION</Text>
            <Text style={[styles.customerLine, { color: COLORS.muted, marginBottom: 6 }]}>
              It is hereby certified, on the basis of control carried out,
              that the declaration by the exporter is correct.
            </Text>
            <View style={[styles.signatureLine, { marginTop: 60 }]}>
              <Text style={styles.signatureLabel}>
                Signature &amp; stamp of certifying authority
              </Text>
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

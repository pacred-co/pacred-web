/**
 * Freight D/O Exchange Letter — Pacred PDF template.
 *
 * V-E4 — formal Thai business letter: consignee → shipping-line agent
 * (e.g. CULINES, Sinokor) asking to "แลก D/O" (exchange the B/L for a
 * delivery order / telex release) so the container can be collected at
 * the port and delivered to the customer's warehouse.
 *
 * Pure templating over `freight_invoices` snapshot + parent
 * `freight_shipments` (for physical fields not snapshotted —
 * `carrier_container_no`, `place_delivery`). No schema, no actions.
 *
 * Single-page A4 Thai letter. Sarabun font. Cancelled-watermark mirrors
 * V-E1.1 pattern (freight-commercial-invoice.tsx).
 *
 * Server-rendered via `@react-pdf/renderer` from
 * `app/api/freight-invoice/[id]/do-letter/route.tsx`.
 *
 * Server-only.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, COLORS } from "./styles";
import {
  CONTACT, ADDRESSES, SITE_LEGAL_NAME_TH, TAX_ID,
} from "@/components/seo/site";

export type FreightDoLetterData = {
  invoice_no:    string | null;
  status:        "draft" | "issued" | "cancelled";
  issued_at:     string | null;
  created_at:    string;

  job_no:        string | null;

  // Consignee (Thai importer — the LETTER WRITER)
  consignee_name:    string;
  consignee_address: string;
  consignee_tax_id:  string | null;

  // Logistics (recipient = shipping-line agent derived from bl_no)
  bl_no:                string | null;
  vessel_voyage:        string | null;
  port_loading:         string | null;
  port_discharge:       string | null;
  place_delivery:       string | null;
  container_code:       string | null;    // Pacred internal GZE####/GZS####
  carrier_container_no: string | null;    // physical B/L container no (e.g. SLVU4871649)

  // Totals from freight_invoice_lines
  total_cartons: number;
  total_weight_kg: number;
};

// ── Helpers (module-scope per React Compiler purity) ─────────────────

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
] as const;

function formatDateThai(iso: string): string {
  const d = new Date(iso);
  const day   = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year  = d.getFullYear() + 543;   // พ.ศ.
  return `${day} ${month} ${year}`;
}

function formatTaxId(id: string | null): string {
  if (!id) return "—";
  const digits = id.replace(/\D/g, "").slice(0, 13);
  if (digits.length !== 13) return id;
  return `${digits[0]}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits[12]}`;
}

/**
 * Derive shipping-line agent name from B/L number prefix.
 * Per V-E4 spec: SLVU→Sinokor Lines · CULU→CULINES · default fallback.
 * The prefix is the carrier's SCAC-ish code embedded in the container/B-L no.
 */
function carrierFromBl(blNo: string | null): string {
  if (!blNo) return "[Shipping Line Agent]";
  const prefix = blNo.trim().slice(0, 4).toUpperCase();
  switch (prefix) {
    case "SLVU": return "Sinokor Lines";
    case "CULU": return "CULINES";
    default:     return "[Shipping Line Agent]";
  }
}

// ── Component ───────────────────────────────────────────────────────

export function FreightDoLetter({ data }: { data: FreightDoLetterData }) {
  const isCancelled = data.status === "cancelled";
  const issueDate   = data.issued_at ?? data.created_at;
  const carrierName = carrierFromBl(data.bl_no);

  return (
    <Document
      title={`Pacred D/O Letter ${data.invoice_no ?? "DRAFT"}`}
      author="Pacred"
      subject={`Delivery Order request letter for job ${data.job_no ?? "—"}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Letterhead — consignee writes TO the carrier, so consignee info is the letterhead */}
        <View style={{ marginBottom: 18 }}>
          <Text style={{ fontSize: 13, fontWeight: "bold", color: COLORS.foreground, marginBottom: 2 }}>
            {data.consignee_name}
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.foreground, lineHeight: 1.4 }}>
            {data.consignee_address}
          </Text>
          {data.consignee_tax_id && (
            <Text style={{ fontSize: 9, color: COLORS.foreground, marginTop: 2 }}>
              เลขประจำตัวผู้เสียภาษี: {formatTaxId(data.consignee_tax_id)}
            </Text>
          )}
        </View>

        {/* Date — right-aligned, Thai พ.ศ. */}
        <View style={{ alignItems: "flex-end", marginBottom: 14 }}>
          <Text style={{ fontSize: 10 }}>
            วันที่ {formatDateThai(issueDate)}
          </Text>
        </View>

        {/* Recipient */}
        <View style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontWeight: "bold" }}>
            เรียน  แผนกออกใบสั่งปล่อยสินค้า (D/O / Release Office)
          </Text>
          <Text style={{ fontSize: 10, marginTop: 2 }}>
            บริษัท {carrierName}
          </Text>
        </View>

        {/* Subject */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: "bold", color: COLORS.primary }}>
            เรื่อง  ขอแลกใบสั่งปล่อยสินค้า (Delivery Order)
          </Text>
        </View>

        {/* Reference detail block */}
        <View
          style={{
            marginBottom: 14,
            padding: 10,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderStyle: "solid",
            borderRadius: 3,
            backgroundColor: COLORS.surfaceAlt,
          }}
        >
          <DetailRow label="B/L No."         value={data.bl_no ?? "—"} />
          <DetailRow label="M.V./VOY"        value={data.vessel_voyage ?? "—"} />
          <DetailRow label="Port of Loading"  value={data.port_loading ?? "—"} />
          <DetailRow label="Port of Discharge" value={data.port_discharge ?? "—"} />
          <DetailRow label="Place of Delivery" value={data.place_delivery ?? "—"} />
          <DetailRow
            label="Container Nos."
            value={data.carrier_container_no ?? "—"}
            sub={data.container_code ? `(Pacred ref: ${data.container_code})` : null}
          />
          <DetailRow
            label="Cargo"
            value={`${Number(data.total_cartons).toLocaleString("en-US")} cartons`}
          />
          <DetailRow
            label="Weight"
            value={`${Number(data.total_weight_kg).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} kg`}
          />
        </View>

        {/* Fixed wording paragraph */}
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: "justify" }}>
            {"        "}
            บริษัทขอแลกใบสั่งปล่อยสินค้า (Delivery Order) สำหรับสินค้าตามรายละเอียดข้างต้น
            โดยจะใช้ในการรับสินค้าออกจากท่าและขนส่งไปยังโกดังลูกค้าต่อไป
            กรุณาออกใบสั่งปล่อย Telex Release ให้กับบริษัทด้วย จะขอบพระคุณยิ่ง
          </Text>
        </View>

        {/* Signature block — bottom right */}
        <View style={{ marginTop: 28, alignItems: "flex-end" }}>
          <Text style={{ fontSize: 10, marginBottom: 36 }}>ขอแสดงความนับถือ</Text>
          <View style={{ alignItems: "center", minWidth: 240 }}>
            <View
              style={{
                width: "100%",
                borderTopWidth: 1,
                borderTopColor: COLORS.foreground,
                borderTopStyle: "solid",
                marginBottom: 4,
              }}
            />
            <Text style={{ fontSize: 10, fontWeight: "bold" }}>
              {SITE_LEGAL_NAME_TH}
            </Text>
            <Text style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>
              เลขประจำตัวผู้เสียภาษี: {formatTaxId(TAX_ID)}
            </Text>
            <Text style={{ fontSize: 9, color: COLORS.muted, marginTop: 2 }}>
              ตำแหน่ง: กรรมการบริษัท
            </Text>
            <Text style={{ fontSize: 8, color: COLORS.muted, marginTop: 6, textAlign: "center" }}>
              {ADDRESSES.office.full}
            </Text>
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
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// ── Tiny helper rows ────────────────────────────────────────────────

function DetailRow({
  label, value, sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <Text style={{ fontSize: 10, color: COLORS.muted, width: 130 }}>{label}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, color: COLORS.foreground }}>{value}</Text>
        {sub && (
          <Text style={{ fontSize: 8, color: COLORS.muted, marginTop: 1 }}>{sub}</Text>
        )}
      </View>
    </View>
  );
}

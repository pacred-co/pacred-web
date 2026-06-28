/**
 * Cargo Commercial Invoice PDF (owner 2026-06-28 #1 · "ขึ้น invoice").
 *
 * A TRADE commercial invoice (ใบแสดงรายการและราคาสินค้า) for a cargo customs-
 * declaration — goods × qty × มูลค่าสำแดง (THB) + total. This is NOT a Thai VAT
 * ใบกำกับภาษี (owner #3: cargo รับเอกสาร ≠ VAT — VAT only on a domestic Thai sale);
 * it's the commercial-invoice document that accompanies the ใบขน. THB-denominated
 * (cargo) — the freight CI is USD/freight-shipment-bound. Mirrors the cargo PL.
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { SITE_LEGAL_NAME, ADDRESSES, CONTACT, TAX_ID } from "@/components/seo/site";

export type CargoCommercialInvoiceData = {
  declaration_no: string | null;
  status:         "draft" | "submitted" | "accepted" | "released" | "cancelled";
  declared_at:    string | null;
  job_no:         string | null;
  cabinet_no:     string | null;
  transport_mode: string | null;
  origin_country: string;
  consignee_name:    string | null;
  consignee_address: string | null;
  consignee_tax_id:  string | null;
  shipper_name:      string | null;
  shipper_address:   string | null;
  lines: Array<{
    position:           number;
    description:        string;
    hs_code:            string | null;
    qty:                number;
    unit:               string;
    declared_value_thb: number;
  }>;
  total_declared_value_thb: number;
};

function fmtDateTh(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}
const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtyf = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Sarabun", color: "#111" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottom: "1.5px solid #B30000", paddingBottom: 8, marginBottom: 10 },
  brandName: { fontSize: 18, fontWeight: 700, color: "#B30000" },
  brandLine: { fontSize: 8, color: "#444", marginTop: 1 },
  docTitle: { fontSize: 15, fontWeight: 700, textAlign: "right" },
  docSub: { fontSize: 9, textAlign: "right", color: "#666" },
  docMeta: { fontSize: 8, color: "#444", textAlign: "right", marginTop: 2 },
  parties: { flexDirection: "row", gap: 10, marginBottom: 10 },
  partyBox: { flex: 1, border: "1px solid #ccc", borderRadius: 3, padding: 6 },
  partyLabel: { fontSize: 7, color: "#888", textTransform: "uppercase", marginBottom: 2 },
  partyName: { fontSize: 9, fontWeight: 700 },
  partyLine: { fontSize: 8, color: "#333", marginTop: 1 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
  metaItem: { fontSize: 8, color: "#333" },
  metaB: { fontWeight: 700 },
  thead: { flexDirection: "row", backgroundColor: "#f3f3f3", borderTop: "1px solid #999", borderBottom: "1px solid #999", paddingVertical: 3 },
  trow: { flexDirection: "row", borderBottom: "0.5px solid #ddd", paddingVertical: 3 },
  cPos: { width: "6%", paddingHorizontal: 3 },
  cDesc: { width: "40%", paddingHorizontal: 3 },
  cHs: { width: "14%", paddingHorizontal: 3 },
  cQty: { width: "16%", paddingHorizontal: 3, textAlign: "right" },
  cAmt: { width: "24%", paddingHorizontal: 3, textAlign: "right" },
  th: { fontSize: 8, fontWeight: 700 },
  td: { fontSize: 8 },
  tfoot: { flexDirection: "row", borderTop: "1px solid #999", paddingVertical: 4 },
  grand: { marginTop: 8, alignItems: "flex-end" },
  grandLabel: { fontSize: 8, color: "#666" },
  grandVal: { fontSize: 13, fontWeight: 700, color: "#B30000" },
  note: { marginTop: 10, fontSize: 7, color: "#999" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7, color: "#888", textAlign: "center", borderTop: "0.5px solid #ddd", paddingTop: 4 },
  draftStamp: { position: "absolute", top: 120, left: 130, fontSize: 60, color: "#f0c0c0", transform: "rotate(-20deg)", fontWeight: 700 },
});

export function CargoCommercialInvoicePdf({ data }: { data: CargoCommercialInvoiceData }) {
  return (
    <Document title={`Pacred Commercial Invoice ${data.declaration_no ?? "DRAFT"}`} author="Pacred" creator="Pacred Web">
      <Page size="A4" style={styles.page}>
        {data.status === "draft" && <Text style={styles.draftStamp}>DRAFT</Text>}
        <View style={styles.header}>
          <View>
            <Text style={styles.brandName}>Pacred</Text>
            <Text style={styles.brandLine}>{SITE_LEGAL_NAME}</Text>
            <Text style={styles.brandLine}>{ADDRESSES.office.full}</Text>
            <Text style={styles.brandLine}>โทร {CONTACT.phoneCompanyDisplay} · เลขผู้เสียภาษี {TAX_ID}</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>COMMERCIAL INVOICE</Text>
            <Text style={styles.docSub}>ใบแสดงรายการและราคาสินค้า</Text>
            <Text style={styles.docMeta}>เลขที่: {data.declaration_no ?? "(ร่าง)"}</Text>
            <Text style={styles.docMeta}>วันที่: {fmtDateTh(data.declared_at)}</Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>ผู้ขาย / Seller (Shipper)</Text>
            <Text style={styles.partyName}>{data.shipper_name ?? "—"}</Text>
            {data.shipper_address ? <Text style={styles.partyLine}>{data.shipper_address}</Text> : null}
          </View>
          <View style={styles.partyBox}>
            <Text style={styles.partyLabel}>ผู้ซื้อ / Buyer (Consignee)</Text>
            <Text style={styles.partyName}>{data.consignee_name ?? "—"}</Text>
            {data.consignee_address ? <Text style={styles.partyLine}>{data.consignee_address}</Text> : null}
            {data.consignee_tax_id ? <Text style={styles.partyLine}>เลขผู้เสียภาษี: {data.consignee_tax_id}</Text> : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaItem}><Text style={styles.metaB}>Job: </Text>{data.job_no ?? "—"}</Text>
          <Text style={styles.metaItem}><Text style={styles.metaB}>ตู้/Container: </Text>{data.cabinet_no ?? "—"}</Text>
          <Text style={styles.metaItem}><Text style={styles.metaB}>ขนส่ง: </Text>{data.transport_mode ?? "—"}</Text>
          <Text style={styles.metaItem}><Text style={styles.metaB}>แหล่งกำเนิด: </Text>{data.origin_country}</Text>
        </View>

        <View style={styles.thead}>
          <Text style={[styles.cPos, styles.th]}>#</Text>
          <Text style={[styles.cDesc, styles.th]}>รายการสินค้า / Description</Text>
          <Text style={[styles.cHs, styles.th]}>พิกัด HS</Text>
          <Text style={[styles.cQty, styles.th]}>จำนวน</Text>
          <Text style={[styles.cAmt, styles.th]}>มูลค่า (บาท)</Text>
        </View>
        {data.lines.map((l) => (
          <View key={l.position} style={styles.trow} wrap={false}>
            <Text style={[styles.cPos, styles.td]}>{l.position}</Text>
            <Text style={[styles.cDesc, styles.td]}>{l.description}</Text>
            <Text style={[styles.cHs, styles.td]}>{l.hs_code ?? "—"}</Text>
            <Text style={[styles.cQty, styles.td]}>{qtyf(Number(l.qty))} {l.unit}</Text>
            <Text style={[styles.cAmt, styles.td]}>{baht(Number(l.declared_value_thb))}</Text>
          </View>
        ))}
        <View style={styles.tfoot}>
          <Text style={[styles.cPos, styles.th]}></Text>
          <Text style={[styles.cDesc, styles.th]}>รวม {data.lines.length} รายการ</Text>
          <Text style={[styles.cHs, styles.th]}></Text>
          <Text style={[styles.cQty, styles.th]}></Text>
          <Text style={[styles.cAmt, styles.th]}>{baht(Number(data.total_declared_value_thb))}</Text>
        </View>

        <View style={styles.grand}>
          <Text style={styles.grandLabel}>มูลค่ารวมทั้งสิ้น (Total Value)</Text>
          <Text style={styles.grandVal}>฿{baht(Number(data.total_declared_value_thb))}</Text>
        </View>

        <Text style={styles.note}>
          * เอกสารนี้เป็นใบแสดงรายการและราคาสินค้าเชิงพาณิชย์ (Commercial Invoice) ประกอบใบขนสินค้า — ไม่ใช่ใบกำกับภาษีมูลค่าเพิ่ม (VAT Tax Invoice)
        </Text>

        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `Pacred · ${CONTACT.email} · Page ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}

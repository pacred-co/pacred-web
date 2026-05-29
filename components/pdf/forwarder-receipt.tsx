/**
 * Forwarder receipt — Pacred PDF template.
 *
 * Server-rendered via `@react-pdf/renderer` in a route handler.
 * Mirrors the HTML receipt at `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx`
 * but produces a true PDF with embedded Sarabun (Thai) font.
 *
 * Server-only: imports `register-fonts` which is `server-only`.
 */

import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles, fmtBaht } from "./styles";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { CONTACT, ADDRESSES, BANK } from "@/components/seo/site";

export type ForwarderReceiptData = {
  f_no:        string | null;
  created_at:  string;

  /**
   * Forwarder lifecycle status code. Drives the document title:
   *   - "delivered" (paid) → ใบเสร็จรับเงินฝากนำเข้า
   *   - any other          → ใบแจ้งหนี้ฝากนำเข้า
   * Optional for backward-compat with older callers; absent = treat as invoice.
   */
  status?:     string | null;

  /** V-C2: staff-set buyer-name override printed on the bill header. NULL = use default. */
  bill_to_name_override?: string | null;

  ship_first_name:    string | null;
  ship_last_name:     string | null;
  ship_phone:         string | null;
  ship_phone2:        string | null;
  ship_address_line:  string | null;
  ship_sub_district:  string | null;
  ship_district:      string | null;
  ship_province:      string | null;
  ship_postal_code:   string | null;

  source_warehouse: "yiwu" | "guangzhou" | string;
  transport_type:   "truck" | "ship" | "air" | string;
  box_count:        number;
  weight_kg:        number;
  volume_cbm:       number;

  transport_price:        number;
  service_fee:            number;
  crate:                  boolean;
  crate_price:            number;
  qc:                     boolean;
  qc_price:               number;
  domestic_china_thb:     number;
  thailand_delivery_thb:  number;
  other_price:            number;
  total_price:            number;

  items: Array<{
    id:                  string;
    product_name:        string;
    product_qty:         number;
    weight_per_item_kg:  number | null;
  }>;
};

function warehouseLabel(w: string): string {
  return w === "yiwu" ? "อี้อู" : w === "guangzhou" ? "กวางโจว" : w;
}

function transportLabel(t: string): string {
  return t === "truck" ? "ทางรถ" : t === "ship" ? "ทางเรือ" : t === "air" ? "ทางอากาศ" : t;
}

function formatDateThai(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
}

export function ForwarderReceipt({ data }: { data: ForwarderReceiptData }) {
  const defaultName  = [data.ship_first_name, data.ship_last_name].filter(Boolean).join(" ") || "—";
  const customerName = (data.bill_to_name_override?.trim() || defaultName);
  const phones = [data.ship_phone, data.ship_phone2].filter(Boolean).join(" / ");
  const addressLine = [
    data.ship_address_line,
    data.ship_sub_district ? `ต.${data.ship_sub_district}` : null,
    data.ship_district     ? `อ.${data.ship_district}`     : null,
    data.ship_province     ? `จ.${data.ship_province}`     : null,
    data.ship_postal_code,
  ].filter(Boolean).join(" ");

  type Row = { label: string; value: number };
  const rows: Row[] = [
    { label: "ค่าขนส่ง (subtotal)", value: Number(data.transport_price) },
    { label: "ค่าบริการ Pacred",    value: Number(data.service_fee) },
  ];
  if (data.crate)                     rows.push({ label: "ค่าตีลังไม้",        value: Number(data.crate_price) });
  if (data.qc)                        rows.push({ label: "ค่า QC",             value: Number(data.qc_price) });
  if (data.domestic_china_thb    > 0) rows.push({ label: "ค่าขนส่งในจีน",     value: Number(data.domestic_china_thb) });
  if (data.thailand_delivery_thb > 0) rows.push({ label: "ค่าขนส่งในไทย",     value: Number(data.thailand_delivery_thb) });
  if (data.other_price           > 0) rows.push({ label: "ค่าอื่นๆ",          value: Number(data.other_price) });

  const fNo = data.f_no ?? "—";
  // Document title — receipt vs invoice based on lifecycle status.
  // "delivered" is the rebuilt-app paid terminal state for forwarder rows.
  const isPaid = data.status === "delivered";
  const docTitle = isPaid ? "ใบเสร็จรับเงินฝากนำเข้า" : "ใบแจ้งหนี้ฝากนำเข้า";

  return (
    <Document
      title={`Pacred ${docTitle} ${fNo}`}
      author="Pacred"
      subject={`Forwarder ${isPaid ? "receipt" : "invoice"} for ${fNo}`}
      creator="Pacred Web (Next.js)"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>Pacred</Text>
            <Text style={styles.brandTagline}>นำเข้า · ส่งออก · ฝากสั่ง · ชิปปิ้ง</Text>
            <Text style={styles.brandAddress}>
              {ADDRESSES.office.full}{"\n"}
              โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}
            </Text>
          </View>
          <View style={styles.receiptMeta}>
            <Text style={styles.receiptTitle}>{docTitle}</Text>
            <Text style={styles.receiptNo}>{fNo}</Text>
            <Text style={styles.receiptDate}>วันที่ {formatDateThai(data.created_at)}</Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.customerBlock}>
          <View style={styles.customerCol}>
            <Text style={styles.customerLabel}>ผู้รับสินค้า</Text>
            <Text style={styles.customerName}>{customerName}</Text>
            {phones && <Text style={styles.customerLine}>โทร {phones}</Text>}
            {addressLine && <Text style={styles.customerLine}>{addressLine}</Text>}
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>การขนส่ง</Text>
            <Text style={styles.customerName}>{warehouseLabel(data.source_warehouse)} → ไทย</Text>
            <Text style={styles.customerLine}>{transportLabel(data.transport_type)}</Text>
            <Text style={styles.customerLine}>
              {data.box_count} กล่อง · {Number(data.weight_kg).toFixed(2)} kg · {Number(data.volume_cbm).toFixed(3)} cbm
            </Text>
          </View>
        </View>

        {/* Item table */}
        {data.items.length > 0 && (
          <View style={styles.table}>
            <View style={styles.tableHead}>
              <Text style={[styles.tableHeadCell, { flex: 4 }]}>รายการสินค้า</Text>
              <Text style={[styles.tableHeadCell, { flex: 1, textAlign: "right" }]}>จำนวน</Text>
              <Text style={[styles.tableHeadCell, { flex: 2, textAlign: "right" }]}>น้ำหนัก/หน่วย</Text>
            </View>
            {data.items.map((it, i) => (
              <View
                key={it.id}
                style={[styles.tableRow, i === data.items.length - 1 ? styles.tableRowLast : {}]}
              >
                <Text style={[styles.tableCell, { flex: 4 }]}>{it.product_name}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1 }]}>× {it.product_qty}</Text>
                <Text style={[styles.tableCell, styles.tableCellRight, { flex: 2 }]}>
                  {it.weight_per_item_kg ? `${Number(it.weight_per_item_kg).toFixed(2)} kg/box` : "—"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Price breakdown */}
        <View style={styles.totalsBlock}>
          {rows.map((r) => (
            <View key={r.label} style={styles.totalRow}>
              <Text style={styles.totalLabel}>{r.label}</Text>
              <Text style={styles.totalValue}>฿{fmtBaht(r.value)}</Text>
            </View>
          ))}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>ยอดรวมทั้งสิ้น</Text>
            <Text style={styles.grandTotalValue}>฿{fmtBaht(Number(data.total_price))}</Text>
          </View>
          <Text style={styles.amountInWords}>
            ({readThaiBaht(Number(data.total_price))})
          </Text>
        </View>

        {/* Bank-transfer payment info (BANK constant — wired from site.ts after T-G3 Bundle 1) */}
        <View style={styles.bankBlock}>
          <Text style={styles.bankTitle}>ช่องทางการชำระเงิน · โอนผ่านธนาคาร</Text>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>ธนาคาร</Text>
            <Text style={styles.bankValue}>{BANK.name}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>ชื่อบัญชี</Text>
            <Text style={styles.bankValue}>{BANK.accountName}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>เลขที่บัญชี</Text>
            <Text style={[styles.bankValue, styles.bankAccountNumber]}>{BANK.accountNumber}</Text>
          </View>
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>ประเภท</Text>
            <Text style={styles.bankValue}>{BANK.accountType}</Text>
          </View>
          <Text style={styles.bankNote}>
            โอนแล้วโปรดอัปโหลดสลิปที่หน้าฝากนำเข้า · หรือชำระผ่าน PromptPay (ดู QR ในระบบ)
          </Text>
        </View>

        {/* Signature lines */}
        <View style={styles.signature}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>ผู้รับเอกสาร</Text>
            </View>
          </View>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>ผู้ออกเอกสาร</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Pacred · {CONTACT.phoneCompanyDisplay} · LINE @pacred · pacred.co
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

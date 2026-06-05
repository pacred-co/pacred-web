/**
 * Shop-order receipt — Pacred PDF template.
 *
 * Ports legacy `member/printShop.php` (mPDF). Same two modes:
 *   - "receipt"  (status='completed')    → "ใบเสร็จรับเงิน"  (green title)
 *   - "invoice"  (any other live status)  → "ใบแจ้งหนี้"      (red title)
 *
 * Renders A4 portrait via @react-pdf/renderer (Sarabun font already
 * registered by the API route). Reuses `styles` + `fmtBaht` from the
 * forwarder receipt so the look-and-feel stays unified.
 */

import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { styles, fmtBaht, COLORS } from "./styles";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { CONTACT, ADDRESSES, BANK } from "@/components/seo/site";
import type { ShopOrderReceiptData } from "@/actions/service-order";

// 2026-06-05 (ภูม flag) — detect CJK chars in a string. When present,
// render with NotoSansSC font (registered in lib/pdf/register-fonts.ts);
// otherwise Sarabun. Mixed Thai+Chinese strings get NotoSansSC too (its
// Latin glyphs are fine · Thai chars will fall back to Sarabun-like glyphs
// via the PDF reader's substitution — acceptable for product names).
function hasChinese(s: string | null | undefined): boolean {
  if (!s) return false;
  // CJK Unified Ideographs · CJK Compatibility · Halfwidth/Fullwidth · Hiragana/Katakana
  return /[　-〿぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/.test(s);
}

const cnFont = { fontFamily: "NotoSansSC" } as const;

const PROVIDER_LABEL: Record<string, string> = {
  "1688":  "1688",
  taobao:  "Taobao",
  tmall:   "Tmall",
  shop:    "Pacred Shop",
  nice:    "Nice",
};

function formatDateThai(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("th-TH", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function warehouseLabel(w: string | null | undefined): string {
  return w === "yiwu" ? "อี้อู" : w === "guangzhou" ? "กวางโจว" : "—";
}

function transportLabel(t: string): string {
  return t === "truck" ? "ทางรถ" : t === "ship" ? "ทางเรือ" : t === "air" ? "ทางอากาศ" : t;
}

/** Group items by provider then by shop_name, preserving original order. */
type Item = ShopOrderReceiptData["items"][number];
type ShopGroup = { shop_name: string; items: Item[] };
type ProviderGroup = { provider: string; shops: ShopGroup[] };

function groupItems(items: Item[]): ProviderGroup[] {
  const out: ProviderGroup[] = [];
  for (const it of items) {
    let pg = out.find((p) => p.provider === it.provider);
    if (!pg) {
      pg = { provider: it.provider, shops: [] };
      out.push(pg);
    }
    let sg = pg.shops.find((s) => s.shop_name === it.shop_name);
    if (!sg) {
      sg = { shop_name: it.shop_name, items: [] };
      pg.shops.push(sg);
    }
    sg.items.push(it);
  }
  return out;
}

export function ShopOrderReceipt({ data }: { data: ShopOrderReceiptData }) {
  // D1 Phase-B Wave 2: data.status is the legacy tb_header_order.hstatus
  // code — '5' = สำเร็จ (paid/completed).
  const isPaid     = data.status === "5";
  const docTitle   = isPaid ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้";
  const titleColor = isPaid ? "#16a34a" : COLORS.primary;        // green vs red

  const c = data.customer;
  const isJuristic   = c.account_type === "juristic";
  const defaultName  = isJuristic
    ? (c.company_name ?? "—")
    : `คุณ${[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}`;
  // V-C2: staff-set override wins (raw text — staff handles prefix themselves)
  const customerName = data.bill_to_name_override?.trim() || defaultName;

  // Address (use corporate address for juristic, else fall back to ship-to)
  const billingAddr = isJuristic
    ? (c.company_address ?? "—")
    : [
        data.ship_address_line,
        data.ship_sub_district ? `ต.${data.ship_sub_district}` : null,
        data.ship_district     ? `อ.${data.ship_district}`     : null,
        data.ship_province     ? `จ.${data.ship_province}`     : null,
        data.ship_postal_code,
      ].filter(Boolean).join(" ") || "—";

  const rate     = Number(data.yuan_rate_locked ?? 0);
  const subtotalThb = data.subtotal_cny * rate + data.domestic_china_cny * rate;
  const grouped  = groupItems(data.items);
  const hNo      = data.h_no ?? "—";

  return (
    <Document
      title={`Pacred ${docTitle} ${hNo}`}
      author="Pacred"
      subject={`${docTitle} for order ${hNo}`}
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
            <Text style={[styles.receiptTitle, { color: titleColor }]}>{docTitle}</Text>
            <Text style={styles.receiptNo}>เลขที่ฝากสั่งซื้อ {hNo}</Text>
            <Text style={styles.receiptDate}>วันที่สั่ง {formatDateThai(data.created_at)}</Text>
            {isPaid && data.date_awaiting_payment && (
              <Text style={styles.receiptDate}>วันที่ชำระ {formatDateThai(data.date_awaiting_payment)}</Text>
            )}
            {!isPaid && data.payment_due_at && (
              <Text style={[styles.receiptDate, { color: COLORS.primary }]}>
                ครบกำหนดชำระ {formatDateThai(data.payment_due_at)}
              </Text>
            )}
          </View>
        </View>

        {/* Customer + shipment */}
        <View style={styles.customerBlock}>
          <View style={styles.customerCol}>
            <Text style={styles.customerLabel}>ผู้สั่งซื้อ</Text>
            <Text style={styles.customerName}>{customerName}</Text>
            {isJuristic && c.tax_id && (
              <Text style={styles.customerLine}>เลขประจำตัวผู้เสียภาษี: {c.tax_id}</Text>
            )}
            {c.member_code && (
              <Text style={styles.customerLine}>รหัสสมาชิก: {c.member_code}</Text>
            )}
            <Text style={styles.customerLine}>{billingAddr}</Text>
            {c.email && <Text style={styles.customerLine}>{c.email}</Text>}
            {c.phone && <Text style={styles.customerLine}>โทร {c.phone}</Text>}
          </View>
          <View style={[styles.customerCol, styles.customerColLast]}>
            <Text style={styles.customerLabel}>การขนส่ง</Text>
            <Text style={styles.customerName}>
              {warehouseLabel(data.warehouse_china)} → ไทย
            </Text>
            <Text style={styles.customerLine}>{transportLabel(data.transport_type)}</Text>
            {rate > 0 && (
              <Text style={styles.customerLine}>เรท ฿{rate.toFixed(4)} / ¥</Text>
            )}
            {data.crate         && <Text style={styles.customerLine}>· ตีลังไม้</Text>}
            {data.free_shipping && <Text style={styles.customerLine}>· ส่งฟรี (Free Shipping)</Text>}
          </View>
        </View>

        {/* Items grouped by provider → shop */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadCell, { flex: 0.4,  textAlign: "center" }]}>#</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.2, textAlign: "center" }]}>รูป</Text>
            <Text style={[styles.tableHeadCell, { flex: 3.4 }]}>รายการสินค้า</Text>
            <Text style={[styles.tableHeadCell, { flex: 0.7, textAlign: "right" }]}>จำนวน</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.1, textAlign: "right" }]}>ราคา/ชิ้น</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.1, textAlign: "right" }]}>ค่าส่งจีน</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.3, textAlign: "right" }]}>รวม</Text>
          </View>

          {grouped.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 1, textAlign: "center", color: COLORS.muted }]}>
                ไม่มีรายการ
              </Text>
            </View>
          )}

          {(() => {
            let runningNo = 0;
            const rendered: React.ReactNode[] = [];

            grouped.forEach((pg, pi) => {
              rendered.push(
                <View key={`p-${pi}`} style={[styles.tableRow, { backgroundColor: "#ffe8e8" }]}>
                  <Text style={[styles.tableCell, styles.tableCellBold, { flex: 1, textAlign: "center" }]}>
                    {PROVIDER_LABEL[pg.provider] ?? pg.provider}
                  </Text>
                </View>,
              );

              pg.shops.forEach((sg, si) => {
                // 2026-06-05 (ภูม flag) — split shop label so the Chinese shop
                // name renders with NotoSansSC while the Thai label uses Sarabun.
                const shippingNos = sg.items
                  .map((it) => it.shipping_number)
                  .filter((s): s is string => !!s);
                const shopNameIsCn = hasChinese(sg.shop_name);
                const shippingLine = shippingNos.length > 0
                  ? `  ·  เลขออเดอร์ร้านจีน: ${[...new Set(shippingNos)].join(", ")}`
                  : "";
                rendered.push(
                  <View key={`p-${pi}-s-${si}`} style={[styles.tableRow, { backgroundColor: "#eff9ff" }]}>
                    <Text style={[styles.tableCell, { flex: 1 }]}>
                      <Text>ร้าน: </Text>
                      <Text style={shopNameIsCn ? cnFont : {}}>{sg.shop_name}</Text>
                      {shippingLine ? <Text>{shippingLine}</Text> : null}
                    </Text>
                  </View>,
                );

                sg.items.forEach((it, ii) => {
                  runningNo += 1;
                  const lineSubCny    = it.amount * it.price_cny;
                  const lineShipCny   = it.domestic_china_cny;
                  const lineTotalThb  = (lineSubCny + lineShipCny) * rate;
                  const detail        = [it.color, it.size].filter(Boolean).join(" / ");
                  const stripe        = runningNo % 2 === 0 ? { backgroundColor: COLORS.surfaceAlt } : {};
                  const titleIsCn     = hasChinese(it.title);
                  const imageUrl      = it.image_path && /^https?:\/\//i.test(it.image_path) ? it.image_path : null;

                  rendered.push(
                    <View key={`p-${pi}-s-${si}-i-${ii}`} style={[styles.tableRow, stripe]}>
                      <Text style={[styles.tableCell, { flex: 0.4, textAlign: "center" }]}>
                        {runningNo}
                      </Text>
                      {/* 2026-06-05 (ภูม flag) — รูปสินค้า เพราะลูกค้าอ่านชื่อจีน
                          ไม่ออก ใช้รูปประกอบจำให้ง่ายขึ้น. cimages ที่เป็น
                          full URL (Taobao/1688 CDN) → render ตรง · bare
                          filename → skip (legacy product images ตอนนี้ไม่ resolve). */}
                      <View style={{ flex: 1.2, alignItems: "center", justifyContent: "center", padding: 2 }}>
                        {imageUrl ? (
                          // eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image does not support alt prop
                          <Image src={imageUrl} style={{ width: 48, height: 48, objectFit: "cover" }} />
                        ) : (
                          <View style={{ width: 48, height: 48, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 7, color: COLORS.muted }}>—</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.tableCell, { flex: 3.4 }, titleIsCn ? cnFont : {}]}>
                        {it.title ?? "—"}
                        {detail ? `\n${detail}` : ""}
                        {it.tracking_number ? `\ntrack: ${it.tracking_number}` : ""}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellRight, { flex: 0.7 }]}>
                        × {it.amount}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.1 }]}>
                        ฿{fmtBaht(it.price_cny * rate)}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellRight, { flex: 1.1 }]}>
                        ฿{fmtBaht(lineShipCny * rate)}
                      </Text>
                      <Text style={[styles.tableCell, styles.tableCellRight, styles.tableCellBold, { flex: 1.3 }]}>
                        ฿{fmtBaht(lineTotalThb)}
                      </Text>
                    </View>,
                  );
                });
              });
            });

            return rendered;
          })()}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>รวมค่าสินค้า + ส่งจีน</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(subtotalThb)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>ค่าบริการ Pacred</Text>
            <Text style={styles.totalValue}>฿{fmtBaht(data.service_fee)}</Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={[styles.grandTotalLabel, { color: titleColor }]}>ยอดรวมทั้งสิ้น</Text>
            <Text style={[styles.grandTotalValue, { color: titleColor }]}>
              ฿{fmtBaht(data.total_thb)}
            </Text>
          </View>
          <Text style={styles.amountInWords}>
            ({readThaiBaht(data.total_thb)})
          </Text>
        </View>

        {/* Bank-transfer payment info (BANK constant — wired from site.ts after T-G3 Bundle 1) */}
        {!isPaid && (
          <View style={styles.bankBlock} wrap={false}>
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
              โอนแล้วโปรดอัปโหลดสลิปที่หน้าออเดอร์ · หรือชำระผ่าน PromptPay (ดู QR ในระบบ) · หรือชำระจาก wallet
            </Text>
          </View>
        )}

        {/* Signature lines — wrap={false} so the two boxes always stay
            together (else they wrap mid-block onto page 2 with a blank
            page above · ภูม flag 2026-06-05). */}
        <View style={styles.signature} wrap={false}>
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine}>
              <Text style={styles.signatureLabel}>
                {isPaid ? "ผู้รับเงิน" : "ผู้รับเอกสาร"}
              </Text>
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

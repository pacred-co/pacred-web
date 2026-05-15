import { notFound } from "next/navigation";
import { getServiceOrderForReceipt } from "@/actions/service-order";
import { getMyTaxInvoiceForOrder } from "@/actions/tax-invoices";
import { PrintButton } from "@/components/print-button";
import { TaxInvoiceRequestPanel } from "@/components/tax-invoice-request-panel";
import { CONTACT, ADDRESSES } from "@/components/seo/site";

/**
 * Print-ready service-order (ฝากสั่งซื้อ — China-shop) receipt view.
 *
 * Mirror of /service-import/[fNo]/receipt for the China-shop side.
 * Customer (logged in via (protected) layout) opens this and either
 * hits Ctrl+P (print stylesheet kicks in) or clicks "ดาวน์โหลด PDF"
 * to fetch the @react-pdf/renderer version at /api/pdf/shop-order/[hNo].
 *
 * status='completed'              → ใบเสร็จรับเงินฝากสั่งซื้อ
 * status in awaiting_payment ..   → ใบแจ้งหนี้ฝากสั่งซื้อ
 *  awaiting_chn_dispatch
 * status='pending' or 'cancelled' → notFound (getServiceOrderForReceipt
 *                                    refuses these per legacy PHP rule)
 *
 * Closes T-P1 GAP 3 (deferred from ภูม commit 121ea0d) — pre-req for
 * T-D1 cargo flow end-to-end smoke test. "ขอใบกำกับภาษี" CTA wires in
 * Phase G2b per ADR-0006 (depends on 0034_tax_invoices.sql).
 */
export default async function ShopOrderReceiptPage({
  params,
}: {
  params: Promise<{ hNo: string }>;
}) {
  const { hNo } = await params;
  const res = await getServiceOrderForReceipt(hNo);
  if (!res.ok || !res.data) notFound();
  const o = res.data;

  // T-P4 G2b: existing tax invoice (if any) for showing status card
  // instead of request form.
  const taxInv = await getMyTaxInvoiceForOrder("service_order", hNo);
  const existingInvoice = taxInv.ok ? taxInv.data : null;

  // Eligible if profile has a tax_id (juristic) OR juristic with corporate.tax_id.
  // Service-order receipt only carries the snapshot fields — derive both paths.
  const buyerTaxId = o.customer.tax_id ?? "";
  const isEligible = buyerTaxId.replace(/\D/g, "").length === 13;

  const isPaid       = o.status === "completed";
  const docLabel     = isPaid ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้";
  // The tax-invoice panel is allowed once the order is paid ('ordered'+),
  // matching requestTaxInvoice's server gate (awaiting_payment is the only
  // ineligible status that reaches this page).
  const canRequestTaxInvoice = o.status !== "awaiting_payment";
  const rate         = Number(o.yuan_rate_locked ?? 0);
  const subtotalThb  = rate > 0 ? o.subtotal_cny       * rate : 0;
  const domesticThb  = rate > 0 ? o.domestic_china_cny * rate : 0;
  const dateForHead  =
    isPaid && o.date_completed
      ? o.date_completed
      : (o.date_awaiting_payment ?? o.created_at);

  return (
    <div className="bg-white text-black min-h-screen">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { padding: 0; margin: 0; }
        }
        @page { size: A4; margin: 1.5cm; }
      `}</style>

      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <a
          href={`/api/pdf/shop-order/${hNo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 transition-colors shadow"
        >
          ดาวน์โหลด PDF
        </a>
        <PrintButton />
      </div>

      <main className="mx-auto max-w-[800px] p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-black pb-4">
          <div>
            <h1 className="text-3xl font-black text-primary-700">Pacred</h1>
            <p className="text-xs">{ADDRESSES.office.full}</p>
            <p className="text-xs">โทร {CONTACT.phoneCompanyDisplay} · {CONTACT.email}</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold">{docLabel}ฝากสั่งซื้อ</h2>
            <p className="font-mono text-lg">{o.h_no ?? "-"}</p>
            <p className="text-xs text-gray-600">
              วันที่: {new Date(dateForHead).toLocaleDateString("th-TH")}
            </p>
            {isPaid && (
              <p className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                ชำระเงินแล้ว
              </p>
            )}
          </div>
        </div>

        {/* Customer */}
        <section>
          <h3 className="mb-2 text-sm font-bold">ลูกค้า:</h3>
          <p className="text-sm">
            {o.customer.first_name} {o.customer.last_name}
            {o.customer.member_code && (
              <span className="ml-2 font-mono text-xs text-gray-600">
                ({o.customer.member_code})
              </span>
            )}
          </p>
          {o.customer.email && <p className="text-xs">{o.customer.email}</p>}
          {o.customer.phone && <p className="text-xs">📞 {o.customer.phone}</p>}

          {o.customer.account_type === "juristic" && o.customer.company_name && (
            <div className="mt-2 rounded bg-gray-50 p-2 text-xs">
              <p>บริษัท: <strong>{o.customer.company_name}</strong></p>
              {o.customer.tax_id && <p>เลขประจำตัวผู้เสียภาษี: {o.customer.tax_id}</p>}
              {o.customer.company_address && <p>{o.customer.company_address}</p>}
            </div>
          )}
        </section>

        {/* Ship to */}
        <section>
          <h3 className="mb-2 text-sm font-bold">ที่อยู่จัดส่ง:</h3>
          <p className="text-sm">{o.ship_first_name} {o.ship_last_name}</p>
          <p className="text-xs">
            📞 {o.ship_phone}{o.ship_phone2 ? ` / ${o.ship_phone2}` : ""}
          </p>
          <p className="text-xs">
            {o.ship_address_line} ต.{o.ship_sub_district} อ.{o.ship_district} จ.{o.ship_province} {o.ship_postal_code}
          </p>
        </section>

        {/* Items */}
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">รายการ</th>
              <th className="border border-gray-300 px-3 py-2 text-right">จำนวน</th>
              <th className="border border-gray-300 px-3 py-2 text-right">ราคา/หน่วย (¥)</th>
              <th className="border border-gray-300 px-3 py-2 text-right">รวม (¥)</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((it) => (
              <tr key={it.id}>
                <td className="border border-gray-300 px-3 py-2">
                  <div className="font-medium">{it.title ?? "(ไม่มีชื่อสินค้า)"}</div>
                  <div className="text-[10px] text-gray-500">
                    {it.shop_name}
                    {it.color && ` · สี: ${it.color}`}
                    {it.size && ` · ขนาด: ${it.size}`}
                  </div>
                  {(it.shipping_number || it.tracking_number) && (
                    <div className="text-[10px] text-gray-500">
                      {it.shipping_number && (
                        <>เลขออเดอร์: <span className="font-mono">{it.shipping_number}</span></>
                      )}
                      {it.shipping_number && it.tracking_number && " · "}
                      {it.tracking_number && (
                        <>tracking: <span className="font-mono">{it.tracking_number}</span></>
                      )}
                    </div>
                  )}
                </td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">× {it.amount}</td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">¥{it.price_cny.toFixed(2)}</td>
                <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                  ¥{(it.price_cny * it.amount).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Price breakdown */}
        <section className="border-t-2 border-black pt-3">
          <table className="w-full text-sm">
            <tbody>
              <Row label="ค่าสินค้ารวม (CNY)" value={`¥${o.subtotal_cny.toFixed(2)}`} />
              {o.domestic_china_cny > 0 && (
                <Row label="ค่าขนส่งในจีน (CNY)" value={`¥${o.domestic_china_cny.toFixed(2)}`} />
              )}
              {rate > 0 && (
                <Row label="อัตราแลกเปลี่ยน" value={`฿${rate.toFixed(4)} / ¥1`} />
              )}
              {subtotalThb > 0 && (
                <Row
                  label="ค่าสินค้า (THB)"
                  value={`฿${subtotalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
                />
              )}
              {domesticThb > 0 && (
                <Row
                  label="ค่าขนส่งในจีน (THB)"
                  value={`฿${domesticThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
                />
              )}
              <Row
                label="ค่าบริการ Pacred"
                value={`฿${o.service_fee.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`}
              />
              {o.crate         && <Row label="ค่าตีลังไม้" value="(รวมในยอดรวม)" />}
              {o.free_shipping && <Row label="ส่วนลด: ค่าส่งฟรีในไทย" value="—" />}
              <tr className="border-t-2 border-black text-base font-bold">
                <td className="py-2">ยอดรวมทั้งสิ้น (THB)</td>
                <td className="text-right font-mono">
                  ฿{o.total_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Shipment info */}
        <section className="text-xs text-gray-700">
          <p>
            คลังต้นทาง:{" "}
            {o.warehouse_china === "yiwu"
              ? "อี้อู"
              : o.warehouse_china === "guangzhou"
                ? "กวางโจว"
                : "—"}
            {" · "}ขนส่ง:{" "}
            {o.transport_type === "truck"
              ? "ทางรถ"
              : o.transport_type === "ship"
                ? "ทางเรือ"
                : o.transport_type === "air"
                  ? "ทางอากาศ"
                  : o.transport_type}
          </p>
        </section>

        {/* T-P4 G2b: tax invoice request panel (hidden on print) */}
        {canRequestTaxInvoice && (
          <TaxInvoiceRequestPanel
            orderType="service_order"
            orderId={o.h_no ?? hNo}
            defaults={{
              name:    o.customer.company_name
                ?? `${o.customer.first_name ?? ""} ${o.customer.last_name ?? ""}`.trim(),
              address: o.customer.company_address ?? "",
              taxId:   buyerTaxId,
            }}
            existing={existingInvoice}
            eligible={isEligible}
          />
        )}

        {/* Footer */}
        <div className="border-t border-gray-300 pt-3 text-[10px] text-gray-600">
          <p>• เอกสารนี้ออกโดย Pacred โดยอัตโนมัติจากระบบ — ไม่ต้องเซ็นกำกับ</p>
          <p>• สำหรับสอบถามเพิ่มเติม โทร {CONTACT.phoneCompanyDisplay} / LINE @pacred</p>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="text-right font-mono">{value}</td>
    </tr>
  );
}

import { notFound } from "next/navigation";
import { getForwarderByNo } from "@/actions/forwarder";
import { PrintButton } from "@/components/print-button";

/**
 * Print-ready receipt view. No NavBar/sidebar/footer — just the body.
 * Customer (or admin) opens this and hits Ctrl+P to save as PDF.
 * Phase H ships this as HTML; later we can swap to @react-pdf/renderer
 * for a true PDF endpoint.
 */
export default async function ForwarderReceiptPage({ params }: { params: Promise<{ fNo: string }> }) {
  const { fNo } = await params;
  const res = await getForwarderByNo(fNo);
  if (!res.ok || !res.data) notFound();
  const f = res.data;

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Print-only styles + auto-print on load (optional) */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { padding: 0; margin: 0; }
        }
        @page { size: A4; margin: 1.5cm; }
      `}</style>

      <div className="no-print fixed top-4 right-4 z-10 flex gap-2">
        <a
          href={`/api/pdf/forwarder/${f.f_no}`}
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
            <p className="text-xs">12 ซอยเพชรเกษม 77 แยก 3-6 หนองค้างพลู หนองแขม กรุงเทพฯ 10160</p>
            <p className="text-xs">โทร 02-444-7046 · contact@pacred.co</p>
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold">ใบแจ้งหนี้ฝากนำเข้า</h2>
            <p className="font-mono text-lg">{f.f_no}</p>
            <p className="text-xs text-gray-600">วันที่: {new Date(f.created_at).toLocaleDateString("th-TH")}</p>
          </div>
        </div>

        {/* Customer */}
        <section>
          <h3 className="font-bold mb-2 text-sm">ผู้รับ:</h3>
          <p className="text-sm">{f.ship_first_name} {f.ship_last_name}</p>
          <p className="text-xs">📞 {f.ship_phone}{f.ship_phone2 ? ` / ${f.ship_phone2}` : ""}</p>
          <p className="text-xs">
            {f.ship_address_line} ต.{f.ship_sub_district} อ.{f.ship_district} จ.{f.ship_province} {f.ship_postal_code}
          </p>
        </section>

        {/* Shipment table */}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">รายการ</th>
              <th className="border border-gray-300 px-3 py-2 text-right">จำนวน</th>
              <th className="border border-gray-300 px-3 py-2 text-right">หน่วย</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-3 py-2">
                ฝากนำเข้าจาก {f.source_warehouse === "yiwu" ? "อี้อู" : "กวางโจว"} — {f.transport_type === "truck" ? "ทางรถ" : f.transport_type === "ship" ? "ทางเรือ" : "ทางอากาศ"}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-right">{f.box_count} กล่อง</td>
              <td className="border border-gray-300 px-3 py-2 text-right">
                {Number(f.weight_kg).toFixed(2)} kg / {Number(f.volume_cbm).toFixed(3)} cbm
              </td>
            </tr>
            {f.items.map((it) => (
              <tr key={it.id}>
                <td className="border border-gray-300 px-3 py-2">{it.product_name}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">× {it.product_qty}</td>
                <td className="border border-gray-300 px-3 py-2 text-right">
                  {it.weight_per_item_kg ? `${Number(it.weight_per_item_kg).toFixed(2)} kg/box` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Price breakdown */}
        <section className="border-t-2 border-black pt-3">
          <table className="w-full text-sm">
            <tbody>
              <Row label="ค่าขนส่ง (subtotal)"   value={Number(f.transport_price)} />
              <Row label="ค่าบริการ Pacred"       value={Number(f.service_fee)} />
              {f.crate                  && <Row label="ค่าตีลังไม้" value={Number(f.crate_price)} />}
              {f.qc                     && <Row label="ค่า QC"      value={Number(f.qc_price)} />}
              {f.domestic_china_thb > 0 && <Row label="ค่าขนส่งในจีน" value={Number(f.domestic_china_thb)} />}
              {f.thailand_delivery_thb > 0 && <Row label="ค่าขนส่งในไทย" value={Number(f.thailand_delivery_thb)} />}
              {f.other_price > 0        && <Row label="ค่าอื่นๆ"   value={Number(f.other_price)} />}
              <tr className="border-t-2 border-black font-bold text-base">
                <td className="py-2">ยอดรวมทั้งสิ้น</td>
                <td className="text-right font-mono">฿{Number(f.total_price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <div className="border-t border-gray-300 pt-3 text-[10px] text-gray-600">
          <p>• เอกสารนี้ออกโดย Pacred โดยอัตโนมัติจากระบบ — ไม่ต้องเซ็นกำกับ</p>
          <p>• สำหรับสอบถามเพิ่มเติม โทร 02-444-7046 / LINE @pacred</p>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <td className="py-1">{label}</td>
      <td className="text-right font-mono">฿{value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
    </tr>
  );
}

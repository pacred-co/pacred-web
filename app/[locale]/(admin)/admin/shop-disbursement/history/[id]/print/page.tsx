/**
 * /admin/shop-disbursement/history/[id]/print — "รายงานภาษีขาย"
 * (sales-tax report) for one disbursement batch. Re-sweep A2 #23, D1.
 *
 * FAITHFUL port of `pcs-admin/print-report-shop.php` (mPDF A4 landscape
 * "รายงานภาษีขาย") — per-order rows (ลำดับ · วันที่ · เลขที่ออเดอร์ ·
 * ชื่อผู้ซื้อ · เลขผู้เสียภาษี · มูลค่าสินค้า=profit · ภาษี 7% · หมายเหตุ)
 * + grand totals. Only orders with profit >= 0 are listed (legacy L166).
 *
 * Rendered as an HTML A4 page with window.print() (the established
 * Pacred print pattern — see /admin/forwarders/combine-bill/print) +
 * @page CSS. Company header rebranded PCS → Pacred per CLAUDE.md
 * (company constants from components/seo/site.ts — never hardcode).
 *
 * Mounted on the batch detail "🖨 พิมพ์รายงานภาษีขาย" button (§0d).
 *
 * Auth — accounting + super.
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PrintButton } from "@/components/print-button";
import { getShopDisbursementBatch } from "@/actions/admin/shop-disbursement";
import { SITE_LEGAL_NAME_TH, TAX_ID, ADDRESSES } from "@/components/seo/site";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Legacy DateThai543Full — render a date as dd/mm/(BE) (Buddhist year).
 *  We keep it simple: dd/mm/yyyy(+543). */
function dateThai543(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}

// 🔴 title = ชื่อไฟล์ตอน Save PDF + หัวกระดาษ. ต้องอยู่ใน metadata เท่านั้น —
//    layout ออก <title> ให้ทุกหน้าอยู่แล้ว, <title> ที่ใส่ใน body จึงเป็นตัวที่ 2
//    และเบราว์เซอร์ใช้ "ตัวแรก" เสมอ (เจอจริง 2026-07-24). `absolute` = ไม่ต่อท้าย "| Pacred".
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: { absolute: `ภาษีขาย ชุดเบิกจ่าย ${id}` } };
}

export default async function ShopDisbursementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["accounting", "super"]);

  const { id } = await params;
  const batchId = Number(id);
  if (!Number.isFinite(batchId) || batchId <= 0) notFound();

  const res = await getShopDisbursementBatch(batchId);
  if (!res.ok) {
    if (res.error === "not_found") notFound();
    return (
      <main className="min-h-screen bg-white p-8 text-black">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-red-50 p-6 text-sm text-red-800">
          โหลดรายงานไม่สำเร็จ: {res.error}
        </div>
      </main>
    );
  }

  const { batch, orders, totals } = res.data!;
  // Legacy lists only profit >= 0 rows (print-report-shop.php L166).
  const rows = orders.filter((o) => o.profit >= 0);
  const taxDigits = TAX_ID.split("");

  return (
    <main className="min-h-screen bg-gray-100 p-4 text-black print:bg-white print:p-0">
      {/* Toolbar — hidden on print */}
      <div className="mx-auto mb-3 flex max-w-[297mm] items-center justify-between print:hidden">
        <Link
          href={`/admin/shop-disbursement/history/${batch.id}`}
          className="rounded-lg border border-black/20 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          ← กลับ
        </Link>
        <PrintButton label="🖨 พิมพ์ / Save PDF" />
      </div>

      {/* A4 landscape sheet */}
      <div className="mx-auto max-w-[297mm] bg-white p-[10mm] text-[13px] shadow print:max-w-none print:p-0 print:shadow-none">
        <h2 className="text-center text-lg font-bold">รายงานภาษีขาย</h2>
        <div className="mb-2 flex items-start justify-between gap-4">
          <div className="text-sm">
            <div className="font-semibold">ชื่อผู้ประกอบการ : {SITE_LEGAL_NAME_TH}</div>
            <div>ที่อยู่สถานประกอบการ : {ADDRESSES.office.full}</div>
            <div className="mt-1">ชื่อชุดเบิกจ่าย : {batch.title ?? "—"} (#{batch.id})</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">เลขประจำตัวผู้เสียภาษีอากร</div>
            <div className="mt-1 inline-flex gap-0.5">
              {taxDigits.map((dgt, i) => (
                <span
                  key={i}
                  className="inline-block w-5 border border-black/40 text-center text-xs"
                >
                  {dgt}
                </span>
              ))}
            </div>
            <div className="mt-1 text-xs">✔ สำนักงานใหญ่</div>
          </div>
        </div>

        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>ลำดับที่</th>
              <th className="border border-black/40 px-1 py-1" colSpan={2}>ใบกำกับภาษี</th>
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>ชื่อผู้ซื้อสินค้า/ผู้รับบริการ</th>
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>เลขประจำตัวผู้เสียภาษี</th>
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>สถานประกอบการ</th>
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>มูลค่าสินค้า<br />หรือบริการ</th>
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>จำนวนเงิน<br />ภาษีมูลค่าเพิ่ม</th>
              <th className="border border-black/40 px-1 py-1" rowSpan={2}>หมายเหตุ</th>
            </tr>
            <tr className="bg-gray-100">
              <th className="border border-black/40 px-1 py-1">วัน เดือน ปี</th>
              <th className="border border-black/40 px-1 py-1">เลขที่</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="border border-black/40 px-2 py-6 text-center text-gray-500">
                  ไม่มีรายการที่มีกำไรในชุดเบิกจ่ายนี้
                </td>
              </tr>
            ) : (
              rows.map((o, i) => (
                <tr key={o.id}>
                  <td className="border border-black/40 px-1 py-1 text-center">{i + 1}.</td>
                  <td className="border border-black/40 px-1 py-1 text-center">{dateThai543(null)}</td>
                  <td className="border border-black/40 px-1 py-1">{o.hno}</td>
                  <td className="border border-black/40 px-1 py-1">
                    {(o.username ?? "").trim()} {(o.userlastname ?? "").trim()} : {o.userid}
                  </td>
                  <td className="border border-black/40 px-1 py-1 text-center" />
                  <td className="border border-black/40 px-1 py-1 text-center">00000</td>
                  <td className="border border-black/40 px-1 py-1 text-right">{fmt2(o.profit)}</td>
                  <td className="border border-black/40 px-1 py-1 text-right">{fmt2(o.vat7)}</td>
                  <td className="border border-black/40 px-1 py-1 text-center" />
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="border border-black/40 px-1 py-1 text-right" colSpan={6}>
                รวมทั้งสิ้น
              </td>
              <td className="border border-black/40 px-1 py-1 text-right">{fmt2(totals.profitAll)}</td>
              <td className="border border-black/40 px-1 py-1 text-right">{fmt2(totals.vat7All)}</td>
              <td className="border border-black/40 px-1 py-1" />
            </tr>
          </tfoot>
        </table>
      </div>

      <style>{`
        @media print {
          body { background: #fff; }
          .print\\:hidden { display: none !important; }
        }
        @page { size: A4 landscape; margin: 8mm; }
      `}</style>
    </main>
  );
}

/**
 * /admin/shop-disbursement/history/[id] — per-batch detail.
 * Re-sweep A2 #23, D1 / ADR-0017.
 *
 * FAITHFUL port of `pcs-admin/report-shops-profit-pay-history.php` DETAIL
 * mode (?id=, L132-499) — the batch's order list (tb_shop_pay_sub →
 * tb_header_order), the bank / payment summary, and the period totals.
 *
 * Pay-out (status '1'→'2' + slip upload, history.php L134-173) is NOT
 * ported here — that's the customer-PULL pay-out surface handled by the
 * existing `/admin/sales-payouts/[id]` family + `/admin/accounting/
 * disbursements`; this batch is created at status '1' (รอดำเนินการ) and
 * the existing pay-out flow flips it. We surface the bank details + a
 * read-only status banner + the A4 "รายงานภาษีขาย" print link (the
 * legacy print-report-shop.php), which is the new artifact this task
 * adds.
 *
 * Reachable §0d: row "ดูรายละเอียด" from /history.
 *
 * Auth — accounting + super.
 */

import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";

import { getShopDisbursementBatch } from "@/actions/admin/shop-disbursement";
import { bankName } from "@/lib/admin/bank-names";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { SlipImage } from "@/components/admin/slip-image";
import { ShopDisbursementPayForm } from "./pay-form";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง",
  "40": "ถึงโกดังจีน",
  "5": "สำเร็จ",
  "6": "ยกเลิกออเดอร์",
};

export default async function AdminShopDisbursementBatchPage({
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
      <>
        <AccountingMenubar />
        <main className="p-6 lg:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดรายละเอียดไม่สำเร็จ: {res.error}
          </div>
        </main>
      </>
    );
  }

  const { batch, orders, totals } = res.data!;
  const batchStatusLabel =
    batch.status === "2" ? "จ่ายแล้ว" : batch.status === "1" ? "รอดำเนินการ" : "ไม่สำเร็จ";
  // B2 — paid slip (resolve only when paid).
  const slipUrl = batch.status === "2" ? await resolveLegacyUrl(batch.imagesslip, "slip") : null;

  return (
    <>
      <AccountingMenubar />
      <main className="space-y-5 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ACCOUNTING</p>
            <h1 className="mt-1 text-2xl font-bold">
              ประวัติจ่ายเงินค่าสินค้า #{batch.id}
            </h1>
            <p className="mt-1 text-xs text-muted">{batch.title ?? "—"}</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/shop-disbursement/history"
              className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:bg-gray-50"
            >
              ← กลับ
            </Link>
            <Link
              href={`/admin/shop-disbursement/history/${batch.id}/print`}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              🖨 พิมพ์รายงานภาษีขาย
            </Link>
          </div>
        </div>

        {/* Order line items (history.php L229-311) */}
        <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-black/10">
          <table className="min-w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">เลขที่ออเดอร์</th>
                <th className="px-3 py-2 text-left">ข้อมูลสินค้า</th>
                <th className="px-3 py-2 text-right">ราคาต้นทุน (บาท)</th>
                <th className="px-3 py-2 text-right">ราคาขาย (บาท)</th>
                <th className="px-3 py-2 text-right">ค่าบริการ (บาท)</th>
                <th className="px-3 py-2 text-right">VAT 7% (บาท)</th>
                <th className="px-3 py-2 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                    ไม่พบรายการในชุดเบิกจ่ายนี้
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">{o.id}</td>
                    <td className="px-3 py-2 font-medium text-primary-700">{o.hno}</td>
                    <td className="px-3 py-2 max-w-[16rem] truncate">
                      {o.htitle ?? "—"}
                      {o.hcount && o.hcount > 1 ? ` และอีก ${o.hcount - 1} รายการ` : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {o.costKeyed ? fmt2(o.pricePCS) : <span className="text-amber-600">รอคำนวณ</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt2(o.priceUser)}</td>
                    <td className="px-3 py-2 text-right">
                      {o.costKeyed ? fmt2(o.profit) : <span className="text-amber-600">รอคำนวณ</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {o.costKeyed ? fmt2(o.vat7) : <span className="text-amber-600">รอคำนวณ</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                        {STATUS_LABEL[String(o.hstatus)] ?? o.hstatus ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Payment / bank summary (history.php L320-359) */}
          <div className="rounded-xl border border-black/10 bg-white p-4 text-sm">
            <h3 className="mb-2 font-bold">ทำรายการชำระค่าสินค้า</h3>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-gray-500">ชื่อเรื่อง</dt>
                <dd className="font-medium">{batch.title ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">สถานะทำรายการ</dt>
                <dd className="font-medium">{batchStatusLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">ชื่อธนาคาร</dt>
                <dd className="font-medium">{bankName(batch.namebank)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">เลขที่บัญชี</dt>
                <dd className="font-medium">{batch.nouserbank || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">ชื่อบัญชี</dt>
                <dd className="font-medium">{batch.nameuserbank || "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">ยอดเงินที่ต้องชำระ (ต้นทุนรวม)</dt>
                <dd className="text-lg font-bold text-primary-700">{fmt2(totals.pricePCSAll)} บาท</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">ผู้ทำรายการ</dt>
                <dd className="font-medium">{batch.adminidcreate ?? "—"}</dd>
              </div>
            </dl>
            {/* B2 (2026-06-22) — pay-out completion (status '1'→'2' + slip). */}
            {batch.status === "1" && (
              <ShopDisbursementPayForm id={batch.id} amount={Number(batch.amount ?? 0)} />
            )}
            {batch.status === "2" && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-sm font-bold text-emerald-800">จ่ายแล้ว · หลักฐานการโอน</p>
                {batch.dateupdate ? (
                  <p className="text-xs text-muted">
                    วันที่จ่าย: {new Date(batch.dateupdate).toLocaleString("th-TH")}
                    {batch.adminidupdate ? ` · โดย ${batch.adminidupdate}` : ""}
                  </p>
                ) : null}
                {slipUrl ? (
                  <a href={slipUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block" title="เปิดสลิปเต็ม">
                    <SlipImage src={slipUrl} pdfMode="tile" className="h-24 w-24 rounded-lg border border-border object-cover bg-surface-alt hover:ring-2 hover:ring-emerald-300" />
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-muted">— ไม่มีไฟล์สลิป</p>
                )}
              </div>
            )}
          </div>

          {/* Totals (history.php L362-367) */}
          <div className="rounded-xl border border-black/10 bg-white p-4 text-right text-sm">
            <div>
              ราคาทุนรวม: <span className="font-semibold">{fmt2(totals.pricePCSAll)}</span> บาท
            </div>
            <div>
              ราคาขายรวม: <span className="font-semibold">{fmt2(totals.priceUserAll)}</span> บาท
            </div>
            <div>
              ค่าบริการรวม (กำไรรวม):{" "}
              <span className="font-semibold text-primary-700">{fmt2(totals.profitAll)}</span> บาท
            </div>
            <div>
              ภาษีมูลค่าเพิ่ม 7% รวม:{" "}
              <span className="font-semibold text-primary-700">{fmt2(totals.vat7All)}</span> บาท
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

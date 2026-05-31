/**
 * /admin/shop-disbursement/history — "ประวัติจ่ายเงินค่าสินค้า".
 * Re-sweep A2 #23, D1 / ADR-0017.
 *
 * FAITHFUL port of `pcs-admin/report-shops-profit-pay-history.php` LIST
 * mode (L1-130). Lists every disbursement batch (tb_shop_pay_h) with its
 * amount + status + slip + a drill-down to the per-batch detail.
 *
 * Reachable §0d: linked from /admin/shop-disbursement ("ประวัติการ
 * เบิกจ่าย") + the accounting menubar leaf.
 *
 * Auth — accounting + super (same as the create page).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { PageTopMenubar } from "@/components/admin/page-top-menubar";
import { CARGO_MENUBAR } from "@/lib/admin/accounting-menubar";
import { getShopDisbursementHistory } from "@/actions/admin/shop-disbursement";

export const dynamic = "force-dynamic";

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Legacy status pill (history.php L72-78).
function StatusPill({ status }: { status: string | null }) {
  if (status === "2") {
    return (
      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
        จ่ายแล้ว
      </span>
    );
  }
  if (status === "1") {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
        รอดำเนินการ
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
      ไม่สำเร็จ
    </span>
  );
}

export default async function AdminShopDisbursementHistoryPage() {
  await requireAdmin(["accounting", "super"]);

  const res = await getShopDisbursementHistory();
  const batches = res.ok ? res.data!.batches : [];

  return (
    <>
      <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/shop-disbursement/history" />
      <main className="space-y-5 p-6 lg:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ACCOUNTING</p>
            <h1 className="mt-1 text-2xl font-bold">ประวัติจ่ายเงินค่าสินค้า</h1>
            <p className="mt-1 text-xs text-muted">
              รายการเบิกจ่ายค่าสินค้า (ฝากสั่งซื้อ) ทั้งหมด — กดดูรายละเอียดเพื่อแนบสลิป / พิมพ์รายงานภาษีขาย
            </p>
          </div>
          <Link
            href="/admin/shop-disbursement"
            className="rounded-lg border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-100"
          >
            ← ทำรายการเบิกเงินใหม่
          </Link>
        </div>

        {!res.ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            โหลดประวัติไม่สำเร็จ: {res.error}
          </div>
        )}

        <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-black/10">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">วันที่ทำรายการ</th>
                <th className="px-3 py-2 text-left">ชื่อเรื่อง</th>
                <th className="px-3 py-2 text-left">ผู้ทำรายการ</th>
                <th className="px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
                <th className="px-3 py-2 text-center">สถานะ</th>
                <th className="px-3 py-2 text-center">ตัวเลือก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                    ยังไม่มีประวัติการเบิกจ่าย
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {b.date ? b.date.replace("T", " ").slice(0, 19) + " น." : "—"}
                    </td>
                    <td className="px-3 py-2">{b.title ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{b.adminidcreate ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmt2(b.amount)}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusPill status={b.status} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Link
                        href={`/admin/shop-disbursement/history/${b.id}`}
                        className="inline-block rounded-full border border-green-300 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        ดูรายละเอียด
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}

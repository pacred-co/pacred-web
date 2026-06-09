/**
 * /admin/warehouse/worker/intake — รับสินค้าเข้าโกดังจีน (W10 · Theme 7 P1).
 *
 * The receiving view: a worker scans a China-courier tracking (or order id),
 * confirms, and the shipment is marked received at the CN warehouse
 * (tb_forwarder.fstatus 1→2 · fdatestatus2 + fwarehousename). Below is the
 * live "รอเข้าโกดังจีน" (fstatus=1) queue so the worker sees what's expected.
 *
 * The actual mutation is a confirm-before-mutate client island calling
 * `warehouseIntakeScan` (G5 transition gated · audited). READ here; WRITE in
 * the island.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadWorkerQueue } from "@/lib/warehouse/worker-queries";
import { IntakeScanPanel } from "./intake-scan-panel";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

export default async function WarehouseIntakePage() {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const queue = await loadWorkerQueue("1", 100);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs text-gray-400 mb-1">
          <Link href="/admin/warehouse/worker" className="hover:underline">แอปคลัง</Link> / รับเข้าโกดัง
        </div>
        <h1 className="text-xl font-semibold text-gray-900">รับสินค้าเข้าโกดังจีน</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          สแกน / พิมพ์เลข tracking (จีน) หรือรหัสออเดอร์ → ยืนยันรับเข้าโกดัง
        </p>
      </header>

      <IntakeScanPanel />

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">รอเข้าโกดังจีน ({queue.length})</h2>
          <Link href="/admin/forwarders?q=1" className="text-xs text-blue-600 hover:underline">
            ดูทั้งหมด
          </Link>
        </div>
        {queue.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ไม่มีรายการรอเข้าโกดัง</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Tracking (จีน)</th>
                  <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
                  <th className="px-3 py-2 text-left font-medium">รายละเอียด</th>
                  <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                  <th className="px-3 py-2 text-left font-medium">วันที่</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {queue.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <Link href={`/admin/forwarders/${r.id}`} className="text-blue-600 hover:underline">
                        {r.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{r.ftrackingchn ?? "—"}</td>
                    <td className="px-3 py-2">{r.userid ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[16rem] truncate" title={r.fdetail ?? ""}>{r.fdetail ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.famount ?? 1}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.fdate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

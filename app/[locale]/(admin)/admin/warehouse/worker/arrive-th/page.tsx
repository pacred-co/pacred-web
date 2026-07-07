/**
 * /admin/warehouse/worker/arrive-th — ยิงรับเข้าไทย (พี่ป๊อป spec §2).
 *
 * TH-warehouse arrival scan: worker scans a tracking → fstatus 3→4 (ถึงไทยแล้ว ·
 * น้ำตาล). Below is the live "กำลังส่งมาไทย" (fstatus=3) queue = what's expected
 * to arrive. Parity with the China intake view (1→2) + the legacy
 * forwarder-import-warehouse.php scan. READ here; WRITE in the island.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadWorkerQueue } from "@/lib/warehouse/worker-queries";
import { ArriveThScanPanel } from "./arrive-th-scan-panel";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("th-TH", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

export default async function WarehouseArriveThPage() {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const queue = await loadWorkerQueue("3", 100);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs text-gray-400 mb-1">
          <Link href="/admin/warehouse/worker" className="hover:underline">แอปคลัง</Link> / ยิงรับเข้าไทย
        </div>
        <h1 className="text-xl font-semibold text-gray-900">ยิงรับสินค้าเข้าโกดังไทย</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          สแกน / พิมพ์เลข tracking (จีน) หรือรหัสออเดอร์ → ยืนยันถึงไทย (สถานะ → ถึงไทยแล้ว)
        </p>
      </header>

      <ArriveThScanPanel />

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">กำลังส่งมาไทย — รอถึง ({queue.length})</h2>
          <Link href="/admin/forwarders?status=3" className="text-xs text-blue-600 hover:underline">
            ดูทั้งหมด
          </Link>
        </div>
        {queue.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ไม่มีรายการกำลังส่งมาไทย</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Tracking (จีน)</th>
                  <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
                  <th className="px-3 py-2 text-left font-medium">ตู้</th>
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
                    <td className="px-3 py-2 font-mono text-xs">{r.fcabinetnumber || "—"}</td>
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

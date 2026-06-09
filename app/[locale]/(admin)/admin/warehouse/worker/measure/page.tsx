/**
 * /admin/warehouse/worker/measure — ชั่ง/วัดขนาด (W10 · Theme 7 P1).
 *
 * The data-entry view: a worker picks a shipment (from the "ถึงโกดังจีน"
 * queue or by search) and records weight + W×L×H → CBM auto-computes and is
 * written to tb_forwarder (fweight/fwidth/flength/fheight/fvolume). NO price
 * or cost column is touched (measure only).
 *
 * The measure form is a confirm-before-mutate client island calling
 * `warehouseMeasure`. The queue here lets the worker click a row to pre-fill.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadWorkerQueue } from "@/lib/warehouse/worker-queries";
import { MeasurePanel } from "./measure-panel";

export const dynamic = "force-dynamic";

export default async function WarehouseMeasurePage() {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const queue = await loadWorkerQueue("2", 100);

  const rows = queue.map((r) => ({
    id: r.id,
    tracking: r.ftrackingchn ?? "",
    userid: r.userid ?? "",
    detail: r.fdetail ?? "",
    amount: r.famount ?? 1,
    weight: Number(r.fweight ?? 0),
    volume: Number(r.fvolume ?? 0),
  }));

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs text-gray-400 mb-1">
          <Link href="/admin/warehouse/worker" className="hover:underline">แอปคลัง</Link> / ชั่ง-วัด
        </div>
        <h1 className="text-xl font-semibold text-gray-900">ชั่ง / วัดขนาด</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          เลือกรายการ → บันทึกน้ำหนัก + กว้าง×ยาว×สูง (ซม.) → ระบบคำนวณ CBM ให้
        </p>
      </header>

      <MeasurePanel queue={rows} />
    </main>
  );
}

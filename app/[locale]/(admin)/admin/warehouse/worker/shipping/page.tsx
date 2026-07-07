/**
 * /admin/warehouse/worker/shipping — ใส่ตู้ / ออกของ / ถึงไทย (W10 · Theme 7 P1).
 *
 * The transit view: attach shipments to a container (fcabinetnumber · refuses
 * locked cabinets · mig 0150), depart China (fstatus 2→3), arrive Thailand
 * (fstatus 3→4). Two queues: "ถึงโกดังจีน" (ready to load/depart) and
 * "กำลังส่งมาไทย" (in transit → arrive). All flips are G5-gated + audited.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadWorkerQueue } from "@/lib/warehouse/worker-queries";
import { ShippingPanel } from "./shipping-panel";
import { createAdminClient } from "@/lib/supabase/admin";
import { getContainerCompletenessBatch } from "@/lib/warehouse/container-completeness";

export const dynamic = "force-dynamic";

export default async function WarehouseShippingPage() {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const [atWarehouse, inTransit] = await Promise.all([
    loadWorkerQueue("2", 100),
    loadWorkerQueue("3", 100),
  ]);

  // ขาด/ครบ ต่อตู้ (พี่ป๊อป spec §2.1 · คลังเห็นความครบของตู้บนมือถือ) — 1 batch query.
  const containers = Array.from(
    new Set([...atWarehouse, ...inTransit].map((r) => r.fcabinetnumber ?? "").filter(Boolean)),
  );
  const completenessByContainer = containers.length
    ? await getContainerCompletenessBatch(createAdminClient(), containers)
    : {};

  const map = (r: typeof atWarehouse[number]) => ({
    id: r.id,
    tracking: r.ftrackingchn ?? "",
    userid: r.userid ?? "",
    container: r.fcabinetnumber ?? "",
    locked: Boolean(r.fcabinet_locked),
    weight: Number(r.fweight ?? 0),
    cbm: Number(r.fvolume ?? 0),
  });

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs text-gray-400 mb-1">
          <Link href="/admin/warehouse/worker" className="hover:underline">แอปคลัง</Link> / ใส่ตู้-ออกของ
        </div>
        <h1 className="text-xl font-semibold text-gray-900">ใส่ตู้ / ออกของ / ถึงไทย</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ใส่ตู้คอนเทนเนอร์ → ออกจากจีน (กำลังส่งมาไทย) → ถึงไทยแล้ว
        </p>
      </header>

      <ShippingPanel
        readyQueue={atWarehouse.map(map)}
        transitQueue={inTransit.map(map)}
        completenessByContainer={completenessByContainer}
      />
    </main>
  );
}

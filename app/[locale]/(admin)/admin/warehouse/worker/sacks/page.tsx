/**
 * /admin/warehouse/worker/sacks — งานกระสอบ (W10 · Theme 7 P1).
 *
 * The sack-pack view: create a sack (warehouse_sack), pack tb_forwarder_item
 * parcels into it (sets productbagid + recomputes sack weight/CBM/count),
 * then seal it. Sealed sacks are read-only (re-open = supervisor).
 *
 * 🔒 Role-gated: super / warehouse / ops / manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { loadSacks } from "@/lib/warehouse/worker-queries";
import { SacksPanel } from "./sacks-panel";

export const dynamic = "force-dynamic";

export default async function WarehouseSacksPage() {
  const { roles } = await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const sacks = await loadSacks({ limit: 100 });

  const isSupervisor = roles.includes("super") || roles.includes("manager");

  const rows = sacks.map((s) => ({
    id: s.id,
    sackNo: s.sack_no,
    warehouse: s.warehouse_code,
    container: s.container_no,
    weight: Number(s.weight_kg),
    cbm: Number(s.cbm),
    count: s.parcel_count,
    sealed: s.sealed,
    createdAt: s.created_at,
  }));

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <header>
        <div className="text-xs text-gray-400 mb-1">
          <Link href="/admin/warehouse/worker" className="hover:underline">แอปคลัง</Link> / งานกระสอบ
        </div>
        <h1 className="text-xl font-semibold text-gray-900">งานกระสอบ</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          สร้างกระสอบ → จัดของลงกระสอบ (ใส่เลขสินค้า/item) → ซีล + พิมพ์ป้าย
        </p>
      </header>

      <SacksPanel sacks={rows} isSupervisor={isSupervisor} />
    </main>
  );
}

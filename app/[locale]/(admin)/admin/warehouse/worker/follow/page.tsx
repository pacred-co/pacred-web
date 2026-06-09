/**
 * /admin/warehouse/worker/follow — ติดตามสินค้า (W10 · Theme 7 P1).
 *
 * The follow-product view (the "ไม่ต้องโทรถาม" USP at warehouse scale): look
 * up a shipment by tracking/order id (?q=) and see its worker-event timeline
 * (intake → measure → sack → depart → arrive) + current status. READ-ONLY.
 *
 * 🔒 Role-gated: super / warehouse / ops / manager.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  findForwarderByKey,
  loadShipmentTimeline,
  type WorkerForwarderRow,
} from "@/lib/warehouse/worker-queries";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";

export const dynamic = "force-dynamic";

const STEP_LABEL: Record<string, string> = {
  intake: "รับเข้าโกดังจีน",
  measure: "ชั่ง/วัด",
  sack: "เข้ากระสอบ",
  unsack: "ออกจากกระสอบ",
  assign_container: "ใส่ตู้",
  depart: "ออกจากจีน",
  arrive: "ถึงไทย",
  status_override: "แก้สถานะ",
  print_label: "พิมพ์ป้าย",
};

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

export default async function WarehouseFollowPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin(["super", "warehouse", "ops", "manager"]);
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  let matches: WorkerForwarderRow[] = [];
  let timeline: Awaited<ReturnType<typeof loadShipmentTimeline>> = [];
  let selected: WorkerForwarderRow | null = null;

  if (query) {
    matches = await findForwarderByKey(query);
    if (matches.length === 1) {
      selected = matches[0];
      timeline = await loadShipmentTimeline(selected.id);
    }
  }

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-3xl">
      <header>
        <div className="text-xs text-gray-400 mb-1">
          <Link href="/admin/warehouse/worker" className="hover:underline">แอปคลัง</Link> / ติดตามสินค้า
        </div>
        <h1 className="text-xl font-semibold text-gray-900">ติดตามสินค้า</h1>
        <p className="text-sm text-gray-500 mt-0.5">ค้นด้วยเลข tracking / รหัสออเดอร์ → ดูไทม์ไลน์งานคลัง</p>
      </header>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="เลข tracking หรือรหัสออเดอร์…"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
        />
        <button type="submit" className="rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700">
          ค้นหา
        </button>
      </form>

      {query && matches.length === 0 && (
        <p className="text-sm text-gray-400">ไม่พบรายการจาก "{query}"</p>
      )}

      {matches.length > 1 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-sm text-gray-600 mb-2">พบหลายรายการ — เลือก:</p>
          <ul className="space-y-1">
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/warehouse/worker/follow?q=${encodeURIComponent(m.ftrackingchn ?? String(m.id))}`}
                  className="text-blue-600 hover:underline text-sm">
                  #{m.id} · {m.ftrackingchn ?? "—"} · {legacyForwarderStatusThai(m.fstatus)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                <Link href={`/admin/forwarders/${selected.id}`} className="text-blue-600 hover:underline">#{selected.id}</Link>
              </h2>
              <span className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-medium text-cyan-800">
                {legacyForwarderStatusThai(selected.fstatus)}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div><dt className="inline text-gray-500">Tracking: </dt><dd className="inline font-mono text-xs">{selected.ftrackingchn ?? "—"}</dd></div>
              <div><dt className="inline text-gray-500">ลูกค้า: </dt><dd className="inline">{selected.userid ?? "—"}</dd></div>
              <div><dt className="inline text-gray-500">ตู้: </dt><dd className="inline">{selected.fcabinetnumber || "—"}</dd></div>
              <div><dt className="inline text-gray-500">น้ำหนัก/CBM: </dt><dd className="inline">{Number(selected.fweight ?? 0)} กก. / {Number(selected.fvolume ?? 0)} m³</dd></div>
            </dl>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-700">ไทม์ไลน์งานคลัง</h2>
            </div>
            {timeline.length === 0 ? (
              <p className="px-4 py-6 text-sm text-gray-400">ยังไม่มีเหตุการณ์งานคลังสำหรับรายการนี้</p>
            ) : (
              <ol className="divide-y divide-gray-50">
                {timeline.map((e) => (
                  <li key={e.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan-400" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{STEP_LABEL[e.step] ?? e.step}</span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtTime(e.created_at)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {e.fstatus_to && <>สถานะ → {legacyForwarderStatusThai(e.fstatus_to)} · </>}
                        โดย {e.admin_id}
                        {e.note && <> · {e.note}</>}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}

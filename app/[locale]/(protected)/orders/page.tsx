import { listOrders } from "@/actions/orders";
import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  processing: "กำลังดำเนินการ",
  shipped: "จัดส่งแล้ว",
  delivered: "ส่งถึงปลายทาง",
  cancelled: "ยกเลิก",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  shipped: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default async function OrdersPage() {
  const res = await listOrders();
  const orders = res.ok ? res.data ?? [] : [];

  return (
    <>
      <main className="mx-auto w-full max-w-[1140px] px-4 py-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold tracking-widest text-primary-600">
              ORDERS
            </p>
            <h1 className="mt-1 text-3xl font-bold text-foreground">
              ออเดอร์ของคุณ
            </h1>
          </div>
          <Link
            href="/orders/new"
            className="flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> สร้างออเดอร์ใหม่
          </Link>
        </div>

        {!res.ok && (
          <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            โหลดข้อมูลไม่สำเร็จ: {res.error}
          </p>
        )}

        {res.ok && orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-white dark:bg-surface p-12 text-center">
            <p className="text-muted">
              ยังไม่มีออเดอร์ กดปุ่ม &quot;สร้างออเดอร์ใหม่&quot; เพื่อเริ่ม
            </p>
          </div>
        )}

        {orders.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-surface-alt text-left text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">วันที่</th>
                  <th className="px-5 py-3">ประเภท</th>
                  <th className="px-5 py-3">เส้นทาง</th>
                  <th className="px-5 py-3">รายละเอียด</th>
                  <th className="px-5 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-zinc-50 dark:hover:bg-surface-alt">
                    <td className="px-5 py-3 text-muted whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-5 py-3 font-medium text-foreground">
                      {o.service_type}
                    </td>
                    <td className="px-5 py-3 text-foreground">
                      {o.origin && o.destination
                        ? `${o.origin} → ${o.destination}`
                        : o.origin || o.destination || "—"}
                    </td>
                    <td className="px-5 py-3 text-muted">
                      <span className="line-clamp-1">{o.description ?? "—"}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[o.status]}`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-6 text-xs text-muted">
          หน้านี้เป็น <strong>demo</strong> — ใช้เป็น reference สำหรับเพิ่ม feature
          ใหม่ในอนาคต ดู pattern เต็มที่ <code>docs/architecture.md</code> Section 9
        </p>
      </main>
    </>
  );
}

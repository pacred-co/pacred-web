/**
 * /admin/billing-run — ใบวางบิล / billing-run history list (R-2)
 *
 * Mirrors the combine-bill list-page pattern but reads `tb_forwarder_invoice`
 * (created by migration 0138). Per AGENTS.md §0d the entry is sidebar-wired
 * in components/sections/admin-sidebar.tsx + lib/admin/sidebar-menu.ts under
 * the accounting block.
 *
 * Filters via URL params (clean GET — no client state):
 *   ?status=all|issued|paid|cancelled|overdue   default: all
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD              default: last 90 days
 *   ?userid=PR123                               optional · per-customer view
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getInvoiceList } from "@/actions/admin/billing-run";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  from?:   string;
  to?:     string;
  userid?: string;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function thbFmt(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusBadge(status: "issued" | "paid" | "cancelled", isOverdue: boolean) {
  if (status === "paid") {
    return <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium">ชำระแล้ว</span>;
  }
  if (status === "cancelled") {
    return <span className="rounded-full bg-stone-50 text-stone-600 border border-stone-200 px-2.5 py-0.5 text-xs">ยกเลิก</span>;
  }
  if (isOverdue) {
    return <span className="rounded-full bg-red-50 text-red-700 border border-red-200 px-2.5 py-0.5 text-xs font-medium">เลยกำหนด</span>;
  }
  return <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-medium">รอชำระ</span>;
}

export default async function BillingRunListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin(["super", "accounting", "ops"]);
  const sp = await searchParams;

  const today = isoToday();
  const dateFrom = sp.from || isoDaysAgo(90);
  const dateTo   = sp.to   || today;
  const statusFilter = (
    ["issued", "paid", "cancelled", "overdue"].includes(sp.status ?? "")
      ? sp.status
      : "all"
  ) as "all" | "issued" | "paid" | "cancelled" | "overdue";

  const res = await getInvoiceList({
    dateFrom,
    dateTo,
    status: statusFilter,
    userid: sp.userid?.trim() || undefined,
    limit: 1000,
  });

  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 space-y-4">
        <h1 className="text-xl font-bold">ใบวางบิล (Billing-Run)</h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          ไม่สามารถโหลดข้อมูลได้: {res.error}
        </div>
      </main>
    );
  }

  const { rows, totalCount } = res.data!;
  const issuedCount    = rows.filter((r) => r.status === "issued" && !r.is_overdue).length;
  const overdueCount   = rows.filter((r) => r.is_overdue).length;
  const paidCount      = rows.filter((r) => r.status === "paid").length;
  const cancelledCount = rows.filter((r) => r.status === "cancelled").length;
  const totalUnpaidThb = rows
    .filter((r) => r.status === "issued")
    .reduce((s, r) => s + r.total_thb, 0);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>ใบวางบิล (Billing-Run) | PR Admin</title>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ใบวางบิล (Billing-Run)</h1>
          <p className="text-xs text-muted mt-0.5">
            ออกใบเรียกเก็บค่าฝากนำเข้าให้ลูกค้าเครดิต · ดูประวัติ · ปรับสถานะรับชำระ
          </p>
        </div>
        <Link href="/admin/billing-run/add" className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          + สร้างใบวางบิลใหม่
        </Link>
      </header>

      {/* Filter chips */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">สถานะ</span>
            <select
              name="status"
              defaultValue={statusFilter}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            >
              <option value="all">ทั้งหมด</option>
              <option value="issued">รอชำระ</option>
              <option value="overdue">เลยกำหนด</option>
              <option value="paid">ชำระแล้ว</option>
              <option value="cancelled">ยกเลิก</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">ตั้งแต่</span>
            <input
              type="date"
              name="from"
              defaultValue={dateFrom}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">ถึง</span>
            <input
              type="date"
              name="to"
              defaultValue={dateTo}
              className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">รหัสลูกค้า</span>
            <input
              type="text"
              name="userid"
              defaultValue={sp.userid ?? ""}
              placeholder="PR1234"
              className="w-32 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className="rounded-lg bg-foreground/90 text-white px-4 py-2 text-sm font-medium hover:bg-foreground">
            กรอง
          </button>
          <Link href="/admin/billing-run" className="text-xs text-muted hover:text-foreground self-center underline-offset-2 hover:underline">
            ล้างฟิลเตอร์
          </Link>
        </form>
      </section>

      {/* Stat strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-3">
          <div className="text-xs text-muted">รวม</div>
          <div className="text-lg font-bold">{totalCount}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3">
          <div className="text-xs text-amber-700">รอชำระ</div>
          <div className="text-lg font-bold text-amber-700">{issuedCount}</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/40 p-3">
          <div className="text-xs text-red-700">เลยกำหนด</div>
          <div className="text-lg font-bold text-red-700">{overdueCount}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="text-xs text-emerald-700">ชำระแล้ว</div>
          <div className="text-lg font-bold text-emerald-700">{paidCount}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-stone-50/40 p-3">
          <div className="text-xs text-stone-700">ยกเลิก</div>
          <div className="text-lg font-bold text-stone-700">{cancelledCount}</div>
        </div>
      </section>

      {/* Outstanding amount banner */}
      {totalUnpaidThb > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50/40 to-orange-50/40 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-amber-700 font-medium">ยอดค้างชำระทั้งหมด</div>
              <div className="text-2xl font-bold text-amber-800">{thbFmt(totalUnpaidThb)} ฿</div>
            </div>
            <div className="text-xs text-amber-600">
              {issuedCount + overdueCount} ใบ
            </div>
          </div>
        </section>
      )}

      {/* List table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/60 text-xs font-medium text-muted">
              <tr>
                <th className="px-3 py-2 text-left">เลขที่เอกสาร</th>
                <th className="px-3 py-2 text-left">ลูกค้า</th>
                <th className="px-3 py-2 text-right">จำนวนรายการ</th>
                <th className="px-3 py-2 text-right">ยอดรวม (฿)</th>
                <th className="px-3 py-2 text-center">วันที่ออก</th>
                <th className="px-3 py-2 text-center">ครบกำหนด</th>
                <th className="px-3 py-2 text-center">สถานะ</th>
                <th className="px-3 py-2 text-right">ดู</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-muted text-sm">
                    ไม่มีใบวางบิลในช่วงเวลาที่เลือก
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/billing-run/${r.id}`} className="font-mono text-primary-600 hover:underline">
                        {r.doc_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{r.buyer_name || "—"}</div>
                      <div className="text-xs text-muted">{r.userid}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">{r.item_count}</td>
                    <td className="px-3 py-2.5 text-right font-medium">{thbFmt(r.total_thb)}</td>
                    <td className="px-3 py-2.5 text-center text-xs">{r.date_issued}</td>
                    <td className="px-3 py-2.5 text-center text-xs">{r.date_due}</td>
                    <td className="px-3 py-2.5 text-center">{statusBadge(r.status, r.is_overdue)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Link href={`/admin/billing-run/${r.id}`} className="text-xs text-primary-600 hover:underline">
                        ดูรายละเอียด →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

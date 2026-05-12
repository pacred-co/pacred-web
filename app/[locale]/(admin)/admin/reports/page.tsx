import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/** Reports overview — high-level revenue + activity metrics across all
 * customer flows. Daily-ops dashboard rolled up to the period level.
 * Phase H ships totals; per-day chart + date range come later. */
export default async function AdminReportsPage() {
  const admin = createAdminClient();

  // Compute date ranges
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisYear  = new Date(now.getFullYear(), 0, 1).toISOString();

  const [
    serviceOrdersToday, serviceOrdersMonth, serviceOrdersYear,
    forwardersToday,    forwardersMonth,    forwardersYear,
    yuanToday,          yuanMonth,          yuanYear,
    walletInToday,      walletInMonth,      walletInYear,
    walletOutToday,
    customersToday,     customersMonth,
    commissionsToday,   commissionsMonth,
  ] = await Promise.all([
    sumThb(admin, "service_orders", "total_thb",  ["completed", "ordered", "awaiting_chn_dispatch"], today),
    sumThb(admin, "service_orders", "total_thb",  ["completed", "ordered", "awaiting_chn_dispatch"], thisMonth),
    sumThb(admin, "service_orders", "total_thb",  ["completed", "ordered", "awaiting_chn_dispatch"], thisYear),
    sumThb(admin, "forwarders",    "total_price", ["delivered", "out_for_delivery", "arrived_thailand"], today),
    sumThb(admin, "forwarders",    "total_price", ["delivered", "out_for_delivery", "arrived_thailand"], thisMonth),
    sumThb(admin, "forwarders",    "total_price", ["delivered", "out_for_delivery", "arrived_thailand"], thisYear),
    sumThb(admin, "yuan_payments", "thb_amount",  ["completed"], today),
    sumThb(admin, "yuan_payments", "thb_amount",  ["completed"], thisMonth),
    sumThb(admin, "yuan_payments", "thb_amount",  ["completed"], thisYear),
    sumThb(admin, "wallet_transactions", "amount", ["completed"], today, "deposit"),
    sumThb(admin, "wallet_transactions", "amount", ["completed"], thisMonth, "deposit"),
    sumThb(admin, "wallet_transactions", "amount", ["completed"], thisYear, "deposit"),
    sumThb(admin, "wallet_transactions", "amount", ["completed"], today, "withdraw"),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", today),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thisMonth),
    sumThb(admin, "sales_commissions", "commission_amount", ["paid", "unpaid"], today),
    sumThb(admin, "sales_commissions", "commission_amount", ["paid", "unpaid"], thisMonth),
  ]);

  const rows = [
    { label: "รายได้ฝากสั่ง",        today: serviceOrdersToday, month: serviceOrdersMonth, year: serviceOrdersYear },
    { label: "รายได้ฝากนำเข้า",       today: forwardersToday,    month: forwardersMonth,    year: forwardersYear },
    { label: "รายได้ฝากโอนหยวน",      today: yuanToday,           month: yuanMonth,           year: yuanYear },
    { label: "เติมเงินรวม",            today: walletInToday,       month: walletInMonth,       year: walletInYear },
    { label: "ค่าคอมทีมขาย",         today: commissionsToday,   month: commissionsMonth,   year: 0 },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">📊 รายงานสรุป</h1>
          <p className="mt-1 text-sm text-muted">ภาพรวมรายได้และกิจกรรมตามช่วงเวลา</p>
        </div>
        <div className="text-xs text-muted">
          เวลาเปิดดู: {new Date().toLocaleString("th-TH")}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">รายการ</th>
              <th className="px-4 py-3 text-right">วันนี้</th>
              <th className="px-4 py-3 text-right">เดือนนี้</th>
              <th className="px-4 py-3 text-right">ปีนี้</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{r.label}</td>
                <td className="px-4 py-3 text-right font-mono">฿{Math.abs(r.today).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right font-mono">฿{Math.abs(r.month).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-3 text-right font-mono">฿{Math.abs(r.year).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="grid sm:grid-cols-3 gap-3">
        <StatCard label="ลูกค้าใหม่วันนี้" value={String(customersToday.count ?? 0)} />
        <StatCard label="ลูกค้าใหม่เดือนนี้" value={String(customersMonth.count ?? 0)} />
        <StatCard label="ถอนเงินรวมวันนี้" value={`฿${Math.abs(walletOutToday).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`} />
      </section>

      <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted">
        ดูรายงานรายเดือน/รายปี + กราฟ + export CSV — เพิ่มในเฟสถัดไป<br />
        <Link href="/admin" className="text-primary-500 hover:underline">← กลับภาพรวม</Link>
      </div>
    </main>
  );
}

async function sumThb(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  col:  string,
  statuses: string[],
  sinceIso: string,
  kindFilter?: string,
): Promise<number> {
  let q = admin.from(table).select(col).gte("created_at", sinceIso);
  if (statuses.length > 0) q = q.in("status", statuses);
  if (kindFilter) q = q.eq("kind", kindFilter);
  const { data } = await q;
  if (!data) return 0;
  return (data as Array<Record<string, number>>).reduce((s, r) => s + Number(r[col] ?? 0), 0);
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold font-mono text-foreground">{value}</p>
    </div>
  );
}

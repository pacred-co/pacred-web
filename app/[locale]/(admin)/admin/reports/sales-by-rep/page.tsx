import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

/**
 * V-G6 #2 — Sales revenue per sales rep.
 *
 * Customers are mapped to a sales rep via `profiles.sales_admin_id` (text).
 * This report aggregates: per rep, total ฝากนำเข้า revenue + total ฝากสั่ง
 * revenue + total yuan-payment THB volume within the selected period.
 *
 * PHP ref: report-sales-group-by-user.php.
 *
 * Read-only — no schema changes.
 */

export const dynamic = "force-dynamic";

type FwRow = {
  total_price: number;
  status:      string;
  profile_id:  string;
};
type SoRow = {
  total_thb:   number;
  status:      string;
  profile_id:  string;
};
type YpRow = {
  thb_amount:  number;
  status:      string;
  profile_id:  string;
};
type ProfileRow = {
  id:              string;
  sales_admin_id:  string | null;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export default async function SalesByRepReport({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days ?? 30) || 30));
  const from = daysAgoIso(days);

  const admin = createAdminClient();

  // Pull everything in parallel.
  const [fwRes, soRes, ypRes, profilesRes] = await Promise.all([
    admin
      .from("forwarders")
      .select("total_price, status, profile_id")
      .gte("created_at", from)
      .neq("status", "cancelled")
      .limit(10000),
    admin
      .from("service_orders")
      .select("total_thb, status, profile_id")
      .gte("created_at", from)
      .neq("status", "cancelled")
      .limit(10000),
    admin
      .from("yuan_payments")
      .select("thb_amount, status, profile_id")
      .gte("created_at", from)
      .not("status", "in", "(cancelled,rejected,failed)")
      .limit(10000),
    admin
      .from("profiles")
      .select("id, sales_admin_id")
      .not("sales_admin_id", "is", null)
      .limit(20000),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const repByProfile = new Map<string, string>();
  for (const p of profiles) {
    if (p.sales_admin_id) repByProfile.set(p.id, p.sales_admin_id);
  }

  // Aggregate per rep.
  type RepAgg = {
    rep:          string;
    fw_count:     number;
    fw_revenue:   number;
    so_count:     number;
    so_revenue:   number;
    yp_count:     number;
    yp_revenue:   number;
    total_revenue: number;
  };
  const aggMap = new Map<string, RepAgg>();
  function bumpFw(rep: string, amount: number) {
    const a = aggMap.get(rep) ?? makeEmpty(rep);
    a.fw_count    += 1;
    a.fw_revenue  += amount;
    a.total_revenue += amount;
    aggMap.set(rep, a);
  }
  function bumpSo(rep: string, amount: number) {
    const a = aggMap.get(rep) ?? makeEmpty(rep);
    a.so_count    += 1;
    a.so_revenue  += amount;
    a.total_revenue += amount;
    aggMap.set(rep, a);
  }
  function bumpYp(rep: string, amount: number) {
    const a = aggMap.get(rep) ?? makeEmpty(rep);
    a.yp_count    += 1;
    a.yp_revenue  += amount;
    a.total_revenue += amount;
    aggMap.set(rep, a);
  }
  function makeEmpty(rep: string): RepAgg {
    return {
      rep, fw_count: 0, fw_revenue: 0, so_count: 0, so_revenue: 0,
      yp_count: 0, yp_revenue: 0, total_revenue: 0,
    };
  }

  for (const r of (fwRes.data ?? []) as FwRow[]) {
    const rep = repByProfile.get(r.profile_id) ?? "(ไม่มี sales rep)";
    bumpFw(rep, Number(r.total_price ?? 0));
  }
  for (const r of (soRes.data ?? []) as SoRow[]) {
    const rep = repByProfile.get(r.profile_id) ?? "(ไม่มี sales rep)";
    bumpSo(rep, Number(r.total_thb ?? 0));
  }
  for (const r of (ypRes.data ?? []) as YpRow[]) {
    const rep = repByProfile.get(r.profile_id) ?? "(ไม่มี sales rep)";
    bumpYp(rep, Number(r.thb_amount ?? 0));
  }

  const aggregates = Array.from(aggMap.values()).sort((a, b) => b.total_revenue - a.total_revenue);

  const totalRev = aggregates.reduce((s, a) => s + a.total_revenue, 0);

  const csvCols = [
    { key: "rep",         label: "Sales rep" },
    { key: "fw_count",    label: "ฝากนำเข้า (รายการ)" },
    { key: "fw_revenue",  label: "ฝากนำเข้า (บาท)" },
    { key: "so_count",    label: "ฝากสั่ง (รายการ)" },
    { key: "so_revenue",  label: "ฝากสั่ง (บาท)" },
    { key: "yp_count",    label: "ฝากโอน (รายการ)" },
    { key: "yp_revenue",  label: "ฝากโอน (บาท)" },
    { key: "total",       label: "รวมยอดเงิน (บาท)" },
  ];
  const csvRows = aggregates.map((a) => ({
    rep:         a.rep,
    fw_count:    a.fw_count,
    fw_revenue:  a.fw_revenue.toFixed(2),
    so_count:    a.so_count,
    so_revenue:  a.so_revenue.toFixed(2),
    yp_count:    a.yp_count,
    yp_revenue:  a.yp_revenue.toFixed(2),
    total:       a.total_revenue.toFixed(2),
  }));

  const dayOptions = [7, 30, 90, 365];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · REPORTS (V-G6)</p>
          <h1 className="mt-1 text-2xl font-bold">ยอดขายแยกตาม Sales rep</h1>
          <p className="mt-1 text-sm text-muted">
            ฝากนำเข้า + ฝากสั่ง + ฝากโอน → รวมยอดต่อ rep ({days} วันล่าสุด)
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">ช่วงเวลา:</span>
          {dayOptions.map((d) => (
            <Link
              key={d}
              href={`/admin/reports/sales-by-rep?days=${d}`}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                d === days ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={`sales-by-rep-${days}d.csv`} />
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="จำนวน Sales rep" value={String(aggregates.length)} />
        <Card label="รวมยอดทั้งหมด" value={thb(totalRev)} highlight />
        <Card label="เฉลี่ยต่อ rep" value={thb(aggregates.length > 0 ? totalRev / aggregates.length : 0)} />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {aggregates.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีข้อมูลในช่วงเวลานี้</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Sales rep</th>
                <th className="px-4 py-2 text-right">ฝากนำเข้า</th>
                <th className="px-4 py-2 text-right">ฝากสั่ง</th>
                <th className="px-4 py-2 text-right">ฝากโอน</th>
                <th className="px-4 py-2 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((a) => (
                <tr key={a.rep} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{a.rep}</td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-mono text-xs">{thb(a.fw_revenue)}</p>
                    <p className="text-[10px] text-muted">{a.fw_count} รายการ</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-mono text-xs">{thb(a.so_revenue)}</p>
                    <p className="text-[10px] text-muted">{a.so_count} รายการ</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-mono text-xs">{thb(a.yp_revenue)}</p>
                    <p className="text-[10px] text-muted">{a.yp_count} รายการ</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-primary-700">{thb(a.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[10px] text-muted">
        Source: <code>profiles.sales_admin_id</code> → join <code>forwarders</code> + <code>service_orders</code> + <code>yuan_payments</code>.
        ลูกค้าที่ไม่มี sales rep mapping จะถูกจัดกลุ่มเป็น &ldquo;(ไม่มี sales rep)&rdquo;.
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-primary-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-primary-700" : ""}`}>{value}</p>
    </div>
  );
}

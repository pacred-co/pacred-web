import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

/**
 * V-G6 #1 — Forwarder volume per period.
 *
 * Aggregates ฝากนำเข้า (forwarders) by (source_warehouse, transport_type)
 * within a selected period. Shows row count + total CBM + total kg + total
 * revenue per combo. PHP ref: report-forwarder-volume.php.
 *
 * Date range filter via ?days=7|30|90|365 (default 30).
 *
 * Read-only — no schema changes.
 */

export const dynamic = "force-dynamic";

const WAREHOUSE_LABEL: Record<string, string> = {
  yiwu:      "อี้อู",
  guangzhou: "กวางโจว",
};
const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ",
  ship:  "🚢 เรือ",
  air:   "✈️ เครื่องบิน",
};

type FwRow = {
  source_warehouse: string;
  transport_type:   string;
  box_count:        number | null;
  weight_kg:        number | null;
  volume_cbm:       number | null;
  total_price:      number;
  status:           string;
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

export default async function ForwarderVolumeReport({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days ?? 30) || 30));
  const from = daysAgoIso(days);

  const admin = createAdminClient();
  const { data } = await admin
    .from("forwarders")
    .select("source_warehouse, transport_type, box_count, weight_kg, volume_cbm, total_price, status")
    .gte("created_at", from)
    .neq("status", "cancelled")
    .limit(10000);
  const rows = (data ?? []) as FwRow[];

  // Aggregate by (source_warehouse, transport_type).
  type Agg = {
    source_warehouse: string;
    transport_type:   string;
    count:            number;
    box_count:        number;
    weight_kg:        number;
    volume_cbm:       number;
    revenue_thb:      number;
  };
  const aggMap = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.source_warehouse}::${r.transport_type}`;
    const a = aggMap.get(key) ?? {
      source_warehouse: r.source_warehouse,
      transport_type:   r.transport_type,
      count: 0, box_count: 0, weight_kg: 0, volume_cbm: 0, revenue_thb: 0,
    };
    a.count       += 1;
    a.box_count   += Number(r.box_count   ?? 0);
    a.weight_kg   += Number(r.weight_kg   ?? 0);
    a.volume_cbm  += Number(r.volume_cbm  ?? 0);
    a.revenue_thb += Number(r.total_price ?? 0);
    aggMap.set(key, a);
  }
  const aggregates = Array.from(aggMap.values()).sort((a, b) => b.revenue_thb - a.revenue_thb);

  const totalCount    = rows.length;
  const totalKg       = aggregates.reduce((s, a) => s + a.weight_kg,   0);
  const totalCbm      = aggregates.reduce((s, a) => s + a.volume_cbm,  0);
  const totalRevenue  = aggregates.reduce((s, a) => s + a.revenue_thb, 0);

  const csvCols = [
    { key: "source",   label: "ต้นทาง" },
    { key: "mode",     label: "ขนส่ง" },
    { key: "count",    label: "จำนวนรายการ" },
    { key: "boxes",    label: "กล่องรวม" },
    { key: "kg",       label: "kg รวม" },
    { key: "cbm",      label: "CBM รวม" },
    { key: "revenue",  label: "ยอดเงิน (บาท)" },
  ];
  const csvRows = aggregates.map((a) => ({
    source:  WAREHOUSE_LABEL[a.source_warehouse] ?? a.source_warehouse,
    mode:    TRANSPORT_LABEL[a.transport_type] ?? a.transport_type,
    count:   a.count,
    boxes:   a.box_count,
    kg:      a.weight_kg.toFixed(2),
    cbm:     a.volume_cbm.toFixed(3),
    revenue: a.revenue_thb.toFixed(2),
  }));

  const dayOptions = [7, 30, 90, 365];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · REPORTS (V-G6)</p>
          <h1 className="mt-1 text-2xl font-bold">ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง</h1>
          <p className="mt-1 text-sm text-muted">
            สำหรับวางแผนตู้ + พิจารณาเพิ่มเส้นทาง ({days} วันล่าสุด · ไม่นับ cancelled)
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
              href={`/admin/reports/forwarder-volume?days=${d}`}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                d === days ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}
            >
              {d}d
            </Link>
          ))}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={`forwarder-volume-${days}d.csv`} />
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="รวมรายการ" value={String(totalCount)} />
        <Card label="รวม kg"    value={totalKg.toFixed(2)} />
        <Card label="รวม CBM"   value={totalCbm.toFixed(3)} />
        <Card label="รวมยอด"    value={thb(totalRevenue)} highlight />
      </div>

      {/* Aggregate table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {aggregates.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีฝากนำเข้าในช่วงเวลานี้</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">ต้นทาง</th>
                <th className="px-4 py-2">ขนส่ง</th>
                <th className="px-4 py-2 text-right">รายการ</th>
                <th className="px-4 py-2 text-right">กล่อง</th>
                <th className="px-4 py-2 text-right">kg</th>
                <th className="px-4 py-2 text-right">CBM</th>
                <th className="px-4 py-2 text-right">ยอดเงิน</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((a) => (
                <tr key={`${a.source_warehouse}-${a.transport_type}`} className="border-t border-border">
                  <td className="px-4 py-3">{WAREHOUSE_LABEL[a.source_warehouse] ?? a.source_warehouse}</td>
                  <td className="px-4 py-3">{TRANSPORT_LABEL[a.transport_type] ?? a.transport_type}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{a.count}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{a.box_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{a.weight_kg.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{a.volume_cbm.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{thb(a.revenue_thb)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-surface-alt/30 font-bold">
              <tr className="border-t-2 border-border">
                <td colSpan={2} className="px-4 py-3">รวมทั้งสิ้น</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{totalCount}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{aggregates.reduce((s, a) => s + a.box_count, 0)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{totalKg.toFixed(2)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{totalCbm.toFixed(3)}</td>
                <td className="px-4 py-3 text-right font-mono text-xs">{thb(totalRevenue)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <p className="text-[10px] text-muted">
        Source: ตาราง <code>forwarders</code> (ฝากนำเข้า) · ไม่รวม status=cancelled · ยอดจาก <code>total_price</code>
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

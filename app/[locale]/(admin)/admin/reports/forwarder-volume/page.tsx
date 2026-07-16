import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

/**
 * V-G6 #1 — Forwarder volume per period.
 *
 * Wave 7.2 (2026-05-21 night): rewritten from rebuilt `forwarders`
 * (empty on prod) → `tb_forwarder` with these column mappings:
 *   source_warehouse → fwarehousechina ("1"=Yiwu, "2"=Guangzhou)
 *   transport_type   → ftransporttype  ("1"=truck, "2"=ship, "3"=air)
 *   box_count        → famountcount
 *   weight_kg        → fweight
 *   volume_cbm       → fvolume
 *   total_price      → ftotalprice
 *   created_at       → fdate
 *   status           → fstatus (drop fstatus='99' = cancelled/special)
 *
 * Aggregates ฝากนำเข้า by (source_warehouse, transport_type) within a
 * selected period. Read-only — no schema changes.
 */

export const dynamic = "force-dynamic";

const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "อี้อู (Yiwu)",
  "2": "กวางโจว (Guangzhou)",
};
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

type FwRow = {
  fwarehousechina: string | null;
  ftransporttype:  string | null;
  famountcount:    number | null;
  fweight:         number | null;
  fvolume:         number | null;
  ftotalprice:     number | null;
  fstatus:         string | null;
  // 2026-06-12 — needed to drop MOMO หัวบิล (bill-header) from the box +
  // row counts (see filterCountableForwarderRows). A bare zero-weight
  // tracking with `-N/M` box siblings is a placeholder, not a parcel.
  ftrackingchn:    string | null;
  userid:          string | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
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
  searchParams: Promise<{ days?: string; page?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const days = Math.max(1, Math.min(365, Number(sp.days ?? 30) || 30));
  const from = daysAgoIso(days);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_forwarder")
    .select(
      "fwarehousechina,ftransporttype,famountcount,fweight,fvolume,ftotalprice,fstatus,ftrackingchn,userid",
    )
    .gte("fdate", from)
    .neq("fstatus", "99")
    .limit(10000);
  if (error) {
    console.error(`[tb_forwarder list] failed`, { code: error.code, message: error.message });
  }
  const rawRows = (data ?? []) as unknown as FwRow[];
  // 2026-06-12 — drop MOMO หัวบิล placeholders BEFORE aggregating so the
  // box count (famountcount) + the row count (count/totalCount) don't
  // double-count a split parcel (header 6 + its 6 box siblings = 12). The
  // header's weight/volume/price are 0, so those Σ are unaffected either way.
  const rows = filterCountableForwarderRows(rawRows, {
    tracking: (r) => r.ftrackingchn,
    weight: (r) => r.fweight,
    userid: (r) => r.userid,
    // ftotalprice=0 → drop an aggregate-weight bare base from the box_count Σ
    // (owner 2026-07-16 · #52559); a priced anchor stays. revenue sums ftotalprice
    // over the RAW rows below so a dropped 0-money bare loses no baht.
    money: (r) => Number(r.ftotalprice ?? 0),
  });

  // Aggregate by (warehouse, transport).
  type Agg = {
    warehouse:   string;
    transport:   string;
    count:       number;
    box_count:   number;
    weight_kg:   number;
    volume_cbm:  number;
    revenue_thb: number;
  };
  const aggMap = new Map<string, Agg>();
  for (const r of rows) {
    const w = r.fwarehousechina ?? "(unknown)";
    const t = r.ftransporttype ?? "(unknown)";
    const key = `${w}::${t}`;
    const a = aggMap.get(key) ?? {
      warehouse: w,
      transport: t,
      count: 0,
      box_count: 0,
      weight_kg: 0,
      volume_cbm: 0,
      revenue_thb: 0,
    };
    a.count += 1;
    a.box_count += Number(r.famountcount ?? 0);
    a.weight_kg += Number(r.fweight ?? 0);
    a.volume_cbm += Number(r.fvolume ?? 0);
    a.revenue_thb += Number(r.ftotalprice ?? 0);
    aggMap.set(key, a);
  }
  const aggregates = Array.from(aggMap.values()).sort((a, b) => b.revenue_thb - a.revenue_thb);

  const totalCount = rows.length;
  const totalKg = aggregates.reduce((s, a) => s + a.weight_kg, 0);
  const totalCbm = aggregates.reduce((s, a) => s + a.volume_cbm, 0);
  const totalRevenue = aggregates.reduce((s, a) => s + a.revenue_thb, 0);

  const csvCols = [
    { key: "source",  label: "ต้นทาง" },
    { key: "mode",    label: "ขนส่ง" },
    { key: "count",   label: "จำนวนรายการ" },
    { key: "boxes",   label: "กล่องรวม" },
    { key: "kg",      label: "kg รวม" },
    { key: "cbm",     label: "CBM รวม" },
    { key: "revenue", label: "ยอดเงิน (บาท)" },
  ];
  const csvRows = aggregates.map((a) => ({
    source:  WAREHOUSE_LABEL[a.warehouse] ?? a.warehouse,
    mode:    TRANSPORT_LABEL[a.transport] ?? a.transport,
    count:   a.count,
    boxes:   a.box_count,
    kg:      a.weight_kg.toFixed(2),
    cbm:     a.volume_cbm.toFixed(3),
    revenue: a.revenue_thb.toFixed(2),
  }));

  const dayOptions = [7, 30, 90, 365];

  // PERF (2026-06-03): paginate the DISPLAYED aggregate table — summary stats
  // + CSV above are over the full `aggregates` array, so they stay correct.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = aggregates.slice(offset, offset + DEFAULT_PAGE_SIZE);

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · REPORTS (V-G6)
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            ปริมาณฝากนำเข้า แยกตามต้นทาง × ขนส่ง
          </h1>
          <p className="mt-1 text-sm text-muted">
            อ่านจาก tb_forwarder · {days} วันล่าสุด · ไม่นับ fstatus=99
            (cancelled/special) · Wave 7.2 rewrite
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">ช่วงเวลา:</span>
          {dayOptions.map((d) => {
            const isActive = days === d;
            return (
              <Link
                key={d}
                href={`/admin/reports/forwarder-volume?days=${d}`}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  isActive
                    ? "border-primary-500 bg-primary-50 text-primary-700 font-medium"
                    : "border-border bg-white dark:bg-surface text-muted hover:text-foreground"
                }`}
              >
                {d} วัน
              </Link>
            );
          })}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={`pacred-forwarder-volume-${days}d.csv`} />
      </div>

      {/* Summary */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="จำนวนรายการ"  value={totalCount.toLocaleString()} />
        <Stat label="น้ำหนักรวม (kg)" value={totalKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} />
        <Stat label="ปริมาตรรวม (CBM)" value={totalCbm.toLocaleString(undefined, { maximumFractionDigits: 3 })} />
        <Stat label="ยอดเงินรวม" value={thb(totalRevenue)} small />
      </section>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[11px] text-muted">
            <tr>
              <th className="px-3 py-2.5">ต้นทาง</th>
              <th className="px-3 py-2.5">ขนส่ง</th>
              <th className="px-3 py-2.5 text-right">รายการ</th>
              <th className="px-3 py-2.5 text-right">กล่อง</th>
              <th className="px-3 py-2.5 text-right">น้ำหนัก (kg)</th>
              <th className="px-3 py-2.5 text-right">CBM</th>
              <th className="px-3 py-2.5 text-right">ยอดเงิน (THB)</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted">
                  ไม่มีรายการในช่วงนี้
                </td>
              </tr>
            ) : (
              pageRows.map((a) => (
                <tr key={`${a.warehouse}-${a.transport}`} className="border-t border-border">
                  <td className="px-3 py-2">{WAREHOUSE_LABEL[a.warehouse] ?? a.warehouse}</td>
                  <td className="px-3 py-2">{TRANSPORT_LABEL[a.transport] ?? a.transport}</td>
                  <td className="px-3 py-2 text-right font-mono">{a.count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">{a.box_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {a.weight_kg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {a.volume_cbm.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{thb(a.revenue_thb)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={aggregates.length}
        basePath="/admin/reports/forwarder-volume"
        params={{ days }}
      />

      <p className="text-[11px] text-muted">
        แสดงผลรวมจากตัวอย่าง 10,000 แถวล่าสุด · สำหรับงวดยาวขึ้น (1 ปี+) ใช้ออก CSV
        แล้ว pivot ใน Excel
      </p>
    </main>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p
        className={`mt-1 font-bold font-mono text-foreground ${small ? "text-sm" : "text-xl"}`}
      >
        {value}
      </p>
    </div>
  );
}

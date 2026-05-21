import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";

/**
 * Wave 3 cleanup (2026-05-20 ค่ำ) — V-B1 #3 containers รอเข้าโกดังไทย
 * faithful-port edition.
 *
 * Original: read from `cargo_containers` (the retired spine), sorted by ETA.
 * Now: groups `tb_forwarder` by `fcabinetnumber` (legacy single source of
 * truth — same pattern as `/admin/report-cnt`). Shows ตู้ที่ fStatus<4
 * (pre-arrival pipeline) — DISTINCT on fcabinetnumber so 50 shipments in
 * 1 container = 1 row. Aggregates: COUNT(shipments), SUM(box_count),
 * SUM(volume_cbm), oldest sealed/closed timestamp.
 */

// D1 Phase-B Wave-B5 (sidebar fidelity): sidebar funnels 2 SLA queues here
// — รอเข้าโกดังจีนเกิน 2 วัน · กำลังมาไทยเกินกำหนด. We surface ?sla= as
// a chip + banner; the underlying status filter is unchanged. Real
// threshold filters wait until the legacy PHP semantics are confirmed.
const SLA_CFG: Record<string, string> = {
  "chn-wh-2d": "รอเข้าโกดังจีนเกิน 2 วัน",
  "transit":   "กำลังมาไทยเกินกำหนด",
};

type ForwarderRow = {
  fcabinetnumber:      string;
  fdatecontainerclose: string | null;
  fdatestatus4:        string | null;
  ftransporttype:      string;
  fwarehousename:      string;
  fstatus:             string;
  fvolume:             number;
  fweight:             number;
};

type Grouped = {
  fcabinetnumber:      string;
  fdatecontainerclose: string | null;
  fdatestatus4:        string | null;
  ftransporttype:      string;
  fwarehousename:      string;
  fstatus:             string;
  shipmentCount:       number;
  totalVolume:         number;
  totalWeight:         number;
};

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ", "2": "🚢 เรือ", "3": "✈️ เครื่องบิน",
};
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};
const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ", "2": "เตรียมส่ง", "3": "กำลังส่งมาไทย",
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function groupByContainer(rows: ForwarderRow[]): Grouped[] {
  const by = new Map<string, Grouped>();
  for (const r of rows) {
    const k = r.fcabinetnumber;
    const existing = by.get(k);
    if (existing) {
      existing.shipmentCount += 1;
      existing.totalVolume += Number(r.fvolume ?? 0);
      existing.totalWeight += Number(r.fweight ?? 0);
    } else {
      by.set(k, {
        fcabinetnumber:      k,
        fdatecontainerclose: r.fdatecontainerclose,
        fdatestatus4:        r.fdatestatus4,
        ftransporttype:      r.ftransporttype,
        fwarehousename:      r.fwarehousename,
        fstatus:             r.fstatus,
        shipmentCount:       1,
        totalVolume:         Number(r.fvolume ?? 0),
        totalWeight:         Number(r.fweight ?? 0),
      });
    }
  }
  // Sort by oldest fdatecontainerclose first (overdue tubs surface)
  return Array.from(by.values()).sort((a, b) => {
    if (!a.fdatecontainerclose) return 1;
    if (!b.fdatecontainerclose) return -1;
    return a.fdatecontainerclose.localeCompare(b.fdatecontainerclose);
  });
}

export default async function ContainersAwaitingThReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; sla?: string }>;
}) {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);
  const sp = await searchParams;
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;
  const admin = createAdminClient();

  // Pull all tb_forwarder rows for ตู้ที่ยังไม่ถึงไทย (fStatus < 4)
  let q = admin
    .from("tb_forwarder")
    .select(`fcabinetnumber, fdatecontainerclose, fdatestatus4, ftransporttype,
      fwarehousename, fstatus, fvolume, fweight`)
    .not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0")
    .lt("fstatus", "4")
    .limit(50_000);
  if (sp.date_from) q = q.gte("fdatecontainerclose", sp.date_from);
  if (sp.date_to)   q = q.lte("fdatecontainerclose", sp.date_to + " 23:59:59");
  const { data } = await q;
  const grouped = groupByContainer((data ?? []) as ForwarderRow[]);

  const overdue = grouped.filter((g) => {
    const d = daysAgo(g.fdatecontainerclose);
    return d != null && d > 21;            // legacy heuristic — ปิดมา > 3 weeks = overdue
  }).length;
  const totalShipments = grouped.reduce((s, g) => s + g.shipmentCount, 0);
  const totalCbm       = grouped.reduce((s, g) => s + g.totalVolume, 0);

  const csvRows = grouped.map((g) => ({
    fcabinetnumber:      g.fcabinetnumber,
    transport:           TRANSPORT_LABEL[g.ftransporttype] ?? g.ftransporttype,
    warehouse:           WAREHOUSE_LABEL[g.fwarehousename] ?? g.fwarehousename,
    status:              STATUS_LABEL[g.fstatus] ?? g.fstatus,
    shipments:           g.shipmentCount,
    total_volume_cbm:    g.totalVolume.toFixed(3),
    total_weight_kg:     g.totalWeight.toFixed(2),
    container_closed_at: g.fdatecontainerclose ?? "",
    days_since_closed:   daysAgo(g.fdatecontainerclose) ?? "",
  }));
  const csvCols = [
    { key: "fcabinetnumber",      label: "หมายเลขตู้" },
    { key: "transport",           label: "ขนส่ง" },
    { key: "warehouse",           label: "โกดัง" },
    { key: "status",              label: "สถานะ" },
    { key: "shipments",           label: "จำนวน shipment" },
    { key: "total_volume_cbm",    label: "ปริมาตร (CBM)" },
    { key: "total_weight_kg",     label: "น้ำหนัก (kg)" },
    { key: "container_closed_at", label: "วันที่ปิดตู้" },
    { key: "days_since_closed",   label: "ปิดมาแล้วกี่วัน" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            ตู้คอนเทนเนอร์รอเข้าโกดังไทย{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">
            ตู้ที่ยัง fStatus &lt; 4 (รอตรวจสอบ → เตรียมส่ง → กำลังส่งมาไทย) — รวมจาก tb_forwarder GROUP BY fcabinetnumber
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href="/admin/reports/containers-awaiting-th"
                className="rounded-full bg-white/70 px-1.5 leading-none hover:bg-white"
                aria-label="ล้างตัวกรอง SLA"
              >
                ×
              </Link>
            </span>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ตัวกรอง SLA: {slaLabel} · กำลังพัฒนาเงื่อนไขกรอง · แสดงทุกรายการในขณะนี้
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4 justify-between">
        <AdminDateFilter dateFrom={sp.date_from} dateTo={sp.date_to} />
        <CsvButton rows={csvRows} cols={csvCols} filename={`containers-awaiting-th-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      <div className="grid sm:grid-cols-4 gap-3">
        <Card label="ตู้ทั้งหมด" value={String(grouped.length)} />
        <Card label="ปิดมา > 21 วัน" value={String(overdue)} highlight={overdue > 0} />
        <Card label="Shipments รวม" value={totalShipments.toLocaleString()} />
        <Card label="CBM รวม" value={totalCbm.toFixed(2)} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {grouped.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">🎉 ไม่มีตู้ค้าง</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">หมายเลขตู้</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">โกดัง</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">Ship / CBM</th>
                  <th className="px-4 py-3">วันที่ปิดตู้</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => {
                  const d = daysAgo(g.fdatecontainerclose);
                  const dBadge = d == null ? "bg-surface-alt text-muted border-border"
                    : d > 21 ? "bg-red-50 text-red-700 border-red-200"
                    : d > 14 ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-green-50 text-green-700 border-green-200";
                  return (
                    <tr key={g.fcabinetnumber} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/admin/report-cnt?id=${encodeURIComponent(g.fcabinetnumber)}`}
                          className="text-primary-600 hover:underline"
                        >
                          {g.fcabinetnumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">{TRANSPORT_LABEL[g.ftransporttype] ?? g.ftransporttype}</td>
                      <td className="px-4 py-3 text-xs">{WAREHOUSE_LABEL[g.fwarehousename] ?? g.fwarehousename}</td>
                      <td className="px-4 py-3 text-xs">{STATUS_LABEL[g.fstatus] ?? g.fstatus}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">
                        {g.shipmentCount}
                        <p className="text-[10px] text-muted">{g.totalVolume.toFixed(2)} CBM</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {g.fdatecontainerclose ? g.fdatecontainerclose.slice(0, 10) : <span className="text-muted">—</span>}
                        {d != null && (
                          <span className={`block mt-1 rounded-full border px-2 py-0.5 text-[10px] w-fit ${dBadge}`}>
                            ปิดมา {d} วัน
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

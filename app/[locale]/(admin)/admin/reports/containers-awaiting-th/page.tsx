import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";

// V-B1 #3: cargo_containers in transit / arrived / unloading — i.e.
// in the pipeline before they hit `closed`. Sorted by ETA (oldest ETA
// first so overdue tubs surface).

// D1 Phase-B Wave-B5 (sidebar fidelity): sidebar funnels 2 SLA queues here
// — รอเข้าโกดังจีนเกิน 2 วัน · กำลังมาไทยเกินกำหนด. We surface ?sla= as
// a chip + banner; the underlying status filter is unchanged. Real
// threshold filters (e.g. status='packing' AND now - created_at > 2d for
// chn-wh-2d, or eta < now for transit) wait until the legacy PHP
// semantics are confirmed — a stub WHERE clause would misreport tubs.
const SLA_CFG: Record<string, string> = {
  "chn-wh-2d": "รอเข้าโกดังจีนเกิน 2 วัน",
  "transit":   "กำลังมาไทยเกินกำหนด",
};

type Row = {
  id: string; code: string | null; transport_mode: string | null;
  origin: string | null; destination: string | null; status: string;
  eta: string | null; packed_at: string | null; sealed_at: string | null;
  actual_arrival: string | null; source: string;
  total_boxes: number; total_weight_kg: number; total_cbm: number;
  carrier_container_no: string | null; created_at: string;
};

const IN_FLIGHT = ["packing", "sealed", "in_transit", "arrived", "unloading"];

const STATUS_LABEL: Record<string, string> = {
  packing:    "กำลังบรรจุ",
  sealed:     "ปิดตู้แล้ว",
  in_transit: "กำลังเดินทาง",
  arrived:    "ถึงปลายทาง",
  unloading:  "กำลังขนลง",
};
const TRANSPORT_LABEL: Record<string, string> = {
  truck: "🚚 รถ", sea: "🚢 เรือ", air: "✈️ เครื่องบิน",
};

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
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

  let q = admin
    .from("cargo_containers")
    .select(`id, code, transport_mode, origin, destination, status, eta, packed_at, sealed_at,
      actual_arrival, source, total_boxes, total_weight_kg, total_cbm, carrier_container_no, created_at`)
    .in("status", IN_FLIGHT)
    .order("eta", { ascending: true, nullsFirst: false })
    .limit(500);
  if (sp.date_from) q = q.gte("created_at", sp.date_from);
  if (sp.date_to)   q = q.lte("created_at", sp.date_to + "T23:59:59");
  const { data } = await q;
  const rows = ((data ?? []) as Row[]);

  // Pull shipment counts in one IN-query
  const ids = rows.map((r) => r.id);
  const countMap = new Map<string, number>();
  if (ids.length > 0) {
    const { data: shipsData } = await admin
      .from("cargo_shipments")
      .select("cargo_container_id")
      .in("cargo_container_id", ids);
    for (const s of (shipsData ?? []) as Array<{ cargo_container_id: string }>) {
      countMap.set(s.cargo_container_id, (countMap.get(s.cargo_container_id) ?? 0) + 1);
    }
  }

  const overdue = rows.filter((r) => {
    const d = daysUntil(r.eta);
    return d != null && d < 0;
  }).length;
  const totalBoxes = rows.reduce((s, r) => s + Number(r.total_boxes ?? 0), 0);
  const totalCbm   = rows.reduce((s, r) => s + Number(r.total_cbm ?? 0), 0);

  const csvRows = rows.map((r) => ({
    code:                 r.code ?? "",
    carrier_container_no: r.carrier_container_no ?? "",
    transport:            r.transport_mode ?? "",
    origin:               r.origin ?? "",
    destination:          r.destination ?? "",
    status:               r.status,
    shipments:            countMap.get(r.id) ?? 0,
    total_boxes:          r.total_boxes,
    total_weight_kg:      r.total_weight_kg,
    total_cbm:            r.total_cbm,
    sealed_at:            r.sealed_at ?? "",
    eta:                  r.eta ?? "",
    actual_arrival:       r.actual_arrival ?? "",
    days_since_sealed:    daysAgo(r.sealed_at) ?? "",
    days_until_eta:       daysUntil(r.eta) ?? "",
    source:               r.source,
  }));
  const csvCols = [
    { key: "code",                 label: "รหัส Pacred" },
    { key: "carrier_container_no", label: "เลข B/L" },
    { key: "transport",            label: "ขนส่ง" },
    { key: "origin",               label: "ต้นทาง" },
    { key: "destination",          label: "ปลายทาง" },
    { key: "status",               label: "สถานะ" },
    { key: "shipments",            label: "Shipments" },
    { key: "total_boxes",          label: "กล่อง" },
    { key: "total_weight_kg",      label: "น้ำหนัก (kg)" },
    { key: "total_cbm",            label: "ปริมาตร (CBM)" },
    { key: "sealed_at",            label: "ปิดตู้" },
    { key: "eta",                  label: "ETA" },
    { key: "actual_arrival",       label: "ถึงจริง" },
    { key: "days_since_sealed",    label: "ปิดมาแล้วกี่วัน" },
    { key: "days_until_eta",       label: "อีกกี่วันถึง (ลบ=เกิน ETA)" },
    { key: "source",               label: "แหล่งข้อมูล" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            ตู้คอนเทนเนอร์รอเข้าโกดังไทย{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">ตู้ที่ยังไม่ปิดงาน (packing → sealed → in_transit → arrived → unloading) — ETA เก่าสุดบนสุด</p>
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
        <Card label="ตู้ทั้งหมด" value={String(rows.length)} />
        <Card label="เกิน ETA" value={String(overdue)} highlight={overdue > 0} />
        <Card label="กล่องรวม" value={totalBoxes.toLocaleString()} />
        <Card label="CBM รวม" value={totalCbm.toFixed(2)} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">🎉 ไม่มีตู้ค้าง</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">เส้นทาง</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-right">Ship/กล่อง/CBM</th>
                  <th className="px-4 py-3">ETA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const eta = daysUntil(r.eta);
                  const etaBadge = eta == null ? "bg-surface-alt text-muted border-border"
                    : eta < 0 ? "bg-red-50 text-red-700 border-red-200"
                    : eta < 3 ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-green-50 text-green-700 border-green-200";
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        {r.code ? (
                          <Link href={`/admin/warehouse/containers/${r.code}`} className="text-primary-600 hover:underline">{r.code}</Link>
                        ) : <span className="text-muted">—</span>}
                        {r.carrier_container_no && <p className="text-[10px] text-muted mt-0.5">B/L: {r.carrier_container_no}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs">{r.transport_mode ? TRANSPORT_LABEL[r.transport_mode] : "—"}</td>
                      <td className="px-4 py-3 text-xs">{r.origin ?? "—"} → {r.destination ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{STATUS_LABEL[r.status] ?? r.status}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">
                        {countMap.get(r.id) ?? 0} / {r.total_boxes}
                        <p className="text-[10px] text-muted">{Number(r.total_cbm).toFixed(2)} CBM</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.eta ? new Date(r.eta).toLocaleDateString("th-TH") : <span className="text-muted">—</span>}
                        {eta != null && (
                          <span className={`block mt-1 rounded-full border px-2 py-0.5 text-[10px] w-fit ${etaBadge}`}>
                            {eta < 0 ? `เกิน ${Math.abs(eta)} วัน` : `อีก ${eta} วัน`}
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

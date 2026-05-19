import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { CsvButton } from "@/components/admin/csv-button";

// V-B1 #1: forwarders sitting in `pending_payment` — staff sees "who hasn't paid yet"
// without asking dev. Sorted oldest first (most-overdue at top).

// D1 Phase-B Wave-B5 (sidebar fidelity): sidebar routes 2 queues here —
// รอชำระสินค้าเกิน 1 วัน (shop side / service_orders) · รอชำระค่านำเข้า
// เกิน 2 วัน (forwarder side). We surface ?sla= as a chip + banner; the
// underlying query (forwarders.status='pending_payment') is unchanged.
// shop-1d would point to service_orders entirely — we don't yet branch
// the data source by sla key since the legacy threshold + table split is
// not confirmed; faithful pass-through avoids misreporting.
const SLA_CFG: Record<string, string> = {
  "shop-1d":      "รอชำระสินค้าเกิน 1 วัน",
  "forwarder-2d": "รอชำระค่านำเข้าเกิน 2 วัน",
};

type Profile = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null } | null;
type Raw = {
  id: string; f_no: string; total_price: number; weight_kg: number | null; volume_cbm: number | null;
  transport_type: string; source_warehouse: string; created_at: string;
  profile: Profile | Profile[] | null;
};
type Row = Omit<Raw, "profile"> & { profile: Profile };

function normP(p: Profile | Profile[] | null): Profile {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function PendingPaymentsReport({
  searchParams,
}: {
  searchParams: Promise<{ date_from?: string; date_to?: string; sla?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;
  const admin = createAdminClient();

  let q = admin
    .from("forwarders")
    .select(`id, f_no, total_price, weight_kg, volume_cbm, transport_type, source_warehouse, created_at,
      profile:profiles!profile_id(member_code, first_name, last_name, phone)`)
    .eq("status", "pending_payment")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (sp.date_from) q = q.gte("created_at", sp.date_from);
  if (sp.date_to)   q = q.lte("created_at", sp.date_to + "T23:59:59");
  const { data } = await q;

  const rows: Row[] = ((data ?? []) as Raw[]).map((r) => ({ ...r, profile: normP(r.profile) }));
  const total = rows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  const overdue7 = rows.filter((r) => daysAgo(r.created_at) >= 7).length;

  const csvRows = rows.map((r) => ({
    f_no:            r.f_no,
    customer_member: r.profile?.member_code ?? "",
    customer_name:   [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
    customer_phone:  r.profile?.phone ?? "",
    total_price:     r.total_price,
    transport:       r.transport_type,
    warehouse:       r.source_warehouse,
    weight_kg:       r.weight_kg ?? "",
    volume_cbm:      r.volume_cbm ?? "",
    created_at:      r.created_at,
    days_old:        daysAgo(r.created_at),
  }));
  const csvCols = [
    { key: "f_no",            label: "เลขที่ฝากนำเข้า" },
    { key: "customer_member", label: "รหัสลูกค้า" },
    { key: "customer_name",   label: "ชื่อลูกค้า" },
    { key: "customer_phone",  label: "เบอร์" },
    { key: "total_price",     label: "ยอดรวม (บาท)" },
    { key: "transport",       label: "ประเภทขนส่ง" },
    { key: "warehouse",       label: "โกดังต้นทาง" },
    { key: "weight_kg",       label: "น้ำหนัก (kg)" },
    { key: "volume_cbm",      label: "ปริมาตร (CBM)" },
    { key: "created_at",      label: "วันที่สร้าง" },
    { key: "days_old",        label: "ค้างกี่วัน" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            ฝากนำเข้ารอชำระเงิน{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">ลูกค้าที่สั่งฝากนำเข้าแล้วแต่ยังไม่ชำระ — เก่าสุดอยู่บนสุด</p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href="/admin/reports/pending-payments"
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
        <CsvButton rows={csvRows} cols={csvCols} filename={`pending-payments-${new Date().toISOString().slice(0,10)}.csv`} />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card label="รายการ" value={String(rows.length)} />
        <Card label="ยอดรวมรอชำระ" value={thb(total)} />
        <Card label="ค้าง ≥ 7 วัน" value={String(overdue7)} highlight={overdue7 > 0} />
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">🎉 ไม่มีรายการรอชำระตามช่วงเวลานี้</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เลขที่</th>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ยอดรวม</th>
                  <th className="px-4 py-3">ขนส่ง</th>
                  <th className="px-4 py-3">โกดัง</th>
                  <th className="px-4 py-3 text-right">น้ำหนัก / CBM</th>
                  <th className="px-4 py-3">สั่งเมื่อ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const age = daysAgo(r.created_at);
                  const ageBadge = age >= 14 ? "bg-red-50 text-red-700 border-red-200"
                    : age >= 7 ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-surface-alt text-muted border-border";
                  return (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">{r.f_no}</Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <p>{[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}</p>
                        {r.profile?.member_code && <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>}
                        {r.profile?.phone && <p className="text-[10px] text-muted">☎ {r.profile.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{thb(Number(r.total_price))}</td>
                      <td className="px-4 py-3 text-xs">{r.transport_type}</td>
                      <td className="px-4 py-3 text-xs">{r.source_warehouse}</td>
                      <td className="px-4 py-3 text-right text-xs font-mono">
                        {Number(r.weight_kg ?? 0).toFixed(1)} kg
                        <p className="text-[10px] text-muted">{Number(r.volume_cbm ?? 0).toFixed(2)} CBM</p>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {new Date(r.created_at).toLocaleDateString("th-TH")}
                        <span className={`block mt-1 rounded-full border px-2 py-0.5 text-[10px] w-fit ${ageBadge}`}>
                          ค้าง {age} วัน
                        </span>
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

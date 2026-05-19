import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CsvButton } from "@/components/admin/csv-button";

// V-B1 #6: month's orders — forwarders + service_orders within selected month.
// Selector = ?month=YYYY-MM (defaults to current month).

// D1 Phase-B Wave-B5 (sidebar fidelity): the sidebar routes 3 distinct SLA
// queues here — รายการยกเลิก · สั่งซื้อรอเกิน 10 นาที · สั่งซื้อรอร้านจีนส่งเกิน 2 วัน.
// We surface the active ?sla= as a chip + banner so staff see the URL state
// honoured; the underlying query is NOT yet filtered — we don't have access
// to the legacy PHP threshold semantics (created_at vs queue_entered_at,
// etc.) and picking wrong SQL would misreport numbers worse than the
// current undifferentiated view. When the legacy thresholds are decoded,
// add real WHERE clauses + status filters per key.
const SLA_CFG: Record<string, string> = {
  "cancelled":       "รายการยกเลิกออเดอร์",
  "pending-10min":   "สั่งซื้อรอเกิน 10 นาที",
  "chn-dispatch-2d": "สั่งซื้อรอร้านจีนส่งเกิน 2 วัน",
};

type FRow = {
  id: string; f_no: string; status: string; total_price: number;
  transport_type: string; created_at: string;
  profile: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
};
type SRow = {
  id: string; h_no: string; status: string; total_thb: number; item_count: number; created_at: string;
  profile: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
};
type Profile = { member_code: string | null; first_name: string | null; last_name: string | null } | null;

function normP(p: Profile | Profile[] | null): Profile {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}
function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

function monthBounds(monthStr: string): { from: string; to: string; label: string } {
  // monthStr = "YYYY-MM"
  const [y, m] = monthStr.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to   = new Date(Date.UTC(y, m, 1)).toISOString();
  const label = `${m.toString().padStart(2, "0")}/${y}`;
  return { from, to, label };
}

export default async function MonthlyOrdersReport({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; sla?: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting"]);
  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = sp.month ?? defaultMonth;
  const { from, to, label } = monthBounds(month);
  const slaKey   = sp.sla && SLA_CFG[sp.sla] ? sp.sla : undefined;
  const slaLabel = slaKey ? SLA_CFG[slaKey] : undefined;

  const admin = createAdminClient();

  const [fRes, sRes] = await Promise.all([
    admin
      .from("forwarders")
      .select(`id, f_no, status, total_price, transport_type, created_at,
        profile:profiles!profile_id(member_code, first_name, last_name)`)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(2000),
    admin
      .from("service_orders")
      .select(`id, h_no, status, total_thb, item_count, created_at,
        profile:profiles!profile_id(member_code, first_name, last_name)`)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const forwarders = ((fRes.data ?? []) as FRow[]).map((r) => ({ ...r, profile: normP(r.profile) }));
  const orders     = ((sRes.data ?? []) as SRow[]).map((r) => ({ ...r, profile: normP(r.profile) }));

  const fTotal = forwarders.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  const sTotal = orders.reduce((s, r) => s + Number(r.total_thb ?? 0), 0);

  // Status breakdown per channel
  const fByStatus = forwarders.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});
  const sByStatus = orders.reduce<Record<string, number>>((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a; }, {});

  const csvRows = [
    ...forwarders.map((r) => ({
      channel: "forwarder",
      ref:     r.f_no,
      status:  r.status,
      amount:  r.total_price,
      created: r.created_at,
      member:  r.profile?.member_code ?? "",
      name:    [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
      extra:   r.transport_type,
    })),
    ...orders.map((r) => ({
      channel: "service_order",
      ref:     r.h_no,
      status:  r.status,
      amount:  r.total_thb,
      created: r.created_at,
      member:  r.profile?.member_code ?? "",
      name:    [r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" "),
      extra:   `${r.item_count} ชิ้น`,
    })),
  ];
  const csvCols = [
    { key: "channel", label: "ช่องทาง" },
    { key: "ref",     label: "เลขที่" },
    { key: "status",  label: "สถานะ" },
    { key: "amount",  label: "ยอด (บาท)" },
    { key: "created", label: "วันที่สร้าง" },
    { key: "member",  label: "รหัสลูกค้า" },
    { key: "name",    label: "ชื่อลูกค้า" },
    { key: "extra",   label: "หมายเหตุ" },
  ];

  // Month picker: 12 months back + current
  const monthOptions: string[] = [];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthOptions.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · รีพอร์ตเฉพาะกิจ (V-B1)</p>
          <h1 className="mt-1 text-2xl font-bold">
            ออเดอร์ในเดือน · {label}{slaLabel ? ` — ${slaLabel}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">ฝากนำเข้า + ฝากสั่งซื้อในเดือนที่เลือก (UTC)</p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรีพอร์ตหลัก</Link>
      </div>

      {slaKey && slaLabel && (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs text-primary-700">
              SLA: {slaLabel}
              <Link
                href={`/admin/reports/monthly-orders?month=${month}`}
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

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">เดือน:</span>
          {monthOptions.map((m) => (
            <Link
              key={m}
              href={`/admin/reports/monthly-orders?month=${m}`}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                m === month ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border hover:bg-surface-alt"
              }`}
            >
              {m.slice(5)}/{m.slice(2, 4)}
            </Link>
          ))}
        </div>
        <CsvButton rows={csvRows} cols={csvCols} filename={`monthly-orders-${month}.csv`} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="ฝากนำเข้า (รายการ)" value={String(forwarders.length)} />
        <Card label="ฝากนำเข้า (ยอด)" value={thb(fTotal)} />
        <Card label="ฝากสั่งซื้อ (รายการ)" value={String(orders.length)} />
        <Card label="ฝากสั่งซื้อ (ยอด)" value={thb(sTotal)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Pane title={`📦 ฝากนำเข้า — ${forwarders.length} รายการ`} statusMap={fByStatus}>
          {forwarders.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในเดือนนี้</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {forwarders.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/admin/forwarders/${r.f_no}`} className="text-primary-600 hover:underline">{r.f_no}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}
                      {r.profile?.member_code && <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(Number(r.total_price))}</td>
                    <td className="px-3 py-2 text-[10px]">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {forwarders.length > 100 && (
            <p className="p-3 text-center text-[10px] text-muted">แสดง 100 แถวแรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
          )}
        </Pane>

        <Pane title={`🛒 ฝากสั่งซื้อ — ${orders.length} รายการ`} statusMap={sByStatus}>
          {orders.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในเดือนนี้</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">เลขที่</th>
                  <th className="px-3 py-2">ลูกค้า</th>
                  <th className="px-3 py-2 text-right">ยอด</th>
                  <th className="px-3 py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 100).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/admin/service-orders/${r.h_no}`} className="text-primary-600 hover:underline">{r.h_no}</Link>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {[r.profile?.first_name, r.profile?.last_name].filter(Boolean).join(" ") || "—"}
                      {r.profile?.member_code && <p className="font-mono text-[10px] text-muted">{r.profile.member_code}</p>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(Number(r.total_thb))}</td>
                    <td className="px-3 py-2 text-[10px]">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {orders.length > 100 && (
            <p className="p-3 text-center text-[10px] text-muted">แสดง 100 แถวแรก — ดาวน์โหลด CSV เพื่อดูทั้งหมด</p>
          )}
        </Pane>
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

function Pane({ title, statusMap, children }: { title: string; statusMap: Record<string, number>; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="font-bold text-sm">{title}</h2>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
          {Object.entries(statusMap).map(([k, n]) => (
            <span key={k} className="rounded-full border border-border bg-surface-alt px-2 py-0.5">
              {k}: <span className="font-mono font-semibold">{n}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

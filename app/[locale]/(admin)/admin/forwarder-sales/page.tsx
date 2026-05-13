import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { AdminDateFilter } from "@/components/admin/date-filter";
import { LeaderPicker } from "./leader-picker";

// Port of legacy `pcs-admin/forwarder-sale.php` — sales commission
// dashboard for admins (cross-team view). PHP filtered by the logged-in
// admin's own ID; the Pacred version exposes a leader picker so super /
// accounting / management can drill into any team leader.
//
// Data source = `sales_commissions` (rows auto-emitted by Postgres
// trigger when a forwarder/service_order completes — see migration
// 0013). Each row already has the team leader + the customer + the
// base amount + locked commission percentage + status.

type Status = "all" | "unpaid" | "paid" | "cancelled";

type Profile = {
  member_code:  string | null;
  first_name:   string | null;
  last_name:    string | null;
  company_name: string | null;
};
type Leader = {
  team_code: string;
  commission_pct: number;
  profile: Profile | Profile[] | null;
};
type Row = {
  id:                  string;
  team_leader_id:      string;
  reference_type:      "forwarder" | "service_order";
  reference_id:        string;
  customer_profile_id: string;
  base_amount:         number;
  commission_pct:      number;
  commission_amount:   number;
  status:              "unpaid" | "paid" | "cancelled";
  earned_at:           string;
  paid_at:             string | null;
  customer:            Profile | Profile[] | null;
  team_leader:         Leader | Leader[] | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}
function customerLabel(p: Profile | null): string {
  if (!p) return "—";
  return p.company_name?.trim() || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "—";
}

const STATUS_BADGE: Record<string, string> = {
  unpaid:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  paid:      "bg-green-50  text-green-700  border-green-200",
  cancelled: "bg-gray-50   text-gray-700   border-gray-200",
};

export default async function AdminForwarderSalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    leader?:     string;
    status?:     string;
    date_from?:  string;
    date_to?:    string;
  }>;
}) {
  const sp = await searchParams;

  const status: Status = (sp.status === "unpaid" || sp.status === "paid" || sp.status === "cancelled")
    ? sp.status
    : "all";
  const leaderId  = sp.leader ?? "";

  // Default to current month if no range supplied — same convention as
  // the legacy PHP screen.
  const now    = new Date();
  const ym     = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  const defaultFrom = `${ym}-01`;
  const defaultTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const dateFrom = sp.date_from ?? defaultFrom;
  const dateTo   = sp.date_to   ?? defaultTo;

  const admin = createAdminClient();

  // List of all active leaders (for the picker)
  const { data: leadersRaw } = await admin
    .from("team_leaders")
    .select(`
      id, team_code, commission_pct, is_active,
      profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
    `)
    .eq("is_active", true)
    .order("team_code");

  type LeaderRow = { id: string; team_code: string; commission_pct: number; profile: Profile | Profile[] | null };
  const leaders = ((leadersRaw ?? []) as LeaderRow[]).map((l) => ({
    id:             l.id,
    team_code:      l.team_code,
    commission_pct: Number(l.commission_pct),
    display:        `${l.team_code} · ${customerLabel(normSingle(l.profile))}`,
  }));

  // Commissions query
  let q = admin
    .from("sales_commissions")
    .select(`
      id, team_leader_id, reference_type, reference_id, customer_profile_id,
      base_amount, commission_pct, commission_amount, status, earned_at, paid_at,
      customer:profiles!customer_profile_id ( member_code, first_name, last_name, company_name ),
      team_leader:team_leaders!team_leader_id (
        team_code, commission_pct,
        profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
      )
    `)
    .gte("earned_at", dateFrom)
    .lte("earned_at", dateTo + "T23:59:59")
    .order("earned_at", { ascending: false })
    .limit(2000);

  if (leaderId) q = q.eq("team_leader_id", leaderId);
  if (status !== "all") q = q.eq("status", status);

  const { data } = await q;
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    customer:    normSingle(r.customer),
    team_leader: normSingle(r.team_leader),
  }));

  // Totals
  const totalCommission = rows.reduce((s, r) => s + Number(r.commission_amount), 0);
  const totalBase       = rows.reduce((s, r) => s + Number(r.base_amount), 0);
  const unpaidTotal     = rows.filter((r) => r.status === "unpaid")
                              .reduce((s, r) => s + Number(r.commission_amount), 0);
  const paidTotal       = rows.filter((r) => r.status === "paid")
                              .reduce((s, r) => s + Number(r.commission_amount), 0);

  const csvRows: CsvRow[] = rows.map((r) => {
    const cust   = r.customer as Profile | null;
    const leader = r.team_leader as Leader | null;
    const lp     = normSingle((leader?.profile ?? null) as Profile | Profile[] | null);
    return {
      earned_at:         new Date(r.earned_at).toLocaleString("th-TH"),
      reference:         r.reference_type === "forwarder" ? `Forwarder ${r.reference_id}` : `Order ${r.reference_id}`,
      customer:          customerLabel(cust),
      customer_code:     cust?.member_code ?? "",
      team_code:         leader?.team_code ?? "",
      leader_name:       customerLabel(lp),
      base_amount:       r.base_amount,
      commission_pct:    (Number(r.commission_pct) * 100).toFixed(2) + "%",
      commission_amount: r.commission_amount,
      status:            r.status,
      paid_at:           r.paid_at ?? "",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · SALES</p>
          <h1 className="mt-1 text-2xl font-bold">รายงานค่าคอมมิชชันฝากนำเข้า</h1>
          <p className="text-sm text-muted mt-1">
            ติดตาม commission ที่เกิดจากออเดอร์ + forwarder ของลูกค้าในทีม — auto-emit เมื่อ status เปลี่ยนเป็น delivered/completed
          </p>
        </div>
        <Link
          href="/admin/team-leaders"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          🧑‍💼 จัดการ Team Leaders
        </Link>
      </div>

      {/* Filters */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <LeaderPicker
          leaders={leaders}
          currentLeaderId={leaderId}
          status={status}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
        <AdminDateFilter
          tab={`leader=${encodeURIComponent(leaderId)}&status=${status}`}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      </section>

      {/* Summary cards */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="จำนวนรายการ" value={String(rows.length)} />
        <Stat label="ยอดฐาน (Base)" value={thb(totalBase)} small />
        <Stat label="ค่าคอม (รวม)" value={thb(totalCommission)} />
        <Stat label="ยังไม่เบิก / เบิกแล้ว" value={`${thb(unpaidTotal)} / ${thb(paidTotal)}`} small />
      </section>

      {/* CSV */}
      <div className="flex justify-end">
        <CsvButton
          rows={csvRows}
          cols={[
            { key: "earned_at",         label: "วันที่เกิด commission" },
            { key: "reference",         label: "อ้างอิง" },
            { key: "customer",          label: "ลูกค้า" },
            { key: "customer_code",     label: "รหัสสมาชิก" },
            { key: "team_code",         label: "ทีม" },
            { key: "leader_name",       label: "หัวหน้าทีม" },
            { key: "base_amount",       label: "ฐาน (THB)" },
            { key: "commission_pct",    label: "%" },
            { key: "commission_amount", label: "ค่าคอม (THB)" },
            { key: "status",            label: "สถานะ" },
            { key: "paid_at",           label: "วันที่จ่าย" },
          ]}
          filename={`pacred-forwarder-sales-${dateFrom}-to-${dateTo}-${status}.csv`}
        />
      </div>

      {/* Table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-surface-alt/50 text-left uppercase tracking-wide text-[10px] sm:text-[11px] text-muted">
            <tr>
              <th className="px-3 py-2.5">วันที่</th>
              <th className="px-3 py-2.5">อ้างอิง</th>
              <th className="px-3 py-2.5">ลูกค้า</th>
              <th className="px-3 py-2.5">ทีม</th>
              <th className="px-3 py-2.5 text-right">ฐาน</th>
              <th className="px-3 py-2.5 text-right">%</th>
              <th className="px-3 py-2.5 text-right">ค่าคอม</th>
              <th className="px-3 py-2.5">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted">
                  ไม่มี commission ในช่วงที่เลือก
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const cust   = r.customer as Profile | null;
                const leader = r.team_leader as Leader | null;
                const lp     = normSingle((leader?.profile ?? null) as Profile | Profile[] | null);
                const refLink = r.reference_type === "forwarder"
                  ? `/admin/forwarders/${r.reference_id}`
                  : `/admin/service-orders/${r.reference_id}`;
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {new Date(r.earned_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={refLink} className="text-primary-600 hover:underline font-mono text-xs">
                        {r.reference_type === "forwarder" ? "F" : "O"} {r.reference_id.slice(0, 8)}
                      </Link>
                      <div className="text-[10px] text-muted">{r.reference_type}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{customerLabel(cust)}</div>
                      <div className="text-[10px] text-muted font-mono">{cust?.member_code ?? "—"}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs">{leader?.team_code ?? "—"}</div>
                      <div className="text-[10px] text-muted">{customerLabel(lp)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {thb(Number(r.base_amount))}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      {(Number(r.commission_pct) * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold text-primary-700">
                      {thb(Number(r.commission_amount))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                        {r.status === "unpaid" ? "รอเบิก" : r.status === "paid" ? "เบิกแล้ว" : "ยกเลิก"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 font-bold font-mono text-foreground ${small ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}

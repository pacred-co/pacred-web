import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import {
  Users, TrendingUp, MessageSquare, Trophy, Coins, UserPlus,
} from "lucide-react";

/**
 * V-E12 · Sales Admin role dashboard — what the sales team lead sees.
 *
 * KPIs (per spec):
 *   - New customer signups today
 *   - Pending freight quotes (lead pipeline)
 *   - This month's commission accrual (sales_rep team)
 *   - Top 5 customers by GMV (last 30d)
 *   - Lead routing queue (incoming contact_messages not claimed)
 */

export const dynamic = "force-dynamic";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function int(n: number): string {
  return n.toLocaleString("th-TH");
}
function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function nowMsServer(): number {
   
  return Date.now();
}

type AccrualRow = { accrued_amount_thb: number };
type CustomerOrderRow = {
  profile_id: string;
  total_thb: number;
  profile:
    | { member_code: string | null; first_name: string | null; last_name: string | null }
    | { member_code: string | null; first_name: string | null; last_name: string | null }[]
    | null;
};

export async function SalesAdminDashboard() {
  const admin = createAdminClient();

  const nowMs = nowMsServer();
  const now = new Date(nowMs);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thirtyDaysAgo = new Date(nowMs - 30 * 86400e3).toISOString();
  const monthLabel = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;

  const [
    signupsToday,
    signupsMonth,
    leadsUnclaimed,
    monthAccruals,
    topOrders,
    salesPayoutsPending,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", todayStart),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    admin
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "new"),
    admin
      .from("commission_accruals")
      .select("accrued_amount_thb")
      .eq("role_kind", "sales_rep")
      .gte("accrued_at", monthStart),
    admin
      .from("service_orders")
      .select("profile_id, total_thb, profile:profiles!profile_id(member_code, first_name, last_name)")
      .gte("created_at", thirtyDaysAgo)
      .neq("status", "cancelled")
      .order("total_thb", { ascending: false })
      .limit(50),
    admin
      .from("sales_payouts")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  const accrualRows = (monthAccruals.data ?? []) as AccrualRow[];
  const teamCommissionMonth = accrualRows.reduce(
    (s, r) => s + Number(r.accrued_amount_thb ?? 0),
    0,
  );

  // Aggregate top customers from raw 50-row pull (cheap in app-layer; avoids
  // a Postgres SUM+GROUP BY view).
  const orderRows = (topOrders.data ?? []) as CustomerOrderRow[];
  const customerTotals = new Map<
    string,
    { name: string; member_code: string | null; total: number; count: number }
  >();
  for (const r of orderRows) {
    const p = Array.isArray(r.profile) ? r.profile[0] : r.profile;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "—";
    const existing = customerTotals.get(r.profile_id);
    if (existing) {
      existing.total += Number(r.total_thb ?? 0);
      existing.count += 1;
    } else {
      customerTotals.set(r.profile_id, {
        name,
        member_code: p?.member_code ?? null,
        total: Number(r.total_thb ?? 0),
        count: 1,
      });
    }
  }
  const topCustomers = Array.from(customerTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <main className="p-4 lg:p-6 space-y-4">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · เซลส์</p>
        <h1 className="mt-1 text-2xl font-bold">หน้าเซลส์ (Sales Admin)</h1>
        <p className="text-xs text-muted mt-1">
          ลูกค้าใหม่ · ลีดยังไม่จัด · ค่าคอมทีม · ลูกค้า top
        </p>
      </header>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          tone="info"
          icon={<UserPlus className="h-7 w-7" />}
          label="ลูกค้าใหม่วันนี้"
          value={int(signupsToday.count ?? 0)}
          sub={`เดือนนี้รวม ${int(signupsMonth.count ?? 0)}`}
          href="/admin/customers"
        />
        <Stat
          tone="warning"
          icon={<MessageSquare className="h-7 w-7" />}
          label="ลีดใหม่ยังไม่จัด"
          value={int(leadsUnclaimed.count ?? 0)}
          sub="contact_messages · new"
          href="/admin/contact-messages"
        />
        <Stat
          tone="success"
          icon={<TrendingUp className="h-7 w-7" />}
          label={`ค่าคอม sales_rep ${monthLabel}`}
          value={thb(teamCommissionMonth)}
          sub={`${int(accrualRows.length)} accruals`}
          href="/admin/commissions"
        />
        <Stat
          tone="primary"
          icon={<Coins className="h-7 w-7" />}
          label="เบิกค่าคอมรอ"
          value={int(salesPayoutsPending.count ?? 0)}
          sub="sales_payouts · pending"
          href="/admin/sales-payouts"
        />
      </section>

      {/* Top customers (30d GMV) */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            ลูกค้า top 5 (30 วันล่าสุด · GMV)
          </h2>
          <Link href="/admin/customers" className="text-[11px] text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {topCustomers.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">ยังไม่มีออเดอร์ในช่วงนี้</p>
        ) : (
          <ul className="divide-y divide-border">
            {topCustomers.map((c, idx) => (
              <li key={c.member_code ?? idx} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-50 text-primary-700 text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono font-semibold truncate">{c.member_code ?? "—"}</p>
                    <p className="text-[11px] text-muted truncate">{c.name}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-semibold">{thb(c.total)}</p>
                  <p className="text-[11px] text-muted">{int(c.count)} ออเดอร์</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Quick links to standard sales surfaces */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h2 className="font-bold text-sm mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" />
          ลิงก์ด่วน
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuickLink href="/admin/customers" label="ลูกค้าทั้งหมด" />
          <QuickLink href="/admin/contact-messages" label="ลีด" />
          <QuickLink href="/admin/forwarder-sales" label="forwarder-sales" />
          <QuickLink href="/admin/team-leaders" label="หัวหน้าทีม" />
        </div>
      </section>
    </main>
  );
}

function Stat({
  tone, icon, label, value, sub, href,
}: {
  tone: "danger" | "info" | "success" | "primary" | "warning";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  href: string;
}) {
  const tones: Record<typeof tone, string> = {
    danger: "text-red-600",
    info: "text-cyan-600",
    success: "text-emerald-600",
    primary: "text-fuchsia-600",
    warning: "text-amber-600",
  };
  return (
    <Link href={href} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm hover:shadow-md transition-shadow block">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-2xl sm:text-3xl font-bold font-mono leading-none ${tones[tone]}`}>{value}</p>
          <p className="mt-2 text-xs font-semibold text-foreground line-clamp-2">{label}</p>
          <p className="mt-1 text-[10px] text-muted">{sub}</p>
        </div>
        <div className={`shrink-0 opacity-80 ${tones[tone]}`}>{icon}</div>
      </div>
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-alt text-center"
    >
      {label}
    </Link>
  );
}

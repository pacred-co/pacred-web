import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Languages, Coins, TrendingUp, Wallet as WalletIcon } from "lucide-react";

/**
 * V-E12 · Interpreter role dashboard — what a ล่ามจีน sees on login.
 *
 * KPIs (per spec):
 *   - This month's commission accrual (this month, gross THB)
 *   - Unpaid balance (accruals without withdrawal_item_id)
 *   - Pending withdrawal requests (CW-... awaiting approval/paid)
 *   - Recent accruals (last 5)
 *
 * Scope: SELF only — interpreter sees own commission_accruals (filter
 * by earner_admin_id = profile.id). RLS would enforce too but we filter
 * explicitly (createAdminClient is RLS-bypass).
 */

export const dynamic = "force-dynamic";

type AccrualRow = {
  id: string;
  source_kind: string;
  source_ref: string;
  base_thb: number;
  accrued_amount_thb: number;
  accrued_at: string;
  withdrawal_item_id: string | null;
};

function int(n: number): string {
  return n.toLocaleString("th-TH");
}
function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

const SOURCE_LABEL: Record<string, string> = {
  service_order: "ฝากสั่งซื้อ",
  forwarder: "ฝากนำเข้า",
  freight_quote: "ฟรีท",
};

export async function InterpreterDashboard({ userId }: { userId: string }) {
  const admin = createAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [monthAccruals, unpaidAccruals, pendingWithdrawals, recentAccruals, lifetimeTotal] =
    await Promise.all([
      admin
        .from("commission_accruals")
        .select("accrued_amount_thb")
        .eq("earner_admin_id", userId)
        .eq("role_kind", "interpreter")
        .gte("accrued_at", monthStart),
      admin
        .from("commission_accruals")
        .select("accrued_amount_thb")
        .eq("earner_admin_id", userId)
        .eq("role_kind", "interpreter")
        .is("withdrawal_item_id", null),
      admin
        .from("commission_withdrawals")
        .select("id", { count: "exact", head: true })
        .eq("earner_admin_id", userId)
        .eq("role_kind", "interpreter")
        .in("status", ["pending", "approved"]),
      admin
        .from("commission_accruals")
        .select("id, source_kind, source_ref, base_thb, accrued_amount_thb, accrued_at, withdrawal_item_id")
        .eq("earner_admin_id", userId)
        .eq("role_kind", "interpreter")
        .order("accrued_at", { ascending: false })
        .limit(8),
      admin
        .from("commission_accruals")
        .select("accrued_amount_thb")
        .eq("earner_admin_id", userId)
        .eq("role_kind", "interpreter"),
    ]);

  const monthRows = (monthAccruals.data ?? []) as Pick<AccrualRow, "accrued_amount_thb">[];
  const unpaidRows = (unpaidAccruals.data ?? []) as Pick<AccrualRow, "accrued_amount_thb">[];
  const lifetimeRows = (lifetimeTotal.data ?? []) as Pick<AccrualRow, "accrued_amount_thb">[];

  const monthGross = monthRows.reduce((s, r) => s + Number(r.accrued_amount_thb ?? 0), 0);
  const unpaidGross = unpaidRows.reduce((s, r) => s + Number(r.accrued_amount_thb ?? 0), 0);
  const lifetimeGross = lifetimeRows.reduce((s, r) => s + Number(r.accrued_amount_thb ?? 0), 0);

  const recent = (recentAccruals.data ?? []) as AccrualRow[];

  return (
    <main className="p-4 lg:p-6 space-y-4">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · ล่ามจีน</p>
        <h1 className="mt-1 text-2xl font-bold">หน้าค่าคอมล่าม (Interpreter)</h1>
        <p className="text-xs text-muted mt-1">
          ยอดค่าคอมเดือนนี้ · ยอดค้างจ่าย · ประวัติ accrual
        </p>
      </header>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          tone="info"
          icon={<TrendingUp className="h-7 w-7" />}
          label="ค่าคอมเดือนนี้"
          value={thb(monthGross)}
          sub={`${int(monthRows.length)} รายการ`}
          href="/admin/commissions"
        />
        <Stat
          tone="warning"
          icon={<Coins className="h-7 w-7" />}
          label="ยอดค้างจ่าย"
          value={thb(unpaidGross)}
          sub={`${int(unpaidRows.length)} accruals ยังไม่เบิก`}
          href="/admin/commissions"
        />
        <Stat
          tone="primary"
          icon={<WalletIcon className="h-7 w-7" />}
          label="คำขอถอนรอ"
          value={int(pendingWithdrawals.count ?? 0)}
          sub="pending + approved"
          href="/admin/commissions"
        />
        <Stat
          tone="success"
          icon={<Languages className="h-7 w-7" />}
          label="ยอดสะสมทั้งหมด"
          value={thb(lifetimeGross)}
          sub={`${int(lifetimeRows.length)} รายการ lifetime`}
          href="/admin/commissions"
        />
      </section>

      {/* Recent accruals */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm">accrual ล่าสุด</h2>
          <Link href="/admin/commissions" className="text-[11px] text-primary-600 hover:underline">
            ดูทั้งหมด →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">ยังไม่มีรายการ</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-mono font-semibold truncate">
                    {SOURCE_LABEL[r.source_kind] ?? r.source_kind} · {r.source_ref}
                  </p>
                  <p className="text-[11px] text-muted">
                    ฐาน {thb(r.base_thb)} · {new Date(r.accrued_at).toLocaleDateString("th-TH")}
                    {r.withdrawal_item_id ? " · เบิกแล้ว" : " · ยังไม่เบิก"}
                  </p>
                </div>
                <span className="font-mono font-semibold text-emerald-600 shrink-0">
                  +{thb(r.accrued_amount_thb)}
                </span>
              </li>
            ))}
          </ul>
        )}
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

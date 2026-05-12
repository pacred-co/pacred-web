import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  // Parallel fetch all pending counts (use admin client so RLS doesn't interfere)
  const [
    forwardersPending,
    serviceOrdersPending,
    yuanPaymentsPending,
    walletDepositsPending,
    walletWithdrawsPending,
    salesPayoutsPending,
    customersCount,
    forwardersTransit,
    serviceOrdersTransit,
  ] = await Promise.all([
    admin.from("forwarders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
    admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment"),
    admin.from("yuan_payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("status", "pending").eq("kind", "deposit"),
    admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("status", "pending").eq("kind", "withdraw"),
    admin.from("sales_payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("forwarders").select("id", { count: "exact", head: true }).in("status", ["shipped_china", "in_transit", "arrived_thailand", "out_for_delivery"]),
    admin.from("service_orders").select("id", { count: "exact", head: true }).in("status", ["ordered", "awaiting_chn_dispatch"]),
  ]);

  return (
    <main className="p-6 lg:p-8 space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">ภาพรวมระบบ</h1>
        <p className="mt-1 text-sm text-muted">งานที่ต้องดำเนินการวันนี้</p>
      </div>

      {/* Pending action queues */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">รอดำเนินการ</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <PendingTile
            label="ฝากนำเข้ารอชำระ"
            count={forwardersPending.count ?? 0}
            href="/admin/forwarders?status=pending_payment"
            tone="yellow"
          />
          <PendingTile
            label="ฝากสั่งรอชำระ"
            count={serviceOrdersPending.count ?? 0}
            href="/admin/service-orders?status=awaiting_payment"
            tone="yellow"
          />
          <PendingTile
            label="ฝากโอนหยวนรอตรวจ"
            count={yuanPaymentsPending.count ?? 0}
            href="/admin/yuan-payments?status=pending"
            tone="indigo"
          />
          <PendingTile
            label="ขอเติมเงินรอตรวจ"
            count={walletDepositsPending.count ?? 0}
            href="/admin/wallet?kind=deposit&status=pending"
            tone="blue"
          />
          <PendingTile
            label="ขอถอนเงินรอโอน"
            count={walletWithdrawsPending.count ?? 0}
            href="/admin/wallet?kind=withdraw&status=pending"
            tone="orange"
          />
          <PendingTile
            label="ขอเบิกค่าคอมรอตรวจ"
            count={salesPayoutsPending.count ?? 0}
            href="/admin/sales-payouts?status=pending"
            tone="green"
          />
        </div>
      </section>

      {/* In-transit summary */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted mb-3">อยู่ระหว่างขนส่ง</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <PendingTile label="ฝากนำเข้ากำลังขนส่ง" count={forwardersTransit.count ?? 0} href="/admin/forwarders?status=in_transit" tone="primary" />
          <PendingTile label="ฝากสั่งกำลังดำเนินการ" count={serviceOrdersTransit.count ?? 0} href="/admin/service-orders?status=ordered" tone="primary" />
          <PendingTile label="ลูกค้าทั้งหมด" count={customersCount.count ?? 0} href="/admin/customers" tone="muted" />
        </div>
      </section>
    </main>
  );
}

function PendingTile({ label, count, href, tone }: {
  label: string; count: number; href: string;
  tone: "yellow" | "indigo" | "blue" | "orange" | "green" | "primary" | "muted";
}) {
  const tones = {
    yellow: "from-yellow-500/10 to-yellow-500/0 border-yellow-500/30 text-yellow-700",
    indigo: "from-indigo-500/10 to-indigo-500/0 border-indigo-500/30 text-indigo-700",
    blue:   "from-blue-500/10 to-blue-500/0 border-blue-500/30 text-blue-700",
    orange: "from-orange-500/10 to-orange-500/0 border-orange-500/30 text-orange-700",
    green:  "from-green-500/10 to-green-500/0 border-green-500/30 text-green-700",
    primary:"from-primary-500/10 to-primary-500/0 border-primary-500/30 text-primary-700",
    muted:  "from-gray-500/10 to-gray-500/0 border-gray-500/30 text-gray-700",
  }[tone];
  const highlight = count > 0;
  return (
    <Link href={href} className={`block rounded-2xl border bg-gradient-to-br p-5 hover:shadow-md transition-shadow ${tones}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className={`mt-1 text-3xl font-bold font-mono ${highlight ? "text-foreground" : "text-muted"}`}>{count}</p>
      {highlight && <p className="text-[11px] mt-1">→ จัดการทันที</p>}
    </Link>
  );
}

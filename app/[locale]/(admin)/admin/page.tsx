import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

export default async function AdminDashboardPage() {
  const admin = createAdminClient();

  const [
    settings,
    inactiveCustomers,
    walletDepositsPending,
    walletWithdrawsPending,
    yuanPending,
    serviceOrdersPending,
    serviceOrdersAwaitPay,
    serviceOrdersOrdered,
    serviceOrdersChnDispatch,
    forwardersPending,
    forwardersCredit,
    forwardersInTransit,
    forwardersDelivery,
    salesPayoutsPending,
    containersActive,
    totalProfiles,
    totalForwarders,
    totalServiceOrders,
  ] = await Promise.all([
    admin.from("settings").select("yuan_rate, service_fee").eq("id", 1).maybeSingle<{ yuan_rate: number; service_fee: number }>(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("status", "incomplete"),
    admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("kind", "deposit").eq("status", "pending"),
    admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("kind", "withdraw").eq("status", "pending"),
    admin.from("yuan_payments").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
    admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment"),
    admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "ordered"),
    admin.from("service_orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_chn_dispatch"),
    admin.from("forwarders").select("id", { count: "exact", head: true }).eq("status", "pending_payment"),
    admin.from("forwarders").select("id", { count: "exact", head: true }).eq("status", "pending_payment").eq("credit_used", true),
    admin.from("forwarders").select("id", { count: "exact", head: true }).eq("status", "in_transit"),
    admin.from("forwarders").select("id", { count: "exact", head: true }).in("status", ["arrived_thailand", "out_for_delivery"]),
    admin.from("sales_payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("containers").select("id", { count: "exact", head: true }).in("status", ["preparing", "sealed", "in_transit"]),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("forwarders").select("id", { count: "exact", head: true }),
    admin.from("service_orders").select("id", { count: "exact", head: true }),
  ]);

  const yuanRate   = Number(settings.data?.yuan_rate ?? 5);
  const serviceFee = Number(settings.data?.service_fee ?? 50);

  const tabs = [
    { label: "ลูกค้าที่ยังไม่ได้ใช้งาน", count: inactiveCustomers.count ?? 0,           href: "/admin/customers?status=incomplete",            tone: "muted" as const },
    { label: "เติมเงิน",                  count: walletDepositsPending.count ?? 0,      href: "/admin/wallet?kind=deposit&status=pending",     tone: "blue" as const },
    { label: "ถอนเงิน",                   count: walletWithdrawsPending.count ?? 0,     href: "/admin/wallet?kind=withdraw&status=pending",    tone: "orange" as const },
    { label: "สั่งซื้อรอดำเนินการ",       count: serviceOrdersPending.count ?? 0,        href: "/admin/service-orders?status=pending",          tone: "muted" as const },
    { label: "รอชำระเงินสินค้า",          count: serviceOrdersAwaitPay.count ?? 0,       href: "/admin/service-orders?status=awaiting_payment", tone: "yellow" as const },
    { label: "รอร้านจีนจัดส่ง",           count: serviceOrdersOrdered.count ?? 0,        href: "/admin/service-orders?status=ordered",          tone: "blue" as const },
    { label: "รอเข้าโกดังจีน",            count: serviceOrdersChnDispatch.count ?? 0,    href: "/admin/service-orders?status=awaiting_chn_dispatch", tone: "indigo" as const },
    { label: "รอชำระเงินนำเข้า",          count: forwardersPending.count ?? 0,           href: "/admin/forwarders?status=pending_payment",      tone: "yellow" as const },
    { label: "เครดิตค้างนำเข้า",          count: forwardersCredit.count ?? 0,            href: "/admin/forwarders?status=pending_payment",      tone: "orange" as const },
    { label: "ขนส่งกลางทาง",              count: forwardersInTransit.count ?? 0,         href: "/admin/forwarders?status=in_transit",           tone: "indigo" as const },
    { label: "เตรียมส่ง/กำลังจัดส่ง",     count: forwardersDelivery.count ?? 0,          href: "/admin/forwarders?status=arrived_thailand",     tone: "primary" as const },
    { label: "ฝากโอนรอดำเนินการ",         count: yuanPending.count ?? 0,                 href: "/admin/yuan-payments?status=pending",           tone: "blue" as const },
    { label: "เบิกค่าคอมรอ",              count: salesPayoutsPending.count ?? 0,         href: "/admin/sales-payouts?status=pending",           tone: "green" as const },
    { label: "🚛 รายการตู้",              count: containersActive.count ?? 0,            href: "/admin/containers",                             tone: "primary" as const, emphasis: true },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-6">
      {/* Rate banner — sale/deposit/transfer rates pinned at top (legacy CEO.php pattern) */}
      <section className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 text-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-white/70">ADMIN — ภาพรวมระบบ</p>
            <h1 className="mt-1 text-2xl font-bold">งานที่ต้องดำเนินการวันนี้</h1>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-white">
            <RateBadge label="เรท CNY → THB" value={`฿${yuanRate.toFixed(4)}/¥`} />
            <RateBadge label="ค่าบริการ"      value={`฿${serviceFee.toFixed(2)}`} />
            <RateBadge label="ลูกค้าทั้งหมด"   value={(totalProfiles.count ?? 0).toLocaleString("th-TH")} />
          </div>
        </div>
      </section>

      {/* Counter tabs — 14 daily-ops queues */}
      <section className="flex flex-wrap gap-2">
        {tabs.map((tab) => <CounterTab key={tab.label} {...tab} />)}
      </section>

      {/* Big stats */}
      <section className="grid gap-3 sm:grid-cols-3">
        <BigStat label="ลูกค้าทั้งหมด"    value={(totalProfiles.count ?? 0).toLocaleString("th-TH")} sub="ทุก account_type" />
        <BigStat label="ฝากนำเข้าทั้งหมด" value={(totalForwarders.count ?? 0).toLocaleString("th-TH")} sub="ทุก status" />
        <BigStat label="ฝากสั่งทั้งหมด"   value={(totalServiceOrders.count ?? 0).toLocaleString("th-TH")} sub="ทุก status" />
      </section>
    </main>
  );
}

function RateBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] uppercase tracking-wider text-white/60">{label}</p>
      <p className="text-lg font-bold font-mono">{value}</p>
    </div>
  );
}

const TONE_STYLES = {
  muted:   { active: "bg-white border-border text-foreground",                  inactive: "bg-white border-border text-muted" },
  yellow:  { active: "bg-yellow-50 border-yellow-300 text-yellow-800",          inactive: "bg-white border-border text-muted" },
  blue:    { active: "bg-blue-50 border-blue-300 text-blue-800",                inactive: "bg-white border-border text-muted" },
  indigo:  { active: "bg-indigo-50 border-indigo-300 text-indigo-800",          inactive: "bg-white border-border text-muted" },
  orange:  { active: "bg-orange-50 border-orange-300 text-orange-800",          inactive: "bg-white border-border text-muted" },
  green:   { active: "bg-green-50 border-green-300 text-green-800",             inactive: "bg-white border-border text-muted" },
  primary: { active: "bg-primary-50 border-primary-300 text-primary-700",       inactive: "bg-white border-border text-muted" },
} as const;

function CounterTab({ label, count, href, tone, emphasis }: {
  label: string; count: number; href: string;
  tone: keyof typeof TONE_STYLES; emphasis?: boolean;
}) {
  const cls = count > 0 ? TONE_STYLES[tone].active : TONE_STYLES[tone].inactive;
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium hover:shadow-sm transition-shadow ${cls} ${
        emphasis ? "border-dashed border-2" : ""
      }`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary-500 text-white text-[11px] font-bold">
          {count > 999 ? "999+" : count}
        </span>
      )}
    </Link>
  );
}

function BigStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold font-mono text-foreground">{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}

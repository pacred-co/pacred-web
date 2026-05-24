import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ShoppingBasket, Box, ArrowLeftRight, Wallet as WalletIcon, Users, UserX, XCircle, Eye } from "lucide-react";
import { pickPrimaryRole } from "@/lib/admin/dashboards/pick-primary-role";
import { AccountingDashboard } from "@/components/admin/dashboards/accounting-dashboard";
import { WarehouseDashboard } from "@/components/admin/dashboards/warehouse-dashboard";
import { SalesAdminDashboard } from "@/components/admin/dashboards/sales-admin-dashboard";
import { DriverDashboard } from "@/components/admin/dashboards/driver-dashboard";
import { InterpreterDashboard } from "@/components/admin/dashboards/interpreter-dashboard";

export const dynamic = "force-dynamic";

const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

type TabKey =
  | "topup" | "withdraw" | "payShop" | "shop1" | "shop2" | "shop4"
  | "forwarder1" | "forwarder5" | "forwarderC" | "forwarder6" | "forwarder62"
  | "payment" | "inactiveCustomers";

/**
 * V-E12 · per-role dashboard dispatch.
 *
 * Single landing route — reads the signed-in admin's roles, picks the
 * primary role (priority: super > accounting > warehouse > sales_admin >
 * driver > interpreter > ops), and renders the role-specific dashboard.
 *
 * - super / ops → the comprehensive ops view below (revenue + queues + tabs)
 * - accounting → AccountingDashboard (invoice queues, WHT, refunds)
 * - warehouse → WarehouseDashboard (QA queue, containers due, orphans)
 * - sales_admin → SalesAdminDashboard (signups, leads, top customers)
 * - driver → DriverDashboard (own pickups + completed today)
 * - interpreter → InterpreterDashboard (own commission accruals)
 *
 * Per docs/port-specs/cargo-and-freight-dashboards.md (V-E12).
 */
export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // Layout already gated to "some admin"; here we just read roles to
  // dispatch. Any active admin role lands somewhere — none falls through
  // to the notFound() path.
  const { user, roles } = await requireAdmin();
  const variant = pickPrimaryRole(roles);

  if (variant === "accounting")  return <AccountingDashboard />;
  if (variant === "warehouse")   return <WarehouseDashboard />;
  if (variant === "sales_admin") return <SalesAdminDashboard />;
  if (variant === "driver")      return <DriverDashboard userId={user.id} />;
  if (variant === "interpreter") return <InterpreterDashboard userId={user.id} />;

  // super + ops → comprehensive ops view (revenue + customer KPIs + pending
  // queues + tabbed work-in-progress lists). Inlined below to avoid a
  // 600-line refactor of the existing live dashboard — fidelity first.
  const sp = await searchParams;
  const admin = createAdminClient();

  // Month range (1st of this month → now)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthLabel = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;

  // ── Sprint-21 (2026-05-25) — Owner directive: queries swap from rebuilt
  //    schema (service_orders/forwarders/yuan_payments/wallet/settings, near-empty)
  //    to LEGACY tb_* tables (where 8,898 customers + years of orders + ฿4.2M/月
  //    shop revenue actually live, post Sprint-1 prod data port).
  //    Field map (rebuilt → legacy):
  //      service_orders.total_thb     → tb_header_order.hcostallth
  //      service_orders.created_at    → tb_header_order.hdate
  //      service_orders.status enum   → tb_header_order.hstatus '1'/'2'/'4'/'6'
  //      forwarders.total_price       → tb_forwarder.ftotalprice
  //      forwarders.created_at        → tb_forwarder.fdate
  //      forwarders.status enum       → tb_forwarder.fstatus '1'/'5'/'6'/'62'
  //      forwarders.credit_used       → tb_forwarder.fcredit = '1'
  //      yuan_payments.thb_amount     → tb_payment.paythb
  //      yuan_payments.created_at     → tb_payment.paydate
  //      yuan_payments.status         → tb_payment.paystatus '1'/'2'
  //      wallet.balance               → tb_wallet.wallettotal
  //      settings.yuan_rate           → tb_settings.rsdefault (and rpdefault/hratecostsale)
  //    profiles.is_active stays — that's a Pacred-side cron-flipped flag for
  //    "has used any service", not a legacy concept.
  const [
    tbSettings,
    revShopMonth, revShopToday,
    revForwarderMonth, revForwarderToday,
    revYuanMonth, revYuanToday,
    walletTotal,
    inactiveCustomers,
    activeCustomerProfiles,
    totalProfiles,
    cancelledOrders,
    walletDepositsPending,
    walletWithdrawsPending,
    salesPayoutsPending,
    yuanPending,
    serviceOrdersPending, serviceOrdersAwaitPay, serviceOrdersOrdered, serviceOrdersChnDispatch,
    forwardersPending, forwardersCredit, forwardersDelivery, forwardersInDelivery,
    containersActive,
  ] = await Promise.all([
    admin.from("tb_settings").select("rsdefault, rpdefault, hratecostsale").eq("id", 1).maybeSingle<{ rsdefault: number; rpdefault: number; hratecostsale: number }>(),
    admin.from("tb_header_order").select("hcostallth").gte("hdate", monthStart).neq("hstatus", "6"),
    admin.from("tb_header_order").select("hcostallth").gte("hdate", todayStart).neq("hstatus", "6"),
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", monthStart),
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", todayStart),
    admin.from("tb_payment").select("paythb").gte("paydate", monthStart).eq("paystatus", "2"),
    admin.from("tb_payment").select("paythb").gte("paydate", todayStart).eq("paystatus", "2"),
    admin.from("tb_wallet").select("wallettotal"),
    // Pacred-side "has used any service" — kept on profiles (cron-flipped).
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", false),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
    admin.from("profiles").select("id", { count: "exact", head: true }),
    // Cancelled shop orders this month = hstatus='6'
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "6").gte("hdate", monthStart),
    admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("kind", "deposit").eq("status", "pending"),
    admin.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("kind", "withdraw").eq("status", "pending"),
    admin.from("sales_payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("tb_payment").select("id", { count: "exact", head: true }).eq("paystatus", "1"),
    // Shop status enums: '1'=สั่งซื้อรอดำเนินการ '2'=รอชำระเงิน '4'=รอร้านจีนจัดส่ง
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "1"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "2"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "4"),
    // Forwarder status enums: '1'=รอเข้าโกดังจีน '5'=รอชำระนำเข้า '5'+credit=เครดิตค้าง '6'=เตรียมส่ง '62'=กำลังจัดส่ง
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "1"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "5"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "5").eq("fcredit", "1"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "6"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "62"),
    // Active containers — keep on rebuilt schema (Sprint-16 just re-applied 0033)
    admin.from("cargo_containers").select("id", { count: "exact", head: true }).in("status", ["packing", "sealed", "in_transit"]),
  ]);

  const sumNum = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T): number =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const shopMonth      = sumNum(revShopMonth.data, "hcostallth");
  const shopToday      = sumNum(revShopToday.data, "hcostallth");
  const forwarderMonth = sumNum(revForwarderMonth.data, "ftotalprice");
  const forwarderToday = sumNum(revForwarderToday.data, "ftotalprice");
  const yuanMonth      = sumNum(revYuanMonth.data, "paythb");
  const yuanToday      = sumNum(revYuanToday.data, "paythb");
  const walletAll      = sumNum(walletTotal.data, "wallettotal");
  const grandTotal     = shopMonth + forwarderMonth + yuanMonth;

  // 3 distinct rates from tb_settings — เรทสั่งซื้อ (shop) / เรท Sale (cost) / เรทโอน (transfer).
  // Legacy admin top-strip showed all 3 separately (e.g. 4.99 / 4.97 / 4.95).
  const shopRate      = Number(tbSettings.data?.rsdefault ?? 5);
  const saleRate      = Number(tbSettings.data?.hratecostsale ?? 5);
  const transferRate  = Number(tbSettings.data?.rpdefault ?? 5);

  const totalProfilesCount = totalProfiles.count ?? 0;
  const activeUsers        = activeCustomerProfiles.count ?? 0;
  const inactiveUsers      = inactiveCustomers.count ?? 0;
  const activePct          = totalProfilesCount > 0 ? Math.round((activeUsers / totalProfilesCount) * 100) : 0;
  const inactivePct        = totalProfilesCount > 0 ? 100 - activePct : 0;

  // Tab counts
  const tabCounts: Record<TabKey, number> = {
    topup:              walletDepositsPending.count ?? 0,
    withdraw:           walletWithdrawsPending.count ?? 0,
    payShop:            salesPayoutsPending.count ?? 0,
    shop1:              serviceOrdersPending.count ?? 0,
    shop2:              serviceOrdersAwaitPay.count ?? 0,
    shop4:              serviceOrdersOrdered.count ?? 0,
    forwarder1:         serviceOrdersChnDispatch.count ?? 0,
    forwarder5:         forwardersPending.count ?? 0,
    forwarderC:         forwardersCredit.count ?? 0,
    forwarder6:         forwardersDelivery.count ?? 0,
    forwarder62:        forwardersInDelivery.count ?? 0,
    payment:            yuanPending.count ?? 0,
    inactiveCustomers:  inactiveUsers,
  };

  const tabDefs: { key: TabKey; label: string }[] = [
    { key: "inactiveCustomers", label: "ลูกค้าที่ยังไม่ได้ใช้งาน" },
    { key: "topup",             label: "เติมเงิน" },
    { key: "payShop",           label: "เบิกเงินค่าสินค้า" },
    { key: "withdraw",          label: "ถอนเงิน" },
    { key: "shop1",             label: "สั่งซื้อรอดำเนินการ" },
    { key: "shop2",             label: "รอชำระเงินสินค้า" },
    { key: "shop4",             label: "รอร้านจีนจัดส่ง" },
    { key: "forwarder1",        label: "รอเข้าโกดังจีน" },
    { key: "forwarder5",        label: "รอชำระเงินนำเข้า" },
    { key: "forwarderC",        label: "เครดิตค้างนำเข้า" },
    { key: "forwarder6",        label: "เตรียมส่ง" },
    { key: "forwarder62",       label: "กำลังจัดส่ง" },
    { key: "payment",           label: "ฝากโอนรอดำเนินการ" },
  ];

  const activeTab = (sp.tab && tabDefs.some((t) => t.key === sp.tab)) ? (sp.tab as TabKey) : "topup";
  const tabRows = await fetchTabRows(activeTab);

  return (
    <main className="p-4 lg:p-6 space-y-4">
      {/* ── Row 1: 4 revenue stat cards (PCS style: number + icon + progress bar) ── */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <RevenueCard
          tone="info"
          icon={<ShoppingBasket />}
          label={`ยอดฝากสั่งซื้อ ${monthLabel}`}
          monthValue={shopMonth}
          todayValue={shopToday}
          href="/admin/service-orders"
        />
        <RevenueCard
          tone="danger"
          icon={<Box />}
          label={`ยอดฝากนำเข้า ${monthLabel}`}
          monthValue={forwarderMonth}
          todayValue={forwarderToday}
          href="/admin/forwarders"
        />
        <RevenueCard
          tone="primary"
          icon={<ArrowLeftRight />}
          label={`ยอดฝากโอน ${monthLabel}`}
          monthValue={yuanMonth}
          todayValue={yuanToday}
          href="/admin/yuan-payments"
        />
        <RevenueCard
          tone="success"
          icon={<WalletIcon />}
          label="กระเป๋าสตางค์ลูกค้ารวม"
          monthValue={walletAll}
          subtitle="ยอด wallet ทั้งหมด"
          href="/admin/wallet"
        />
      </section>

      {/* ── Row 2: Rate strip (4 rates) ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <RateChip color="cyan"    label="เรทสั่งซื้อ" value={shopRate.toFixed(2)} />
          <RateChip color="red"     label="เรท Sale"   value={saleRate.toFixed(2)} />
          <RateChip color="purple"  label="เรทโอน"     value={transferRate.toFixed(2)} />
          <RateChip color="amber"   label="ยอดรวม"     value={formatTHB(grandTotal, true)} />
        </div>
      </section>

      {/* ── Row 3: User stat cards ── */}
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <UserStatCard
          tone="info"
          icon={<Users />}
          label="ลูกค้าที่ใช้งานแล้ว"
          value={activeUsers}
          progress={activePct}
          subtitle={`${activePct}% ของลูกค้าทั้งหมด`}
          href="/admin/customers/recently-active"
        />
        <UserStatCard
          tone="warning"
          icon={<UserX />}
          label="ลูกค้าที่ยังไม่ใช้งาน"
          value={inactiveUsers}
          progress={inactivePct}
          subtitle={`${inactivePct}% ของลูกค้าทั้งหมด`}
          href="/admin?tab=inactiveCustomers"
        />
        <UserStatCard
          tone="danger"
          icon={<XCircle />}
          label="ออเดอร์ที่ลูกค้ายกเลิก"
          value={cancelledOrders.count ?? 0}
          progress={100}
          subtitle={`เดือน ${THAI_MONTHS[now.getMonth()]}`}
          href="/admin/service-orders?status=cancelled"
        />
      </section>

      {/* ── Row 4: Tab strip + active tab table ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border overflow-x-auto">
          <div className="flex flex-wrap min-w-max -mb-px">
            {tabDefs.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = tabCounts[tab.key];
              return (
                <Link
                  key={tab.key}
                  href={`/admin?tab=${tab.key}`}
                  className={`inline-flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive ? "border-primary-500 text-primary-600 bg-primary-50/30" : "border-transparent text-muted hover:text-foreground hover:bg-surface-alt/50"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold px-1.5">
                      {count > 999 ? "999+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
            <Link
              href="/admin/containers"
              className="inline-flex items-center gap-2 px-3 py-2.5 text-xs sm:text-sm font-medium border-b-2 border-transparent text-muted hover:text-foreground hover:bg-surface-alt/50 whitespace-nowrap"
            >
              🚛 รายการตู้
              {(containersActive.count ?? 0) > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold px-1.5">
                  {containersActive.count}
                </span>
              )}
            </Link>
          </div>
        </div>

        <ActiveTabTable tab={activeTab} rows={tabRows} />
      </section>
    </main>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTHB(n: number, compact = false): string {
  if (compact && n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (compact && n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type RowShape = {
  id: string;
  created_at: string;
  member_code: string | null;
  customer_name: string | null;
  amount: number;
  detail: string;
  link: string;
  status: string;
};

async function fetchTabRows(tab: TabKey): Promise<RowShape[]> {
  const admin = createAdminClient();
  switch (tab) {
    case "topup": {
      const { data } = await admin.from("wallet_transactions")
        .select(`
          id, amount, created_at, slip_url, status,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .eq("kind", "deposit").eq("status", "pending")
        .order("created_at", { ascending: false }).limit(50);
      return mapWalletRows(data as RawTxRow[], "/admin/wallet");
    }
    case "withdraw": {
      const { data } = await admin.from("wallet_transactions")
        .select(`
          id, amount, created_at, slip_url, status,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .eq("kind", "withdraw").eq("status", "pending")
        .order("created_at", { ascending: false }).limit(50);
      return mapWalletRows(data as RawTxRow[], "/admin/wallet");
    }
    case "shop1": case "shop2": case "shop4": case "forwarder1": {
      const statusMap: Record<string, string> = { shop1: "pending", shop2: "awaiting_payment", shop4: "ordered", forwarder1: "awaiting_chn_dispatch" };
      const { data } = await admin.from("service_orders")
        .select(`
          id, h_no, status, total_thb, created_at, title,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .eq("status", statusMap[tab])
        .order("created_at", { ascending: false }).limit(50);
      return mapOrderRows(data as RawOrderRow[]);
    }
    case "forwarder5": case "forwarderC": case "forwarder6": case "forwarder62": {
      let query = admin.from("forwarders")
        .select(`
          id, f_no, status, total_price, created_at,
          source_warehouse, transport_type, weight_kg,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .order("created_at", { ascending: false }).limit(50);
      if (tab === "forwarder5")       query = query.eq("status", "pending_payment");
      else if (tab === "forwarderC")  query = query.eq("status", "pending_payment").eq("credit_used", true);
      else if (tab === "forwarder6")  query = query.eq("status", "arrived_thailand");
      else                            query = query.eq("status", "out_for_delivery");
      const { data } = await query;
      return mapForwarderRows(data as RawForwarderRow[]);
    }
    case "payment": {
      const { data } = await admin.from("yuan_payments")
        .select(`
          id, yuan_amount, thb_amount, channel, status, created_at,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false }).limit(50);
      return mapPaymentRows(data as RawPaymentRow[]);
    }
    case "payShop": {
      const { data } = await admin.from("sales_payouts")
        .select(`
          id, amount, status, created_at,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false }).limit(50);
      return mapPayoutRows(data as RawPayoutRow[]);
    }
    case "inactiveCustomers": {
      // Registered profiles that have never used a service (is_active=false).
      // NOT status='incomplete' — that is mid-registration juristic accounts.
      const { data } = await admin.from("profiles")
        .select("id, member_code, first_name, last_name, company_name, phone, email, created_at, account_type")
        .eq("is_active", false)
        .order("created_at", { ascending: false }).limit(50);
      return ((data ?? []) as RawProfileRow[]).map((p) => ({
        id: p.id,
        created_at: p.created_at,
        member_code: p.member_code,
        customer_name: customerNameOf(p),
        amount: 0,
        detail: `${p.phone ?? "—"}${p.email ? ` · ${p.email}` : ""}`,
        link: `/admin/customers/${p.id}`,
        status: "registered",
      }));
    }
    default:
      return [];
  }
}

type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null };
type ProfileMaybeArray = ProfileShape | ProfileShape[] | null;

function customerNameOf(p: { first_name?: string | null; last_name?: string | null; company_name?: string | null }): string {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.company_name || "—";
}

function pickProfile(p: ProfileMaybeArray): ProfileShape | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
}

type RawTxRow      = { id: string; amount: number; created_at: string; slip_url: string | null; status: string; profile: ProfileMaybeArray };
type RawOrderRow   = { id: string; h_no: string | null; status: string; total_thb: number; created_at: string; title: string | null; profile: ProfileMaybeArray };
type RawForwarderRow = { id: string; f_no: string | null; status: string; total_price: number; created_at: string; source_warehouse: string; transport_type: string; weight_kg: number; profile: ProfileMaybeArray };
type RawPaymentRow = { id: string; yuan_amount: number; thb_amount: number; channel: string; status: string; created_at: string; profile: ProfileMaybeArray };
type RawPayoutRow  = { id: string; amount: number; status: string; created_at: string; profile: ProfileMaybeArray };
type RawProfileRow = { id: string; member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null; phone: string | null; email: string | null; created_at: string; account_type: string };

function mapWalletRows(rows: RawTxRow[] | null, baseLink: string): RowShape[] {
  return (rows ?? []).map((r) => {
    const p = pickProfile(r.profile);
    return {
      id: r.id,
      created_at: r.created_at,
      member_code: p?.member_code ?? null,
      customer_name: p ? customerNameOf(p) : "—",
      amount: Number(r.amount),
      detail: r.slip_url ? `สลิป: <a class="text-blue-600 underline" href="${r.slip_url}" target="_blank">ดูสลิป</a>` : "ไม่มีสลิป",
      link: `${baseLink}/${r.id}`,
      status: r.status,
    };
  });
}

function mapOrderRows(rows: RawOrderRow[] | null): RowShape[] {
  return (rows ?? []).map((r) => {
    const p = pickProfile(r.profile);
    return {
      id: r.id,
      created_at: r.created_at,
      member_code: p?.member_code ?? null,
      customer_name: p ? customerNameOf(p) : "—",
      amount: Number(r.total_thb),
      detail: `${r.h_no ?? "—"} · ${r.title ?? "ไม่มีชื่อ"}`,
      link: r.h_no ? `/admin/service-orders/${r.h_no}` : "/admin/service-orders",
      status: r.status,
    };
  });
}

function mapForwarderRows(rows: RawForwarderRow[] | null): RowShape[] {
  return (rows ?? []).map((r) => {
    const p = pickProfile(r.profile);
    const transportLabel = r.transport_type === "truck" ? "รถ" : r.transport_type === "ship" ? "เรือ" : "อากาศ";
    return {
      id: r.id,
      created_at: r.created_at,
      member_code: p?.member_code ?? null,
      customer_name: p ? customerNameOf(p) : "—",
      amount: Number(r.total_price),
      detail: `${r.f_no ?? "—"} · ${transportLabel} · ${Number(r.weight_kg).toFixed(2)} kg`,
      link: r.f_no ? `/admin/forwarders/${r.f_no}` : "/admin/forwarders",
      status: r.status,
    };
  });
}

function mapPaymentRows(rows: RawPaymentRow[] | null): RowShape[] {
  return (rows ?? []).map((r) => {
    const p = pickProfile(r.profile);
    const channelLabel = r.channel === "alipay" ? "Alipay" : r.channel === "wechat" ? "WeChat" : "Bank";
    return {
      id: r.id,
      created_at: r.created_at,
      member_code: p?.member_code ?? null,
      customer_name: p ? customerNameOf(p) : "—",
      amount: Number(r.thb_amount),
      detail: `${channelLabel} · ¥${Number(r.yuan_amount).toFixed(2)}`,
      link: `/admin/yuan-payments/${r.id}`,
      status: r.status,
    };
  });
}

function mapPayoutRows(rows: RawPayoutRow[] | null): RowShape[] {
  return (rows ?? []).map((r) => {
    const p = pickProfile(r.profile);
    return {
      id: r.id,
      created_at: r.created_at,
      member_code: p?.member_code ?? null,
      customer_name: p ? customerNameOf(p) : "—",
      amount: Number(r.amount),
      detail: "เบิกค่าคอม / commission",
      link: `/admin/sales-payouts/${r.id}`,
      status: r.status,
    };
  });
}

// ── Cards ──────────────────────────────────────────────────────────────────

function RevenueCard({
  tone, icon, label, monthValue, todayValue, subtitle, href,
}: {
  tone: "info" | "danger" | "primary" | "success";
  icon: React.ReactNode;
  label: string;
  monthValue: number;
  todayValue?: number;
  subtitle?: string;
  href: string;
}) {
  const tones = {
    info:    { text: "text-cyan-600",    bar: "from-cyan-400 to-cyan-600" },
    danger:  { text: "text-red-600",     bar: "from-red-400 to-red-600" },
    primary: { text: "text-fuchsia-600", bar: "from-purple-400 to-fuchsia-600" },
    success: { text: "text-emerald-600", bar: "from-emerald-400 to-green-600" },
  }[tone];

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-bold leading-none ${tones.text} text-2xl sm:text-3xl font-mono`}>
              ฿{formatTHB(monthValue)}
            </p>
            <p className="mt-2 text-xs font-semibold text-foreground line-clamp-2">{label}</p>
            {todayValue !== undefined ? (
              <p className="text-[10px] text-muted mt-1">วันนี้: ฿{formatTHB(todayValue)}</p>
            ) : subtitle ? (
              <p className="text-[10px] text-muted mt-1">{subtitle}</p>
            ) : null}
          </div>
          <div className={`shrink-0 ${tones.text} w-9 h-9 [&>svg]:w-9 [&>svg]:h-9 opacity-80`}>{icon}</div>
        </div>
      </div>
      <div className="h-1.5 w-full bg-surface-alt">
        <div className={`h-full w-full bg-gradient-to-r ${tones.bar}`} />
      </div>
    </Link>
  );
}

function RateChip({ color, label, value }: { color: "cyan" | "red" | "purple" | "amber"; label: string; value: string }) {
  const colors = {
    cyan:   "text-cyan-700",
    red:    "text-red-600",
    purple: "text-purple-700",
    amber:  "text-amber-700",
  };
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-xl font-bold ${colors[color]}`}>{value}</p>
    </div>
  );
}

function UserStatCard({
  tone, icon, label, value, progress, subtitle, href,
}: {
  tone: "info" | "warning" | "danger";
  icon: React.ReactNode;
  label: string;
  value: number;
  progress: number;
  subtitle: string;
  href: string;
}) {
  const tones = {
    info:    { text: "text-cyan-600",    bar: "from-cyan-400 to-cyan-600" },
    warning: { text: "text-amber-500",   bar: "from-amber-400 to-orange-500" },
    danger:  { text: "text-red-600",     bar: "from-red-400 to-red-600" },
  }[tone];
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-border bg-white dark:bg-surface shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`font-bold leading-none ${tones.text} text-3xl font-mono`}>{value.toLocaleString("th-TH")}</p>
            <p className="mt-2 text-sm font-semibold text-foreground">{label}</p>
            <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>
          </div>
          <div className={`shrink-0 ${tones.text} w-9 h-9 [&>svg]:w-9 [&>svg]:h-9 opacity-80`}>{icon}</div>
        </div>
      </div>
      <div className="h-1.5 w-full bg-surface-alt">
        <div className={`h-full bg-gradient-to-r ${tones.bar}`} style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
    </Link>
  );
}

// ── Active tab content table ───────────────────────────────────────────────

function ActiveTabTable({ tab, rows }: { tab: TabKey; rows: RowShape[] }) {
  if (rows.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-muted">
        ไม่มีรายการในหมวดนี้
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-alt/30 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3 w-[60px]">ลำดับ</th>
            <th className="px-4 py-3 w-[140px]">วันที่สร้าง</th>
            <th className="px-4 py-3">ข้อมูลรายการ</th>
            <th className="px-4 py-3 w-[180px]">สถานะ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => {
            const created = new Date(r.created_at);
            return (
              <tr key={r.id} className="hover:bg-surface-alt/30 transition-colors">
                <td className="px-4 py-3 text-center text-sm font-mono">{i + 1}</td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                  <div>{created.toLocaleDateString("th-TH")}</div>
                  <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                </td>
                <td className="px-4 py-3 text-sm">
                  <Link href={r.link} className="text-blue-600 hover:underline font-mono text-xs">
                    {r.member_code ?? "—"}
                  </Link>{" "}
                  <span className="text-foreground">{r.customer_name}</span>
                  <p className="mt-1 text-xs text-muted" dangerouslySetInnerHTML={{ __html: r.detail }} />
                  {tab !== "inactiveCustomers" && r.amount > 0 && (
                    <p className="mt-1 text-sm font-bold text-red-600">
                      ยอดเงิน: ฿{formatTHB(r.amount)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-[11px] font-bold">
                    รอดำเนินการ
                  </span>
                  <div className="mt-2">
                    <Link
                      href={r.link}
                      className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1 text-xs font-bold shadow-sm hover:shadow-md transition-shadow"
                    >
                      <Eye className="w-3 h-3" /> ดู / แก้ไข
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

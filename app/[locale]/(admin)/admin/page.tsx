/**
 * /admin — Home dashboard (faithful port · Wave 6 P0 — 2026-05-21)
 *
 * Rewritten from the rebuilt-schema reads (service_orders / forwarders /
 * yuan_payments / profiles / wallet / wallet_transactions / sales_payouts
 * / containers) — which on production are EMPTY (the rebuilt tables were
 * never backfilled). Result before this rewrite: every revenue card showed
 * ฿0.00 and "ลูกค้าที่ยังไม่ใช้งาน: 10" (10 test profiles), instead of
 * the REAL 8,898 migrated PCS customers + 47,626 tb_forwarder rows +
 * 958 tb_cnt + thousands of tb_header_order / tb_payment / tb_wallet_hs.
 *
 * Same pattern as Wave 3 P0 #1 (`/admin/forwarders` rewrite) — every
 * stat card and every tab queue now reads the legacy `tb_*` tables
 * loaded by migration 0081. Tab labels + JSX layout are kept intact;
 * the tab keys are renamed where the rebuilt-app term no longer makes
 * sense in the legacy model (e.g. forwarder6 = fstatus='4' arrived).
 *
 * Legacy column reference:
 *   tb_users          — userid, username, userlastname, usertel, useremail,
 *                       userregistered, useractive ('1'=ใช้งานแล้ว)
 *   tb_forwarder      — fdate, fstatus ('1'..'7','99'), ftotalprice, userid,
 *                       fidorco, fcabinetnumber, fcredit, paydeposit,
 *                       fwarehousename, ftransporttype, fweight
 *   tb_header_order   — hdate, hstatus ('1'..'6'), hno, htitle, userid,
 *                       htotalpriceuser ('ราคาขายลูกค้า' THB)
 *   tb_payment        — paydate, paystatus ('1'..), paythb, payyuan, userid,
 *                       paytype ('1'=alipay '2'=wechat '3'=bank?), imagesslip
 *   tb_wallet         — userid, wallettotal (running balance)
 *   tb_wallet_hs      — date, status ('1'=รอ '2'=อนุมัติ '3'=ปฏิเสธ),
 *                       amount (>0 deposit, <0 withdraw), userid
 *   tb_cnt            — cntstatus ('1'=รอจ่าย), cntamount, date
 *   tb_settings       — rgdefault (เรทสั่งซื้อ), rsdefault (sale), rpdefault (โอน)
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, getAdminRoles } from "@/lib/auth/require-admin";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ShoppingBasket, Box, ArrowLeftRight, Wallet as WalletIcon, Users, UserX, XCircle, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

// Tab keys = the 13 bottom queues. Renamed where the legacy concept
// diverges from the rebuilt-app terminology (e.g. forwarder6 = arrived).
type TabKey =
  | "topup"               // tb_wallet_hs status='1' amount>0
  | "withdraw"            // tb_wallet_hs status='1' amount<0
  | "payShop"             // sales_payouts pending (Pacred-original — no legacy equivalent)
  | "shop1"               // tb_header_order hstatus='1' (รอดำเนินการ)
  | "shop2"               // tb_header_order hstatus='2' (รอชำระเงิน)
  | "shop4"               // tb_header_order hstatus='4' (รอร้านจีนจัดส่ง)
  | "forwarder1"          // tb_forwarder fstatus='1' (รอเข้าโกดังจีน)
  | "forwarder5"          // tb_forwarder fstatus='5' (รอชำระเงิน)
  | "forwarderC"          // tb_forwarder fcredit='1'
  | "forwarder6"          // tb_forwarder fstatus='4' (ถึงไทยแล้ว · "เตรียมส่ง" queue)
  | "forwarder62"         // tb_forwarder fstatus='6' (เตรียมส่ง / กำลังจัดส่ง)
  | "payment"             // tb_payment paystatus='1' (รอตรวจสอบ)
  | "inactiveCustomers";  // tb_users useractive='0'

export default async function AdminDashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  // 2026-05-28 — Driver landing redirect (G12 — Driver mobile UI parity sprint).
  // Drivers logging into /admin used to hit notFound() because the office
  // role gate below excludes them. Their actual home is /admin/drivers/work.
  // Done BEFORE requireAdmin so a driver-only user doesn't 404 — they
  // bounce one segment over to where their job lives.
  //
  // Multi-role admins (e.g. someone with BOTH driver + ops) still see the
  // ops dashboard — the redirect only fires when driver is the ONLY role.
  // This mirrors legacy `index.php:133` (case 7 → home/Cargo/Warehouse/Driver.php)
  // which sends pure-driver staff straight to their work queue.
  const allRoles = await getAdminRoles();
  if (allRoles && allRoles.length > 0) {
    const isDriverOnly = allRoles.every((r) => r === "driver");
    if (isDriverOnly) {
      const locale = await getLocale();
      redirect({ href: "/admin/drivers/work", locale });
    }
  }

  // W-1 (gap-admin H-2): page-level role gate. The (admin) layout only
  // proves "some admin" — driver/warehouse roles legitimately reach
  // floor-ops pages, but this dashboard exposes company-wide revenue +
  // total wallet balance + pending payouts via createAdminClient
  // (RLS-bypass). Office roles only; super implicit.
  await requireAdmin(["ops", "accounting", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Month range (1st of this month → now)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthLabel = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;

  // Stat cards — revenue & user totals. ALL queries fan-out in parallel.
  // Cancelled status (legacy):
  //   tb_forwarder.fstatus='7' = ยกเลิก
  //   tb_header_order.hstatus='6' = ยกเลิกออเดอร์
  // Note: tb_payment has no explicit cancelled state (paystatus 1=รอ);
  // we treat paystatus='2' (อนุมัติ) as the "completed" set per legacy
  // comment on the column.
  const [
    settings,
    revShopMonth, revShopToday,
    revForwarderMonth, revForwarderToday,
    revYuanMonth, revYuanToday,
    walletTotal,
    usageCountsRes,
    totalCustomersCount,
    cancelledOrdersCount,
    walletDepositsPending,
    walletWithdrawsPending,
    salesPayoutsPending,
    yuanPending,
    shop1Count, shop2Count, shop4Count,
    forwarder1Count, forwarder5Count, forwarderCreditCount,
    forwarder6Count, forwarder62Count,
    containersInTransitRows,
  ] = await Promise.all([
    admin.from("tb_settings").select("rgdefault,rsdefault,rpdefault").eq("id", 1).maybeSingle<{
      rgdefault: number | string | null;
      rsdefault: number | string | null;
      rpdefault: number | string | null;
    }>(),
    // ฝากสั่งซื้อ (shop) revenue — htotalpriceuser is the THB the customer pays.
    admin.from("tb_header_order").select("htotalpriceuser").gte("hdate", monthStart).neq("hstatus", "6"),
    admin.from("tb_header_order").select("htotalpriceuser").gte("hdate", todayStart).neq("hstatus", "6"),
    // ฝากนำเข้า (forwarder) revenue — ftotalprice is the THB charged.
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", monthStart).neq("fstatus", "7"),
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", todayStart).neq("fstatus", "7"),
    // ฝากโอน (yuan transfer) revenue — paythb is THB equivalent · paystatus='2'=อนุมัติ.
    admin.from("tb_payment").select("paythb").gte("paydate", monthStart).eq("paystatus", "2"),
    admin.from("tb_payment").select("paythb").gte("paydate", todayStart).eq("paystatus", "2"),
    // Wallet total — running balance per customer (`wallettotal`); summed in app.
    // Wave 21 P2 Phase A: This SUM fetches ALL ~8,898 rows just to reduce in JS.
    // Survey docs/research/wave-21-p2-query-survey.md §2 + §7 — to be replaced
    // by `get_dashboard_kpi()` RPC in Phase C (collapses 8 sum-reduces to 1 RTT).
    // Leaving the fetch for now: PostgREST has no SUM endpoint + accepting a
    // stale cache here would diverge from staff "always fresh" expectation.
    admin.from("tb_wallet").select("wallettotal").limit(50_000),
    // Customer usage split — ORDER-BASED (migration 0125 · เดฟ 2026-05-30).
    // used = customer with ≥1 tb_forwarder/tb_header_order · unused = approved
    // customer (userActive≠'0', not deleted) with 0 orders. Replaces the old
    // userActive-flag classification: `approveCustomer` flips userActive→'1' at
    // approval, so a just-approved customer who never shipped wrongly counted
    // as "ใช้งานแล้ว". Now usage is derived from real orders — approved-but-no-
    // shipment correctly sits in "ยังไม่ได้ใช้งาน" and graduates to "ใช้งานแล้ว"
    // the moment the first shipment lands (self-correcting, no flag-flip hook).
    // Returns one row { used, unused }; service-role only (SECURITY DEFINER).
    admin.rpc("get_customer_usage_counts"),
    admin.from("tb_users").select("ID", { count: "exact", head: true }),
    // Cancelled orders this month — hstatus='6' on tb_header_order.
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "6").gte("hdate", monthStart),
    // Pending queues (tab badge counts).
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("status", "1").gt("amount", 0),
    admin.from("tb_wallet_hs").select("id", { count: "exact", head: true }).eq("status", "1").lt("amount", 0),
    // sales_payouts — Pacred-original module (no legacy equivalent).
    // Keep the rebuilt-app read; on prod the table is empty so the badge = 0.
    // TODO Phase C: decide whether to retire this tab or wire it to a real
    // legacy commission table (tb_user_sales_admin_pay status='1' looks closest).
    admin.from("sales_payouts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    // tb_payment paystatus '1' = pending (รอตรวจสอบ).
    admin.from("tb_payment").select("id", { count: "exact", head: true }).eq("paystatus", "1"),
    // ฝากสั่งซื้อ tabs.
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "1"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "2"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "4"),
    // ฝากนำเข้า tabs — match Wave 3 forwarders rewrite + sidebar-counts.
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "1"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "5"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fcredit", "1"),
    // forwarder6 = "เตรียมส่ง" tab → legacy fstatus='4' (ถึงไทยแล้ว · need to deliver).
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "4"),
    // forwarder62 = "กำลังจัดส่ง" tab → legacy fstatus='6' (เตรียมส่ง / on-truck).
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "6"),
    // Active containers — DISTINCT fcabinetnumber from tb_forwarder where
    // pre-arrival (fstatus 1..3). Pull rows (PostgREST has no COUNT DISTINCT).
    admin.from("tb_forwarder")
      .select("fcabinetnumber")
      .not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0")
      .lt("fstatus", "4")
      .limit(50_000),
  ]);

  const sumNum = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T): number =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const shopMonth      = sumNum(revShopMonth.data, "htotalpriceuser");
  const shopToday      = sumNum(revShopToday.data, "htotalpriceuser");
  const forwarderMonth = sumNum(revForwarderMonth.data, "ftotalprice");
  const forwarderToday = sumNum(revForwarderToday.data, "ftotalprice");
  const yuanMonth      = sumNum(revYuanMonth.data, "paythb");
  const yuanToday      = sumNum(revYuanToday.data, "paythb");
  const walletAll      = sumNum(walletTotal.data, "wallettotal");
  const grandTotal     = shopMonth + forwarderMonth + yuanMonth;

  // Settings rates — default to 5.00 (parity with legacy default constants
  // when tb_settings row id=1 is missing). rgdefault = เรทสั่งซื้อ;
  // rsdefault = เรท Sale (cost); rpdefault = เรทโอน.
  const settingsRow = settings.data;
  const rateShop     = Number(settingsRow?.rgdefault ?? 5);
  const rateSale     = Number(settingsRow?.rsdefault ?? 5);
  const ratePayment  = Number(settingsRow?.rpdefault ?? 5);

  // DISTINCT fcabinetnumber count (1 ตู้ = 1 count, many shipments share).
  const activeContainersCount = new Set(
    (containersInTransitRows.data ?? []).map((r) => (r as { fcabinetnumber: string }).fcabinetnumber),
  ).size;

  // Order-based usage split (migration 0125 RPC). usageCountsRes.data is a
  // one-row set [{ used, unused }]: used = has placed ≥1 shipment/order,
  // unused = approved customer with none.
  if (usageCountsRes.error) {
    console.error(`[get_customer_usage_counts] failed`, { code: usageCountsRes.error.code, message: usageCountsRes.error.message });
  }
  const usage = (Array.isArray(usageCountsRes.data) ? usageCountsRes.data[0] : usageCountsRes.data) as
    { used: number | string; unused: number | string } | null | undefined;
  const totalUsers    = totalCustomersCount.count ?? 0;
  const activeUsers   = Number(usage?.used ?? 0);
  const inactiveUsers = Number(usage?.unused ?? 0);
  const activePct     = totalUsers > 0 ? Math.round((activeUsers / totalUsers) * 100) : 0;
  const inactivePct   = totalUsers > 0 ? Math.round((inactiveUsers / totalUsers) * 100) : 0;

  // Tab counts
  const tabCounts: Record<TabKey, number> = {
    topup:              walletDepositsPending.count ?? 0,
    withdraw:           walletWithdrawsPending.count ?? 0,
    payShop:            salesPayoutsPending.count ?? 0,
    shop1:              shop1Count.count ?? 0,
    shop2:              shop2Count.count ?? 0,
    shop4:              shop4Count.count ?? 0,
    forwarder1:         forwarder1Count.count ?? 0,
    forwarder5:         forwarder5Count.count ?? 0,
    forwarderC:         forwarderCreditCount.count ?? 0,
    forwarder6:         forwarder6Count.count ?? 0,
    forwarder62:        forwarder62Count.count ?? 0,
    payment:            yuanPending.count ?? 0,
    inactiveCustomers:  inactiveUsers,
  };

  const tabDefs: { key: TabKey; label: string }[] = [
    { key: "inactiveCustomers", label: "ลูกค้าที่ยังไม่ได้ใช้งาน" },
    { key: "topup",             label: "เติมเงิน" },
    // Wave 7.2 (ภูม audit): payShop reads rebuilt `sales_payouts` which is
    // empty on prod (Pacred-only feature · no legacy port yet · Phase C).
    // Badge always 0. Label suffixed so staff don't expect data here.
    { key: "payShop",           label: "เบิกเงินค่าสินค้า (Phase C)" },
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
      {/* Layout fix 2026-05-25: 4-col only at xl (≥1280) — was lg (≥1024) which
          overflowed on common 1366-1500px laptop viewports because the big
          ฿-numbers (text-3xl font-mono) refuse to shrink. At lg/md → 2 cols. */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
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
        {/* 4-chip rate row — push 4-col to lg (≥1024) so 1500px viewport fits */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
          <RateChip color="cyan"    label="เรทสั่งซื้อ" value={rateShop.toFixed(2)} />
          <RateChip color="red"     label="เรท Sale"   value={rateSale.toFixed(2)} />
          <RateChip color="purple"  label="เรทโอน"     value={ratePayment.toFixed(2)} />
          <RateChip color="amber"   label="ยอดรวม"     value={formatTHB(grandTotal, true)} />
        </div>
      </section>

      {/* ── Row 3: User stat cards ── */}
      {/* 3-card customer summary — push 3-col to md (≥768) to match the rate row */}
      <section className="grid gap-3 grid-cols-1 md:grid-cols-3">
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
          value={cancelledOrdersCount.count ?? 0}
          progress={100}
          subtitle={`เดือน ${THAI_MONTHS[now.getMonth()]}`}
          href="/admin/service-orders?status=cancelled"
        />
      </section>

      {/* ── Row 4: Tab strip + active tab table ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {/* Tab strip — ภูม brief 2026-05-25: ต้อง 1 แถวเดียวเสมอ (ไม่ wrap).
            Compacted px-3 py-2.5 text-xs sm:text-sm → px-2 py-2 text-xs (no sm
            bump) so 14 tabs fit in ~1100px (สบายๆ ใน sidebar-offset viewport
            ของ laptop 1500px+). overflow-x-auto fallback ถ้า viewport แคบกว่า. */}
        <div className="border-b border-border overflow-x-auto">
          <div className="flex flex-nowrap -mb-px">
            {tabDefs.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = tabCounts[tab.key];
              return (
                <Link
                  key={tab.key}
                  href={`/admin?tab=${tab.key}`}
                  className={`inline-flex items-center gap-1.5 px-2 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors ${
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
              href="/admin/report-cnt"
              className="inline-flex items-center gap-1.5 px-2 py-2 text-xs font-medium border-b-2 border-transparent text-muted hover:text-foreground hover:bg-surface-alt/50 whitespace-nowrap shrink-0"
            >
              🚛 รายการตู้
              {activeContainersCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold px-1.5">
                  {activeContainersCount}
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
  member_code: string | null;     // legacy userid (e.g. "PCS10843")
  customer_name: string | null;
  amount: number;
  detail: string;
  link: string;
  status: string;
};

type RawUserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

/**
 * Resolve a set of legacy userid → display name + phone in a single
 * tb_users query. Returns an empty Map if no ids. PostgREST `.in()` is
 * the only reliable join — the legacy FK is by `userid` text not a
 * proper relational FK (same constraint as /admin/forwarders rewrite).
 */
async function loadUsersByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, RawUserRow>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { data, error } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName,userTel")
    .in("userID", unique);
  if (error) {
    console.warn(`[tb_users list] failed (soft-fail · returning empty map)`, error);
  }
  return new Map(((data ?? []) as unknown as RawUserRow[]).map((u) => [u.userID, u]));
}

function nameOf(u: RawUserRow | undefined): string {
  if (!u) return "—";
  const n = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim();
  return n || "—";
}

async function fetchTabRows(tab: TabKey): Promise<RowShape[]> {
  const admin = createAdminClient();
  switch (tab) {
    // ── Wallet queues (tb_wallet_hs) ───────────────────────────────────────
    // Deposit pending = status='1' AND amount > 0
    // Withdraw pending = status='1' AND amount < 0
    // (legacy stores the two as same table, signed on `amount`).
    case "topup":
    case "withdraw": {
      let q = admin
        .from("tb_wallet_hs")
        .select("id,date,amount,status,imagesslip,userid")
        .eq("status", "1")
        .order("date", { ascending: false, nullsFirst: false })
        .limit(50);
      q = tab === "topup" ? q.gt("amount", 0) : q.lt("amount", 0);
      const { data, error } = await q;
      if (error) {
        console.warn(`[tb_wallet_hs list] failed (soft-fail · returning empty rows)`, error);
      }
      const rows = (data ?? []) as unknown as RawWalletHsRow[];
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      return rows.map((r) => {
        const u = users.get(r.userid);
        return {
          id: String(r.id),
          created_at: r.date ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Math.abs(Number(r.amount ?? 0)),
          detail: r.imagesslip
            ? `สลิป: <a class="text-blue-600 underline" href="${r.imagesslip}" target="_blank">ดูสลิป</a>`
            : "ไม่มีสลิป",
          link: `/admin/wallet/${r.id}`,
          status: r.status ?? "1",
        };
      });
    }

    // ── ฝากสั่งซื้อ (tb_header_order) ──────────────────────────────────────
    // shop1 = hstatus='1' (รอดำเนินการ)
    // shop2 = hstatus='2' (รอชำระเงิน)
    // shop4 = hstatus='4' (รอร้านจีนจัดส่ง)
    // forwarder1 (label "รอเข้าโกดังจีน") = tb_forwarder fstatus='1' — handled below.
    case "shop1":
    case "shop2":
    case "shop4": {
      const statusMap: Record<string, string> = { shop1: "1", shop2: "2", shop4: "4" };
      const { data, error } = await admin
        .from("tb_header_order")
        .select("id,hno,hstatus,htotalpriceuser,hdate,htitle,userid")
        .eq("hstatus", statusMap[tab])
        .order("hdate", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[tb_header_order list] failed (soft-fail · returning empty rows)`, error);
      }
      const rows = (data ?? []) as unknown as RawHeaderOrderRow[];
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      return rows.map((r) => {
        const u = users.get(r.userid);
        return {
          id: String(r.id),
          created_at: r.hdate ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Number(r.htotalpriceuser ?? 0),
          detail: `${r.hno ?? "—"} · ${r.htitle ?? "ไม่มีชื่อ"}`,
          link: r.hno ? `/admin/service-orders/${encodeURIComponent(r.hno)}` : "/admin/service-orders",
          status: r.hstatus ?? "1",
        };
      });
    }

    // ── ฝากนำเข้า (tb_forwarder) ───────────────────────────────────────────
    // forwarder1   = fstatus='1' (รอเข้าโกดังจีน)
    // forwarder5   = fstatus='5' (รอชำระเงิน)
    // forwarderC   = fcredit='1'
    // forwarder6   = fstatus='4' (ถึงไทยแล้ว · "เตรียมส่ง" queue)
    // forwarder62  = fstatus='6' (กำลังจัดส่ง)
    case "forwarder1":
    case "forwarder5":
    case "forwarderC":
    case "forwarder6":
    case "forwarder62": {
      let q = admin
        .from("tb_forwarder")
        .select("id,fdate,fstatus,fidorco,ftotalprice,ftransporttype,fweight,userid,fcabinetnumber,fcredit")
        .order("fdate", { ascending: false, nullsFirst: false })
        .limit(50);
      if      (tab === "forwarder1")  q = q.eq("fstatus", "1");
      else if (tab === "forwarder5")  q = q.eq("fstatus", "5");
      else if (tab === "forwarderC")  q = q.eq("fcredit", "1");
      else if (tab === "forwarder6")  q = q.eq("fstatus", "4");
      else                            q = q.eq("fstatus", "6");
      const { data, error } = await q;
      if (error) {
        console.warn(`[tb_forwarder list] failed (soft-fail · returning empty rows)`, error);
      }
      const rows = (data ?? []) as unknown as RawForwarderRow[];
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      return rows.map((r) => {
        const u = users.get(r.userid);
        const transportLabel =
          r.ftransporttype === "1" ? "🚛 รถ"
          : r.ftransporttype === "2" ? "🚢 เรือ"
          : r.ftransporttype === "3" ? "✈️ แอร์"
          : r.ftransporttype ?? "—";
        const fno = r.fidorco ?? String(r.id);
        return {
          id: String(r.id),
          created_at: r.fdate ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Number(r.ftotalprice ?? 0),
          detail: `${fno} · ${transportLabel} · ${Number(r.fweight ?? 0).toFixed(2)} kg`,
          link: `/admin/forwarders/${encodeURIComponent(fno)}`,
          status: r.fstatus ?? "1",
        };
      });
    }

    // ── ฝากโอน (tb_payment) ────────────────────────────────────────────────
    // paystatus '1' = รอตรวจสอบ; legacy paytype 1=alipay 2=wechat 3=bank.
    case "payment": {
      const { data, error } = await admin
        .from("tb_payment")
        .select("id,paydate,paystatus,paytype,payyuan,paythb,userid")
        .eq("paystatus", "1")
        .order("paydate", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[tb_payment list] failed (soft-fail · returning empty rows)`, error);
      }
      const rows = (data ?? []) as unknown as RawPaymentRow[];
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      return rows.map((r) => {
        const u = users.get(r.userid);
        const channelLabel =
          r.paytype === "1" ? "Alipay"
          : r.paytype === "2" ? "WeChat"
          : r.paytype === "3" ? "Bank"
          : (r.paytype ?? "—");
        return {
          id: String(r.id),
          created_at: r.paydate ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Number(r.paythb ?? 0),
          detail: `${channelLabel} · ¥${Number(r.payyuan ?? 0).toFixed(2)}`,
          link: `/admin/yuan-payments/${r.id}`,
          status: r.paystatus ?? "1",
        };
      });
    }

    // ── เบิกเงินค่าสินค้า (sales_payouts — Pacred-original) ────────────────
    // No 1:1 legacy table. Closest legacy is tb_user_sales_admin_pay
    // (status='1' = รออนุมัติ) but it pays the SALES STAFF, not the
    // customer — semantically different. Keep the rebuilt read for now;
    // on prod the table is empty so the tab will say "no rows" until
    // Phase C decides whether to retire the tab or re-wire it.
    // TODO Phase C — see file header.
    case "payShop": {
      const { data, error } = await admin
        .from("sales_payouts")
        .select(`
          id, amount, status, created_at,
          profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
        `)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.warn(`[sales_payouts list] failed (soft-fail · returning empty rows)`, error);
      }
      return ((data ?? []) as RawPayoutRow[]).map((r) => {
        const p = pickProfile(r.profile);
        return {
          id: String(r.id),
          created_at: r.created_at,
          member_code: p?.member_code ?? null,
          customer_name: p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.company_name || "—" : "—",
          amount: Number(r.amount),
          detail: "เบิกค่าคอม / commission",
          link: `/admin/sales-payouts/${r.id}`,
          status: r.status,
        };
      });
    }

    // ── ลูกค้าที่ยังไม่ได้ใช้งาน — ORDER-BASED (migration 0125) ──────────
    // Approved customers (userActive≠'0', not deleted) with ZERO orders, via
    // the list_unused_customers RPC. Matches the order-based count card above:
    // a just-approved customer who hasn't shipped shows here, and disappears
    // once their first tb_forwarder/tb_header_order lands.
    case "inactiveCustomers": {
      const { data, error } = await admin.rpc("list_unused_customers", { p_limit: 50 });
      if (error) {
        console.warn(`[list_unused_customers] failed (soft-fail · returning empty map)`, error);
      }
      const rows = (data ?? []) as unknown as RawUserListRow[];
      return rows.map((u) => ({
        id: String(u.ID),
        created_at: u.userRegistered ?? "",
        member_code: u.userID,
        customer_name: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—",
        amount: 0,
        detail: `${u.userTel ?? "—"}${u.userEmail ? ` · ${u.userEmail}` : ""}`,
        link: `/admin/customers/${u.userID}`,
        status: "registered",
      }));
    }

    default:
      return [];
  }
}

// ── Raw row types ──────────────────────────────────────────────────────────

type RawWalletHsRow   = { id: number | string; date: string | null; amount: number | string; status: string | null; imagesslip: string | null; userid: string };
type RawHeaderOrderRow = { id: number | string; hno: string | null; hstatus: string | null; htotalpriceuser: number | string; hdate: string | null; htitle: string | null; userid: string };
type RawForwarderRow  = { id: number | string; fdate: string | null; fstatus: string | null; fidorco: string | null; ftotalprice: number | string; ftransporttype: string | null; fweight: number | string; userid: string; fcabinetnumber: string | null; fcredit: string | null };
type RawPaymentRow    = { id: number | string; paydate: string | null; paystatus: string | null; paytype: string | null; payyuan: number | string; paythb: number | string; userid: string };
type RawUserListRow   = { ID: number | string; userID: string; userName: string | null; userLastName: string | null; userTel: string | null; userEmail: string | null; userRegistered: string | null; userCompany: string | null };

// sales_payouts (rebuilt schema · the one tab without a legacy equivalent)
type ProfileShape       = { member_code: string | null; first_name: string | null; last_name: string | null; company_name: string | null };
type ProfileMaybeArray  = ProfileShape | ProfileShape[] | null;
type RawPayoutRow       = { id: string; amount: number; status: string; created_at: string; profile: ProfileMaybeArray };

function pickProfile(p: ProfileMaybeArray): ProfileShape | null {
  if (!p) return null;
  return Array.isArray(p) ? (p[0] ?? null) : p;
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
    primary: { text: "text-primary-600", bar: "from-primary-400 to-primary-600" },
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
            const created = r.created_at ? new Date(r.created_at) : null;
            return (
              <tr key={r.id} className="hover:bg-surface-alt/30 transition-colors">
                <td className="px-4 py-3 text-center text-sm font-mono">{i + 1}</td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (
                    <>
                      <div>{created.toLocaleDateString("th-TH")}</div>
                      <div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div>
                    </>
                  ) : (
                    <div>—</div>
                  )}
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

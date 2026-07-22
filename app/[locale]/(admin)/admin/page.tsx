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
 * sense in the legacy model (e.g. forwarder6 = fstatus='6' เตรียมส่ง).
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
 *   tb_settings       — hratecostdefault (เรทสั่งซื้อ/ต้นทุน), rsdefault (sale), rpdefault (โอน)
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBillingIdentity } from "@/lib/admin/customer-identity";
import { unstable_cache } from "next/cache";
import { resolveLegacyUrl, resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { getSignedBucketUrl } from "@/lib/storage/upload";
import { SlipImage } from "@/components/admin/slip-image";
import { RevenueCarouselCard } from "@/components/admin/revenue-carousel-card";
import { getWalletSystemTotals } from "@/lib/admin/wallet-totals";
import { pendingTopupFilter, pendingWithdrawFilter } from "@/lib/wallet/wallet-hs";
import { collapseWalletBillingPairs, computeTopupBadge } from "@/lib/admin/topup-slip-dedup";
import { computeBillWht } from "@/lib/billing/wht";
import { requireAdmin, getAdminRoles } from "@/lib/auth/require-admin";
import { resolveViewAsRole } from "@/lib/admin/view-as-role";
import { isGodRole } from "@/lib/admin/god-role";
import { canViewCost } from "@/lib/admin/money-visibility";
import { Link, redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { ShoppingBasket, Box, ArrowLeftRight, Wallet as WalletIcon, Users, UserX, XCircle, Eye, LayoutGrid, ArrowRight } from "lucide-react";
import { relativeTimeTh } from "@/lib/utils/relative-time";

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
  | "shop3"               // tb_header_order hstatus='3' (สั่งสินค้า · ชำระแล้ว · Pacred ต้องสั่งจีน)
  | "shop4"               // tb_header_order hstatus='4' (รอร้านจีนจัดส่ง)
  | "forwarder1"          // tb_forwarder fstatus='1' (รอเข้าโกดังจีน)
  | "forwarder5"          // tb_forwarder fstatus='5' (รอชำระเงิน)
  | "forwarderC"          // tb_forwarder fcredit='1'
  | "forwarder6"          // tb_forwarder fstatus='6' NOT in an open driver batch (เตรียมส่ง)
  | "forwarder62"         // tb_forwarder fstatus='6' WITH an open driver-item (กำลังจัดส่ง)
  | "payment"             // tb_payment paystatus='1' (รอตรวจสอบ)
  | "inactiveCustomers";  // tb_users useractive='0'

// next-action hint per queue (self-explaining-row §0g) — "ให้พนักงานทำอะไรต่อ" so a
// glance at the dashboard says what to do, not just "รอดำเนินการ".
const TAB_NEXT: Record<TabKey, string> = {
  topup:             "ตรวจสลิป → อนุมัติ/ตัดจ่าย",
  withdraw:          "ตรวจ → จ่ายเงินคืน",
  payShop:           "ตรวจ → จ่ายค่าคอม/ร้านค้า",
  shop1:             "ตรวจ/เปิดราคา",
  shop2:             "รอลูกค้าชำระ/ตรวจสลิป",
  shop3:             "สั่งซื้อจากจีน",
  shop4:             "รอร้านจีนจัดส่งเข้าโกดัง",
  forwarder1:        "รอสินค้าเข้าโกดังจีน",
  forwarder5:        "รอลูกค้าชำระ/ตรวจสลิป",
  forwarderC:        "ติดตามเครดิต/เก็บเงิน",
  forwarder6:        "ตรวจ/แจ้งเก็บเงิน",
  forwarder62:       "มอบงานคนขับ/จัดรถ",
  payment:           "ตรวจสลิป → อนุมัติ/ตัดจ่าย",
  inactiveCustomers: "ติดตามลูกค้า",
};

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
  // 👁 VIEW-AS-ROLE (2026-07-22 · ภูม audit tool) — a real god previewing a role
  // must LAND where that role really lands, so the preview shows the department's
  // true first screen (warehouse → /admin/warehouse/home, driver → work queue,
  // a no-dashboard role → its workspace) instead of the CEO dashboard. `previewRole`
  // is non-null ONLY for a real god + a valid, money-tier-safe cookie
  // (resolveViewAsRole); for everyone else `effectiveRoles === allRoles` so the
  // real-role landing below is byte-for-byte unchanged. The requireAdmin() office
  // gate further down still reads REAL roles — security never changes; this only
  // routes a previewing god to a lower role's home.
  const previewRole = await resolveViewAsRole(allRoles ?? []);
  const effectiveRoles = previewRole ? [previewRole] : (allRoles ?? []);
  if (effectiveRoles.length > 0) {
    const isDriverOnly = effectiveRoles.every((r) => r === "driver");
    if (isDriverOnly) {
      const locale = await getLocale();
      redirect({ href: "/admin/drivers/work", locale });
    }
    // 2026-06-08 (ภูม warehouse-handoff round 4 · pre-handoff browser smoke):
    // Same pattern as driver-only. Warehouse staff (เบียร์/แหวน/มาร์ค)
    // login via the legacy bridge → bridge auto-provisions admins row
    // role='warehouse' → user lands on /admin → requireAdmin below
    // rejects warehouse → notFound() → first-screen 404 for every staff.
    // Caught with a real end-to-end test login (admin_test_warehouse)
    // pre-handoff.
    // 2026-07-18 (owner): the warehouse role now has its OWN handheld home —
    // the faithful PCS warehouse-staff launcher (4 summary cards + bottom
    // tab-bar) at /admin/warehouse/home. Land warehouse-only staff there.
    const isWarehouseOnly = effectiveRoles.every((r) => r === "warehouse");
    if (isWarehouseOnly) {
      const locale = await getLocale();
      redirect({ href: "/admin/warehouse/home", locale });
    }
    // 👁 A previewed role with NO CEO-dashboard access (pricing / interpreter /
    // purchaser* / freight_*) → its faithful home is the universal per-position
    // workspace (/admin/workspace · gate = any admin). `previewRole`-guarded so a
    // REAL non-dashboard role never hits this (its pre-existing /admin 404 is out
    // of scope); super/normies previews stay on /admin (god-nav). The list mirrors
    // the office requireAdmin([...]) gate below.
    const DASHBOARD_LANDING = ["ops", "accounting", "sales_admin", "sales", "qa", "manager"];
    if (previewRole && !DASHBOARD_LANDING.includes(previewRole) && !isGodRole([previewRole])) {
      const locale = await getLocale();
      redirect({ href: "/admin/workspace", locale });
    }
  }

  // W-1 (gap-admin H-2): page-level role gate. The (admin) layout only
  // proves "some admin" — driver/warehouse roles legitimately reach
  // floor-ops pages (they're redirected above), but this dashboard
  // exposes company-wide revenue + total wallet balance + pending payouts
  // via createAdminClient (RLS-bypass). Office roles only; super implicit.
  //
  // 2026-06-08 (ภูม pre-handoff round 5 · proactive role-coverage):
  // Expanded from ["ops","accounting","sales_admin"] to include "sales"
  // (Cargo Sales Staff #30 · legacy doc lines 792-870 — same operational
  // dashboard as sales_admin minus approval rights) + "qa" (QA & QC staff
  // #5) + "manager" (Cargo Manager — added 0118 · super-without-grants).
  // Without these, a freshly-provisioned non-super staff in these 3 roles
  // would 404 on /admin (same warehouse pattern caught round 4 with the
  // live test-account login). All 3 are office roles that ops/accounting
  // legitimately collaborate with — same data sensitivity tier.
  //
  // NOT included: interpreter (legitimately has its own landing — TODO
  // when interpreter portal lands; for now they 404 + need a redirect like
  // warehouse/driver got) and freight_* roles (Theme 8 not live yet).
  await requireAdmin([
    "ops", "accounting", "sales_admin", "sales", "qa", "manager",
  ]);

  const sp = await searchParams;
  // Month label for display; the heavy metrics fan-out runs inside the cached
  // helper below (it computes its own date boundaries).
  const now = new Date();
  const monthLabel = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;

  // Stat cards — revenue & user totals. ALL queries fan-out in parallel.
  // Cancelled status (legacy):
  //   tb_forwarder.fstatus='7' = ยกเลิก
  //   tb_header_order.hstatus='6' = ยกเลิกออเดอร์
  // Note: tb_payment has no explicit cancelled state (paystatus 1=รอ);
  // we treat paystatus='2' (อนุมัติ) as the "completed" set per legacy
  // comment on the column.
  // PERF (2026-06-03): the system-wide wallet total was pulled out of this
  // fan-out into the cached getWalletSystemTotals() helper (60 s TTL · shared
  // with /admin/wallet). It used to pull ~9k rows + sum in JS on every
  // dashboard load. Kick it off concurrently with the big query batch below.
  const walletTotalsPromise = getWalletSystemTotals();
  const [
    settings,
    revShopMonth, revShopToday,
    revForwarderMonth, revForwarderToday,
    revYuanMonth, revYuanToday,
    usageCountsRes,
    totalCustomersCount,
    cancelledOrdersCount,
    walletWithdrawsPending,
    salesPayoutsPending,
    yuanPending,
    shop1Count, shop2Count, shop3Count, shop4Count,
    forwarder1Count, forwarder5Count, forwarderCreditCount,
    fstatus6IdsRes, openDriverFidsRes,
    containersInTransitRows,
  ] = await unstable_cache(
    async () => {
      // PERF (owner 2026-06-29 "ระบบช้า"): the 25-query metrics fan-out runs at
      // most once per 60 s (global key · same pattern as getWalletSystemTotals),
      // instead of on every dashboard load. Self-contained: own admin client +
      // date boundaries so it's safe inside unstable_cache (service-role, no cookies).
      const admin = createAdminClient();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return Promise.all([
    admin.from("tb_settings").select("hratecostdefault,rsdefault,rpdefault").eq("id", 1).maybeSingle<{
      hratecostdefault: number | string | null;
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
    // Pending withdraw queue (tab badge count). Routes through the shared SOT filter
    // (lib/wallet/wallet-hs.ts) so the dashboard tab + the sidebar badge always agree,
    // and direction is keyed off `type` — NEVER the amount sign (amounts are stored
    // POSITIVE, so the old `.lt('amount',0)` withdraw filter matched nothing).
    // (The TOPUP badge is computed separately via computeTopupBadge so it can net out
    //  the wallet↔ใบวางบิล เบิ้ล — GOAL 1. See below.)
    pendingWithdrawFilter(admin.from("tb_wallet_hs").select("id", { count: "exact", head: true })),
    // payShop queue — repointed to the LIVE tb_shop_pay_h (real INSERT at
    // actions/admin/shop-disbursement.ts; the old rebuilt `sales_payouts` twin was 0-row).
    // Count + list both read tb_shop_pay_h status='1' (same source — no drift).
    admin.from("tb_shop_pay_h").select("id", { count: "exact", head: true }).eq("status", "1"),
    // tb_payment paystatus '1' = pending (รอตรวจสอบ).
    admin.from("tb_payment").select("id", { count: "exact", head: true }).eq("paystatus", "1"),
    // ฝากสั่งซื้อ tabs.
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "1"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "2"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "3"),
    admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", "4"),
    // ฝากนำเข้า tabs — match Wave 3 forwarders rewrite + sidebar-counts.
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "1"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", "5"),
    admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fcredit", "1"),
    // เตรียมส่ง(6) / กำลังจัดส่ง(62) — partition fstatus=6 by open driver-item (legacy
    // forwarder6.php = fStatus6 NOT-with-open-driver · forwarder62.php = fStatus6 WITH
    // open driver-item [fdiStatus '' / '1' = assigned, not delivered]). Fetch the id
    // sets → compute the two counts after the fan-out.
    admin.from("tb_forwarder").select("id").eq("fstatus", "6").limit(50_000),
    admin.from("tb_forwarder_driver_item").select("fid").or("fdistatus.eq.,fdistatus.eq.1,fdistatus.is.null").limit(50_000),
    // Active containers — DISTINCT fcabinetnumber from tb_forwarder where
    // pre-arrival (fstatus 1..3). Pull rows (PostgREST has no COUNT DISTINCT).
    admin.from("tb_forwarder")
      .select("fcabinetnumber")
      .not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0")
      .lt("fstatus", "4")
      .limit(50_000),
      ]);
    },
    ["admin-dashboard-fanout"],
    { revalidate: 60 },
  )();

  const sumNum = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T): number =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

  const shopMonth      = sumNum(revShopMonth.data, "htotalpriceuser");
  const shopToday      = sumNum(revShopToday.data, "htotalpriceuser");
  const forwarderMonth = sumNum(revForwarderMonth.data, "ftotalprice");
  const forwarderToday = sumNum(revForwarderToday.data, "ftotalprice");
  const yuanMonth      = sumNum(revYuanMonth.data, "paythb");
  const yuanToday      = sumNum(revYuanToday.data, "paythb");
  const walletTotals   = await walletTotalsPromise;
  const walletAll      = walletTotals.sumWallet;
  // Negative TOTAL = customers whose wallet went negative from an unbalanced
  // legacy "เติม-แล้วจ่าย" pay (the −pay leg settled without its +topup credit).
  // owner 2026-06-25: ติดลบ "ไม่ควรปล่อย" — ลูกค้าจ่ายมาแล้ว ต้องแก้ได้ในระบบ → guide
  // staff ไป "บันทึกการชำระ + แนบสลิป" ที่หน้า wallet (เติม +|ติดลบ| ลง tb_wallet.wallettotal
  // = เคลียร์จริง). การ์ดลิงก์ /admin/wallet อยู่แล้ว · per-customer deep-link = งานต่อ.
  const walletNote = walletTotals.negCount > 0
    ? `มีลูกค้า ${walletTotals.negCount} ราย ยอดติดลบรวม ฿${formatTHB(walletTotals.negSum)}` +
      (walletTotals.topNegUserid ? ` (เช่น ${walletTotals.topNegUserid} ฿${formatTHB(walletTotals.topNegAmount)})` : "") +
      ` — ลูกค้าจ่ายมาแล้วยังไม่บันทึก · กด “บันทึกการชำระ + แนบสลิป” ที่หน้ากระเป๋าเงินเพื่อเคลียร์`
    : undefined;
  const grandTotal     = shopMonth + forwarderMonth + yuanMonth;

  // Settings rates — default to 5.00 (parity with legacy default constants
  // when tb_settings row id=1 is missing). "เรทสั่งซื้อ" = the ฝากสั่ง buy/cost
  // rate = hratecostdefault (เรทฝากสั่งสินค้าต้นทุน on /admin/settings; 4.91 prod).
  // NOTE: rgdefault is a DEAD legacy column (0.00 on prod, never set) — do NOT
  // use it for the chip. rsdefault = เรท Sale; rpdefault = เรทโอน.
  const settingsRow = settings.data;
  const rateShop     = Number(settingsRow?.hratecostdefault ?? 5);
  const rateSale     = Number(settingsRow?.rsdefault ?? 5);
  const ratePayment  = Number(settingsRow?.rpdefault ?? 5);
  // "เรทต้นทุน (ภายใน)" = hratecostdefault = COST-internal → canViewCost only
  // (money-visibility.ts). Was UNGATED (a real leak: sales/ops/qa/manager saw it).
  // Gated on EFFECTIVE roles → closes the leak for real non-cost office roles AND
  // makes the 👁 view-as preview faithful (previewing sales hides it, accounting
  // shows it). effectiveRoles === real roles for non-previewers; the money-tier
  // gate guarantees a preview can only DOWNGRADE, never reveal cost above the real
  // role. SELL/transfer rates below stay visible to all (not money-internal).
  const showCostRate = canViewCost(effectiveRoles);

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

  // ภูม 2026-06-30 — สลิป "ใบวางบิล" รอบัญชีตรวจ ถูกรวมเข้าคิว "ชำระเงิน" (topup) แล้ว.
  // GOAL 1 (§0f badge ตรง) — the badge must equal the LIST after the เบิ้ล collapse:
  // wallet-topup rows − wallet twins already on a pending FRI + pending FRIs. One SOT
  // (computeTopupBadge) shared with the sidebar so dashboard badge = sidebar badge = list.
  const topupBadge = await computeTopupBadge(createAdminClient());

  // เตรียมส่ง(6) vs กำลังจัดส่ง(62) — partition fstatus=6 by whether the row is in an
  // OPEN driver batch (fdistatus '' / '1' = assigned, not delivered).
  const openDriverFidSet = new Set(
    ((openDriverFidsRes.data ?? []) as { fid: number }[]).map((r) => r.fid),
  );
  const fstatus6Ids = ((fstatus6IdsRes.data ?? []) as { id: number }[]).map((r) => r.id);
  const forwarder62Val = fstatus6Ids.filter((id) => openDriverFidSet.has(id)).length;
  const forwarder6Val = fstatus6Ids.length - forwarder62Val;

  // Tab counts
  const tabCounts: Record<TabKey, number> = {
    topup:              topupBadge,
    withdraw:           walletWithdrawsPending.count ?? 0,
    payShop:            salesPayoutsPending.count ?? 0,
    shop1:              shop1Count.count ?? 0,
    shop2:              shop2Count.count ?? 0,
    shop3:              shop3Count.count ?? 0,
    shop4:              shop4Count.count ?? 0,
    forwarder1:         forwarder1Count.count ?? 0,
    forwarder5:         forwarder5Count.count ?? 0,
    forwarderC:         forwarderCreditCount.count ?? 0,
    forwarder6:         forwarder6Val,
    forwarder62:        forwarder62Val,
    payment:            yuanPending.count ?? 0,
    inactiveCustomers:  inactiveUsers,
  };

  // `href` overrides the default `?tab=` self-link → the tab navigates to a
  // dedicated full-feature page instead of the dashboard mini-table. shop3
  // (สั่งสินค้า · ชำระแล้ว) points at the real /admin/service-orders?q=3 workflow
  // (status-driven edit · the proper process · owner 2026-06-11) — the dashboard
  // mini-table only had a generic ดู/แก้ไข row.
  const tabDefs: { key: TabKey; label: string; href?: string }[] = [
    { key: "inactiveCustomers", label: "ลูกค้าที่ยังไม่ได้ใช้งาน" },
    { key: "topup",             label: "ชำระเงิน" },
    // Wave 7.2 (ภูม audit): payShop reads rebuilt `sales_payouts` which is
    // empty on prod (Pacred-only feature · no legacy port yet · Phase C).
    // Badge always 0. Label suffixed so staff don't expect data here.
    { key: "payShop",           label: "เบิกเงินค่าสินค้า (Phase C)" },
    { key: "withdraw",          label: "ถอนเงิน" },
    { key: "shop1",             label: "สั่งซื้อรอดำเนินการ" },
    { key: "shop2",             label: "รอชำระเงินสินค้า" },
    { key: "shop3",             label: "สั่งสินค้า (ชำระแล้ว)", href: "/admin/service-orders?q=3" },
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
      {/* ── My Workspace entry (G1 · 2026-06-30 · owner W3) — every staffer's focused
          "งานของฉันตอนนี้" landing is ≤1 click from the dashboard (§0d). Additive — the
          default /admin landing is unchanged; this is the door to the per-position view. */}
      <Link
        href="/admin/workspace"
        className="group flex items-center gap-3 rounded-2xl border border-primary-200 bg-gradient-to-r from-primary-50 to-white dark:from-primary-950/20 dark:to-surface px-4 py-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
      >
        <div className="shrink-0 w-9 h-9 [&>svg]:w-9 [&>svg]:h-9 text-primary-600">
          <LayoutGrid />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">พื้นที่งานของฉัน (My Workspace)</p>
          <p className="text-xs text-muted">เปิดคิวงานเฉพาะตำแหน่งของคุณ — ดูว่ามีอะไรรอคุณทำตอนนี้</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary-600 group-hover:gap-2 transition-all">
          เปิด <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </Link>

      {/* ── Row 1: 4 revenue stat cards (PCS style: number + icon + progress bar) ── */}
      {/* Layout fix 2026-05-25: 4-col only at xl (≥1280) — was lg (≥1024) which
          overflowed on common 1366-1500px laptop viewports because the big
          ฿-numbers (text-3xl font-mono) refuse to shrink. At lg/md → 2 cols. */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
        <RevenueCarouselCard
          tone="info"
          icon={<ShoppingBasket />}
          monthLabel={`ยอดฝากสั่งซื้อ ${monthLabel}`}
          monthValue={shopMonth}
          todayLabel="ยอดฝากสั่งซื้อวันนี้"
          todayValue={shopToday}
          href="/admin/service-orders"
        />
        <RevenueCarouselCard
          tone="danger"
          icon={<Box />}
          monthLabel={`ยอดฝากนำเข้า ${monthLabel}`}
          monthValue={forwarderMonth}
          todayLabel="ยอดฝากนำเข้าวันนี้"
          todayValue={forwarderToday}
          href="/admin/forwarders"
        />
        <RevenueCarouselCard
          tone="primary"
          icon={<ArrowLeftRight />}
          monthLabel={`ยอดฝากโอน ${monthLabel}`}
          monthValue={yuanMonth}
          todayLabel="ยอดฝากโอนวันนี้"
          todayValue={yuanToday}
          href="/admin/yuan-payments"
        />
        <RevenueCard
          tone="success"
          icon={<WalletIcon />}
          label="กระเป๋าสตางค์ลูกค้ารวม"
          monthValue={walletAll}
          subtitle="ยอด wallet ทั้งหมด"
          note={walletNote}
          href="/admin/wallet"
        />
      </section>

      {/* ── Row 2: Rate strip (3 rates) ── */}
      {/* owner 2026-06-29: chip labels were misleading — "เรทสั่งซื้อ" actually
          reads hratecostdefault (the COST rate) and "เรท Sale" reads rsdefault
          (the ฝากสั่ง SELL rate); relabeled to plain Thai. "ยอดรวม" (revenue, not
          a rate) was moved OUT of this row into its own stat below. Columns each
          chip reads are UNCHANGED — labels + placement only. */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        {/* 3-chip rate row — เรทต้นทุน hidden for non-cost roles (see showCostRate) */}
        <div className={`grid grid-cols-1 gap-3 text-center ${showCostRate ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {showCostRate && (
            <RateChip color="cyan"  label="เรทต้นทุน (ภายใน)" value={rateShop.toFixed(2)} />
          )}
          <RateChip color="red"     label="เรทฝากสั่ง (ขาย)"  value={rateSale.toFixed(2)} />
          <RateChip color="purple"  label="เรทโอน"            value={ratePayment.toFixed(2)} />
        </div>
        {/* Revenue total — relocated out of the rate row (it's revenue, not a rate). */}
        <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5">
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            ยอดรวมรายได้ {monthLabel}
          </span>
          <span className="text-lg font-bold tabular-nums text-amber-900 dark:text-amber-100">
            {formatTHB(grandTotal, true)}
          </span>
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
                  href={tab.href ?? `/admin?tab=${tab.key}`}
                  className={`inline-flex items-center gap-1.5 px-2 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 transition-colors ${
                    isActive ? "border-primary-500 text-primary-600 bg-primary-50/30" : "border-transparent text-muted hover:text-foreground hover:bg-surface-alt/50"
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-red-500 text-white text-[11px] font-extrabold px-1.5 ring-2 ring-red-200 shadow-sm">
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
                <span className="inline-flex items-center justify-center min-w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold px-1.5">
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

// Wallet-history type → human label (legacy semantics · see wallet/[id]/page.tsx).
const WALLET_TYPE_LABEL: Record<string, string> = {
  "1": "ชำระเงิน / เติมเงิน",
  "2": "เติมเงิน (แอดมิน)",
  "3": "ถอนเงิน",
  "4": "ชำระค่าฝากนำเข้า",
  "5": "ปรับยอดมือ",
  "6": "ชำระค่าบริการ",
  "7": "ชำระค่าบริการ",
  "8": "ชำระฝากสั่งซื้อ",
};

// Escape a DB string before it goes into a dangerouslySetInnerHTML detail blob.
function escapeHtmlInline(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
  // Owner 2026-06-21: show a slip thumbnail inline on the queue so the admin sees
  // at a glance that a slip is attached + it renders (signed URL · null = no slip).
  slipUrl?: string | null;
  // ── Legacy-fidelity per-tab columns (owner 2026-07-04 ·
  //    docs/research/dashboard-tabstrip-fidelity-2026-07-04.md). Optional: only a
  //    tab-group that renders its TAILORED legacy table populates these; tabs still
  //    on the generic 4-col table leave them undefined (no regression).
  orderNo?: string | null;        // เลขที่ออเดอร์ (hNo) / เลขที่รายการ / #fNo
  statusLabel?: string;           // real status text (legacy badge label)
  statusTone?: StatusTone;        // legacy badge color
  // ฝากนำเข้า (forwarder) 9-col cells (forwarderTableAll.php):
  trackingChn?: string | null;    // เลขพัสดุ (จีน)
  cabinet?: string | null;        // เลขตู้ (fCabinetNumber)
  trackingTh?: string | null;     // เลขพัสดุ (ไทย)
  shipByTh?: string | null;       // ขนส่งไทย (nameShipBy)
  address?: string | null;        // ที่อยู่ส่งสินค้า (fullAddress)
  transportInfo?: string | null;  // ยอดค้างชำระ line2 — ขนส่ง + Kg/CBM
  payMethod?: string | null;      // ฝากโอน วิธีการชำระ (payType)
  // Rich legacy-cell fields (shop/forwarder rows · owner 2026-07-04 · shopTableAll.php):
  vip?: string | null;            // VIP/tier badge (coID · badgeVIP2)
  saleRep?: string | null;        // Sale : {adminIDSale}
  ipc?: string | null;            // IPC : {adminIDCreate}
  promo?: string | null;          // โปรโมชั่น (promoID · tagPro)
  note?: string | null;           // หมายเหตุ (hNote / fNote)
  noteVisibility?: "admin" | "both" | null; // แอดมินเท่านั้น / ทั้งลูกค้าและแอดมิน
  noteDate?: string | null;       // note timestamp
  deadline?: string | null;       // กรุณาชำระเงินก่อน (hDatePayment · shop2)
  updateDate?: string | null;     // อัปเดต — status-date (hDateN / fDateStatusN)
  updateAdmin?: string | null;    // adminIDUpdate
  // usersActive (ลูกค้าที่ยังไม่ได้ใช้งาน) cells:
  shopUserLabel?: string | null;  // ซื้อสินค้าเพื่อ (shopUser)
  channelLabel?: string | null;   // รู้จักเราจาก (channel)
};

// VIP-tier badge (legacy badgeVIP2): show the coID as a tier badge unless it's the
// general customer pool (PR/PCS/GENERAL/empty).
function vipTierBadge(coid: string | null | undefined): string | null {
  const c = (coid ?? "").trim().toUpperCase();
  if (!c || c === "PR" || c === "PCS" || c === "GENERAL") return null;
  return c;
}

// Legacy Bootstrap badge tones → Tailwind pill classes (shared by the tailored tables).
type StatusTone = "warning" | "danger" | "primary" | "info" | "success" | "secondary";
const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  warning:   "bg-amber-100 text-amber-700",
  danger:    "bg-red-100 text-red-700",
  primary:   "bg-blue-100 text-blue-700",
  info:      "bg-cyan-100 text-cyan-700",
  success:   "bg-emerald-100 text-emerald-700",
  secondary: "bg-slate-100 text-slate-700",
};

// ฝากสั่งซื้อ tb_header_order.hStatus → legacy statusOrderBadgeAll (function.php:504).
const SHOP_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  "1": { label: "รอดำเนินการ",   tone: "warning" },
  "2": { label: "รอชำระเงิน",     tone: "danger" },
  "3": { label: "สั่งสินค้า",      tone: "info" },
  "4": { label: "รอร้านจีนจัดส่ง", tone: "primary" },
  "5": { label: "สำเร็จ",         tone: "success" },
  "6": { label: "ยกเลิกออเดอร์",   tone: "danger" },
};

// ฝากนำเข้า tb_forwarder.fStatus → legacy statusForwarderAll2 label+tone.
const FWD_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  "1": { label: "รอเข้าโกดังจีน",   tone: "secondary" },
  "2": { label: "ถึงโกดังจีน",      tone: "info" },
  "3": { label: "กำลังส่งมาไทย",    tone: "primary" },
  "4": { label: "ถึงไทยแล้ว",       tone: "info" },
  "5": { label: "รอชำระเงินนำเข้า", tone: "danger" },
  "6": { label: "เตรียมส่ง",        tone: "primary" },
  "7": { label: "ส่งแล้ว",          tone: "success" },
};

// ขนส่งไทย code → name (compact subset of legacy nameShipBy · function.php).
const FWD_SHIPBY: Record<string, string> = {
  PCSF: "Pacred เหมาเหมา", PCSE: "Pacred Express", PCS: "รับเองโกดัง",
  "1": "KERRY", "2": "ไปรษณีย์", "3": "Flash", "4": "J&T", "5": "Best Express", "6": "Ninja", "7": "DHL",
};

// ซื้อสินค้าเพื่อ (tb_users.shopUser · legacy shopUserName · function.php:2181).
const SHOP_USER_LABEL: Record<string, string> = { "1": "ซื้อไปใช้เอง", "2": "ซื้อไปขาย" };
// รู้จักเราจาก (tb_users.channel · legacy channelUserName · function.php:2189).
const CHANNEL_LABEL: Record<string, string> = {
  "1": "ค้นหาโดยใช้ Google", "2": "โฆษณาทาง Facebook หรือ Instagram", "3": "โฆษณาทาง Youtube",
  "4": "โฆษณา Banner จากเว็บไซต์อื่นๆ", "5": "โฆษณาทาง Tiktok", "6": "โฆษณาทาง Twitter",
  "7": "เพื่อนหรือคนรู้จักแนะนำ", "8": "ผู้ใช้งานแนะนำ", "9": "กระทู้ Pantip หรือบทความจากเว็บไซต์ต่างๆ",
  "10": "การจัดบูธ อบรมสัมนา",
};

type RawUserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  coID: string | null;          // VIP tier (badgeVIP2)
  adminIDSale: string | null;   // sales rep (badgeAdminSale)
  // นิติบุคคล display (owner 2026-07-04) — the dashboard tab rows must show the
  // COMPANY name for a juristic customer, not the contact person (was leaking
  // "PEA PEA" for a company). Batched via the same .in() as the user rows.
  userCompany: string | null;   // '1' = นิติบุคคล
  corporatename: string | null; // tb_corporate.corporatename (company display name)
};

/**
 * Resolve a set of legacy userid → display name + phone in a single
 * tb_users query. Returns an empty Map if no ids. PostgREST `.in()` is
 * the only reliable join — the legacy FK is by `userid` text not a
 * proper relational FK (same constraint as /admin/forwarders rewrite).
 *
 * Also batches tb_corporate (2026-07-04) in ONE more .in() so nameOf() can show
 * the COMPANY name for a นิติบุคคล (owner: dashboard leaked the contact person).
 * NOT N+1 — two parallel .in() queries, then a merge.
 */
async function loadUsersByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
): Promise<Map<string, RawUserRow>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const [usersRes, corpRes] = await Promise.all([
    admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel,coID,adminIDSale,userCompany")
      .in("userID", unique),
    admin
      .from("tb_corporate")
      .select("userid, corporatename")
      .in("userid", unique),
  ]);
  if (usersRes.error) {
    console.warn(`[tb_users list] failed (soft-fail · returning empty map)`, usersRes.error);
  }
  if (corpRes.error) {
    console.warn(`[tb_corporate list] failed (soft-fail · person name shown)`, corpRes.error);
  }
  const corpNameByUser = new Map<string, string>();
  for (const c of (corpRes.data ?? []) as { userid: string; corporatename: string | null }[]) {
    const nm = (c.corporatename ?? "").trim();
    if (c.userid && nm) corpNameByUser.set(c.userid, nm);
  }
  return new Map(
    ((usersRes.data ?? []) as unknown as Omit<RawUserRow, "corporatename">[]).map((u) => [
      u.userID,
      { ...u, corporatename: corpNameByUser.get(u.userID) ?? null } as RawUserRow,
    ]),
  );
}

/**
 * Juristic-aware customer name for a dashboard row — the COMPANY name for a
 * นิติบุคคล, else the person. Owner 2026-07-04 (was leaking the contact person
 * on the "รอชำระเงินนำเข้า"/tab rows). Uses the shared resolveBillingIdentity SOT.
 */
function nameOf(u: RawUserRow | undefined): string {
  if (!u) return "—";
  const identity = resolveBillingIdentity({
    userCompany: u.userCompany,
    userName: u.userName,
    userLastName: u.userLastName,
    corp: u.corporatename
      ? { corporatename: u.corporatename, corporatenumber: null, corporateaddress: null }
      : null,
  });
  return identity.name || "—";
}

/**
 * ภูม 2026-06-30 — bill-slip rows for the "ชำระเงิน" queue. ใบวางบิล (tb_forwarder_invoice)
 * ที่เซลแนบสลิปแล้ว รอบัญชีตรวจ (status='issued' · slip_status='pending') → โผล่ในคิว
 * เดียวกับสลิปต่อออเดอร์ (กดเข้าหน้า /admin/billing-run/[id] ตรวจ+ตัดจ่าย). Append-only —
 * ไม่แตะ logic tb_wallet_hs เดิม.
 */
type BillingRunSlipRow = RowShape & { invoiceId: number; forwarderIds: number[] };

async function fetchBillingRunSlipRows(
  admin: ReturnType<typeof createAdminClient>,
): Promise<BillingRunSlipRow[]> {
  const { data, error } = await admin
    .from("tb_forwarder_invoice")
    .select("id, doc_no, userid, buyer_name, total_thb, is_juristic, slip_path, slip_uploaded_at")
    .eq("status", "issued")
    .eq("slip_status", "pending")
    .order("slip_uploaded_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) {
    console.warn(`[billing-run slip queue] failed (soft-fail · returning empty rows)`, error);
    return [];
  }
  const list = (data ?? []) as Array<{
    id: number; doc_no: string; userid: string | null; buyer_name: string | null;
    total_thb: number | string | null; is_juristic: boolean | null;
    slip_path: string | null; slip_uploaded_at: string | null;
  }>;

  // Batch-read the forwarder ids each FRI bills so the topup queue can collapse a
  // raw wallet slip twin whose forwarder is already covered by one of these FRIs
  // (the เบิ้ล fix · GOAL 1 · lib/admin/topup-slip-dedup.ts). READ-only.
  const fidByInvoice = new Map<number, number[]>();
  const invoiceIds = list.map((r) => r.id);
  if (invoiceIds.length > 0) {
    const { data: items, error: itemErr } = await admin
      .from("tb_forwarder_invoice_item")
      .select("invoice_id, forwarder_id")
      .in("invoice_id", invoiceIds);
    if (itemErr) {
      console.warn(`[billing-run slip queue: forwarder_ids] failed (soft-fail)`, itemErr);
    } else {
      for (const it of (items ?? []) as Array<{ invoice_id: number; forwarder_id: number }>) {
        const arr = fidByInvoice.get(it.invoice_id) ?? [];
        if (it.forwarder_id != null) arr.push(Number(it.forwarder_id));
        fidByInvoice.set(it.invoice_id, arr);
      }
    }
  }

  return await Promise.all(list.map(async (r) => {
    const slipUrl = r.slip_path ? await getSignedBucketUrl("slips", r.slip_path) : null;
    return {
      id: `bill-${r.id}`,
      created_at: r.slip_uploaded_at ?? "",
      member_code: r.userid ?? "",
      customer_name: r.buyer_name ?? "",
      // NET payable (gross − WHT 1% for juristic · owner 2026-07-22 no minimum) — the
      // SAME value the billing-run detail + ใบเสร็จ compute. These are unpaid bills
      // awaiting slip review → new rule. Was Number(total_thb) = GROSS → showed 1,196.50
      // for a juristic bill whose real payable is 1,184.54 (WHT-fix 2026-07-16).
      amount: computeBillWht(Boolean(r.is_juristic), Number(r.total_thb ?? 0)).net_payable,
      detail: `🧾 ใบวางบิล ${escapeHtmlInline(r.doc_no)} · <span class="text-emerald-600">📎 แนบสลิปแล้ว (รอบัญชีตรวจ)</span>`,
      link: `/admin/billing-run/${r.id}`,
      status: "1",
      slipUrl,
      invoiceId: r.id,
      forwarderIds: fidByInvoice.get(r.id) ?? [],
    };
  }));
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
      // Owner 2026-06-21: the slip-verify queue was too thin (ยอด/ชื่อซ้ำ · ไม่รู้
      // ค่าอะไร · รูปไม่ขึ้น). Pull the note (what it's paying — F#/H#/service),
      // type + dateslip, AND resolve imagesslip → a SIGNED URL so the row shows a
      // real thumbnail (the bare filename was used as a broken href before).
      const base = admin
        .from("tb_wallet_hs")
        .select("id,date,dateslip,amount,status,imagesslip,userid,note,type,reforder,reforder2");
      // Route the LIST through the SAME shared SOT filters as the badge/tabs
      // (lib/wallet/wallet-hs.ts) so the list, the tab count, and the sidebar badge
      // can never disagree. Direction is keyed off `type`, never the amount sign.
      const filtered = tab === "topup" ? pendingTopupFilter(base) : pendingWithdrawFilter(base);
      const { data, error } = await filtered
        .order("date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[tb_wallet_hs list] failed (soft-fail · returning empty rows)`, error);
      }
      const rawRows = (data ?? []) as unknown as Array<RawWalletHsRow & {
        dateslip: string | null; note: string | null; type: string | null;
        reforder: string | null; reforder2: string | number | null;
      }>;
      // ── COLLAPSE the "เติม-แล้วจ่าย" pair to ONE row (owner 2026-06-21: "คนเดียวกัน
      //    ยอดเดียวกัน → แถวเดียว · ก็แค่รอตรวจสลิป"). Each import payment makes a
      //    slip-bearing TOPUP (type='1') + a no-slip PAY (type='4', reforder2→topup).
      //    Show ONLY the slip row; drop the pay-half + tag the topup with the
      //    forwarder# it pays (so the single row reads "ชำระค่าฝากนำเข้า #F…").
      const paidFwdByTopup = new Map<string, string>();
      for (const r of rawRows) {
        if (r.type === "4" && r.reforder2) paidFwdByTopup.set(String(r.reforder2), r.reforder ?? "");
      }
      const rows = rawRows.filter((r) => !(r.type === "4" && r.reforder2));
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      const walletRows = await Promise.all(rows.map(async (r) => {
        const u = users.get(r.userid);
        const slipUrl = await resolveLegacyUrl(r.imagesslip, "slip");
        // "what it's paying" — for a collapsed import-pay pair use the paired
        // forwarder#; else the note; else type label + ref. Never a bare amount.
        const paidFwd = paidFwdByTopup.get(String(r.id));
        const what = paidFwd
          ? `ชำระค่าฝากนำเข้า #${paidFwd}`
          : (r.note && r.note.trim())
            ? r.note.trim()
            : `${WALLET_TYPE_LABEL[r.type ?? ""] ?? "ชำระเงิน"}${r.reforder ? ` #${r.reforder}` : ""}`;
        const slipNote = slipUrl
          ? `📎 แนบสลิปแล้ว`
          : (r.imagesslip ? `⚠️ มีสลิปแต่เปิดไม่ได้ (${escapeHtmlInline(r.imagesslip)})` : `— ไม่มีสลิป`);
        return {
          id: String(r.id),
          created_at: r.date ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Math.abs(Number(r.amount ?? 0)),
          detail: `${escapeHtmlInline(what)} · <span class="${slipUrl ? "text-emerald-600" : "text-amber-600"}">${slipNote}</span>`,
          link: `/admin/wallet/${r.id}`,
          status: r.status ?? "1",
          slipUrl,
          statusLabel: "รอดำเนินการ",
          statusTone: "warning" as const,
          vip: vipTierBadge(u?.coID),
          saleRep: (u?.adminIDSale ?? "").trim() || null,
        };
      }));
      // ภูม 2026-06-30 — รวมสลิป "ใบวางบิล" (เซลแนบ · รอบัญชีตรวจ) เข้าคิว "ชำระเงิน"
      // เดียวกัน (เลิก tab แยก "วางบิลรอตรวจสลิป"). เฉพาะ topup (ขาเข้า) · withdraw ไม่แตะ.
      if (tab === "topup") {
        const friRows = await fetchBillingRunSlipRows(admin);
        // COLLAPSE THE เบิ้ล (GOAL 1 · READ/aggregation only · no money moved · no
        // settlement row dropped). A raw wallet slip that pays a forwarder DIRECTLY
        // (type='4' · reforder=fid) is shown TWICE when a ใบวางบิล (FRI) also bills
        // that same forwarder. The FRI wins (richer legacy-shaped doc · routes to the
        // /admin/billing-run/[id] 2-round gate) → suppress the raw wallet twin.
        const walletFidByRowId = new Map<string, number>();
        for (const r of rows) {
          if (r.type === "4" && r.reforder && /^\d+$/.test(String(r.reforder))) {
            walletFidByRowId.set(String(r.id), Number(r.reforder));
          }
        }
        const { suppressedWalletFids } = collapseWalletBillingPairs({
          walletForwarderIds: [...walletFidByRowId.values()],
          friForwarderSets: friRows.map((f) => ({ invoiceId: f.invoiceId, forwarderIds: f.forwarderIds })),
        });
        const filteredWalletRows = suppressedWalletFids.size === 0
          ? walletRows
          : walletRows.filter((w) => {
              const fid = walletFidByRowId.get(w.id);
              return fid === undefined || !suppressedWalletFids.has(fid);
            });
        return [...filteredWalletRows, ...friRows];
      }
      return walletRows;
    }

    // ── ฝากสั่งซื้อ (tb_header_order) ──────────────────────────────────────
    // shop1 = hstatus='1' (รอดำเนินการ)
    // shop2 = hstatus='2' (รอชำระเงิน)
    // shop4 = hstatus='4' (รอร้านจีนจัดส่ง)
    // forwarder1 (label "รอเข้าโกดังจีน") = tb_forwarder fstatus='1' — handled below.
    case "shop1":
    case "shop2":
    case "shop3":
    case "shop4": {
      const statusMap: Record<string, string> = { shop1: "1", shop2: "2", shop3: "3", shop4: "4" };
      const { data, error } = await admin
        .from("tb_header_order")
        .select("id,hno,hstatus,htotalpriceuser,hdate,hdate2,hdate3,hdate4,hdate5,htitle,userid,hcover,hcount,adminidcreate,adminidupdate,hnote,hnoteuser,hnoteuserread,hnotedate,hdatepayment")
        .eq("hstatus", statusMap[tab])
        .order("hdate", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[tb_header_order list] failed (soft-fail · returning empty rows)`, error);
      }
      const rows = (data ?? []) as unknown as RawHeaderOrderRow[];
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      // Product cover thumbnail (self-explaining-row §0g — "ดึงรูปสินค้ามาโชว์").
      const coverMap = await resolveLegacyUrlMap(rows.map((r) => ({ id: r.id, filename: r.hcover })), "cover");
      return rows.map((r) => {
        const u = users.get(r.userid);
        const itemCount = Number(r.hcount ?? 0);
        const title = (r.htitle ?? "").trim() || "ไม่มีชื่อสินค้า";
        const st = SHOP_STATUS[r.hstatus ?? "1"] ?? SHOP_STATUS["1"];
        // อัปเดต column shows the status-date for the row's current hStatus (legacy switch).
        const updDate =
          r.hstatus === "2" ? r.hdate2
          : r.hstatus === "3" ? r.hdate3
          : r.hstatus === "4" ? r.hdate4
          : r.hstatus === "5" ? r.hdate5
          : r.hdate;
        const noteTxt = (r.hnote ?? "").trim();
        return {
          id: String(r.id),
          created_at: r.hdate ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Number(r.htotalpriceuser ?? 0),
          // ข้อมูลสินค้า column (hNo moved to its own เลขที่ออเดอร์ column, legacy-faithful).
          detail: `<span class="font-semibold text-foreground">${escapeHtmlInline(title)}</span>${itemCount > 1 ? ` · และอีก ${itemCount - 1} รายการ` : ""}`,
          link: r.hno ? `/admin/service-orders/${encodeURIComponent(r.hno)}` : "/admin/service-orders",
          status: r.hstatus ?? "1",
          slipUrl: coverMap[String(r.id)] ?? null,
          orderNo: r.hno ?? null,
          statusLabel: st.label,
          statusTone: st.tone,
          vip: vipTierBadge(u?.coID),
          saleRep: (u?.adminIDSale ?? "").trim() || null,
          ipc: (r.adminidcreate ?? "").trim() || null,
          promo: null,
          note: noteTxt || null,
          noteVisibility: noteTxt ? (String(r.hnoteuser) === "1" ? "admin" : "both") : null,
          noteDate: (String(r.hnotedate ?? "").trim() && String(r.hnotedate) !== "0") ? String(r.hnotedate) : null,
          deadline: r.hstatus === "2" && r.hdatepayment ? String(r.hdatepayment) : null,
          updateDate: updDate ?? null,
          updateAdmin: (r.adminidupdate ?? "").trim() || null,
        };
      });
    }

    // ── ฝากนำเข้า (tb_forwarder) ───────────────────────────────────────────
    // forwarder1   = fstatus='1' (รอเข้าโกดังจีน)
    // forwarder5   = fstatus='5' (รอชำระเงิน)
    // forwarderC   = fcredit='1'
    // forwarder6   = fstatus='6' + NO open driver-item ("เตรียมส่ง" queue)
    // forwarder62  = fstatus='6' + open driver-item (กำลังจัดส่ง)
    case "forwarder1":
    case "forwarder5":
    case "forwarderC":
    case "forwarder6":
    case "forwarder62": {
      let q = admin
        .from("tb_forwarder")
        .select("id,fdate,fstatus,fidorco,ftotalprice,ftransporttype,fweight,fvolume,userid,fcabinetnumber,fcredit,fcover,ftrackingchn,ftrackingth,fshipby,faddressname,faddresslastname,faddressno,faddresssubdistrict,faddressdistrict,faddressprovince,faddresszipcode,fnote,adminidupdate")
        .order("fdate", { ascending: false, nullsFirst: false })
        .limit(50);
      if      (tab === "forwarder1")  q = q.eq("fstatus", "1");
      else if (tab === "forwarder5")  q = q.eq("fstatus", "5");
      else if (tab === "forwarderC")  q = q.eq("fcredit", "1");
      else                            q = q.eq("fstatus", "6"); // forwarder6 + forwarder62 = fstatus 6
      const { data, error } = await q;
      if (error) {
        console.warn(`[tb_forwarder list] failed (soft-fail · returning empty rows)`, error);
      }
      let rows = (data ?? []) as unknown as RawForwarderRow[];
      // เตรียมส่ง(6) vs กำลังจัดส่ง(62) — partition fstatus=6 by open driver-item (fdistatus ''/'1').
      if (tab === "forwarder6" || tab === "forwarder62") {
        const { data: dItems, error: dErr } = await admin
          .from("tb_forwarder_driver_item")
          .select("fid")
          .or("fdistatus.eq.,fdistatus.eq.1,fdistatus.is.null")
          .limit(50_000);
        if (dErr) console.warn(`[forwarder6/62 driver-partition] failed (soft-fail)`, dErr);
        const driverSet = new Set(((dItems ?? []) as { fid: number }[]).map((r) => r.fid));
        rows = tab === "forwarder62"
          ? rows.filter((r) => driverSet.has(Number(r.id)))
          : rows.filter((r) => !driverSet.has(Number(r.id)));
      }
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      const fcoverMap = await resolveLegacyUrlMap(rows.map((r) => ({ id: r.id, filename: r.fcover })), "cover");
      return rows.map((r) => {
        const u = users.get(r.userid);
        const transportLabel =
          r.ftransporttype === "1" ? "🚛 รถ"
          : r.ftransporttype === "2" ? "🚢 เรือ"
          : r.ftransporttype === "3" ? "✈️ แอร์"
          : r.ftransporttype ?? "—";
        const fno = r.fidorco ?? String(r.id);
        const st = FWD_STATUS[r.fstatus ?? "1"] ?? FWD_STATUS["1"];
        const addr = [r.faddressname, r.faddresslastname, r.faddressno, r.faddresssubdistrict, r.faddressdistrict, r.faddressprovince, r.faddresszipcode]
          .map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
        return {
          id: String(r.id),
          created_at: r.fdate ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Number(r.ftotalprice ?? 0),
          // รายละเอียด column (legacy: "เลขที่รายการ #ID" + "ฝากนำเข้า" badge).
          detail: `เลขที่รายการ <span class="font-semibold text-foreground">#${escapeHtmlInline(fno)}</span> · <span class="text-red-600 font-medium">ฝากนำเข้า</span>`,
          link: `/admin/forwarders/${r.id}`,
          status: r.fstatus ?? "1",
          slipUrl: fcoverMap[String(r.id)] ?? null,
          orderNo: `#${fno}`,
          statusLabel: st.label,
          statusTone: st.tone,
          trackingChn: (r.ftrackingchn ?? "").trim() || null,
          cabinet: (r.fcabinetnumber ?? "").trim() || null,
          trackingTh: (r.ftrackingth ?? "").trim() || null,
          shipByTh: r.fshipby ? (FWD_SHIPBY[r.fshipby] ?? r.fshipby) : null,
          address: addr || null,
          transportInfo: `${transportLabel} · ${Number(r.fweight ?? 0).toFixed(2)} kg / ${Number(r.fvolume ?? 0).toFixed(3)} CBM`,
          note: (r.fnote ?? "").trim() || null,
          noteVisibility: (r.fnote ?? "").trim() ? "both" as const : null,
          updateAdmin: (r.adminidupdate ?? "").trim() || null,
          vip: vipTierBadge(u?.coID),
          saleRep: (u?.adminIDSale ?? "").trim() || null,
        };
      });
    }

    // ── ฝากโอน (tb_payment) ────────────────────────────────────────────────
    // paystatus '1' = รอตรวจสอบ; legacy paytype 1=alipay 2=wechat 3=bank.
    case "payment": {
      const { data, error } = await admin
        .from("tb_payment")
        .select("id,paydate,paystatus,paytype,payyuan,paythb,userid,imagesslip,paydetail")
        .eq("paystatus", "1")
        .order("paydate", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[tb_payment list] failed (soft-fail · returning empty rows)`, error);
      }
      const rows = (data ?? []) as unknown as RawPaymentRow[];
      const users = await loadUsersByUserId(admin, rows.map((r) => r.userid));
      const paySlipMap = await resolveLegacyUrlMap(rows.map((r) => ({ id: r.id, filename: r.imagesslip })), "slip");
      return rows.map((r) => {
        const u = users.get(r.userid);
        // วิธีการชำระ — legacy payment.php payType labels (function.php).
        const payMethod =
          r.paytype === "1" ? "จ่ายผ่านเว็บไซต์จีน"
          : r.paytype === "2" ? "โอนเข้าบัญชี Alipay ร้านค้าจีน"
          : "อื่นๆ";
        const slipU = paySlipMap[String(r.id)] ?? null;
        const note = (r.paydetail ?? "").trim();
        // รายละเอียด = payDetail note (legacy); fall back to ¥ + slip status.
        const detail = note
          ? escapeHtmlInline(note)
          : `¥${Number(r.payyuan ?? 0).toFixed(2)} · <span class="${slipU ? "text-emerald-600" : "text-amber-600"}">${slipU ? "📎 แนบสลิปแล้ว" : "— ไม่มีสลิป"}</span>`;
        return {
          id: String(r.id),
          created_at: r.paydate ?? "",
          member_code: r.userid,
          customer_name: nameOf(u),
          amount: Number(r.paythb ?? 0),
          detail,
          link: `/admin/yuan-payments/${r.id}`,
          status: r.paystatus ?? "1",
          slipUrl: slipU,
          orderNo: `#${r.id}`,
          payMethod,
          statusLabel: "รอดำเนินการ",
          statusTone: "warning",
          vip: vipTierBadge(u?.coID),
          saleRep: (u?.adminIDSale ?? "").trim() || null,
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
      // เบิกเงินค่าสินค้า — legacy tb_shop_pay_h WHERE status='1' (faithful · payShopPCS.php).
      // ผู้ทำรายการ = adminidcreate (this is a SHOP disbursement — no customer link).
      // (Repointed off the empty rebuilt `sales_payouts` twin · owner 2026-07-05 · §0e.)
      const { data, error } = await admin
        .from("tb_shop_pay_h")
        .select("id,date,amount,status,imagesslip,adminidcreate")
        .eq("status", "1")
        .order("date", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) {
        console.warn(`[tb_shop_pay_h list] failed (soft-fail · returning empty rows)`, error);
      }
      const payRows = (data ?? []) as unknown as { id: number | string; date: string | null; amount: number | string; status: string | null; imagesslip: string | null; adminidcreate: string | null }[];
      const slipMap = await resolveLegacyUrlMap(payRows.map((r) => ({ id: r.id, filename: r.imagesslip })), "slip");
      return payRows.map((r) => ({
        id: String(r.id),
        created_at: r.date ?? "",
        member_code: (r.adminidcreate ?? "").trim() || "—",  // ผู้ทำรายการ (admin)
        customer_name: "",
        amount: Number(r.amount ?? 0),
        detail: "เบิกเงินค่าสินค้า",
        link: `/admin/accounting`,
        status: r.status ?? "1",
        slipUrl: slipMap[String(r.id)] ?? null,
        statusLabel: "รอดำเนินการ",
        statusTone: "warning" as const,
      }));
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
      // 2nd lookup — the RPC doesn't return ซื้อเพื่อ / รู้จักจาก / โน้ต / VIP / เซล; pull from tb_users.
      type UsrExtra = { userID: string; shopUser: string | null; channel: string | null; userNote: string | null; coID: string | null; adminIDSale: string | null };
      const extraMap = new Map<string, UsrExtra>();
      // นิติบุคคล display (owner 2026-07-04) — company name for a company row.
      const corpNameByUser = new Map<string, string>();
      const uids = rows.map((u) => u.userID).filter(Boolean);
      if (uids.length > 0) {
        const [exRes, corpRes] = await Promise.all([
          admin
            .from("tb_users")
            .select("userID,shopUser,channel,userNote,coID,adminIDSale")
            .in("userID", uids),
          admin
            .from("tb_corporate")
            .select("userid, corporatename")
            .in("userid", uids),
        ]);
        if (exRes.error) console.warn(`[tb_users usersActive extra] failed (soft-fail)`, exRes.error);
        if (corpRes.error) console.warn(`[tb_corporate usersActive] failed (soft-fail · person name)`, corpRes.error);
        for (const e of (exRes.data ?? []) as unknown as UsrExtra[]) extraMap.set(e.userID, e);
        for (const c of (corpRes.data ?? []) as { userid: string; corporatename: string | null }[]) {
          const nm = (c.corporatename ?? "").trim();
          if (c.userid && nm) corpNameByUser.set(c.userid, nm);
        }
      }
      return rows.map((u) => {
        const ex = extraMap.get(u.userID);
        const identity = resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpNameByUser.has(u.userID)
            ? { corporatename: corpNameByUser.get(u.userID)!, corporatenumber: null, corporateaddress: null }
            : null,
        });
        return {
          id: String(u.ID),
          created_at: u.userRegistered ?? "",
          member_code: u.userID,
          customer_name: identity.name || "—",
          amount: 0,
          detail: `${u.userTel ?? "—"}${u.userEmail ? ` · ${u.userEmail}` : ""}`,
          link: `/admin/customers/${u.userID}`,
          status: "registered",
          shopUserLabel: ex?.shopUser ? (SHOP_USER_LABEL[ex.shopUser] ?? "—") : "—",
          channelLabel: ex?.channel ? (CHANNEL_LABEL[ex.channel] ?? "—") : "—",
          note: (ex?.userNote ?? "").trim() || null,
          vip: vipTierBadge(ex?.coID),
          saleRep: (ex?.adminIDSale ?? "").trim() || null,
        };
      });
    }

    default:
      return [];
  }
}

// ── Raw row types ──────────────────────────────────────────────────────────

type RawWalletHsRow   = { id: number | string; date: string | null; amount: number | string; status: string | null; imagesslip: string | null; userid: string };
type RawHeaderOrderRow = { id: number | string; hno: string | null; hstatus: string | null; htotalpriceuser: number | string; hdate: string | null; hdate2: string | null; hdate3: string | null; hdate4: string | null; hdate5: string | null; htitle: string | null; userid: string; hcover: string | null; hcount: number | string | null; adminidcreate: string | null; adminidupdate: string | null; hnote: string | null; hnoteuser: string | number | null; hnoteuserread: string | number | null; hnotedate: string | null; hdatepayment: string | null };
type RawForwarderRow  = { id: number | string; fdate: string | null; fstatus: string | null; fidorco: string | null; ftotalprice: number | string; ftransporttype: string | null; fweight: number | string; fvolume: number | string; userid: string; fcabinetnumber: string | null; fcredit: string | null; fcover: string | null; ftrackingchn: string | null; ftrackingth: string | null; fshipby: string | null; faddressname: string | null; faddresslastname: string | null; faddressno: string | null; faddresssubdistrict: string | null; faddressdistrict: string | null; faddressprovince: string | null; faddresszipcode: string | null; fnote: string | null; adminidupdate: string | null };
type RawPaymentRow    = { id: number | string; paydate: string | null; paystatus: string | null; paytype: string | null; payyuan: number | string; paythb: number | string; userid: string; imagesslip: string | null; paydetail: string | null };
type RawUserListRow   = { ID: number | string; userID: string; userName: string | null; userLastName: string | null; userTel: string | null; userEmail: string | null; userRegistered: string | null; userCompany: string | null };

// ── Cards ──────────────────────────────────────────────────────────────────

function RevenueCard({
  tone, icon, label, monthValue, todayValue, subtitle, href, note,
}: {
  tone: "info" | "danger" | "primary" | "success";
  icon: React.ReactNode;
  label: string;
  monthValue: number;
  todayValue?: number;
  subtitle?: string;
  href: string;
  /** Explain an anomaly inline (owner 2026-06-22 · e.g. a negative wallet total). */
  note?: string;
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
            <p className="mt-2 text-sm font-semibold text-foreground line-clamp-2">{label}</p>
            {todayValue !== undefined ? (
              <p className="text-xs text-muted mt-1">วันนี้: ฿{formatTHB(todayValue)}</p>
            ) : subtitle ? (
              <p className="text-xs text-muted mt-1">{subtitle}</p>
            ) : null}
            {note ? (
              <p className="mt-1.5 text-[11px] leading-snug font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                ⚠️ {note}
              </p>
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
      <p className="text-[11px] uppercase tracking-widest text-muted">{label}</p>
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
            <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>
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

// Small inline badge (legacy badge-pill).
function MiniBadge({ text, tone }: { text: string; tone: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{text}</span>;
}

// หมายเหตุ block (legacy shopTableAll.php:38-52 / forwarderTableAll) — visibility badge
// + red note bar + note date + "ผ่านมา" relative time. Shared by shop + forwarder rows.
function NoteBlock({ r }: { r: RowShape }) {
  if (!r.note) return null;
  return (
    <div className="mt-1 space-y-0.5">
      {r.noteVisibility === "admin"
        ? <MiniBadge text="แอดมินเท่านั้น" tone="bg-amber-100 text-amber-700" />
        : <MiniBadge text="ทั้งลูกค้าและแอดมิน" tone="bg-cyan-100 text-cyan-700" />}
      <div className="rounded bg-red-600 text-white px-1.5 py-0.5 text-[11px] max-w-[320px] whitespace-normal break-words">หมายเหตุ : {r.note}</div>
      {r.noteDate ? (
        <div className="text-[11px] text-muted">{r.noteDate} · ผ่านมา <span className="text-red-600">{relativeTimeTh(r.noteDate)}</span></div>
      ) : null}
    </div>
  );
}

// อัปเดต cell (legacy: status-date + "ผ่านมา" + adminIDUpdate). Shared shop + forwarder.
function UpdateCell({ r }: { r: RowShape }) {
  const d = r.updateDate ?? r.created_at;
  return (
    <div className="text-xs text-muted whitespace-nowrap">
      {d ? (
        <>
          <div>{new Date(d).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</div>
          <div>ผ่านมา <span className="text-red-600">{relativeTimeTh(d)}</span></div>
        </>
      ) : "—"}
      {r.updateAdmin ? <div className="text-foreground/70 mt-0.5">{r.updateAdmin}</div> : null}
    </div>
  );
}

// ── Shop tabs (ฝากสั่งซื้อ) — legacy 8-col table (oop/shopTableAll.php) ──────
// วันที่สร้าง · รหัสสมาชิก · เลขที่ออเดอร์ · ข้อมูลสินค้า · ราคารวม · สถานะ · อัปเดต · ตัวเลือก
function ShopTabTable({ rows }: { rows: RowShape[] }) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-sm text-muted">ไม่มีรายการในหมวดนี้</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 whitespace-nowrap">วันที่สร้าง</th>
            <th className="px-3 py-3">รหัสสมาชิก</th>
            <th className="px-3 py-3">เลขที่ออเดอร์</th>
            <th className="px-3 py-3">ข้อมูลสินค้า</th>
            <th className="px-3 py-3 text-right whitespace-nowrap">ราคารวม (บาท)</th>
            <th className="px-3 py-3">สถานะ</th>
            <th className="px-3 py-3 whitespace-nowrap">อัปเดต</th>
            <th className="px-3 py-3">ตัวเลือก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const created = r.created_at ? new Date(r.created_at) : null;
            const tone = r.statusTone ? STATUS_TONE_CLASS[r.statusTone] : "bg-amber-100 text-amber-700";
            const deadline = r.deadline ? new Date(r.deadline) : null;
            return (
              // zebra striping (สีสลับ · owner "ไม่ให้ลายตา")
              <tr key={r.id} className="border-b border-border/60 odd:bg-surface-alt/20 hover:bg-primary-50/30 transition-colors align-top">
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (<><div>{created.toLocaleDateString("th-TH")}</div><div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div></>) : "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/customers/${r.member_code ?? ""}`} className="text-blue-600 hover:underline font-mono text-xs">{r.member_code ?? "—"}</Link>
                  {r.vip ? <> <MiniBadge text={r.vip} tone="bg-violet-100 text-violet-700" /></> : null}
                  {r.saleRep ? <> <MiniBadge text={`Sale : ${r.saleRep}`} tone="bg-emerald-100 text-emerald-700" /></> : null}
                  <div className="text-foreground text-xs mt-0.5">{r.customer_name}</div>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={r.link} className="text-blue-600 hover:underline font-mono text-xs">{r.orderNo ?? "—"}</Link>
                  {r.ipc ? <div className="mt-0.5"><MiniBadge text={`IPC : ${r.ipc}`} tone="bg-blue-100 text-blue-700" /></div> : null}
                  {r.promo ? <div className="mt-0.5"><MiniBadge text={`โปร ${r.promo}`} tone="bg-pink-100 text-pink-700" /></div> : null}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    {r.slipUrl ? (
                      <a href={r.slipUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" title="รูปสินค้า">
                        <SlipImage src={r.slipUrl} pdfMode="tile" className="h-14 w-14 rounded-lg border border-border object-cover bg-surface-alt" />
                      </a>
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-xs text-foreground" dangerouslySetInnerHTML={{ __html: r.detail }} />
                      {deadline ? (
                        <div className="mt-1 text-[11px]">กรุณาชำระเงินก่อน <span className="text-red-600 font-medium">{deadline.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}</span> น.</div>
                      ) : null}
                      <NoteBlock r={r} />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right font-bold text-red-600 whitespace-nowrap tabular-nums">฿{formatTHB(r.amount)}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}>{r.statusLabel ?? "รอดำเนินการ"}</span>
                </td>
                <td className="px-3 py-3"><UpdateCell r={r} /></td>
                <td className="px-3 py-3">
                  <Link href={r.link} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1 text-xs font-bold shadow-sm hover:shadow-md whitespace-nowrap">
                    <Eye className="w-3 h-3" /> ดูรายละเอียด
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Forwarder tabs (ฝากนำเข้า) — legacy 9-col table (oop/forwarderTableAll.php) ──
// วันที่สร้าง · รหัสลูกค้า · รายละเอียด · ยอดค้างชำระ · เลขพัสดุ(จีน) · เลขพัสดุ(ไทย) · สถานะ · อัปเดต · ตัวเลือก
function ForwarderTabTable({ rows }: { rows: RowShape[] }) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-sm text-muted">ไม่มีรายการในหมวดนี้</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 whitespace-nowrap">วันที่สร้าง</th>
            <th className="px-3 py-3">รหัสลูกค้า</th>
            <th className="px-3 py-3">รายละเอียด</th>
            <th className="px-3 py-3 text-right whitespace-nowrap">ยอดค้างชำระ</th>
            <th className="px-3 py-3">เลขพัสดุ (จีน)</th>
            <th className="px-3 py-3">เลขพัสดุ (ไทย)</th>
            <th className="px-3 py-3">สถานะ</th>
            <th className="px-3 py-3 whitespace-nowrap">อัปเดต</th>
            <th className="px-3 py-3">ตัวเลือก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const created = r.created_at ? new Date(r.created_at) : null;
            const tone = r.statusTone ? STATUS_TONE_CLASS[r.statusTone] : "bg-amber-100 text-amber-700";
            return (
              <tr key={r.id} className="border-b border-border/60 odd:bg-surface-alt/20 hover:bg-primary-50/30 transition-colors align-top">
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (<><div>{created.toLocaleDateString("th-TH")}</div><div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div></>) : "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/customers/${r.member_code ?? ""}`} className="text-blue-600 hover:underline font-mono text-xs">{r.member_code ?? "—"}</Link>
                  {r.vip ? <> <MiniBadge text={r.vip} tone="bg-violet-100 text-violet-700" /></> : null}
                  {r.saleRep ? <> <MiniBadge text={`Sale : ${r.saleRep}`} tone="bg-emerald-100 text-emerald-700" /></> : null}
                  <div className="text-foreground text-xs mt-0.5">{r.customer_name}</div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    {r.slipUrl ? (
                      <a href={r.slipUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" title="รูปสินค้า">
                        <SlipImage src={r.slipUrl} pdfMode="tile" className="h-12 w-12 rounded-lg border border-border object-cover bg-surface-alt" />
                      </a>
                    ) : null}
                    <div className="min-w-0">
                      <p className="text-xs text-foreground" dangerouslySetInnerHTML={{ __html: r.detail }} />
                      <NoteBlock r={r} />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right whitespace-nowrap">
                  <div className="font-bold text-red-600 tabular-nums">฿{formatTHB(r.amount)}</div>
                  {r.transportInfo ? <div className="text-[11px] text-muted mt-0.5">{r.transportInfo}</div> : null}
                </td>
                <td className="px-3 py-3 text-xs">
                  {r.trackingChn ? <div className="font-mono">{r.trackingChn}</div> : <span className="text-muted">—</span>}
                  {r.cabinet ? <div className="text-[11px] text-muted mt-0.5">เลขตู้: {r.cabinet}</div> : null}
                </td>
                <td className="px-3 py-3 text-xs">
                  {r.shipByTh ? <div className="font-medium">{r.shipByTh}</div> : null}
                  {r.trackingTh ? <div className="font-mono text-[11px]">{r.trackingTh}</div> : null}
                  {r.address ? <div className="text-[11px] text-muted mt-0.5 max-w-[240px] whitespace-normal">{r.address}</div> : (!r.shipByTh && !r.trackingTh ? <span className="text-muted">—</span> : null)}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}>{r.statusLabel ?? "รอดำเนินการ"}</span>
                </td>
                <td className="px-3 py-3"><UpdateCell r={r} /></td>
                <td className="px-3 py-3">
                  <Link href={r.link} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1 text-xs font-bold shadow-sm hover:shadow-md whitespace-nowrap">
                    <Eye className="w-3 h-3" /> ดูรายละเอียด
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ฝากโอน (payment) tab — legacy 9-col table (CEO/payment.php) ─────────────
// วันที่สร้าง · เลขที่ออเดอร์ · ชื่อ-นามสกุล · รายละเอียด · วิธีการชำระ · ยอดรวม · สถานะ · อัปเดต · ตัวเลือก
function PaymentTabTable({ rows }: { rows: RowShape[] }) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-sm text-muted">ไม่มีรายการในหมวดนี้</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 whitespace-nowrap">วันที่สร้าง</th>
            <th className="px-3 py-3">เลขที่ออเดอร์</th>
            <th className="px-3 py-3">ชื่อ-นามสกุล</th>
            <th className="px-3 py-3">รายละเอียด</th>
            <th className="px-3 py-3">วิธีการชำระ</th>
            <th className="px-3 py-3 text-right whitespace-nowrap">ยอดรวม (บาท)</th>
            <th className="px-3 py-3">สถานะ</th>
            <th className="px-3 py-3 whitespace-nowrap">อัปเดต</th>
            <th className="px-3 py-3">ตัวเลือก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const created = r.created_at ? new Date(r.created_at) : null;
            const tone = r.statusTone ? STATUS_TONE_CLASS[r.statusTone] : "bg-amber-100 text-amber-700";
            return (
              <tr key={r.id} className="border-b border-border/60 odd:bg-surface-alt/20 hover:bg-primary-50/30 transition-colors align-top">
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (<><div>{created.toLocaleDateString("th-TH")}</div><div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div></>) : "—"}
                </td>
                <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{r.orderNo ?? "—"}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/customers/${r.member_code ?? ""}`} className="text-blue-600 hover:underline font-mono text-xs">{r.member_code ?? "—"}</Link>
                  {r.vip ? <> <MiniBadge text={r.vip} tone="bg-violet-100 text-violet-700" /></> : null}
                  {r.saleRep ? <> <MiniBadge text={`Sale : ${r.saleRep}`} tone="bg-emerald-100 text-emerald-700" /></> : null}
                  <div className="text-foreground text-xs mt-0.5">{r.customer_name}</div>
                </td>
                <td className="px-3 py-3">
                  <p className="text-xs text-foreground max-w-[280px] whitespace-normal" dangerouslySetInnerHTML={{ __html: r.detail }} />
                </td>
                <td className="px-3 py-3 text-xs text-muted whitespace-normal max-w-[160px]">{r.payMethod ?? "—"}</td>
                <td className="px-3 py-3 text-right font-bold text-red-600 whitespace-nowrap tabular-nums">฿{formatTHB(r.amount)}</td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}>{r.statusLabel ?? "รอดำเนินการ"}</span>
                </td>
                <td className="px-3 py-3"><UpdateCell r={r} /></td>
                <td className="px-3 py-3">
                  <Link href={r.link} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1 text-xs font-bold shadow-sm hover:shadow-md whitespace-nowrap">
                    <Eye className="w-3 h-3" /> ดู / แก้ไข
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ลูกค้าที่ยังไม่ได้ใช้งาน (usersActive) — legacy 6-col table ───────────────
// วันที่สมัคร · ซื้อสินค้าเพื่อ · รู้จักเราจาก · รหัสสมาชิก · ชื่อ-นามสกุล · โน้ต
function UsersActiveTable({ rows }: { rows: RowShape[] }) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-sm text-muted">ไม่มีลูกค้าใหม่ที่ยังไม่ใช้งาน</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <div className="px-3 pt-3 text-xs text-muted">แสดงล่าสุด · <Link href="/admin/customers" className="text-primary-600 hover:underline">ไปยังทุกรายการ</Link></div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 whitespace-nowrap">วันที่สมัครสมาชิก</th>
            <th className="px-3 py-3">ซื้อสินค้าเพื่อ</th>
            <th className="px-3 py-3">รู้จักเราจาก</th>
            <th className="px-3 py-3">รหัสสมาชิก</th>
            <th className="px-3 py-3">ชื่อ-นามสกุล</th>
            <th className="px-3 py-3">โน้ต</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const created = r.created_at ? new Date(r.created_at) : null;
            return (
              <tr key={r.id} className="border-b border-border/60 odd:bg-surface-alt/20 hover:bg-primary-50/30 transition-colors align-top">
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (<><div>{created.toLocaleDateString("th-TH")}</div><div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div></>) : "—"}
                </td>
                <td className="px-3 py-3 text-xs">{r.shopUserLabel ?? "—"}</td>
                <td className="px-3 py-3 text-xs whitespace-normal max-w-[200px]">{r.channelLabel ?? "—"}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={r.link} className="text-blue-600 hover:underline font-mono text-xs">{r.member_code ?? "—"}</Link>
                  {r.vip ? <> <MiniBadge text={r.vip} tone="bg-violet-100 text-violet-700" /></> : null}
                  {r.saleRep ? <> <MiniBadge text={`Sale : ${r.saleRep}`} tone="bg-emerald-100 text-emerald-700" /></> : null}
                </td>
                <td className="px-3 py-3 text-xs text-foreground">
                  <Link href={r.link} className="hover:underline">คุณ{r.customer_name}</Link>
                  <div className="text-[11px] text-muted" dangerouslySetInnerHTML={{ __html: r.detail }} />
                </td>
                <td className="px-3 py-3 text-xs text-muted whitespace-normal max-w-[220px]">{r.note ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ถอนเงิน (withdraw) — legacy 7-col table (withdrawUser.php) ───────────────
// ลำดับ · วันที่ทำรายการ · ชื่อ-นามสกุล · สถานะรายการ · สลิป · ยอดเงินที่ถอน · ตัวเลือก
function WithdrawTable({ rows }: { rows: RowShape[] }) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-sm text-muted">ไม่มีรายการถอนเงิน</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 w-[50px] text-center">ลำดับ</th>
            <th className="px-3 py-3 whitespace-nowrap">วันที่ทำรายการ</th>
            <th className="px-3 py-3">ชื่อ-นามสกุล</th>
            <th className="px-3 py-3">สถานะรายการ</th>
            <th className="px-3 py-3">สลิป</th>
            <th className="px-3 py-3 text-right whitespace-nowrap">ยอดเงินที่ถอน</th>
            <th className="px-3 py-3">ตัวเลือก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const created = r.created_at ? new Date(r.created_at) : null;
            const tone = r.statusTone ? STATUS_TONE_CLASS[r.statusTone] : "bg-amber-100 text-amber-700";
            return (
              <tr key={r.id} className="border-b border-border/60 odd:bg-surface-alt/20 hover:bg-primary-50/30 transition-colors align-top">
                <td className="px-3 py-3 text-center text-xs font-mono">{i + 1}</td>
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (<><div>{created.toLocaleDateString("th-TH")}</div><div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div></>) : "—"}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Link href={`/admin/customers/${r.member_code ?? ""}`} className="text-blue-600 hover:underline font-mono text-xs">{r.member_code ?? "—"}</Link>
                  {r.vip ? <> <MiniBadge text={r.vip} tone="bg-violet-100 text-violet-700" /></> : null}
                  {r.saleRep ? <> <MiniBadge text={`Sale : ${r.saleRep}`} tone="bg-emerald-100 text-emerald-700" /></> : null}
                  <div className="text-foreground text-xs mt-0.5">คุณ{r.customer_name}</div>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}>{r.statusLabel ?? "รอดำเนินการ"}</span>
                </td>
                <td className="px-3 py-3">
                  {r.slipUrl ? (
                    <a href={r.slipUrl} target="_blank" rel="noopener noreferrer" title="เปิดสลิป">
                      <SlipImage src={r.slipUrl} pdfMode="tile" className="h-12 w-12 rounded-lg border border-border object-cover bg-surface-alt" />
                    </a>
                  ) : <span className="text-xs text-muted">— ไม่มีสลิป</span>}
                </td>
                <td className="px-3 py-3 text-right font-bold text-red-600 whitespace-nowrap tabular-nums">฿{formatTHB(r.amount)}</td>
                <td className="px-3 py-3">
                  <Link href={r.link} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1 text-xs font-bold shadow-sm hover:shadow-md whitespace-nowrap">
                    <Eye className="w-3 h-3" /> ดู / แก้ไข
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── เบิกเงินค่าสินค้า (payShop) — legacy 6-col (payShopPCS.php · tb_shop_pay_h) ──
// วันที่ทำรายการ · ผู้ทำรายการ · จำนวนเงิน · สลิป · สถานะทำรายการ · ตัวเลือก
function PayShopTable({ rows }: { rows: RowShape[] }) {
  if (rows.length === 0) {
    return <div className="p-12 text-center text-sm text-muted">ไม่มีรายการเบิกเงินค่าสินค้า</div>;
  }
  return (
    <div className="overflow-x-auto scrollbar-x-visible">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-3 whitespace-nowrap">วันที่ทำรายการ</th>
            <th className="px-3 py-3">ผู้ทำรายการ</th>
            <th className="px-3 py-3 text-right whitespace-nowrap">จำนวนเงิน</th>
            <th className="px-3 py-3">สลิป</th>
            <th className="px-3 py-3">สถานะทำรายการ</th>
            <th className="px-3 py-3">ตัวเลือก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const created = r.created_at ? new Date(r.created_at) : null;
            const tone = r.statusTone ? STATUS_TONE_CLASS[r.statusTone] : "bg-amber-100 text-amber-700";
            return (
              <tr key={r.id} className="border-b border-border/60 odd:bg-surface-alt/20 hover:bg-primary-50/30 transition-colors align-top">
                <td className="px-3 py-3 text-xs text-muted whitespace-nowrap">
                  {created ? (<><div>{created.toLocaleDateString("th-TH")}</div><div>{created.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.</div></>) : "—"}
                </td>
                <td className="px-3 py-3 text-xs font-mono">{r.member_code ?? "—"}</td>
                <td className="px-3 py-3 text-right font-bold text-red-600 whitespace-nowrap tabular-nums">฿{formatTHB(r.amount)}</td>
                <td className="px-3 py-3">
                  {r.slipUrl ? (
                    <a href={r.slipUrl} target="_blank" rel="noopener noreferrer" title="เปิดสลิป">
                      <SlipImage src={r.slipUrl} pdfMode="tile" className="h-12 w-12 rounded-lg border border-border object-cover bg-surface-alt" />
                    </a>
                  ) : <span className="text-xs text-muted">— ไม่มีสลิป</span>}
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${tone}`}>{r.statusLabel ?? "รอดำเนินการ"}</span>
                </td>
                <td className="px-3 py-3">
                  <Link href={r.link} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-700 text-white px-3 py-1 text-xs font-bold shadow-sm hover:shadow-md whitespace-nowrap">
                    <Eye className="w-3 h-3" /> ดำเนินการ
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Active tab content table ───────────────────────────────────────────────

function ActiveTabTable({ tab, rows }: { tab: TabKey; rows: RowShape[] }) {
  // ลูกค้าที่ยังไม่ได้ใช้งาน renders the legacy 6-col users table.
  if (tab === "inactiveCustomers") {
    return <UsersActiveTable rows={rows} />;
  }
  // ถอนเงิน renders the legacy 7-col withdraw table.
  if (tab === "withdraw") {
    return <WithdrawTable rows={rows} />;
  }
  // เบิกเงินค่าสินค้า renders the legacy 6-col shop-disbursement table.
  if (tab === "payShop") {
    return <PayShopTable rows={rows} />;
  }
  // ฝากสั่งซื้อ tabs render the legacy 8-col shop table (owner 2026-07-04).
  if (tab === "shop1" || tab === "shop2" || tab === "shop3" || tab === "shop4") {
    return <ShopTabTable rows={rows} />;
  }
  // ฝากนำเข้า tabs render the legacy 9-col forwarder table.
  if (tab === "forwarder1" || tab === "forwarder5" || tab === "forwarderC" || tab === "forwarder6" || tab === "forwarder62") {
    return <ForwarderTabTable rows={rows} />;
  }
  // ฝากโอน tab renders the legacy 9-col payment table.
  if (tab === "payment") {
    return <PaymentTabTable rows={rows} />;
  }
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
          <tr className="border-b-2 border-border bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
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
                  <div className="flex items-start gap-3">
                    {/* Slip thumbnail (owner 2026-06-21) — proves a slip is attached
                        + renders; click opens the full slip in a new tab. */}
                    {r.slipUrl ? (
                      <a href={r.slipUrl} target="_blank" rel="noopener noreferrer" className="shrink-0" title="เปิดสลิปเต็ม">
                        <SlipImage
                          src={r.slipUrl}
                          pdfMode="tile"
                          className="h-16 w-16 rounded-lg border border-border object-cover bg-surface-alt hover:ring-2 hover:ring-primary-300"
                        />
                      </a>
                    ) : null}
                    <div className="min-w-0">
                      <Link href={r.link} className="text-blue-600 hover:underline font-mono text-xs">
                        {r.member_code ?? "—"}
                      </Link>{" "}
                      <span className="text-foreground">{r.customer_name}</span>
                      <p className="mt-1 text-xs text-muted" dangerouslySetInnerHTML={{ __html: r.detail }} />
                      {r.amount > 0 && (
                        <p className="mt-1 text-sm font-bold text-red-600">
                          ยอดเงิน: ฿{formatTHB(r.amount)}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="inline-flex rounded-full bg-amber-100 text-amber-700 px-2.5 py-0.5 text-[11px] font-bold">
                    รอดำเนินการ
                  </span>
                  {TAB_NEXT[tab] ? (
                    <div className="mt-1 text-[11px] font-semibold text-rose-600 whitespace-nowrap">
                      🔔 {TAB_NEXT[tab]}
                    </div>
                  ) : null}
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

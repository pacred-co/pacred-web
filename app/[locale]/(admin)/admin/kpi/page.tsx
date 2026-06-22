import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import {
  ShoppingBasket, Box, ArrowLeftRight, Wallet as WalletIcon,
  Users, Container as ContainerIcon, TrendingUp, TrendingDown, Minus,
} from "lucide-react";

/**
 * Executive KPI dashboard (Tier-1 / G-A-1 — capability-tools-strategy).
 *
 * The single business-health roll-up the per-department `/admin/reports/*`
 * pages don't give: revenue (month + today), orders by status, container
 * throughput, signups, wallet top-up volume — each with a vs-last-month
 * baseline so a number means something.
 *
 * Built per the `audit-kpi-dashboard` skill: name → classify → source →
 * query → render. All data is read live from the existing Supabase tables
 * via `createAdminClient()` (RLS bypass) — no migration, no SQL view; the
 * dashboard refreshes on every visit (`force-dynamic`).
 *
 * Gated to office roles only — it exposes company-wide revenue + total
 * wallet balance, which floor-ops roles (driver / warehouse) shouldn't see.
 */

export const dynamic = "force-dynamic";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// Wave 3 cleanup (2026-05-20 ค่ำ): the rebuilt `containers` + `cargo_containers`
// spine was retired under D1 Option A. Container-throughput KPIs now read
// from `tb_forwarder` (the legacy single source of truth, faithful port of
// report-cnt.php). The legacy `fStatus` column is 1..7 — 1..3 = pre-arrival
// (กำลังขนส่ง), 4..6 = post-arrival (ถึงไทยแล้ว / สำเร็จ), 7 = ยกเลิก.
// Counts are DISTINCT on fCabinetNumber (so 50 shipments in 1 container = 1 ตู้).
//
// Wave 20 P0-3 (2026-05-25 ค่ำ): the REMAINING rebuilt-schema reads on
// this dashboard (revenue + signups + wallet) were swapped to legacy tb_*
// where the 8,898 customers + years of orders actually live. Field map
// follows admin/page.tsx (commit `9c0ffd6` Wave 6 P0):
//   service_orders.total_thb    → tb_header_order.hcostallth
//   service_orders.created_at   → tb_header_order.hdate
//   service_orders.status enum  → tb_header_order.hstatus '1'..'6'
//                                  (cancel = '6', not 'cancelled')
//   forwarders.total_price      → tb_forwarder.ftotalprice
//   forwarders.created_at       → tb_forwarder.fdate
//   forwarders.status enum      → tb_forwarder.fstatus '1'..'7'
//                                  (no "cancelled" — legacy uses '6'/'62' workflow)
//   yuan_payments.thb_amount    → tb_payment.paythb
//   yuan_payments.created_at    → tb_payment.paydate
//   yuan_payments.status enum   → tb_payment.paystatus '1'=pending,'2'=completed
//   profiles.created_at         → tb_users.userregistered
//   wallet_transactions.amount  → tb_wallet_hs.amount
//   wallet_transactions.kind    → tb_wallet_hs.type '1'=deposit (and `typenew='1'`)
//   wallet_transactions.status  → tb_wallet_hs.status '1'=pending,'2'=completed,'3'=failed
//   wallet_transactions.created_at → tb_wallet_hs.date
//   wallet.balance              → tb_wallet.wallettotal

// hstatus / fstatus → human label maps (legacy `tb_header_order.hstatus`
// IS '1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิกออเดอร์'
// and `tb_forwarder.fstatus` per service-import/table/page.tsx helper).
const HSTATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ", "2": "รอชำระเงิน", "3": "สั่งสินค้า",
  "4": "รอร้านจีนจัดส่ง", "40": "ถึงโกดังจีน", "5": "สำเร็จ", "6": "ยกเลิกออเดอร์",
};
const FSTATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน", "2": "ถึงโกดังจีนแล้ว", "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",    "5": "รอชำระเงิน",       "6": "เตรียมส่ง / กำลังจัดส่ง",
  "62": "กำลังจัดส่ง",   "7": "ส่งแล้ว",
};

// ── tiny helpers ─────────────────────────────────────────────────────────
function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function int(n: number): string {
  return n.toLocaleString("th-TH");
}
/** % change a→b; null when there's no prior baseline to divide by. */
function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 100);
}
function sumNum<T extends Record<string, unknown>>(rows: T[] | null, key: keyof T): number {
  return (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
}

export default async function AdminKpiPage() {
  // Office roles only — company-wide revenue + wallet totals below.
  await requireAdmin(["ops", "accounting", "sales_admin"]);
  const admin = createAdminClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  // Previous full calendar month — the vs-baseline window.
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = monthStart; // exclusive upper bound = this month's start
  const monthLabel = `${THAI_MONTHS[now.getMonth()]} ${now.getFullYear() + 543}`;
  const prevMonthLabel = THAI_MONTHS[(now.getMonth() + 11) % 12];

  // Status enums we'll count separately (one count query each) to avoid the
  // PostgREST 1000-row cap (a `.select("hstatus").limit(50_000)` is silently
  // capped to 1000 by Supabase's `db.max_rows` ceiling, so an in-app group-by
  // would skew toward the most-recent rows). The prior-art admin/page.tsx
  // uses the same per-enum count pattern.
  const HSTATUS_CODES = Object.keys(HSTATUS_LABEL);
  const FSTATUS_CODES = Object.keys(FSTATUS_LABEL);

  const [
    // revenue — this month (exclude cancelled; yuan only counts completed)
    soMonth, fwMonth, yuanMonth,
    // revenue — today
    soToday, fwToday, yuanToday,
    // revenue — previous full month (baseline)
    soPrev, fwPrev, yuanPrev,
    // orders by status — per-enum count queries (see HSTATUS_CODES note)
    soStatusCounts, fwStatusCounts,
    // container throughput (Wave 3: from tb_forwarder DISTINCT fcabinetnumber)
    containersInTransitRows, containersArrivedMonthRows,
    // signups
    signupsMonth, signupsToday, signupsPrev, signupsTotal,
    // wallet top-up volume (completed deposits)
    walletDepMonth, walletDepPrev, walletBalances,
  ] = await Promise.all([
    // Revenue this month — legacy tb_* (8,898 customers + years of orders).
    // tb_header_order.hstatus '6' = ยกเลิกออเดอร์; tb_payment.paystatus '2' = สำเร็จ.
    // tb_forwarder has no legacy "cancelled" status — workflow goes 1→7, no exclusion.
    admin.from("tb_header_order").select("hcostallth").gte("hdate", monthStart).neq("hstatus", "6"),
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", monthStart),
    admin.from("tb_payment").select("paythb").gte("paydate", monthStart).eq("paystatus", "2"),

    admin.from("tb_header_order").select("hcostallth").gte("hdate", todayStart).neq("hstatus", "6"),
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", todayStart),
    admin.from("tb_payment").select("paythb").gte("paydate", todayStart).eq("paystatus", "2"),

    admin.from("tb_header_order").select("hcostallth").gte("hdate", prevMonthStart).lt("hdate", prevMonthEnd).neq("hstatus", "6"),
    admin.from("tb_forwarder").select("ftotalprice").gte("fdate", prevMonthStart).lt("fdate", prevMonthEnd),
    admin.from("tb_payment").select("paythb").gte("paydate", prevMonthStart).lt("paydate", prevMonthEnd).eq("paystatus", "2"),

    // Orders by status — one count query PER enum so we don't hit the
    // PostgREST 1000-row cap. Returns an array of { code, count } for the
    // status pane to render. `Promise.all` keeps this parallel inside the
    // outer Promise.all → still one network round-trip total.
    Promise.all(HSTATUS_CODES.map(async (code) => {
      const res = await admin.from("tb_header_order").select("id", { count: "exact", head: true }).eq("hstatus", code);
      return { code, count: res.count ?? 0, error: res.error };
    })),
    Promise.all(FSTATUS_CODES.map(async (code) => {
      const res = await admin.from("tb_forwarder").select("id", { count: "exact", head: true }).eq("fstatus", code);
      return { code, count: res.count ?? 0, error: res.error };
    })),

    // In-transit ตู้ — tb_forwarder fStatus 1..3 = pre-arrival, DISTINCT fcabinetnumber.
    // No date filter (we want the live load, not just rows created this month).
    admin.from("tb_forwarder")
      .select("fcabinetnumber")
      .not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0")
      .lt("fstatus", "4")
      .limit(50_000),

    // Arrived ตู้ this month — fStatus 4..6 (ถึงไทยแล้ว / completed), DISTINCT.
    // Date filter on fdatestatus4 (the legacy column for "arrived at Thailand").
    admin.from("tb_forwarder")
      .select("fcabinetnumber")
      .not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0")
      .gt("fstatus", "3").lt("fstatus", "7")
      .gte("fdatestatus4", monthStart)
      .limit(50_000),

    // Signups — legacy tb_users.userRegistered. ~8,898 customers ported
    // (vs ~3 rows on profiles). No `userActive`/`userStatus` filter — count
    // all registrations in the window for consistency with admin/page.tsx.
    admin.from("tb_users").select("ID", { count: "exact", head: true }).gte("userRegistered", monthStart),
    admin.from("tb_users").select("ID", { count: "exact", head: true }).gte("userRegistered", todayStart),
    admin.from("tb_users").select("ID", { count: "exact", head: true }).gte("userRegistered", prevMonthStart).lt("userRegistered", prevMonthEnd),
    admin.from("tb_users").select("ID", { count: "exact", head: true }),

    // Wallet top-up volume — legacy tb_wallet_hs. type='1' (ชำระเงิน) +
    // status='2' (สำเร็จ). Date column = `date` (the work date), matches
    // PHP report-wallet.php period filter.
    admin.from("tb_wallet_hs").select("amount").eq("type", "1").eq("status", "2").gte("date", monthStart),
    admin.from("tb_wallet_hs").select("amount").eq("type", "1").eq("status", "2").gte("date", prevMonthStart).lt("date", prevMonthEnd),
    // Wallet float (held) — one row per customer on tb_wallet, `wallettotal`.
    admin.from("tb_wallet").select("wallettotal"),
  ]);

  // AGENTS §0c: every Supabase query MUST surface its `error` rather than
  // silently falling back to null data — silent db errors are how the
  // 2026-05-25 PR10899 intermittent 404 slipped past Wave 18's smoke
  // gate. Log per-query; don't throw (one failed query shouldn't blank
  // the whole investor dashboard — partial data + visible logs are
  // preferable to a 500 here).
  const queryResults = {
    soMonth, fwMonth, yuanMonth, soToday, fwToday, yuanToday,
    soPrev, fwPrev, yuanPrev,
    containersInTransitRows, containersArrivedMonthRows,
    signupsMonth, signupsToday, signupsPrev, signupsTotal,
    walletDepMonth, walletDepPrev, walletBalances,
  };
  for (const [name, r] of Object.entries(queryResults)) {
    if (r.error) console.error(`[admin/kpi] query ${name} failed:`, r.error);
  }
  // Status-count sub-queries log their own errors (one per enum code).
  for (const r of soStatusCounts) if (r.error) console.error(`[admin/kpi] tb_header_order hstatus=${r.code} count failed:`, r.error);
  for (const r of fwStatusCounts) if (r.error) console.error(`[admin/kpi] tb_forwarder fstatus=${r.code} count failed:`, r.error);

  // DISTINCT fcabinetnumber → 1 ตู้ = 1 count (many forwarders share a container)
  const inTransitCount = new Set((containersInTransitRows.data ?? []).map((r) => (r as { fcabinetnumber: string }).fcabinetnumber)).size;
  const arrivedCount   = new Set((containersArrivedMonthRows.data ?? []).map((r) => (r as { fcabinetnumber: string }).fcabinetnumber)).size;

  // ── revenue roll-up ──
  // Wave 20 P0-3: column names follow legacy tb_* schema.
  //   tb_header_order.hcostallth = THB cost of one shop order
  //   tb_forwarder.ftotalprice   = THB cost of one import job
  //   tb_payment.paythb          = THB equivalent of one yuan-transfer
  const revMonth = sumNum(soMonth.data, "hcostallth") + sumNum(fwMonth.data, "ftotalprice") + sumNum(yuanMonth.data, "paythb");
  const revToday = sumNum(soToday.data, "hcostallth") + sumNum(fwToday.data, "ftotalprice") + sumNum(yuanToday.data, "paythb");
  const revPrev = sumNum(soPrev.data, "hcostallth") + sumNum(fwPrev.data, "ftotalprice") + sumNum(yuanPrev.data, "paythb");

  const revByChannel = [
    { label: "ฝากสั่งซื้อ", icon: <ShoppingBasket className="h-5 w-5" />, month: sumNum(soMonth.data, "hcostallth"), today: sumNum(soToday.data, "hcostallth"), href: "/admin/service-orders" },
    { label: "ฝากนำเข้า", icon: <Box className="h-5 w-5" />, month: sumNum(fwMonth.data, "ftotalprice"), today: sumNum(fwToday.data, "ftotalprice"), href: "/admin/forwarders" },
    { label: "ฝากโอนหยวน", icon: <ArrowLeftRight className="h-5 w-5" />, month: sumNum(yuanMonth.data, "paythb"), today: sumNum(yuanToday.data, "paythb"), href: "/admin/yuan-payments" },
  ];

  // ── orders by status ──
  // Wave 20 P0-3: legacy enum codes decode via *_LABEL maps; sort by count
  // descending and drop zero-count entries so the pane stays compact.
  const toBreakdown = (
    counts: { code: string; count: number }[],
    labelMap: Record<string, string>,
  ): [string, number][] =>
    counts
      .filter((r) => r.count > 0)
      .map((r): [string, number] => [labelMap[r.code] ?? r.code, r.count])
      .sort((a, b) => b[1] - a[1]);

  const soByStatus = toBreakdown(soStatusCounts, HSTATUS_LABEL);
  const fwByStatus = toBreakdown(fwStatusCounts, FSTATUS_LABEL);
  const soTotal = soByStatus.reduce((s, [, n]) => s + n, 0);
  const fwTotal = fwByStatus.reduce((s, [, n]) => s + n, 0);

  // ── wallet ──
  // Wave 20 P0-3: tb_wallet_hs.amount + tb_wallet.wallettotal.
  const walletMonth = sumNum(walletDepMonth.data, "amount");
  const walletPrev = sumNum(walletDepPrev.data, "amount");
  const walletHeld = sumNum(walletBalances.data, "wallettotal");

  // ── signups ──
  const signupMonthN = signupsMonth.count ?? 0;
  const signupTodayN = signupsToday.count ?? 0;
  const signupPrevN = signupsPrev.count ?? 0;
  const signupTotalN = signupsTotal.count ?? 0;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <PageHeader
        eyebrow="ADMIN · KPI"
        title="KPI ภาพรวมธุรกิจ"
        subtitle={`ตัวเลขสำคัญของบริษัท — รายได้ · ออเดอร์ · ตู้ · ลูกค้าใหม่ · ยอดชำระเงิน · เทียบกับเดือน${prevMonthLabel}`}
        actions={
          <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
            ← กลับภาพรวม
          </Link>
        }
      />

      {/* ── headline KPIs ── */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <BigStat
          tone="danger"
          icon={<TrendingUp className="h-5 w-5" />}
          label={`รายได้รวม · ${monthLabel}`}
          value={thb(revMonth)}
          sub={`วันนี้ ${thb(revToday)}`}
          delta={pctDelta(revMonth, revPrev)}
        />
        <BigStat
          tone="info"
          icon={<Users className="h-5 w-5" />}
          label="ลูกค้าใหม่ · เดือนนี้"
          value={int(signupMonthN)}
          sub={`วันนี้ ${int(signupTodayN)} · รวมทั้งหมด ${int(signupTotalN)}`}
          delta={pctDelta(signupMonthN, signupPrevN)}
        />
        <BigStat
          tone="success"
          icon={<WalletIcon className="h-5 w-5" />}
          label="ยอดชำระเงิน · เดือนนี้"
          value={thb(walletMonth)}
          sub={`ยอด wallet คงค้างรวม ${thb(walletHeld)}`}
          delta={pctDelta(walletMonth, walletPrev)}
        />
        <BigStat
          tone="primary"
          icon={<ContainerIcon className="h-5 w-5" />}
          label="ตู้กำลังขนส่ง"
          value={int(inTransitCount)}
          sub={`เข้าไทยแล้วเดือนนี้ ${int(arrivedCount)} ตู้`}
        />
      </section>

      {/* ── revenue by channel ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="font-bold text-sm">รายได้แยกตามช่องทาง · {monthLabel}</h2>
          <p className="text-[11px] text-muted mt-0.5">ไม่นับออเดอร์ที่ยกเลิก · ฝากโอนนับเฉพาะที่สำเร็จแล้ว</p>
        </div>
        <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          {revByChannel.map((c) => (
            <Link key={c.label} href={c.href} className="block p-4 hover:bg-surface-alt/40 transition-colors">
              <div className="flex items-center gap-2 text-muted">
                {c.icon}
                <span className="text-xs font-semibold">{c.label}</span>
              </div>
              <p className="mt-2 text-xl font-bold font-mono text-foreground">{thb(c.month)}</p>
              <p className="text-[11px] text-muted mt-0.5">วันนี้ {thb(c.today)}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ── orders by status ── */}
      <section className="grid lg:grid-cols-2 gap-5">
        <StatusPane
          title={`ฝากนำเข้า — ${int(fwTotal)} รายการทั้งหมด`}
          icon="📦"
          rows={fwByStatus}
          total={fwTotal}
          href="/admin/forwarders"
        />
        <StatusPane
          title={`ฝากสั่งซื้อ — ${int(soTotal)} รายการทั้งหมด`}
          icon="🛒"
          rows={soByStatus}
          total={soTotal}
          href="/admin/service-orders"
        />
      </section>

      <p className="text-[11px] text-muted">
        ตัวเลขดึงสดจากฐานข้อมูลทุกครั้งที่เปิดหน้านี้ · ช่วงเวลาอ้างอิงเขตเวลาเครื่องเซิร์ฟเวอร์
      </p>
    </main>
  );
}

// ── components ───────────────────────────────────────────────────────────

function BigStat({
  tone, icon, label, value, sub, delta,
}: {
  tone: "danger" | "info" | "success" | "primary";
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  delta?: number | null;
}) {
  const tones = {
    danger: "text-red-600",
    info: "text-cyan-600",
    success: "text-emerald-600",
    primary: "text-fuchsia-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={`text-2xl sm:text-3xl font-bold font-mono leading-none ${tones}`}>{value}</p>
          <p className="mt-2 text-xs font-semibold text-foreground line-clamp-2">{label}</p>
          <p className="mt-1 text-[11px] text-muted">{sub}</p>
        </div>
        <div className={`shrink-0 opacity-80 ${tones}`}>{icon}</div>
      </div>
      {delta !== undefined && <DeltaBadge delta={delta} />}
    </div>
  );
}

/** vs-last-month change pill. `null` delta = no prior-month baseline. */
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <p className="mt-2 text-[11px] text-muted">เดือนก่อนไม่มีข้อมูลเทียบ</p>;
  }
  const up = delta > 0;
  const flat = delta === 0;
  const cls = flat ? "text-muted" : up ? "text-emerald-600" : "text-red-600";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  return (
    <p className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}{delta}% เทียบเดือนก่อน
    </p>
  );
}

function StatusPane({
  title, icon, rows, total, href,
}: {
  title: string;
  icon: string;
  rows: [string, number][];
  total: number;
  href: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h2 className="font-bold text-sm">{icon} {title}</h2>
        <Link href={href} className="text-[11px] text-primary-600 hover:underline shrink-0">
          ดูทั้งหมด →
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted">ยังไม่มีรายการ</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map(([status, n]) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            return (
              <li key={status} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-mono text-xs text-foreground">{status}</span>
                  <span className="font-mono font-semibold">{int(n)}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-surface-alt overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

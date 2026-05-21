import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
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

  const [
    // revenue — this month (exclude cancelled; yuan only counts completed)
    soMonth, fwMonth, yuanMonth,
    // revenue — today
    soToday, fwToday, yuanToday,
    // revenue — previous full month (baseline)
    soPrev, fwPrev, yuanPrev,
    // orders by status — full status row sets, counted in-app
    soStatuses, fwStatuses,
    // container throughput (Wave 3: from tb_forwarder DISTINCT fcabinetnumber)
    containersInTransitRows, containersArrivedMonthRows,
    // signups
    signupsMonth, signupsToday, signupsPrev, signupsTotal,
    // wallet top-up volume (completed deposits)
    walletDepMonth, walletDepPrev, walletBalances,
  ] = await Promise.all([
    admin.from("service_orders").select("total_thb").gte("created_at", monthStart).neq("status", "cancelled"),
    admin.from("forwarders").select("total_price").gte("created_at", monthStart).neq("status", "cancelled"),
    admin.from("yuan_payments").select("thb_amount").gte("created_at", monthStart).eq("status", "completed"),

    admin.from("service_orders").select("total_thb").gte("created_at", todayStart).neq("status", "cancelled"),
    admin.from("forwarders").select("total_price").gte("created_at", todayStart).neq("status", "cancelled"),
    admin.from("yuan_payments").select("thb_amount").gte("created_at", todayStart).eq("status", "completed"),

    admin.from("service_orders").select("total_thb").gte("created_at", prevMonthStart).lt("created_at", prevMonthEnd).neq("status", "cancelled"),
    admin.from("forwarders").select("total_price").gte("created_at", prevMonthStart).lt("created_at", prevMonthEnd).neq("status", "cancelled"),
    admin.from("yuan_payments").select("thb_amount").gte("created_at", prevMonthStart).lt("created_at", prevMonthEnd).eq("status", "completed"),

    admin.from("service_orders").select("status"),
    admin.from("forwarders").select("status"),

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

    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", monthStart),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", prevMonthStart).lt("created_at", prevMonthEnd),
    admin.from("profiles").select("id", { count: "exact", head: true }),

    admin.from("wallet_transactions").select("amount").eq("kind", "deposit").eq("status", "completed").gte("created_at", monthStart),
    admin.from("wallet_transactions").select("amount").eq("kind", "deposit").eq("status", "completed").gte("created_at", prevMonthStart).lt("created_at", prevMonthEnd),
    admin.from("wallet").select("balance"),
  ]);

  // DISTINCT fcabinetnumber → 1 ตู้ = 1 count (many forwarders share a container)
  const inTransitCount = new Set((containersInTransitRows.data ?? []).map((r) => (r as { fcabinetnumber: string }).fcabinetnumber)).size;
  const arrivedCount   = new Set((containersArrivedMonthRows.data ?? []).map((r) => (r as { fcabinetnumber: string }).fcabinetnumber)).size;

  // ── revenue roll-up ──
  const revMonth = sumNum(soMonth.data, "total_thb") + sumNum(fwMonth.data, "total_price") + sumNum(yuanMonth.data, "thb_amount");
  const revToday = sumNum(soToday.data, "total_thb") + sumNum(fwToday.data, "total_price") + sumNum(yuanToday.data, "thb_amount");
  const revPrev = sumNum(soPrev.data, "total_thb") + sumNum(fwPrev.data, "total_price") + sumNum(yuanPrev.data, "thb_amount");

  const revByChannel = [
    { label: "ฝากสั่งซื้อ", icon: <ShoppingBasket className="h-5 w-5" />, month: sumNum(soMonth.data, "total_thb"), today: sumNum(soToday.data, "total_thb"), href: "/admin/service-orders" },
    { label: "ฝากนำเข้า", icon: <Box className="h-5 w-5" />, month: sumNum(fwMonth.data, "total_price"), today: sumNum(fwToday.data, "total_price"), href: "/admin/forwarders" },
    { label: "ฝากโอนหยวน", icon: <ArrowLeftRight className="h-5 w-5" />, month: sumNum(yuanMonth.data, "thb_amount"), today: sumNum(yuanToday.data, "thb_amount"), href: "/admin/yuan-payments" },
  ];

  // ── orders by status ──
  const countByStatus = (rows: { status: string }[] | null): [string, number][] => {
    const map = (rows ?? []).reduce<Record<string, number>>((a, r) => {
      a[r.status] = (a[r.status] ?? 0) + 1;
      return a;
    }, {});
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  };
  const soByStatus = countByStatus(soStatuses.data as { status: string }[] | null);
  const fwByStatus = countByStatus(fwStatuses.data as { status: string }[] | null);
  const soTotal = soByStatus.reduce((s, [, n]) => s + n, 0);
  const fwTotal = fwByStatus.reduce((s, [, n]) => s + n, 0);

  // ── wallet ──
  const walletMonth = sumNum(walletDepMonth.data, "amount");
  const walletPrev = sumNum(walletDepPrev.data, "amount");
  const walletHeld = sumNum(walletBalances.data, "balance");

  // ── signups ──
  const signupMonthN = signupsMonth.count ?? 0;
  const signupTodayN = signupsToday.count ?? 0;
  const signupPrevN = signupsPrev.count ?? 0;
  const signupTotalN = signupsTotal.count ?? 0;

  return (
    <main className="p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · KPI</p>
          <h1 className="mt-1 text-2xl font-bold">KPI ภาพรวมธุรกิจ</h1>
          <p className="mt-1 text-sm text-muted">
            ตัวเลขสำคัญของบริษัท — รายได้ · ออเดอร์ · ตู้ · ลูกค้าใหม่ · ยอดเติมเงิน · เทียบกับเดือน{prevMonthLabel}
          </p>
        </div>
        <Link href="/admin" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับภาพรวม
        </Link>
      </div>

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
          label="ยอดเติมเงิน · เดือนนี้"
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
          <p className="mt-1 text-[10px] text-muted">{sub}</p>
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
    return <p className="mt-2 text-[10px] text-muted">เดือนก่อนไม่มีข้อมูลเทียบ</p>;
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

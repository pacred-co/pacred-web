/**
 * /admin/reports/user-sales-history — ประวัติการขายต่อลูกค้า
 * (Wave 23 P1 batch 2-B Tailwind rewrite · 2026-05-27 ค่ำ).
 *
 * **Wave 23 P1 batch 2-B (2026-05-27 ค่ำ):** UI rewrite only — the
 * underlying tb_users + tb_forwarder + tb_header_order + tb_payment
 * cohort aggregate stays intact. Replaces the .pcs-legacy / Bootstrap-4 /
 * admin-base.css chrome (~470 LOC) with the Pacred Tailwind v4 reports
 * template (mirrors `reports/payment/page.tsx` Wave 20 P1 batch 2-b).
 *
 * **Workflow preserved (per AGENTS §0a):** same logic, same filters
 * (cohort YYYY-MM · q text search · limit), same data shape, same
 * counted-status gates (fstatus 6,7 / hstatus 5,6 / paystatus 3),
 * same role gate (super + ops + accounting + sales_admin), same churn
 * heuristic (> 60 days inactive). Only the chrome moves Bootstrap → Tailwind.
 *
 * **Legacy PHP reference:**
 *   `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-user-sales-history.php`
 *   — note: that legacy file actually serves a sales-rep commission
 *   payout flow (`tb_user_sales_admin_pay`). This Pacred slot is the
 *   V-G6 #4 customer-cohort drill-down (Wave 8 backlog #8) that
 *   replaces the Wave 7.2 redirect to `/admin/customers/...`. The URL
 *   is reused; the legacy commission flow lives elsewhere.
 *
 * **§0c compliance:** every Supabase query destructures { data, error },
 * logs + throws on load-bearing reads; uses datetime-helpers `nowMs`
 * (no raw `Date.now()` in render per Next 16 react-hooks/purity).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CsvButton } from "@/components/admin/csv-button";
import { nowMs } from "@/lib/datetime-helpers";

export const dynamic = "force-dynamic";

// ── Helpers ─────────────────────────────────────────────────────────

function parseCohort(raw: string | undefined): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}$/.test(raw) ? raw : null;
}

function cohortStartISO(ym: string): string {
  return `${ym}-01T00:00:00`;
}

function cohortEndExclusiveISO(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${next}-01T00:00:00`;
}

function thb(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysAgo(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDateOnly(iso: string | null): string {
  return iso ? String(iso).slice(0, 10) : "—";
}

// ── Row shapes ──────────────────────────────────────────────────────

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userStatus: string | null;
  userRegistered: string | null;
  userLastLogin: string | null;
  adminIDSale: string | null;
  userCompany: string | null;
};

type FRow = { userid: string | null; fdate: string | null; ftotalprice: number | null };
type HRow = { userid: string | null; hdate: string | null; htotalpriceuser: number | null };
type PRow = { userid: string | null; paydate: string | null; paythb: number | null };

type CustomerAggregate = {
  userid: string;
  fullname: string;
  phone: string;
  email: string;
  registered_at: string | null;
  last_login_at: string | null;
  adminidsale: string | null;
  is_juristic: boolean;
  first_order_at: string | null;
  last_order_at: string | null;
  forwarder_count: number;
  shop_count: number;
  payment_count: number;
  total_revenue_thb: number;
  days_since_last: number | null;
};

type SP = { cohort?: string; q?: string; limit?: string };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const LIMIT_OPTIONS = [50, 100, 200, 500] as const;

// ── Page ────────────────────────────────────────────────────────────

export default async function UserSalesHistoryEntry({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;

  const cohort = parseCohort(sp.cohort);
  const search = (sp.q ?? "").trim();
  const parsedLimit = Number(sp.limit ?? DEFAULT_LIMIT);
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(parsedLimit) ? parsedLimit : DEFAULT_LIMIT));

  const admin = createAdminClient();

  // Render-time "now" (wrapped per Next 16 react-hooks/purity)
  const now = nowMs();

  // ── 1) Customer list ────────────────────────────────────────────
  let usersQ = admin
    .from("tb_users")
    .select(
      "userID, userName, userLastName, userTel, userEmail, userStatus, userRegistered, userLastLogin, adminIDSale, userCompany",
    )
    .neq("userStatus", "0") // exclude deleted accounts (per tb_users.userStatus comment)
    .order("userRegistered", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (cohort) {
    usersQ = usersQ
      .gte("userRegistered", cohortStartISO(cohort))
      .lt("userRegistered", cohortEndExclusiveISO(cohort));
  }

  if (search) {
    // PostgREST .or() with ilike for userID / userName / userTel
    const safe = search.replace(/[%,]/g, "");
    usersQ = usersQ.or(
      `userID.ilike.%${safe}%,userName.ilike.%${safe}%,userLastName.ilike.%${safe}%,userTel.ilike.%${safe}%`,
    );
  }

  const { data: usersData, error: usersErr } = await usersQ;
  if (usersErr) {
    console.error(`[tb_users cohort list] failed`, {
      code: usersErr.code, message: usersErr.message, details: usersErr.details, hint: usersErr.hint,
    });
    throw new Error(`Failed to load tb_users (${usersErr.code ?? "unknown"}): ${usersErr.message}`);
  }
  const users = (usersData ?? []) as unknown as URow[];

  const userids = users.map((u) => u.userID);

  // ── 2) Aggregate revenue/dates per user (parallel fetches) ──────
  // For each of the three revenue tables, fetch the slim columns we need
  // for ONLY these users, then bucket in TS. Counted statuses match the
  // sales-by-rep view (migration 0094): fstatus IN ('6','7') / hstatus IN
  // ('5','6') / paystatus = '3'.
  let fRows: FRow[] = [];
  let hRows: HRow[] = [];
  let pRows: PRow[] = [];

  if (userids.length > 0) {
    const [
      { data: fRowsData, error: fErr },
      { data: hRowsData, error: hErr },
      { data: pRowsData, error: pErr },
    ] = await Promise.all([
      admin
        .from("tb_forwarder")
        .select("userid, fdate, ftotalprice")
        .in("userid", userids)
        .in("fstatus", ["6", "7"]),
      admin
        .from("tb_header_order")
        .select("userid, hdate, htotalpriceuser")
        .in("userid", userids)
        .in("hstatus", ["5", "6"]),
      admin
        .from("tb_payment")
        .select("userid, paydate, paythb")
        .in("userid", userids)
        .eq("paystatus", "3"),
    ]);

    if (fErr) console.error(`[tb_forwarder cohort agg] failed`, { code: fErr.code, message: fErr.message });
    if (hErr) console.error(`[tb_header_order cohort agg] failed`, { code: hErr.code, message: hErr.message });
    if (pErr) console.error(`[tb_payment cohort agg] failed`, { code: pErr.code, message: pErr.message });

    fRows = (fRowsData ?? []) as unknown as FRow[];
    hRows = (hRowsData ?? []) as unknown as HRow[];
    pRows = (pRowsData ?? []) as unknown as PRow[];
  }

  // Bucket per userid
  const aggMap = new Map<string, CustomerAggregate>();
  for (const u of users) {
    aggMap.set(u.userID, {
      userid: u.userID,
      fullname: `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—",
      phone: u.userTel ?? "",
      email: u.userEmail ?? "",
      registered_at: u.userRegistered,
      last_login_at: u.userLastLogin,
      adminidsale: u.adminIDSale,
      is_juristic: u.userCompany === "1",
      first_order_at: null,
      last_order_at: null,
      forwarder_count: 0,
      shop_count: 0,
      payment_count: 0,
      total_revenue_thb: 0,
      days_since_last: null,
    });
  }

  function pushDate(agg: CustomerAggregate, iso: string | null) {
    if (!iso) return;
    if (agg.first_order_at === null || iso < agg.first_order_at) agg.first_order_at = iso;
    if (agg.last_order_at === null || iso > agg.last_order_at) agg.last_order_at = iso;
  }

  for (const r of fRows) {
    if (!r.userid) continue;
    const a = aggMap.get(r.userid);
    if (!a) continue;
    a.forwarder_count += 1;
    a.total_revenue_thb += Number(r.ftotalprice ?? 0);
    pushDate(a, r.fdate);
  }
  for (const r of hRows) {
    if (!r.userid) continue;
    const a = aggMap.get(r.userid);
    if (!a) continue;
    a.shop_count += 1;
    a.total_revenue_thb += Number(r.htotalpriceuser ?? 0);
    pushDate(a, r.hdate);
  }
  for (const r of pRows) {
    if (!r.userid) continue;
    const a = aggMap.get(r.userid);
    if (!a) continue;
    a.payment_count += 1;
    a.total_revenue_thb += Number(r.paythb ?? 0);
    pushDate(a, r.paydate);
  }

  for (const a of aggMap.values()) {
    a.days_since_last = daysAgo(a.last_order_at, now);
  }

  const aggregates = Array.from(aggMap.values());

  // Stat summary
  const totalRevenue = aggregates.reduce((s, a) => s + a.total_revenue_thb, 0);
  const activeCount = aggregates.filter(
    (a) => a.total_revenue_thb > 0 && (a.days_since_last === null || a.days_since_last <= 60),
  ).length;
  const churnRiskCount = aggregates.filter(
    (a) => a.total_revenue_thb > 0 && a.days_since_last !== null && a.days_since_last > 60,
  ).length;

  // CSV
  const csvRows = aggregates.map((a) => ({
    userid: a.userid,
    fullname: a.fullname,
    phone: a.phone,
    email: a.email,
    registered_at: fmtDateOnly(a.registered_at),
    first_order_at: fmtDateOnly(a.first_order_at),
    last_order_at: fmtDateOnly(a.last_order_at),
    days_since_last: a.days_since_last ?? "",
    forwarder_count: a.forwarder_count,
    shop_count: a.shop_count,
    payment_count: a.payment_count,
    total_revenue_thb: Number(a.total_revenue_thb.toFixed(2)),
    adminidsale: a.adminidsale ?? "",
    is_juristic: a.is_juristic ? "นิติบุคคล" : "",
  }));
  const csvCols = [
    { key: "userid",            label: "รหัสลูกค้า" },
    { key: "fullname",          label: "ชื่อ" },
    { key: "phone",             label: "เบอร์" },
    { key: "email",             label: "อีเมล" },
    { key: "registered_at",     label: "สมัคร" },
    { key: "first_order_at",    label: "ออเดอร์แรก" },
    { key: "last_order_at",     label: "ล่าสุด" },
    { key: "days_since_last",   label: "วันที่ผ่านมา" },
    { key: "forwarder_count",   label: "ฝากนำเข้า (ครั้ง)" },
    { key: "shop_count",        label: "ฝากสั่ง (ครั้ง)" },
    { key: "payment_count",     label: "ฝากโอน (ครั้ง)" },
    { key: "total_revenue_thb", label: "รวมรายได้ (บาท)" },
    { key: "adminidsale",       label: "เซลล์" },
    { key: "is_juristic",       label: "นิติบุคคล" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">ประวัติการขายต่อลูกค้า</h1>
          <p className="mt-1 text-sm text-muted">
            สรุปยอดต่อลูกค้า · สถานะที่นับ: ฝากนำเข้า{" "}
            <span className="font-mono">fstatus 6,7</span> · ฝากสั่ง{" "}
            <span className="font-mono">hstatus 5,6</span> · ฝากโอน{" "}
            <span className="font-mono">paystatus 3</span> · ป้าย &ldquo;เสี่ยงเลิกใช้&rdquo; = ขาดกิจกรรม &gt; 60 วัน
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Filter banner (when filter applied) */}
      {(cohort || search) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ผลลัพธ์การค้นหา
          {cohort && (
            <>
              {" · "}สมัครเดือน: <span className="font-semibold">{cohort}</span>
            </>
          )}
          {search && (
            <>
              {" · "}คำค้น: <span className="font-semibold">&ldquo;{search}&rdquo;</span>
            </>
          )}
          {" · "}จำนวนสูงสุด: <span className="font-semibold">{limit}</span>
        </div>
      )}

      {/* Filter form (GET) */}
      <form
        method="GET"
        action="/admin/reports/user-sales-history"
        className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3"
      >
        <div className="grid sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="cohort" className="block text-xs text-muted mb-1">
              เดือนที่สมัคร (cohort)
            </label>
            <input
              id="cohort"
              type="month"
              name="cohort"
              defaultValue={cohort ?? ""}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="q" className="block text-xs text-muted mb-1">
              ค้นหา (รหัส · ชื่อ · เบอร์)
            </label>
            <input
              id="q"
              type="text"
              name="q"
              defaultValue={search}
              placeholder="PR0001 · ภูม · 0812345678"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="limit" className="block text-xs text-muted mb-1">
              จำนวนสูงสุด
            </label>
            <select
              id="limit"
              name="limit"
              defaultValue={String(limit)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button
            type="submit"
            className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600"
          >
            ค้นหาข้อมูล
          </button>
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename={`user-sales-history-${cohort ?? "all"}.csv`}
          />
        </div>
      </form>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="จำนวนลูกค้า" value={String(aggregates.length)} />
        <Card label="รวมรายได้ตลอดอายุ" value={`฿${thb(totalRevenue)}`} />
        <Card label="ใช้งานอยู่" value={String(activeCount)} highlight="green" />
        <Card label="เสี่ยงเลิกใช้ (&gt; 60 วัน)" value={String(churnRiskCount)} highlight="red" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {aggregates.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">
            ไม่พบข้อมูล — ลองเปลี่ยน cohort หรือล้างคำค้น
          </p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">เบอร์</th>
                  <th className="px-4 py-3">สมัคร</th>
                  <th className="px-4 py-3">ออเดอร์แรก</th>
                  <th className="px-4 py-3">ล่าสุด</th>
                  <th className="px-4 py-3 text-right">รวมรายได้ (บาท)</th>
                  <th
                    className="px-4 py-3 text-right whitespace-nowrap"
                    title="ฝากนำเข้า / ฝากสั่ง / ฝากโอน (จำนวนครั้ง)"
                  >
                    น/ส/อ
                  </th>
                  <th className="px-4 py-3">เซลล์</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((a) => {
                  const churnRisk = a.days_since_last !== null && a.days_since_last > 60;
                  const noOrders = a.total_revenue_thb === 0;
                  return (
                    <tr key={a.userid} className="border-t border-border hover:bg-surface-alt/30 align-top">
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        <Link
                          href={`/admin/reports/user-sales-history/${encodeURIComponent(a.userid)}`}
                          className="text-primary-600 hover:underline"
                        >
                          {a.userid}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {a.fullname}
                        {a.is_juristic && (
                          <span className="ml-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                            นิติบุคคล
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{a.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {fmtDateOnly(a.registered_at)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">
                        {fmtDateOnly(a.first_order_at)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span className="text-muted">{fmtDateOnly(a.last_order_at)}</span>
                        {a.days_since_last !== null && (
                          <span className="block text-[10px] text-muted">{a.days_since_last} วันก่อน</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold whitespace-nowrap">
                        {thb(a.total_revenue_thb)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs whitespace-nowrap text-muted">
                        {a.forwarder_count}/{a.shop_count}/{a.payment_count}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {a.adminidsale ? (
                          <Link
                            href={`/admin/admins/${encodeURIComponent(a.adminidsale)}`}
                            className="text-primary-600 hover:underline"
                          >
                            {a.adminidsale}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {noOrders ? (
                          <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-600">
                            ยังไม่มีออเดอร์
                          </span>
                        ) : churnRisk ? (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                            เสี่ยงเลิกใช้
                          </span>
                        ) : (
                          <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] text-green-700">
                            ใช้งานอยู่
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap text-right">
                        <Link
                          href={`/admin/reports/user-sales-history/${encodeURIComponent(a.userid)}`}
                          className="rounded-md border border-border px-2 py-1 hover:bg-surface-alt"
                        >
                          ดู →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        แสดงไม่เกิน {limit} ลูกค้า · ใช้ตัวกรอง cohort หรือคำค้นเพื่อจำกัดผลลัพธ์
      </p>
    </main>
  );
}

function Card({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "green" | "red";
}) {
  const borderCls =
    highlight === "green" ? "border-green-200" : highlight === "red" ? "border-red-200" : "border-border";
  const valueCls =
    highlight === "green" ? "text-green-700" : highlight === "red" ? "text-red-700" : "";
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${borderCls}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${valueCls}`}>{value}</p>
    </div>
  );
}

/**
 * /admin/reports/sales-by-rep — รายได้แยกตามเซลล์ผู้ดูแล
 *
 * **Wave 23 P1 batch 2-A (2026-05-27 ค่ำ):** UI rewrite only — the underlying
 * `vw_sales_by_rep` read (Postgres VIEW from migration 0094) is already correct
 * and stays intact. Replaces the .pcs-legacy / Bootstrap-4 / admin-base.css
 * chrome (~422 LOC) with the Pacred Tailwind v4 reports template (mirrors
 * `reports/payment/page.tsx` Wave 20 P1 batch 2-b).
 *
 * **Workflow preserved (per AGENTS §0a):** same SQL, same filters, same data
 * fields, same role gate (super + ops + accounting + sales_admin), same
 * aggregation logic. Only the chrome moves from Bootstrap-4 to Tailwind.
 *
 * **Legacy PHP source:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\report-sale.php`
 *   - The legacy "ยอดพนักงานขาย" page (CEO/Manager/QA/Accounting/IT gate)
 *   - Reads tb_sales_report (rebuilt on each visit from tb_forwarder fStatus=7)
 *   - Aggregates SUM(fTotalPrice + fTransportPrice + fPriceUpdate) per rep × month
 *   - "ยอดที่ได้จริง" = price × 0.01 (the 1% commission line — for Phase C reference)
 *
 * **Pacred richer than legacy (intentional Phase C polish):**
 *   - Pacred uses month-range filter (from/to) vs legacy single-month dropdown
 *   - Pacred aggregates 3 income streams (forwarder + shop + payment) vs legacy
 *     fStatus=7 only (forwarder). The vw_sales_by_rep view does the heavy lift.
 *   - Pacred sort options (revenue / customers / forwarders / shop / payments)
 *
 * **§0c compliance:** vw_sales_by_rep read destructures { data, error }, logs
 * + surfaces the error in a styled banner instead of throwing (so the page
 * still renders if the migration 0094 view is missing on a fresh env).
 */
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CsvButton } from "@/components/admin/csv-button";
import { nowDate } from "@/lib/datetime-helpers";

export const dynamic = "force-dynamic";

// ── Helpers ──────────────────────────────────────────────────────────────

function firstDayOfThisMonth(): string {
  const d = nowDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const [yStr, mStr] = raw.split("-");
  const m = Number(mStr);
  if (m < 1 || m > 12) return null;
  return `${yStr}-${mStr}`;
}

/** First day of month → ISO timestamp for the .gte() filter on activity_month */
function monthStartISO(ym: string): string {
  return `${ym}-01T00:00:00`;
}

/** Last day of month → first-of-next-month ISO (use with .lt() for inclusive end) */
function monthEndExclusiveISO(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return `${next}-01T00:00:00`;
}

function thb(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function intFmt(n: number): string {
  return Number(n || 0).toLocaleString("en-US");
}

// ── Row shape — vw_sales_by_rep ──────────────────────────────────────────

type VRow = {
  admin_userid: string | null;
  adminnickname: string | null;
  admin_fullname: string | null;
  customer_count: number | null;
  activity_month: string | null;
  forwarder_revenue_thb: number | null;
  forwarder_count: number | null;
  shop_revenue_thb: number | null;
  shop_count: number | null;
  payment_revenue_thb: number | null;
  payment_count: number | null;
  total_revenue_thb: number | null;
};

type RepAggregate = {
  admin_userid: string;
  adminnickname: string;
  admin_fullname: string;
  customer_count: number;
  forwarder_revenue_thb: number;
  forwarder_count: number;
  shop_revenue_thb: number;
  shop_count: number;
  payment_revenue_thb: number;
  payment_count: number;
  total_revenue_thb: number;
};

type SP = {
  from?: string;
  to?: string;
  sort?: "revenue" | "customers" | "forwarders" | "shop" | "payments";
};

type SortKey = NonNullable<SP["sort"]>;

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "revenue",    label: "รายได้รวม" },
  { value: "customers",  label: "จำนวนลูกค้า" },
  { value: "forwarders", label: "จำนวนนำเข้า" },
  { value: "shop",       label: "จำนวนฝากสั่ง" },
  { value: "payments",   label: "จำนวนฝากโอน" },
];

// ── Page ─────────────────────────────────────────────────────────────────

export default async function SalesByRepReport({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;

  // Resolve the month window + sort.
  const fromMonth = parseMonth(sp.from) ?? firstDayOfThisMonth();
  const toMonth = parseMonth(sp.to) ?? firstDayOfThisMonth();
  const sort: SortKey = (["revenue", "customers", "forwarders", "shop", "payments"] as const).includes(
    sp.sort as SortKey,
  )
    ? (sp.sort as SortKey)
    : "revenue";

  const admin = createAdminClient();

  // Read the view — server-side filter on activity_month range.
  // (vw_sales_by_rep is bucketed per month; per-rep aggregation happens
  // below in TS.)
  const { data: viewData, error: viewErr } = await admin
    .from("vw_sales_by_rep")
    .select(
      "admin_userid, adminnickname, admin_fullname, customer_count, activity_month, forwarder_revenue_thb, forwarder_count, shop_revenue_thb, shop_count, payment_revenue_thb, payment_count, total_revenue_thb",
    )
    .gte("activity_month", monthStartISO(fromMonth))
    .lt("activity_month", monthEndExclusiveISO(toMonth));

  if (viewErr) {
    console.error(`[vw_sales_by_rep read] failed`, {
      code: viewErr.code, message: viewErr.message, details: viewErr.details,
    });
    // Soft-fail: render the banner so the admin can see WHY the table is empty.
    // (vw_sales_by_rep needs migration 0094 — soft path keeps the page usable.)
  }

  const rows = (viewData ?? []) as unknown as VRow[];

  // Aggregate per rep across the window.
  const byRep = new Map<string, RepAggregate>();
  for (const r of rows) {
    const key = r.admin_userid ?? "";
    if (!key) continue;
    const existing = byRep.get(key);
    if (existing) {
      existing.forwarder_revenue_thb += Number(r.forwarder_revenue_thb || 0);
      existing.forwarder_count += Number(r.forwarder_count || 0);
      existing.shop_revenue_thb += Number(r.shop_revenue_thb || 0);
      existing.shop_count += Number(r.shop_count || 0);
      existing.payment_revenue_thb += Number(r.payment_revenue_thb || 0);
      existing.payment_count += Number(r.payment_count || 0);
      existing.total_revenue_thb += Number(r.total_revenue_thb || 0);
      // customer_count is rep-level (not month-level) → take max (any row has it)
      existing.customer_count = Math.max(existing.customer_count, Number(r.customer_count || 0));
    } else {
      byRep.set(key, {
        admin_userid: key,
        adminnickname: r.adminnickname ?? "",
        admin_fullname: r.admin_fullname ?? "",
        customer_count: Number(r.customer_count || 0),
        forwarder_revenue_thb: Number(r.forwarder_revenue_thb || 0),
        forwarder_count: Number(r.forwarder_count || 0),
        shop_revenue_thb: Number(r.shop_revenue_thb || 0),
        shop_count: Number(r.shop_count || 0),
        payment_revenue_thb: Number(r.payment_revenue_thb || 0),
        payment_count: Number(r.payment_count || 0),
        total_revenue_thb: Number(r.total_revenue_thb || 0),
      });
    }
  }

  const sortFns: Record<SortKey, (a: RepAggregate, b: RepAggregate) => number> = {
    revenue:    (a, b) => b.total_revenue_thb - a.total_revenue_thb,
    customers:  (a, b) => b.customer_count - a.customer_count,
    forwarders: (a, b) => b.forwarder_count - a.forwarder_count,
    shop:       (a, b) => b.shop_count - a.shop_count,
    payments:   (a, b) => b.payment_count - a.payment_count,
  };

  const aggregates = Array.from(byRep.values()).sort(sortFns[sort]);

  // Grand totals
  const totals = aggregates.reduce(
    (acc, r) => {
      acc.forwarder_revenue_thb += r.forwarder_revenue_thb;
      acc.forwarder_count       += r.forwarder_count;
      acc.shop_revenue_thb      += r.shop_revenue_thb;
      acc.shop_count            += r.shop_count;
      acc.payment_revenue_thb   += r.payment_revenue_thb;
      acc.payment_count         += r.payment_count;
      acc.total_revenue_thb     += r.total_revenue_thb;
      acc.customer_count        += r.customer_count;
      return acc;
    },
    {
      forwarder_revenue_thb: 0,
      forwarder_count: 0,
      shop_revenue_thb: 0,
      shop_count: 0,
      payment_revenue_thb: 0,
      payment_count: 0,
      total_revenue_thb: 0,
      customer_count: 0,
    },
  );

  // CSV rows.
  const csvRows = aggregates.map((r) => ({
    nickname:        r.adminnickname || r.admin_fullname || "",
    admin_userid:    r.admin_userid,
    customer_count:  r.customer_count,
    forwarder_count: r.forwarder_count,
    forwarder_thb:   r.forwarder_revenue_thb,
    shop_count:      r.shop_count,
    shop_thb:        r.shop_revenue_thb,
    payment_count:   r.payment_count,
    payment_thb:     r.payment_revenue_thb,
    total_thb:       r.total_revenue_thb,
  }));
  const csvCols = [
    { key: "nickname",        label: "เซลล์" },
    { key: "admin_userid",    label: "รหัสแอดมิน" },
    { key: "customer_count",  label: "ลูกค้า" },
    { key: "forwarder_count", label: "ฝากนำเข้า (รายการ)" },
    { key: "forwarder_thb",   label: "ฝากนำเข้า (บาท)" },
    { key: "shop_count",      label: "ฝากสั่ง (รายการ)" },
    { key: "shop_thb",        label: "ฝากสั่ง (บาท)" },
    { key: "payment_count",   label: "ฝากโอน (รายการ)" },
    { key: "payment_thb",     label: "ฝากโอน (บาท)" },
    { key: "total_thb",       label: "รวมรายได้ (บาท)" },
  ];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · รายงาน</p>
          <h1 className="mt-1 text-2xl font-bold">รายได้แยกตามเซลล์ผู้ดูแล</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono">vw_sales_by_rep</span> (migration 0094) · ฝากนำเข้า (fstatus 6,7) +
            ฝากสั่ง (hstatus 5,6) + ฝากโอน (paystatus 3) — คิดต่อเซลล์ที่ดูแลลูกค้า
          </p>
        </div>
        <Link href="/admin/reports" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
          ← กลับรีพอร์ตหลัก
        </Link>
      </div>

      {/* Filter banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ผลลัพธ์: <span className="font-semibold">{fromMonth}</span> ถึง <span className="font-semibold">{toMonth}</span>
        {" · "}
        เรียงตาม: <span className="font-semibold">{SORT_OPTIONS.find((o) => o.value === sort)?.label}</span>
        {" · "}
        เซลล์ <span className="font-semibold">{aggregates.length}</span> คน
      </div>

      {/* Filter form (GET) */}
      <form method="GET" action="/admin/reports/sales-by-rep" className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="from" className="block text-xs text-muted mb-1">เดือนเริ่มต้น</label>
            <input
              id="from"
              type="month"
              name="from"
              defaultValue={fromMonth}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="to" className="block text-xs text-muted mb-1">เดือนสิ้นสุด</label>
            <input
              id="to"
              type="month"
              name="to"
              defaultValue={toMonth}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
          <div>
            <label htmlFor="sort" className="block text-xs text-muted mb-1">เรียงตาม</label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
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
          <CsvButton rows={csvRows} cols={csvCols} filename={`sales-by-rep-${fromMonth}-to-${toMonth}.csv`} />
        </div>
      </form>

      {/* Error banner (soft-fail — page still renders) */}
      {viewErr && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">อ่านข้อมูลไม่สำเร็จ: {viewErr.message}</p>
          <p className="mt-1 text-xs text-red-700">
            ตรวจสอบว่า migration <span className="font-mono">0094_view_sales_by_rep.sql</span> ได้รันบน Supabase
            dashboard แล้วหรือยัง
          </p>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid sm:grid-cols-4 gap-3">
        <Card label="เซลล์" value={String(aggregates.length)} />
        <Card label="ลูกค้ารวม" value={intFmt(totals.customer_count)} />
        <Card label="รายการรวม" value={intFmt(totals.forwarder_count + totals.shop_count + totals.payment_count)} />
        <Card label="รายได้รวม (บาท)" value={thb(totals.total_revenue_thb)} highlight />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {aggregates.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่พบข้อมูลในช่วงนี้</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">เซลล์</th>
                  <th className="px-4 py-3">รหัสแอดมิน</th>
                  <th className="px-4 py-3 text-right">ลูกค้า</th>
                  <th className="px-4 py-3 text-right">ฝากนำเข้า<br/><span className="text-[10px] font-normal normal-case">(รายการ)</span></th>
                  <th className="px-4 py-3 text-right">ฝากนำเข้า<br/><span className="text-[10px] font-normal normal-case">(บาท)</span></th>
                  <th className="px-4 py-3 text-right">ฝากสั่ง<br/><span className="text-[10px] font-normal normal-case">(รายการ)</span></th>
                  <th className="px-4 py-3 text-right">ฝากสั่ง<br/><span className="text-[10px] font-normal normal-case">(บาท)</span></th>
                  <th className="px-4 py-3 text-right">ฝากโอน<br/><span className="text-[10px] font-normal normal-case">(รายการ)</span></th>
                  <th className="px-4 py-3 text-right">ฝากโอน<br/><span className="text-[10px] font-normal normal-case">(บาท)</span></th>
                  <th className="px-4 py-3 text-right">รวมรายได้<br/><span className="text-[10px] font-normal normal-case">(บาท)</span></th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((r) => (
                  <tr key={r.admin_userid} className="border-t border-border hover:bg-surface-alt/30 align-top">
                    <td className="px-4 py-3 text-xs">
                      {r.adminnickname || r.admin_fullname || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/admin/admins/${encodeURIComponent(r.admin_userid)}`}
                        className="text-primary-600 hover:underline"
                      >
                        {r.admin_userid}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(r.customer_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(r.forwarder_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.forwarder_revenue_thb)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(r.shop_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.shop_revenue_thb)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(r.payment_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(r.payment_revenue_thb)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-red-700">
                      {thb(r.total_revenue_thb)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {aggregates.length > 0 && (
                <tfoot className="bg-surface-alt/50 font-semibold">
                  <tr className="border-t border-border">
                    <td className="px-4 py-3 text-xs" colSpan={2}>รวมทั้งหมด</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(totals.customer_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(totals.forwarder_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(totals.forwarder_revenue_thb)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(totals.shop_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(totals.shop_revenue_thb)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{intFmt(totals.payment_count)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{thb(totals.payment_revenue_thb)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-red-700">{thb(totals.total_revenue_thb)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        ค่าเริ่มต้น = เดือนปัจจุบัน · ปรับช่วงเดือน + sort key ผ่าน filter ด้านบน · กดรหัสแอดมินเพื่อดูโปรไฟล์
      </p>
    </main>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border bg-white dark:bg-surface p-4 shadow-sm ${highlight ? "border-red-200" : "border-border"}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold font-mono ${highlight ? "text-red-700" : ""}`}>{value}</p>
    </div>
  );
}

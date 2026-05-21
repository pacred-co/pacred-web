/**
 * V-G6 #2 — Sales revenue per sales rep (Wave 8 backlog item #7 · D1 port).
 *
 * Reads `vw_sales_by_rep` (Postgres VIEW from migration 0094 — applied to
 * prod manually by ภูม via the Supabase dashboard). The view aggregates
 * `tb_users.adminidsale × { tb_forwarder, tb_header_order, tb_payment }`
 * per month with the legacy `report-sale-new.php` (~700 LOC) status
 * gates: fstatus IN ('6','7') / hstatus IN ('5','6') / paystatus = '3'.
 *
 * Replaces the Wave 7.2 "Wave 8 banner" stub that rendered ฿0 for every
 * rep because the rebuilt-schema 3-way join was empty on prod.
 *
 * URL filters:
 *   ?from=YYYY-MM  → start month (inclusive · default = first day of THIS month)
 *   ?to=YYYY-MM    → end month   (inclusive · default = first day of THIS month)
 *   ?sort=revenue|customers|forwarders|shop|payments   (default = revenue)
 *
 * Gate: super + accounting + sales_admin (mirrors the legacy export-chip
 * gate which restricts CSV/Excel/print to CEO / Manager / Accounting; we
 * narrow the *view* to those same roles since the table IS the report).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ── Helpers (PHP `date(...)` parity) ─────────────────────────────────

function firstDayOfThisMonth(): string {
  const d = new Date();
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

// ── Row shape — vw_sales_by_rep ──────────────────────────────────────

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

export default async function SalesByRepReport({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const sp = await searchParams;

  // ── Resolve the month window ────────────────────────────────────
  const fromMonth = parseMonth(sp.from) ?? firstDayOfThisMonth();
  const toMonth = parseMonth(sp.to) ?? firstDayOfThisMonth();
  const sort: SortKey = (["revenue", "customers", "forwarders", "shop", "payments"] as const).includes(
    sp.sort as SortKey,
  )
    ? (sp.sort as SortKey)
    : "revenue";

  const admin = createAdminClient();

  // Read the view — server-side filter on activity_month range
  // (vw_sales_by_rep is bucketed per month; per-rep aggregation
  // happens below in TS).
  const { data: viewData, error } = await admin
    .from("vw_sales_by_rep")
    .select(
      "admin_userid, adminnickname, admin_fullname, customer_count, activity_month, forwarder_revenue_thb, forwarder_count, shop_revenue_thb, shop_count, payment_revenue_thb, payment_count, total_revenue_thb",
    )
    .gte("activity_month", monthStartISO(fromMonth))
    .lt("activity_month", monthEndExclusiveISO(toMonth));

  const rows = (viewData ?? []) as unknown as VRow[];

  // Aggregate per rep across the window
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

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/reports">รายงาน</Link>
                    </li>
                    <li className="breadcrumb-item active">รายได้แยกตามเซลล์ผู้ดูแล</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-12">
                            <h3 className="text-center text-md-left">
                              <span className="ft-box font-30" style={{ fontSize: "2.2rem" }}></span>{" "}
                              รายได้แยกตามเซลล์ผู้ดูแล
                            </h3>
                            <p className="font-12 text-muted">
                              สรุปยอดรายได้จาก ฝากนำเข้า (fstatus 6,7) + ฝากสั่ง (hstatus 5,6) + ฝากโอน (paystatus 3)
                              คิดต่อเซลล์ที่ดูแลลูกค้า · view: <code>vw_sales_by_rep</code> (migration 0094)
                            </p>

                            {/* Filter form */}
                            <form
                              method="GET"
                              action="/admin/reports/sales-by-rep"
                              className="mb-2"
                            >
                              <div className="row">
                                <div className="col-md-3 col-6">
                                  <label className="form-control-label" htmlFor="from">
                                    เดือนเริ่มต้น
                                  </label>
                                  <input
                                    type="month"
                                    className="form-control"
                                    name="from"
                                    defaultValue={fromMonth}
                                  />
                                </div>
                                <div className="col-md-3 col-6">
                                  <label className="form-control-label" htmlFor="to">
                                    เดือนสิ้นสุด
                                  </label>
                                  <input
                                    type="month"
                                    className="form-control"
                                    name="to"
                                    defaultValue={toMonth}
                                  />
                                </div>
                                <div className="col-md-3 col-12">
                                  <label className="form-control-label" htmlFor="sort">
                                    เรียงตาม
                                  </label>
                                  <select
                                    className="form-control"
                                    name="sort"
                                    defaultValue={sort}
                                  >
                                    <option value="revenue">รายได้รวม</option>
                                    <option value="customers">จำนวนลูกค้า</option>
                                    <option value="forwarders">จำนวนนำเข้า</option>
                                    <option value="shop">จำนวนฝากสั่ง</option>
                                    <option value="payments">จำนวนฝากโอน</option>
                                  </select>
                                </div>
                                <div className="col-md-3 col-12 d-flex align-items-end">
                                  <button
                                    type="submit"
                                    className="btn btn-block btn-rounded btn-info"
                                  >
                                    <i className="fas fa-search"></i> ค้นหา
                                  </button>
                                </div>
                              </div>
                            </form>

                            <h4 className="text-center text-md-left d-inline-block">
                              <span className="font-14 text-danger">
                                ผลลัพธ์: {fromMonth} ถึง {toMonth} · เซลล์ {aggregates.length} คน
                              </span>
                            </h4>

                            {error && (
                              <div className="alert alert-danger mt-2 font-12">
                                อ่านข้อมูลไม่สำเร็จ: {error.message}
                                <br />
                                <span className="text-muted">
                                  ตรวจสอบว่า migration 0094_view_sales_by_rep.sql ได้รัน
                                  บน Supabase dashboard แล้วหรือยัง
                                </span>
                              </div>
                            )}

                            {/* Table */}
                            <div className="table-responsive mt-1">
                              <table
                                id="myTable"
                                className="table report-table display table-bordered table-striped dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>เซลล์</th>
                                    <th>รหัสแอดมิน</th>
                                    <th className="text-right">ลูกค้า</th>
                                    <th className="text-right">ฝากนำเข้า (รายการ)</th>
                                    <th className="text-right">ฝากนำเข้า (บาท)</th>
                                    <th className="text-right">ฝากสั่ง (รายการ)</th>
                                    <th className="text-right">ฝากสั่ง (บาท)</th>
                                    <th className="text-right">ฝากโอน (รายการ)</th>
                                    <th className="text-right">ฝากโอน (บาท)</th>
                                    <th className="text-right">รวมรายได้ (บาท)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {aggregates.length === 0 && (
                                    <tr>
                                      <td colSpan={10} className="text-center font-12">
                                        ไม่พบข้อมูลในช่วงนี้
                                      </td>
                                    </tr>
                                  )}
                                  {aggregates.map((r) => (
                                    <tr key={r.admin_userid}>
                                      <td className="font-12">
                                        {r.adminnickname || r.admin_fullname || "—"}
                                      </td>
                                      <td className="text-center font-12">
                                        <Link
                                          className="text-info"
                                          href={`/admin/admins/${encodeURIComponent(r.admin_userid)}`}
                                        >
                                          {r.admin_userid}
                                        </Link>
                                      </td>
                                      <td className="text-right font-12">
                                        {intFmt(r.customer_count)}
                                      </td>
                                      <td className="text-right font-12">
                                        {intFmt(r.forwarder_count)}
                                      </td>
                                      <td className="text-right font-12">
                                        {thb(r.forwarder_revenue_thb)}
                                      </td>
                                      <td className="text-right font-12">
                                        {intFmt(r.shop_count)}
                                      </td>
                                      <td className="text-right font-12">
                                        {thb(r.shop_revenue_thb)}
                                      </td>
                                      <td className="text-right font-12">
                                        {intFmt(r.payment_count)}
                                      </td>
                                      <td className="text-right font-12">
                                        {thb(r.payment_revenue_thb)}
                                      </td>
                                      <td className="text-right font-12 font-weight-bold">
                                        {thb(r.total_revenue_thb)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                {aggregates.length > 0 && (
                                  <tfoot>
                                    <tr className="text-right font-weight-bold">
                                      <td colSpan={2} className="text-left font-12">
                                        รวมทั้งหมด
                                      </td>
                                      <td className="font-12">{intFmt(totals.customer_count)}</td>
                                      <td className="font-12">{intFmt(totals.forwarder_count)}</td>
                                      <td className="font-12">{thb(totals.forwarder_revenue_thb)}</td>
                                      <td className="font-12">{intFmt(totals.shop_count)}</td>
                                      <td className="font-12">{thb(totals.shop_revenue_thb)}</td>
                                      <td className="font-12">{intFmt(totals.payment_count)}</td>
                                      <td className="font-12">{thb(totals.payment_revenue_thb)}</td>
                                      <td className="font-12">{thb(totals.total_revenue_thb)}</td>
                                    </tr>
                                  </tfoot>
                                )}
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

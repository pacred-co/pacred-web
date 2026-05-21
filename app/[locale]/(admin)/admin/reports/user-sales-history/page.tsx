/**
 * V-G6 #4 — Customer cohort / lifetime tool (Wave 8 backlog item #8 · D1 port).
 *
 * Replaces the Wave 7.2 redirect that punted to `/admin/customers/...`.
 * Faithful port of `pcs-admin/report-user-sales-history.php` (~1500 LOC):
 *   - List view (this file)   — per-customer registration → first/last
 *                                 order → total spend → churn risk badge
 *   - Detail view ([customer_id]/page.tsx) — per-customer UNION timeline
 *                                 across tb_forwarder + tb_header_order +
 *                                 tb_payment + tb_wallet_hs (newest 100).
 *
 * URL filters:
 *   ?cohort=YYYY-MM   → registration cohort filter (default = all)
 *   ?q=<text>         → search by userid / username / phone
 *   ?limit=<N>        → page size (default 100, max 500)
 *
 * Gate: super + accounting + sales_admin — same as sister reports.
 *
 * Churn risk flag = "last activity > 60 days ago" per the legacy heuristic
 * (`report-user-sales-history.php` L260-275 — the "ลูกค้าไม่ใช้งาน" badge).
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

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

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDateOnly(iso: string | null): string {
  return iso ? String(iso).slice(0, 10) : "-";
}

// ── Row shapes ──────────────────────────────────────────────────────

type URow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
  userstatus: string | null;
  userregistered: string | null;
  userlastlogin: string | null;
  adminidsale: string | null;
  usercompany: string | null;
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

  // ── 1) Customer list ────────────────────────────────────────────
  let usersQ = admin
    .from("tb_users")
    .select(
      "userid, username, userlastname, usertel, useremail, userstatus, userregistered, userlastlogin, adminidsale, usercompany",
    )
    .neq("userstatus", "0") // exclude deleted accounts (per tb_users.userstatus comment)
    .order("userregistered", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (cohort) {
    usersQ = usersQ
      .gte("userregistered", cohortStartISO(cohort))
      .lt("userregistered", cohortEndExclusiveISO(cohort));
  }

  if (search) {
    // PostgREST .or() with ilike for userid / username / phone
    const safe = search.replace(/[%,]/g, "");
    usersQ = usersQ.or(
      `userid.ilike.%${safe}%,username.ilike.%${safe}%,userlastname.ilike.%${safe}%,usertel.ilike.%${safe}%`,
    );
  }

  const { data: usersData, error: usersErr } = await usersQ;
  const users = (usersData ?? []) as unknown as URow[];

  const userids = users.map((u) => u.userid);

  // ── 2) Aggregate revenue/dates per user (parallel fetches) ──────
  // For each of the three revenue tables, fetch the slim columns we need
  // for ONLY these users, then bucket in TS. Counted statuses match the
  // sales-by-rep view (migration 0094): fstatus IN ('6','7') / hstatus IN
  // ('5','6') / paystatus = '3'.
  const [
    { data: fRowsData },
    { data: hRowsData },
    { data: pRowsData },
  ] = userids.length === 0
    ? [
        { data: [] as FRow[] },
        { data: [] as HRow[] },
        { data: [] as PRow[] },
      ]
    : await Promise.all([
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

  const fRows = (fRowsData ?? []) as unknown as FRow[];
  const hRows = (hRowsData ?? []) as unknown as HRow[];
  const pRows = (pRowsData ?? []) as unknown as PRow[];

  // Bucket per userid
  const aggMap = new Map<string, CustomerAggregate>();
  for (const u of users) {
    aggMap.set(u.userid, {
      userid: u.userid,
      fullname: `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() || "—",
      phone: u.usertel ?? "",
      email: u.useremail ?? "",
      registered_at: u.userregistered,
      last_login_at: u.userlastlogin,
      adminidsale: u.adminidsale,
      is_juristic: u.usercompany === "1",
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
    a.days_since_last = daysAgo(a.last_order_at);
  }

  const aggregates = Array.from(aggMap.values());

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
                    <li className="breadcrumb-item active">ประวัติการขายต่อลูกค้า</li>
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
                        <h3 className="text-center text-md-left">
                          <span className="ft-box font-30" style={{ fontSize: "2.2rem" }}></span>{" "}
                          ประวัติการขายต่อลูกค้า
                        </h3>
                        <p className="font-12 text-muted">
                          รวมยอดต่อลูกค้า · สถานะที่นับ: ฝากนำเข้า fstatus 6,7 · ฝากสั่ง hstatus 5,6 · ฝากโอน paystatus 3
                          · ป้าย &ldquo;เสี่ยงเลิกใช้&rdquo; = ขาดกิจกรรม &gt; 60 วัน
                        </p>

                        {/* Filter form */}
                        <form
                          method="GET"
                          action="/admin/reports/user-sales-history"
                          className="mb-2"
                        >
                          <div className="row">
                            <div className="col-md-3 col-6">
                              <label className="form-control-label" htmlFor="cohort">
                                เดือนที่สมัคร (cohort)
                              </label>
                              <input
                                type="month"
                                className="form-control"
                                name="cohort"
                                defaultValue={cohort ?? ""}
                              />
                            </div>
                            <div className="col-md-4 col-12">
                              <label className="form-control-label" htmlFor="q">
                                ค้นหา (รหัสลูกค้า · ชื่อ · เบอร์)
                              </label>
                              <input
                                type="text"
                                className="form-control"
                                name="q"
                                defaultValue={search}
                                placeholder="PR0001 · ภูม · 0812345678"
                              />
                            </div>
                            <div className="col-md-2 col-6">
                              <label className="form-control-label" htmlFor="limit">
                                จำนวนสูงสุด
                              </label>
                              <select className="form-control" name="limit" defaultValue={String(limit)}>
                                <option value="50">50</option>
                                <option value="100">100</option>
                                <option value="200">200</option>
                                <option value="500">500</option>
                              </select>
                            </div>
                            <div className="col-md-3 col-12 d-flex align-items-end">
                              <button type="submit" className="btn btn-block btn-rounded btn-info">
                                <i className="fas fa-search"></i> ค้นหา
                              </button>
                            </div>
                          </div>
                        </form>

                        <h4 className="text-center text-md-left d-inline-block">
                          <span className="font-14 text-danger">
                            ผลลัพธ์: {aggregates.length} ลูกค้า
                            {cohort ? ` · สมัครเดือน ${cohort}` : ""}
                            {search ? ` · ค้นหา "${search}"` : ""}
                          </span>
                        </h4>

                        {usersErr && (
                          <div className="alert alert-danger mt-2 font-12">
                            อ่านข้อมูลไม่สำเร็จ: {usersErr.message}
                          </div>
                        )}

                        <div className="table-responsive mt-1">
                          <table
                            id="myTable"
                            className="table report-table display table-bordered table-striped dataTable no-footer dtr-inline"
                          >
                            <thead>
                              <tr className="text-center">
                                <th>รหัส</th>
                                <th>ชื่อ</th>
                                <th>เบอร์</th>
                                <th>สมัคร</th>
                                <th>ออเดอร์แรก</th>
                                <th>ล่าสุด</th>
                                <th className="text-right">รวมรายได้ (บาท)</th>
                                <th className="text-right">น/ส/อ</th>
                                <th>เซลล์</th>
                                <th>สถานะ</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {aggregates.length === 0 && (
                                <tr>
                                  <td colSpan={11} className="text-center font-12">
                                    ไม่พบข้อมูล
                                  </td>
                                </tr>
                              )}
                              {aggregates.map((a) => {
                                const churnRisk =
                                  a.days_since_last !== null && a.days_since_last > 60;
                                const noOrders = a.total_revenue_thb === 0;
                                return (
                                  <tr key={a.userid}>
                                    <td className="text-center font-12">
                                      <Link
                                        className="text-info"
                                        href={`/admin/reports/user-sales-history/${encodeURIComponent(a.userid)}`}
                                      >
                                        {a.userid}
                                      </Link>
                                    </td>
                                    <td className="font-12">
                                      {a.fullname}
                                      {a.is_juristic && (
                                        <span className="ml-1 badge badge-info badge-pill font-10">นิติบุคคล</span>
                                      )}
                                    </td>
                                    <td className="font-12">{a.phone || "-"}</td>
                                    <td className="text-center font-12">
                                      {fmtDateOnly(a.registered_at)}
                                    </td>
                                    <td className="text-center font-12">
                                      {fmtDateOnly(a.first_order_at)}
                                    </td>
                                    <td className="text-center font-12">
                                      {fmtDateOnly(a.last_order_at)}
                                      {a.days_since_last !== null && (
                                        <small className="d-block text-muted">
                                          {a.days_since_last} วันก่อน
                                        </small>
                                      )}
                                    </td>
                                    <td className="text-right font-12 font-weight-bold">
                                      {thb(a.total_revenue_thb)}
                                    </td>
                                    <td className="text-right font-12">
                                      {a.forwarder_count}/{a.shop_count}/{a.payment_count}
                                    </td>
                                    <td className="text-center font-12">
                                      {a.adminidsale ? (
                                        <Link
                                          className="text-info"
                                          href={`/admin/admins/${encodeURIComponent(a.adminidsale)}`}
                                        >
                                          {a.adminidsale}
                                        </Link>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                    <td className="text-center font-12">
                                      {noOrders ? (
                                        <span className="badge badge-secondary badge-pill font-10">
                                          ยังไม่มีออเดอร์
                                        </span>
                                      ) : churnRisk ? (
                                        <span className="badge badge-danger badge-pill font-10">
                                          เสี่ยงเลิกใช้
                                        </span>
                                      ) : (
                                        <span className="badge badge-success badge-pill font-10">
                                          ใช้งานอยู่
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-center">
                                      <Link
                                        className="btn btn-sm btn-outline-info"
                                        href={`/admin/reports/user-sales-history/${encodeURIComponent(a.userid)}`}
                                      >
                                        ดู
                                      </Link>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
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

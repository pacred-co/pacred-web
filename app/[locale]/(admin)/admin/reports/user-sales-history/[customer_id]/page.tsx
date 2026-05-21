/**
 * V-G6 #4 drill-in — /admin/reports/user-sales-history/[customer_id].
 *
 * Per-customer lifetime timeline — UNION (tb_forwarder + tb_header_order
 * + tb_payment + tb_wallet_hs) ordered date DESC, top 100 events.
 *
 * Replaces the Wave 7.2 redirect that punted to /admin/customers/[id].
 * That target page also exists (legacy-view.tsx) and shows the same
 * tables truncated to 10 rows each — this page is the FULL timeline +
 * wallet activity, which the customer-detail view did NOT include
 * (it's the V-G6 #4 cohort drill-in scope per
 * `pcs-admin/report-user-sales-history.php` L600-1100).
 *
 * Gate: super + accounting + sales_admin — same as the list page.
 */

import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 100;

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

type FRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  fidorco: string | null;
  fdetail: string | null;
  ftotalprice: number | null;
  ftrackingth: string | null;
};
type HRow = {
  id: number;
  hdate: string | null;
  hstatus: string | null;
  hno: string | null;
  htitle: string | null;
  htotalpriceuser: number | null;
  hcount: number | null;
};
type PRow = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  payyuan: number | null;
  paythb: number | null;
  paydetail: string | null;
};
type WRow = {
  id: number;
  date: string | null;
  status: string | null;
  typenew: string | null;
  amount: number | null;
  note: string | null;
  reforder: string | null;
};
type WBalance = { wallettotal: number | null };

type EventKind = "forwarder" | "shop" | "yuan" | "wallet";

type TimelineEvent = {
  kind: EventKind;
  date: string;
  label: string;
  detail: string;
  amount_thb: number | null;
  status: string;
  href: string | null;
};

function thb(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "0.00";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "-";
  return `${String(iso).slice(0, 10)} ${String(iso).slice(11, 19)}`;
}

const F_STATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีน",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทย",
  "5": "รอชำระ",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

const H_STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระ",
  "3": "สั่งสินค้า",
  "4": "รอร้านจัดส่ง",
  "5": "สำเร็จ",
  "6": "ยกเลิก",
};

const P_STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "กำลังโอน",
  "3": "สำเร็จ",
};

const W_TYPE_LABEL: Record<string, string> = {
  "1": "เติมเงิน",
  "2": "คืนเงิน",
  "3": "ชำระฝากสั่ง",
  "4": "ชำระฝากสั่งเติมเพิ่ม",
  "5": "ชำระฝากนำเข้า",
  "6": "ชำระฝากนำเข้าเติมเพิ่ม",
  "7": "ชำระฝากโอน",
};

const W_STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

export default async function UserSalesHistoryDrillIn({
  params,
}: {
  params: Promise<{ customer_id: string }>;
}) {
  await requireAdmin(["super", "ops", "accounting", "sales_admin"]);
  const { customer_id } = await params;
  const id = decodeURIComponent(customer_id);

  const admin = createAdminClient();

  const { data: userRaw } = await admin
    .from("tb_users")
    .select(
      "userid, username, userlastname, usertel, useremail, userstatus, userregistered, userlastlogin, adminidsale, usercompany",
    )
    .eq("userid", id)
    .maybeSingle();

  if (!userRaw) notFound();
  const u = userRaw as unknown as URow;

  // Parallel fetch — newest first, plenty for the top-100 merge
  const [
    { data: fData },
    { data: hData },
    { data: pData },
    { data: wData },
    { data: walletBalRaw },
  ] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select("id, fdate, fstatus, fidorco, fdetail, ftotalprice, ftrackingth")
      .eq("userid", u.userid)
      .order("fdate", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_header_order")
      .select("id, hdate, hstatus, hno, htitle, htotalpriceuser, hcount")
      .eq("userid", u.userid)
      .order("hdate", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_payment")
      .select("id, paydate, paystatus, payyuan, paythb, paydetail")
      .eq("userid", u.userid)
      .order("paydate", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_wallet_hs")
      .select("id, date, status, typenew, amount, note, reforder")
      .eq("userid", u.userid)
      .order("date", { ascending: false, nullsFirst: false })
      .limit(MAX_EVENTS),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", u.userid)
      .maybeSingle(),
  ]);

  const fws = (fData ?? []) as unknown as FRow[];
  const hos = (hData ?? []) as unknown as HRow[];
  const pys = (pData ?? []) as unknown as PRow[];
  const wls = (wData ?? []) as unknown as WRow[];
  const walletBal = (walletBalRaw as unknown as WBalance | null) ?? null;

  // Union into timeline events
  const events: TimelineEvent[] = [];
  for (const r of fws) {
    if (!r.fdate) continue;
    events.push({
      kind: "forwarder",
      date: r.fdate,
      label: `ฝากนำเข้า ${r.fidorco ?? `#${r.id}`}`,
      detail: r.fdetail ?? (r.ftrackingth ? `Tracking TH: ${r.ftrackingth}` : "—"),
      amount_thb: r.ftotalprice !== null ? Number(r.ftotalprice) : null,
      status: F_STATUS_LABEL[r.fstatus ?? ""] ?? r.fstatus ?? "—",
      href: `/admin/forwarders/${encodeURIComponent(r.fidorco ?? String(r.id))}`,
    });
  }
  for (const r of hos) {
    if (!r.hdate) continue;
    events.push({
      kind: "shop",
      date: r.hdate,
      label: `ฝากสั่ง ${r.hno ?? `#${r.id}`}`,
      detail: r.htitle ?? (r.hcount ? `${r.hcount} รายการ` : "—"),
      amount_thb: r.htotalpriceuser !== null ? Number(r.htotalpriceuser) : null,
      status: H_STATUS_LABEL[r.hstatus ?? ""] ?? r.hstatus ?? "—",
      href: `/admin/service-orders/${encodeURIComponent(r.hno ?? String(r.id))}`,
    });
  }
  for (const r of pys) {
    if (!r.paydate) continue;
    events.push({
      kind: "yuan",
      date: r.paydate,
      label: `ฝากโอน #${r.id}`,
      detail: `${r.paydetail ?? "—"} · ¥${thb(Number(r.payyuan ?? 0))}`,
      amount_thb: r.paythb !== null ? Number(r.paythb) : null,
      status: P_STATUS_LABEL[r.paystatus ?? ""] ?? r.paystatus ?? "—",
      href: `/admin/yuan-payments?q=${encodeURIComponent(u.userid)}`,
    });
  }
  for (const r of wls) {
    if (!r.date) continue;
    events.push({
      kind: "wallet",
      date: r.date,
      label: `Wallet · ${W_TYPE_LABEL[r.typenew ?? ""] ?? r.typenew ?? "—"}`,
      detail: r.note ?? r.reforder ?? "—",
      amount_thb: r.amount !== null ? Number(r.amount) : null,
      status: W_STATUS_LABEL[r.status ?? ""] ?? r.status ?? "—",
      href: `/admin/wallet?userid=${encodeURIComponent(u.userid)}`,
    });
  }

  // Sort merged events DESC by date, cap at MAX_EVENTS
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const timeline = events.slice(0, MAX_EVENTS);

  const fullname = `${u.username ?? ""} ${u.userlastname ?? ""}`.trim() || "—";
  const isJuristic = u.usercompany === "1";

  // Lifetime totals (same status gates as the list page · sales-by-rep view)
  const lifetimeForwarderRevenue = fws
    .filter((r) => r.fstatus === "6" || r.fstatus === "7")
    .reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
  const lifetimeShopRevenue = hos
    .filter((r) => r.hstatus === "5" || r.hstatus === "6")
    .reduce((s, r) => s + Number(r.htotalpriceuser ?? 0), 0);
  const lifetimePaymentRevenue = pys
    .filter((r) => r.paystatus === "3")
    .reduce((s, r) => s + Number(r.paythb ?? 0), 0);
  const lifetimeTotal = lifetimeForwarderRevenue + lifetimeShopRevenue + lifetimePaymentRevenue;

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
                    <li className="breadcrumb-item">
                      <Link href="/admin/reports/user-sales-history">ประวัติการขายต่อลูกค้า</Link>
                    </li>
                    <li className="breadcrumb-item active">{u.userid}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body">
            {/* Header card — customer summary */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-6">
                            <h3 className="text-md-left">
                              <span className="font-mono">{u.userid}</span>
                              {isJuristic && (
                                <span className="ml-2 badge badge-info badge-pill font-12">
                                  นิติบุคคล
                                </span>
                              )}
                            </h3>
                            <p className="font-12 mb-0">
                              <strong>{fullname}</strong>
                            </p>
                            <p className="font-12 mb-0">
                              โทร: {u.usertel ?? "-"} · อีเมล: {u.useremail ?? "-"}
                            </p>
                            <p className="font-12 mb-0">
                              สมัคร: {fmtDateTime(u.userregistered)} · ล่าสุดล็อกอิน: {fmtDateTime(u.userlastlogin)}
                            </p>
                            {u.adminidsale && (
                              <p className="font-12 mb-0">
                                เซลล์ผู้ดูแล:{" "}
                                <Link
                                  className="text-info"
                                  href={`/admin/admins/${encodeURIComponent(u.adminidsale)}`}
                                >
                                  {u.adminidsale}
                                </Link>
                              </p>
                            )}
                          </div>
                          <div className="col-md-6">
                            <div className="row">
                              <div className="col-6">
                                <div className="text-center">
                                  <small className="text-muted">ยอดกระเป๋า (THB)</small>
                                  <h4 className="font-mono">
                                    ฿{thb(walletBal?.wallettotal ?? 0)}
                                  </h4>
                                </div>
                              </div>
                              <div className="col-6">
                                <div className="text-center">
                                  <small className="text-muted">รวมรายได้ตลอดอายุ (บาท)</small>
                                  <h4 className="font-mono text-success">{thb(lifetimeTotal)}</h4>
                                  <small className="d-block font-10 text-muted">
                                    นำเข้า {thb(lifetimeForwarderRevenue)} · สั่ง {thb(lifetimeShopRevenue)} · โอน{" "}
                                    {thb(lifetimePaymentRevenue)}
                                  </small>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Timeline */}
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <h3 className="text-center text-md-left">
                          <span className="ft-box font-30" style={{ fontSize: "2.2rem" }}></span>{" "}
                          ไทม์ไลน์กิจกรรมล่าสุด ({timeline.length} / {MAX_EVENTS})
                        </h3>
                        <p className="font-12 text-muted">
                          UNION ของ tb_forwarder + tb_header_order + tb_payment + tb_wallet_hs
                          เรียงตามวันที่ใหม่สุดก่อน · จำกัด {MAX_EVENTS} รายการล่าสุด
                        </p>

                        <div className="table-responsive">
                          <table className="table report-table display table-bordered table-striped dataTable no-footer dtr-inline">
                            <thead>
                              <tr className="text-center">
                                <th>วันที่</th>
                                <th>ประเภท</th>
                                <th>รายการ</th>
                                <th>รายละเอียด</th>
                                <th>สถานะ</th>
                                <th className="text-right">จำนวน (บาท)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {timeline.length === 0 && (
                                <tr>
                                  <td colSpan={6} className="text-center font-12">
                                    ไม่พบกิจกรรมของลูกค้ารายนี้
                                  </td>
                                </tr>
                              )}
                              {timeline.map((ev, idx) => (
                                <tr key={`${ev.kind}-${idx}`}>
                                  <td className="text-center font-12">{fmtDateTime(ev.date)}</td>
                                  <td className="text-center font-12">
                                    <KindBadge kind={ev.kind} />
                                  </td>
                                  <td className="font-12">
                                    {ev.href ? (
                                      <Link className="text-info" href={ev.href}>
                                        {ev.label}
                                      </Link>
                                    ) : (
                                      ev.label
                                    )}
                                  </td>
                                  <td className="font-12">
                                    <span className="d-inline-block text-truncate" style={{ maxWidth: 320 }} title={ev.detail}>
                                      {ev.detail}
                                    </span>
                                  </td>
                                  <td className="text-center font-12">{ev.status}</td>
                                  <td className="text-right font-12 font-weight-bold">
                                    {ev.amount_thb !== null ? thb(ev.amount_thb) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="mt-2">
                          <Link
                            href={`/admin/customers/${encodeURIComponent(u.userid)}`}
                            className="btn btn-sm btn-outline-info"
                          >
                            ดูข้อมูลลูกค้าเพิ่ม →
                          </Link>
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

function KindBadge({ kind }: { kind: EventKind }) {
  switch (kind) {
    case "forwarder":
      return <span className="font-10 badge badge-info badge-pill">ฝากนำเข้า</span>;
    case "shop":
      return <span className="font-10 badge badge-warning badge-pill">ฝากสั่ง</span>;
    case "yuan":
      return <span className="font-10 badge badge-success badge-pill">ฝากโอน</span>;
    case "wallet":
      return <span className="font-10 badge badge-secondary badge-pill">Wallet</span>;
  }
}

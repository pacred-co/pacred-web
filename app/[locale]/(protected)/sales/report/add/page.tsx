import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSalesAgent } from "../../team-map";
import { fStatusBadge, nameStatusUserPay, numberFormat } from "../../helpers";

/**
 * Sales-rep "รายการที่ยังไม่ได้เบิกเงิน" (unpaid-items payout) screen —
 * a FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/report-user-sales-add.php` (D1 / ADR-0017 · the faithful-port
 * transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `report-user-sales-add.php` renders — same
 * elements, same Bootstrap-4 class names, same structure, same labels,
 * same order. The visual identity comes from the legacy theme CSS,
 * brought in verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/report-user-sales.css`, loaded via a plain `<link>`.
 *
 * `report-user-sales-add.php` source structure transcribed here
 * (L30-149):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb — "หน้าแรก" / "รายงานยอดขายทีม"
 *     2. .content-body.pr110 > section > .row > .col-md-12 > .card
 *        a. .pt-1.pl-1.pr-1 > <h3> "รายการที่ยังไม่ได้เบิกเงิน {userIDMain}"
 *        b. .card-content > .card-body > .row > .col-12
 *           - <form action="report-user-sales-add/"> wrapping
 *             table#myTable — the unpaid-items list (9 columns, the
 *             first being a DataTables select-checkbox)
 *           - the fixed-position "ทำรายการเบิกเงินรายการที่เลือก" button
 *
 * Data — the `report-user-sales-add.php` L61-66 mysqli query,
 * transcribed 1:1 to the ported legacy `tb_*` schema (Supabase).
 *   SELECT … FROM tb_user_sales us
 *     LEFT JOIN tb_forwarder f ON f.ID=us.IDF
 *     LEFT JOIN tb_users u ON f.userID=u.userID
 *   WHERE u.coID='$userIDMain' AND usStatus=1   ORDER BY date DESC
 * (identical to report-user-sales.php's query but pinned to
 * usStatus=1 — only the not-yet-claimed rows.) PostgREST cannot filter
 * a joined column, so it is run as the same lookup sequence:
 * tb_user_sales(usStatus=1) → tb_forwarder(by IDF) → keep rows whose
 * forwarder.userID is a team member.
 *
 * Gate — `report-user-sales-add.php` L3 only allows the 5 whitelisted
 * member codes; that gate is in `../../layout.tsx` (`resolveSalesAgent`).
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── NOT transcribed (deliberate · flagged) ──
 *  1. `report-user-sales-add.php` L13-58 — the `$_POST['add']` handler
 *     (the actual payout: it sums the selected rows' fTotalPrice−
 *     fDiscount, applies the 1% commission − 3% fee, uploads the PDF,
 *     INSERTs tb_user_sales_admin_pay + tb_user_sales_pay, UPDATEs
 *     tb_user_sales.usStatus). This is a render-time mutation; a
 *     Server Component render must be a PURE READ — NOT reproduced.
 *     The legacy reaches this handler by submitting the form to
 *     `report-user-sales-add/` (this same screen). Faithful behaviour
 *     = a deferred Server Action — flagged for the integrator.
 *  2. `include/header.php` L75-85 `UPDATE tb_header_order` — a
 *     render-time mutation; NOT reproduced.
 *  3. The DataTables select-checkbox + the `#select1` jQuery (page
 *     `<script>` L172-230) — it AJAX-POSTs the selected IDs to
 *     `include/pages/report-user-sales/getListForwarder.php`, which
 *     returns a confirm-and-pay sub-form. That whole select→confirm→
 *     pay flow needs client JS + the deferred Server Action above.
 *     The table renders statically with the `#myTable` class hooks
 *     (resting look identical); the select/submit is the follow-up.
 *     `<div id="list-forwarder-data">` (the AJAX target, L150) is
 *     transcribed as the empty div the legacy renders.
 */

// This screen reads the signed-in customer's cookies/auth + the
// service-role `tb_*` data on every request — it cannot be statically
// rendered. `force-dynamic` per the faithful-port runbook §11.
export const dynamic = "force-dynamic";

/** An unpaid-items row, as the report-user-sales-add.php query yields. */
type UnpaidRow = {
  usID: number;
  userID: string | null;
  fTrackingCHN: string | null;
  fVolume: number;
  fWeight: number;
  fTotalPrice: number;
  fStatus: string | null;
  usStatus: string | null;
  dateLabel: string;
  timeLabel: string;
};

// PHP DATE(date) / TIME(date) — split a SQL timestamp into two columns.
function splitDateTime(ts: string | null): { date: string; time: string } {
  if (!ts) return { date: "", time: "" };
  const [datePart, timePartRaw] = ts.replace("T", " ").split(" ");
  return { date: datePart ?? "", time: (timePartRaw ?? "").slice(0, 8) };
}

export default async function SalesReportAddPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  if (!agent) redirect("/dashboard"); // defensive — layout already 404s.
  const userIDMain = agent.userIDMain;

  const admin = createAdminClient();

  // ── The unpaid-items query, transcribed 1:1 (L61-66) ──────────
  // 1. The team's member ids — tb_users WHERE coID = $userIDMain.
  const { data: teamUsersRaw } = await admin
    .from("tb_users")
    .select("userid")
    .eq("coid", userIDMain);
  const teamUserIds = (
    (teamUsersRaw ?? []) as unknown as { userid: string }[]
  ).map((u) => u.userid);

  let rows: UnpaidRow[] = [];
  if (teamUserIds.length > 0) {
    // 2. tb_user_sales WHERE usStatus=1 — only the unclaimed rows.
    //    ORDER BY date DESC (L66).
    const { data: usRaw } = await admin
      .from("tb_user_sales")
      .select("id, usstatus, date, idf")
      .eq("usstatus", "1")
      .order("date", { ascending: false });
    const usRows = (usRaw ?? []) as unknown as {
      id: number;
      usstatus: string | null;
      date: string | null;
      idf: number;
    }[];

    // 3. LEFT JOIN tb_forwarder ON f.ID=us.IDF.
    const forwarderIds = [...new Set(usRows.map((r) => r.idf))];
    const forwarderById = new Map<
      number,
      {
        id: number;
        userid: string | null;
        ftrackingchn: string | null;
        fvolume: number | string | null;
        fweight: number | string | null;
        ftotalprice: number | string | null;
        fstatus: string | null;
      }
    >();
    if (forwarderIds.length > 0) {
      const { data: fwdRaw } = await admin
        .from("tb_forwarder")
        .select("id, userid, ftrackingchn, fvolume, fweight, ftotalprice, fstatus")
        .in("id", forwarderIds);
      for (const f of (fwdRaw ?? []) as unknown as {
        id: number;
        userid: string | null;
        ftrackingchn: string | null;
        fvolume: number | string | null;
        fweight: number | string | null;
        ftotalprice: number | string | null;
        fstatus: string | null;
      }[]) {
        forwarderById.set(f.id, f);
      }
    }

    // 4. LEFT JOIN tb_users + WHERE u.coID — keep only rows whose
    //    forwarder belongs to a team member.
    const teamSet = new Set(teamUserIds);
    rows = usRows
      .map((us): UnpaidRow | null => {
        const f = forwarderById.get(us.idf);
        if (!f || f.userid == null || !teamSet.has(f.userid)) return null;
        const { date, time } = splitDateTime(us.date);
        return {
          usID: us.id,
          userID: f.userid,
          fTrackingCHN: f.ftrackingchn,
          fVolume: Number(f.fvolume ?? 0),
          fWeight: Number(f.fweight ?? 0),
          fTotalPrice: Number(f.ftotalprice ?? 0),
          fStatus: f.fstatus,
          usStatus: us.usstatus,
          dateLabel: date,
          timeLabel: time,
        };
      })
      .filter((r): r is UnpaidRow => r !== null);
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset via a plain <link>. */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales-add.php <title> L14 (fidelity-record comment):
          รายงานยอดขายทีม {userIDMain} | Pacred */}

      {/* BEGIN: Content — report-user-sales-add.php L30 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L34-45 — breadcrumb header */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">
                      รายงานยอดขายทีม {userIDMain}
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L46 — content-body */}
          <div className="content-body pr110">
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="pt-1 pl-1 pr-1">
                      <h3 className="">
                        รายการที่ยังไม่ได้เบิกเงิน {userIDMain}
                      </h3>
                    </div>
                    <div className="card-content">
                      <div className="card-body pl-1 pr-1 pt-0">
                        <div className="row">
                          <div className="col-12">
                            <h4 className="text-center text-md-left d-inline-block"></h4>
                            {/* L69-133 — the payout form. Legacy is
                                method="POST" action="report-user-sales-add/"
                                — the submit is the deferred Server Action
                                (see the file header §1/§3); the form
                                markup is transcribed 1:1. */}
                            <form
                              className="form-horizontal"
                              method="POST"
                              action="/sales/report/add"
                              autoComplete="off"
                            >
                              <div className="table-responsive ">
                                <table
                                  id="myTable"
                                  className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                                >
                                  <thead>
                                    <tr className="text-center">
                                      <th>ID</th>
                                      <th>วันที่สถานะสำเร็จ</th>
                                      <th>รหัสสมาชิก</th>
                                      <th>เลขแทรคกิ้ง</th>
                                      <th>ปริมาตร(CBM)</th>
                                      <th>น้ำหนัก(Kg)</th>
                                      <th>ค่าฝากนำเข้าจีน</th>
                                      <th>สถานะ</th>
                                      <th>
                                        สถานะเบิก
                                        <br />
                                        เงินส่วนแบ่ง
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row) => (
                                      <tr key={row.usID}>
                                        <td>{row.usID}</td>
                                        <td className="text-center font-12">
                                          {row.dateLabel} {row.timeLabel} น.
                                        </td>
                                        <td>{row.userID}</td>
                                        <td>{row.fTrackingCHN}</td>
                                        <td className="text-right">
                                          {numberFormat(row.fVolume, 5)}{" "}
                                        </td>
                                        <td className="text-right">
                                          {numberFormat(row.fWeight, 2)}{" "}
                                        </td>
                                        <td className="text-right">
                                          {numberFormat(row.fTotalPrice, 2)}{" "}
                                        </td>
                                        <td className="text-center">
                                          {fStatusBadge(row.fStatus)}
                                        </td>
                                        <td className="text-center">
                                          {nameStatusUserPay(row.usStatus)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {/* L130-132 — the fixed-position payout
                                  trigger. Legacy: jQuery #select1 click
                                  → AJAX getListForwarder.php (a deferred
                                  Server Action — see the file header §3). */}
                              <div
                                className="btn-group"
                                role="group"
                                aria-label="Basic example"
                                style={{
                                  position: "fixed",
                                  bottom: "20px",
                                  zIndex: 999,
                                }}
                              >
                                <a href="#">
                                  <span
                                    className="btn btn-color-main waves-effect round"
                                    id="select1"
                                  >
                                    ทำรายการเบิกเงินรายการที่เลือก
                                  </span>
                                </a>
                              </div>
                            </form>
                            <hr />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* Basic Carousel end */}
          </div>
        </div>
      </div>
      {/* END: Content — report-user-sales-add.php L149 */}
      {/* L150 — the jQuery AJAX target div for getListForwarder.php */}
      <div id="list-forwarder-data"></div>
    </div>
  );
}

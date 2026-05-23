import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSalesAgent } from "../team-map";
import { nameStatusUserPay, numberFormat } from "../helpers";

/**
 * Sales-rep "ประวัติจ่ายเงินลูกค้าตัวแทน" (agent payout history) screen —
 * the LIST view, a FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/report-user-sales-history.php` (the no-`?page` branch,
 * L13-294) (D1 / ADR-0017 · the faithful-port transcription
 * workstream · runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * `report-user-sales-history.php` is a TWO-VIEW screen — the legacy
 * branches on `$_GET['page']`:
 *   - no `?page`        → the payout-history LIST   (this file)
 *   - `?page=ID`        → the per-payout DETAIL     (`./[id]/page.tsx`)
 * Each legacy view becomes a separate Next.js route segment (the
 * runbook §8 sub-page-router pattern). This file is the list view.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup the list view renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order.
 * The visual identity comes from the legacy theme CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/report-user-sales.css`, loaded via a plain `<link>`.
 *
 * List-view structure transcribed here (L129-232):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb
 *        — "หน้าแรก" / "ประวัติจ่ายเงินลูกค้าตัวแทน"
 *     2. .content-body.pr110 > section > .row > .col-md-12 > .card
 *        > .card-content > .card-body
 *          a. .row — the "ประวัติจ่ายเงินลูกค้าตัวแทน" title (left)
 *             + the "ทำรายการเบิกเงิน" button (right)
 *          b. .row > .col-12 > table#myTable — the payout list
 *             (6 columns)
 *
 * Data — the `report-user-sales-history.php` L188 mysqli query,
 * transcribed 1:1 to the ported legacy `tb_*` schema (Supabase).
 *   SELECT status,ID,DATE(date),TIME(date),imagesSlip,amount,
 *          adminCreate,userIDMain
 *   FROM tb_user_sales_admin_pay WHERE userIDMain='$userIDMain'
 *
 * Gate — `report-user-sales-history.php` L3 only allows the 5
 * whitelisted member codes; that gate is in `../layout.tsx`
 * (`resolveSalesAgent`).
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── NOT transcribed (deliberate · flagged) ──
 *  1. `report-user-sales-history.php` L14-111 — the `$_POST['add']`
 *     handler (the actual payout: sums the selected rows, applies the
 *     1% − 3% commission, uploads the PDF, INSERTs
 *     tb_user_sales_admin_pay + tb_user_sales_pay, UPDATEs
 *     tb_user_sales.usStatus, then SweetAlert-redirects to the
 *     detail view). This is a render-time mutation; a Server
 *     Component render must be a PURE READ — NOT reproduced. It
 *     becomes the `/sales/report/add` screen's deferred Server
 *     Action (the same payout the legacy add screen posts).
 *  2. `include/header.php` L75-85 `UPDATE tb_header_order` — NOT
 *     reproduced (render-time mutation).
 *  3. The DataTables jQuery (page `<script>` L244-260) needs client
 *     JS; the table renders statically with the `#myTable` class
 *     hooks (resting look identical) — functional sort is the
 *     follow-up.
 *  4. The SweetAlert result popups (L261-294) fire only after the
 *     L14-111 POST — moot here (the POST is not reproduced).
 */

// This screen reads the signed-in customer's cookies/auth + the
// service-role `tb_*` data on every request — it cannot be statically
// rendered. `force-dynamic` per the faithful-port runbook §11.
export const dynamic = "force-dynamic";

/** A payout-history row, as the L188 query yields. */
type PayoutRow = {
  ID: number;
  status: string | null;
  imagesSlip: string | null;
  amount: number;
  userIDMain: string | null;
  dateLabel: string;
  timeLabel: string;
};

// PHP DATE(date) / TIME(date) — split a SQL timestamp into two columns.
function splitDateTime(ts: string | null): { date: string; time: string } {
  if (!ts) return { date: "", time: "" };
  const [datePart, timePartRaw] = ts.replace("T", " ").split(" ");
  return { date: datePart ?? "", time: (timePartRaw ?? "").slice(0, 8) };
}

export default async function SalesHistoryPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  if (!agent) redirect("/dashboard"); // defensive — layout already 404s.
  const userIDMain = agent.userIDMain;

  const admin = createAdminClient();

  // ── The payout-history query, transcribed 1:1 (L188) ──────────
  // SELECT … FROM tb_user_sales_admin_pay WHERE userIDMain=$userIDMain
  const { data: payoutsRaw } = await admin
    .from("tb_user_sales_admin_pay")
    .select("id, status, date, imagesslip, amount, admincreate, useridmain")
    .eq("useridmain", userIDMain);

  const rows: PayoutRow[] = (
    (payoutsRaw ?? []) as unknown as {
      id: number;
      status: string | null;
      date: string | null;
      imagesslip: string | null;
      amount: number | string | null;
      useridmain: string | null;
    }[]
  ).map((r) => {
    const { date, time } = splitDateTime(r.date);
    return {
      ID: r.id,
      status: r.status,
      imagesSlip: r.imagesslip,
      amount: Number(r.amount ?? 0),
      userIDMain: r.useridmain,
      dateLabel: date,
      timeLabel: time,
    };
  });

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset via a plain <link>. */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales-history.php <title> L113 (fidelity-record
          comment):  ประวัติจ่ายเงินลูกค้าตัวแทน | Pacred */}

      {/* BEGIN: Content — report-user-sales-history.php L129 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L133-144 — breadcrumb header */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">
                      ประวัติจ่ายเงินลูกค้าตัวแทน
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L145 — content-body */}
          <div className="content-body pr110">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        {/* L153-171 — title + the "ทำรายการเบิกเงิน" button */}
                        <div className="row">
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                ประวัติจ่ายเงินลูกค้าตัวแทน
                              </h3>
                            </div>
                          </div>
                          <div className="content-header-right col-md-6 col-12">
                            <div className="float-md-right">
                              <div className="text-center text-md-right">
                                <Link href="/sales/report/add">
                                  <button className="btn btn-sm btn-circle btn-success text-white">
                                    <i className="ft-plus"></i>
                                  </button>{" "}
                                  <span className="font-normal text-dark">
                                    ทำรายการเบิกเงิน
                                  </span>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>
                        {/* L172-221 — the payout-history table */}
                        <div className="row">
                          <div className="col-12">
                            <div className="table-responsive">
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>วันที่ทำรายการ</th>
                                    <th>รหัสตัวแทนขาย</th>
                                    <th>จำนวนเงิน</th>
                                    <th>สลิป</th>
                                    <th>สถานะรายการ</th>
                                    <th>ตัวเลือก</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.ID}>
                                      <td className="text-center font-12">
                                        {row.dateLabel} {row.timeLabel} น.
                                      </td>
                                      <td className="text-center">
                                        {row.userIDMain}
                                      </td>
                                      <td className="text-right">
                                        {numberFormat(row.amount, 2)}
                                      </td>
                                      <td className="text-center">
                                        {/* L199-204 — the slip link shows
                                            only when status==3. */}
                                        {row.status === "3" && (
                                          <a
                                            className="image-popup-vertical-fit el-link"
                                            href={`https://pcscargo.co.th/member/storage/slip/${row.imagesSlip ?? ""}`}
                                          >
                                            ดูสลิป
                                          </a>
                                        )}
                                      </td>
                                      <td className="text-center">
                                        {nameStatusUserPay(row.status)}
                                      </td>
                                      <td className="text-center">
                                        <Link href={`/sales/history/${row.ID}`}>
                                          <span className="btn btn-sm font-12 btn-outline-success btn-rounded">
                                            {" "}
                                            ดูรายละเอียด{" "}
                                          </span>
                                        </Link>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
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
            {/* Basic Carousel end */}
          </div>
        </div>
      </div>
      {/* END: Content — report-user-sales-history.php L232 */}
    </div>
  );
}

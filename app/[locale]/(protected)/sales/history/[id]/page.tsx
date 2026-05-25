import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSalesAgent } from "../../team-map";
import { fStatusBadge, nameStatusUserPay, numberFormat } from "../../helpers";

/**
 * Sales-rep "ประวัติจ่ายเงินลูกค้าตัวแทน #ID" (agent payout detail)
 * screen — the DETAIL view, a FAITHFUL 1:1 TRANSCRIPTION of the legacy
 * PCS Cargo `member/report-user-sales-history.php` (the `?page=ID`
 * branch, L296-509) (D1 / ADR-0017 · the faithful-port transcription
 * workstream · runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * `report-user-sales-history.php` is a TWO-VIEW screen — the legacy
 * branches on `$_GET['page']`:
 *   - no `?page`        → the payout-history LIST   (`../page.tsx`)
 *   - `?page=ID`        → the per-payout DETAIL     (this file)
 * Each legacy view becomes a separate Next.js route segment (the
 * runbook §8 sub-page-router pattern). The legacy `?page=ID` is the
 * `[id]` dynamic segment here.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup the detail view renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order.
 * The visual identity comes from the legacy theme CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/report-user-sales.css`, loaded via a plain `<link>`.
 *
 * Detail-view structure transcribed here (L316-499):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb — "หน้าแรก" /
 *        "ประวัติจ่ายเงินลูกค้าตัวแทน" / "#{ID}"
 *     2. .content-body.pr110 > section > .row > .col-md-12
 *        a. .card #1 — the payout summary card: bank name / account
 *           no / account name / amount + (status==2: "รอดำเนินการ" +
 *           a card-file link · else: "สำเร็จ" + the slip image)
 *        b. .card #2 — table#myTable, the items in this payout
 *           (9 columns)
 *
 * Data — two queries, transcribed 1:1:
 *  - L298 — the payout row:
 *    SELECT *,ID,DATE(dateSlip),TIME(dateSlip),imagesSlip,amount,
 *           adminCreate,userIDMain
 *    FROM tb_user_sales_admin_pay WHERE ID='$ID' AND userIDMain='$userIDMain'
 *    (note the `AND userIDMain` — the legacy scopes the lookup to the
 *    viewer's own team; a foreign ID 404s. Reproduced exactly.)
 *  - L433 / L446-451 — the items in this payout:
 *    SELECT IDUS FROM tb_user_sales_pay WHERE IDUSAP='$ID'
 *    then SELECT … FROM tb_user_sales us
 *           LEFT JOIN tb_forwarder f ON f.ID=us.IDF
 *           LEFT JOIN tb_users u ON f.userID=u.userID
 *         WHERE us.ID IN (the IDUS set)
 *
 * Gate — `report-user-sales-history.php` L3 only allows the 5
 * whitelisted member codes; that gate is in `../../layout.tsx`
 * (`resolveSalesAgent`). The `AND userIDMain` in the L298 query is the
 * per-row ownership check (a payout from another team → notFound()).
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── NOT transcribed (deliberate · flagged) ──
 *  1. `include/header.php` L75-85 `UPDATE tb_header_order` — a
 *     render-time mutation; a Server Component render must be a PURE
 *     READ — NOT reproduced.
 *  2. The legacy detail view loads no DataTables/page JS of its own
 *     (L501-503 only re-includes `all-script.php`); the `#myTable` is
 *     rendered statically — its resting look is identical via the
 *     legacy CSS.
 *  3. The aggregate counters $pricePCSAllCHN etc. (L441-444/L464-467)
 *     are summed in the legacy loop but never echoed on this view —
 *     faithful transcription = no totals row.
 */

// This screen reads the signed-in customer's cookies/auth + the
// service-role `tb_*` data on every request, under a dynamic `[id]`
// segment — it cannot be statically rendered. `force-dynamic` per the
// faithful-port runbook §11.
export const dynamic = "force-dynamic";

/** A payout-items row, as the L446-451 query yields. */
type ItemRow = {
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

export default async function SalesHistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  if (!agent) redirect("/dashboard"); // defensive — layout already 404s.
  const userIDMain = agent.userIDMain;

  const { id } = await params;

  const admin = createAdminClient();

  // ── L298 — the payout row. WHERE ID=$ID AND userIDMain=$userIDMain
  //   — the `AND userIDMain` scopes the lookup to the viewer's own
  //   team; a foreign / unknown ID yields no row → legacy `//404page`. ──
  const { data: rowMain, error: rowMainErr } = await admin
    .from("tb_user_sales_admin_pay")
    .select(
      "id, status, useridmain, dateslip, imagesslip, amount, admincreate, " +
        "name_blank, no_blank, name_account, file",
    )
    .eq("id", id)
    .eq("useridmain", userIDMain)
    .maybeSingle<{
      id: number;
      status: string | null;
      useridmain: string | null;
      dateslip: string | null;
      imagesslip: string | null;
      amount: number | string | null;
      admincreate: string | null;
      name_blank: string | null;
      no_blank: string | null;
      name_account: string | null;
      file: string | null;
    }>();

  // Legacy `if ($result->num_rows > 0){…}else{ //404page }`.
  if (rowMainErr) {
    console.error(`[tb_user_sales_admin_pay lookup] failed`, { code: rowMainErr.code, message: rowMainErr.message, details: rowMainErr.details, hint: rowMainErr.hint });
    throw new Error(`Failed to load tb_user_sales_admin_pay (${rowMainErr.code ?? "unknown"}): ${rowMainErr.message}`);
  }
  if (!rowMain) {
    notFound();
  }

  const amount = Number(rowMain.amount ?? 0);

  // ── L433 — the IDUS set for this payout ──
  const { data: payLinksRaw, error: payLinksRawErr } = await admin
    .from("tb_user_sales_pay")
    .select("idus")
    .eq("idusap", id);
  if (payLinksRawErr) {
    console.error(`[tb_user_sales_pay list] failed`, { code: payLinksRawErr.code, message: payLinksRawErr.message });
  }
  const idusList = (
    (payLinksRaw ?? []) as unknown as { idus: number }[]
  ).map((p) => p.idus);

  // ── L446-451 — the items: tb_user_sales WHERE ID IN (idusList),
  //   joined to tb_forwarder (by IDF) and tb_users. ──
  let items: ItemRow[] = [];
  if (idusList.length > 0) {
    const { data: usRaw, error: usRawErr } = await admin
      .from("tb_user_sales")
      .select("id, usstatus, date, idf")
      .in("id", idusList);
    if (usRawErr) {
      console.error(`[tb_user_sales list] failed`, { code: usRawErr.code, message: usRawErr.message });
    }
    const usRows = (usRaw ?? []) as unknown as {
      id: number;
      usstatus: string | null;
      date: string | null;
      idf: number;
    }[];

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
      const { data: fwdRaw, error: fwdRawErr } = await admin
        .from("tb_forwarder")
        .select("id, userid, ftrackingchn, fvolume, fweight, ftotalprice, fstatus")
        .in("id", forwarderIds);
      if (fwdRawErr) {
        console.error(`[tb_forwarder list] failed`, { code: fwdRawErr.code, message: fwdRawErr.message });
      }
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

    items = usRows.map((us) => {
      const f = forwarderById.get(us.idf);
      const { date, time } = splitDateTime(us.date);
      return {
        usID: us.id,
        userID: f?.userid ?? null,
        fTrackingCHN: f?.ftrackingchn ?? null,
        fVolume: Number(f?.fvolume ?? 0),
        fWeight: Number(f?.fweight ?? 0),
        fTotalPrice: Number(f?.ftotalprice ?? 0),
        fStatus: f?.fstatus ?? null,
        usStatus: us.usstatus,
        dateLabel: date,
        timeLabel: time,
      };
    });
  }

  // Legacy storage base — the slip / file links are absolute legacy
  // URLs (faithful, scrub-safe per the runbook §9.2).
  const STORAGE = "https://pcscargo.co.th/member/storage";

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — static public/ asset via a plain <link>. */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales-history.php detail <title> L303 (fidelity-
          record comment):  ประวัติจ่ายเงินลูกค้าตัวแทน #{ID} | Pacred Admin */}

      {/* BEGIN: Content — report-user-sales-history.php L316 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L320-332 — breadcrumb header */}
          <div className="content-header row">
            <div className="content-header-left col-12">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/sales/history">
                        ประวัติจ่ายเงินลูกค้าตัวแทน
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">#{rowMain.id}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L333 — content-body */}
          <div className="content-body pr110">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  {/* L338-398 — card #1: the payout summary */}
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-6 offset-md-3">
                            {/* L344-393 — branch on status: 2 →
                                "รอดำเนินการ" + card-file link · else →
                                "สำเร็จ" + the slip image. The left
                                bank-info column is identical in both. */}
                            <div className="row">
                              <div className="col-md-6">
                                <div className="">
                                  <label
                                    className="form-control-label"
                                    htmlFor="name_blank"
                                  >
                                    ชื่อธนาคาร : {rowMain.name_blank}
                                  </label>
                                </div>
                                <div className="">
                                  <label
                                    className="form-control-label"
                                    htmlFor="no_blank"
                                  >
                                    เลขที่บัญชี : {rowMain.no_blank}{" "}
                                  </label>
                                </div>
                                <div className="">
                                  <label
                                    className="form-control-label"
                                    htmlFor="name_account"
                                  >
                                    ชื่อบัญชี : {rowMain.name_account}
                                  </label>
                                </div>
                                <div className="">
                                  <label className="form-control-label" htmlFor="">
                                    จำนวนเงิน :{" "}
                                    <span className="text-danger">
                                      {numberFormat(amount, 2)}
                                    </span>{" "}
                                    บาท
                                  </label>
                                </div>
                              </div>
                              <div className="col-md-6">
                                {rowMain.status === "2" ? (
                                  <>
                                    สถานะ :{" "}
                                    <span className="font-12 badge badge-warning badge-pill">
                                      รอดำเนินการ
                                    </span>
                                    <br />
                                    สำเนาบัตร :{" "}
                                    <a
                                      href={`${STORAGE}/file/${rowMain.file ?? ""}`}
                                      className="text-info"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      ดูไฟล์
                                    </a>
                                  </>
                                ) : (
                                  <>
                                    สถานะ :{" "}
                                    <span className="font-12 badge badge-success badge-pill">
                                      สำเร็จ
                                    </span>
                                    <a
                                      className="image-popup-vertical-fit el-link"
                                      href={`${STORAGE}/slip/${rowMain.imagesslip ?? ""}`}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        width={120}
                                        src={`${STORAGE}/slip/${rowMain.imagesslip ?? ""}`}
                                        alt=""
                                      />
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* L400-491 — card #2: the items in this payout */}
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="content-header-left col-md-6 col-12">
                            <div className="text-center text-md-left">
                              <h3 className="text-center text-md-left">
                                <span className="font-30 ft-users"></span>{" "}
                                ประวัติจ่ายเงินลูกค้าตัวแทน #{rowMain.id}
                              </h3>
                            </div>
                          </div>
                          <div className="content-header-right col-md-6 col-12"></div>
                        </div>
                        <div className="row">
                          <div className="col-12">
                            <div className="table-responsive pt-1">
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>ลำดับ</th>
                                    <th>วันที่สำเร็จ</th>
                                    <th>รหัสสมาชิก</th>
                                    <th>เลขแทรคกิ้ง</th>
                                    <th>ปริมาตร(CBM)</th>
                                    <th>น้ำหนัก(Kg)</th>
                                    <th>
                                      ค่าฝากนำ
                                      <br />
                                      เข้าจีน
                                    </th>
                                    <th>สถานะ</th>
                                    <th>
                                      สถานะเบิก
                                      <br />
                                      เงินส่วนแบ่ง
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((row, i) => (
                                    <tr key={row.usID}>
                                      <td className="text-center">{i + 1}</td>
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
      {/* END: Content — report-user-sales-history.php L499 */}
    </div>
  );
}

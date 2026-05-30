import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSalesAgent } from "../team-map";
import { fStatusBadge, nameStatusUserPay, numberFormat } from "../helpers";

/**
 * Sales-rep "รายงานยอดขายทีม" (team sales report) screen — a FAITHFUL
 * 1:1 TRANSCRIPTION of the legacy PCS Cargo `member/report-user-sales.php`
 * (D1 / ADR-0017 · the faithful-port transcription workstream ·
 * runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `report-user-sales.php` renders — same
 * elements, same Bootstrap-4 class names, same structure, same labels,
 * same order. The visual identity comes from the legacy theme CSS,
 * brought in verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/report-user-sales.css`, loaded via a plain
 * `<link>`.
 *
 * `report-user-sales.php` source structure transcribed here (L74-225):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb — "หน้าแรก" / "รายงานยอดขายทีม"
 *     2. .content-body.pr110 > section > .row > .col-md-12
 *        > .card > .card-content > .card-body.p-1 > .row > .col-12
 *          a. <h3> "รายงานยอดขายทีม {userIDMain}"
 *          b. the filter form — a usStatus <select> + a daterangepicker
 *             <input> + a "ค้นหาข้อมูล" submit button
 *          c. the search-result caption (when a search was run)
 *          d. table#myTable — the team-sales report (8 columns)
 *
 * ── Filters — searchParams, not POST (the runbook §9 gotcha) ──
 * The legacy form uses `method="POST"` and reads `$_POST['usStatus']` /
 * `$_POST['date']` / `$_POST['report_forwarderTable']`. A Server
 * Component cannot read a POST body; per the faithful-port runbook the
 * legacy filter inputs are exposed as URL `searchParams` and the form
 * is `method="GET"`. The filter SEMANTICS — the WHERE clauses, the
 * default "first/last day of this month" range, the status options —
 * are transcribed 1:1; only the transport (POST→GET) changes.
 *
 * Data — the `report-user-sales.php` L133-155 mysqli query, transcribed
 * 1:1 to the ported legacy `tb_*` schema (Supabase). `tb_*` is
 * RLS-locked to service_role, so reads go through the admin client.
 *   SELECT … FROM tb_user_sales us
 *     LEFT JOIN tb_forwarder f ON f.ID=us.IDF
 *     LEFT JOIN tb_users u ON f.userID=u.userID
 *   WHERE u.coID='$userIDMain'
 *     AND (DATE(date) BETWEEN '$startDate' AND '$endDate')
 *     [AND usStatus='$usStatus']     ORDER BY date DESC
 * PostgREST cannot filter on a joined table's column, so the join is
 * run as the same sequence of lookups the PHP effectively does:
 * tb_user_sales → tb_forwarder (by IDF) → filter by the forwarder's
 * userID being a team member (u.coID='$userIDMain').
 *
 * Gate — `report-user-sales.php` L3 only allows the 5 whitelisted
 * member codes; that gate is in `../layout.tsx` (`resolveSalesAgent`).
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── NOT transcribed (deliberate · flagged) ──
 *  1. `report-user-sales.php` L13-59 — the `$_POST['add']` handler
 *     (INSERT tb_user_sales_admin_pay + tb_user_sales_pay + UPDATE
 *     tb_user_sales.usStatus). This is a render-time mutation; a
 *     Server Component render must be a PURE READ — NOT reproduced.
 *     The legacy `add` POST is fired from the report-user-sales-add
 *     screen (`/sales/report/add`), so it becomes that screen's
 *     deferred Server Action.
 *  2. `include/header.php` L75-85 `UPDATE tb_header_order` — a
 *     render-time mutation; NOT reproduced.
 *  3. The DataTables + daterangepicker jQuery (page `<script>`
 *     L248-279) needs client JS; the table renders statically with
 *     the `#myTable` hooks (resting look identical) and the date
 *     <input> is a plain text input. The functional sort / the
 *     daterangepicker calendar are a deferred client-JS follow-up.
 */

// This screen reads the signed-in customer's cookies/auth + the
// service-role `tb_*` data + the URL searchParams on every request —
// it cannot be statically rendered. `force-dynamic` per the
// faithful-port runbook §11.
export const dynamic = "force-dynamic";

// The aggregate counters the legacy initialises ($pricePCSAllCHN etc.,
// L175-178) are computed but never echoed on this screen — the legacy
// declares them, sums them in the loop, and never prints them.
// Faithful transcription = no totals row.

/** A team-sales report row, as the report-user-sales.php query yields. */
type ReportRow = {
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

// PHP date("Y-m-d", strtotime("first/last day of this month")).
function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastDayOfThisMonth(): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// report-user-sales.php L122-126 — the usStatus → Thai label switch
// used in the search-result caption.
const US_STATUS_LABEL: Record<string, string> = {
  "1": "ยังไม่เบิกจ่าย",
  "2": "กำลังดำเนินการ",
  "3": "เบิกจ่ายแล้ว",
  all: "ทั้งหมด",
};

// PHP DATE(date) / TIME(date) — split a SQL timestamp into the two
// columns the legacy table prints ("YYYY-MM-DD" and "HH:MM:SS").
function splitDateTime(ts: string | null): { date: string; time: string } {
  if (!ts) return { date: "", time: "" };
  const [datePart, timePartRaw] = ts.replace("T", " ").split(" ");
  return { date: datePart ?? "", time: (timePartRaw ?? "").slice(0, 8) };
}

export default async function SalesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  if (!agent) redirect("/dashboard"); // defensive — layout already 404s.
  const userIDMain = agent.userIDMain;

  const sp = await searchParams;
  // The legacy `isset($_POST['report_forwarderTable'])` flag — true
  // once the customer submits the filter form. Exposed as a GET param.
  const didSearch = sp["report_forwarderTable"] != null;
  const usStatusRaw = typeof sp["usStatus"] === "string" ? sp["usStatus"] : "all";
  const dateRaw = typeof sp["date"] === "string" ? sp["date"] : "";

  // report-user-sales.php L111 — the date input default value.
  // When no search: "first day of this month - last day of this month".
  // When a search ran: keep the submitted "YYYY-MM-DD - YYYY-MM-DD".
  const defaultDateValue = `${firstDayOfThisMonth()} - ${lastDayOfThisMonth()}`;
  const dateInputValue = didSearch && dateRaw ? dateRaw : defaultDateValue;

  // report-user-sales.php L131-132 / L147-148 — the active date range.
  // The legacy slices `$_POST['date']`: chars 0-10 = start, 13+ = end.
  let startDate = firstDayOfThisMonth();
  let endDate = lastDayOfThisMonth();
  if (didSearch && dateRaw.length >= 13) {
    startDate = dateRaw.slice(0, 10);
    endDate = dateRaw.slice(13);
  }

  const admin = createAdminClient();

  // ── The report query, transcribed 1:1 (L133-155) ──────────────
  // 1. The team's member ids — tb_users WHERE coID = $userIDMain.
  const { data: teamUsersRaw, error: teamUsersRawErr } = await admin
    .from("tb_users")
    .select("userID")
    .eq("coID", userIDMain);
  if (teamUsersRawErr) {
    console.error(`[tb_users list] failed`, { code: teamUsersRawErr.code, message: teamUsersRawErr.message });
  }
  const teamUserIds = (
    (teamUsersRaw ?? []) as unknown as { userID: string }[]
  ).map((u) => u.userID);

  let rows: ReportRow[] = [];
  if (teamUserIds.length > 0) {
    // 2. tb_user_sales — the team-sales rows. Filter by usStatus when
    //    set (L143-145). Order by `date` DESC (L154).
    let usQuery = admin
      .from("tb_user_sales")
      .select("id, usstatus, date, idf")
      .order("date", { ascending: false });
    if (usStatusRaw !== "all" && usStatusRaw !== "") {
      usQuery = usQuery.eq("usstatus", usStatusRaw);
    }
    const { data: usRaw, error: usRawErr } = await usQuery;
    if (usRawErr) {
      console.error(`[tb_user_sales list] failed`, { code: usRawErr.code, message: usRawErr.message });
    }
    const usRows = (usRaw ?? []) as unknown as {
      id: number;
      usstatus: string | null;
      date: string | null;
      idf: number;
    }[];

    // The date filter is on `tb_user_sales.date` (L139/L141/L154).
    const inRange = usRows.filter((r) => {
      if (!r.date) return false;
      const d = r.date.slice(0, 10);
      return startDate === endDate ? d === startDate : d >= startDate && d <= endDate;
    });

    // 3. LEFT JOIN tb_forwarder ON f.ID=us.IDF — the forwarder rows.
    const forwarderIds = [...new Set(inRange.map((r) => r.idf))];
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

    // 4. LEFT JOIN tb_users ON f.userID=u.userID + WHERE u.coID — i.e.
    //    keep only rows whose forwarder belongs to a team member.
    const teamSet = new Set(teamUserIds);
    rows = inRange
      .map((us): ReportRow | null => {
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
      .filter((r): r is ReportRow => r !== null);
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for layout-scope globals; the
          visible surface below is Tailwind (2026-05-30 rebuild · ปอน). */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales.php <title> L61 (fidelity-record comment):
          รายงานยอดขายทีม {userIDMain} | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* ── Header: title ── */}
          <div className="border-b border-border px-3 py-3 md:px-5 md:py-4">
            <h3 className="text-base md:text-xl font-bold text-foreground">
              รายงานยอดขายทีม {userIDMain}
            </h3>
          </div>

          {/* ── Filter form. Legacy was method="POST"; transcribed as
              method="GET" so a Server Component reads the filters
              (runbook §9). name/value/defaultValue + hook classes
              (usStatus / shawCalRanges) preserved verbatim. ── */}
          <div className="px-3 py-3 md:px-5 md:py-4">
            <form
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] items-end gap-2.5 md:gap-3"
              method="GET"
              action="/sales/report"
            >
              <div className="min-w-0">
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="usStatus">
                  สถานะรายการจ่ายเงินส่วนแบ่ง
                </label>
                <select
                  className="usStatus w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  name="usStatus"
                  defaultValue={usStatusRaw}
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="1">ยังไม่เบิกจ่าย</option>
                  <option value="2">กำลังดำเนินการ</option>
                  <option value="3">เบิกจ่ายแล้ว</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="date">
                  วันที่ออเดอร์สำเร็จ
                </label>
                <input
                  type="text"
                  className="shawCalRanges w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-base md:text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                  name="date"
                  defaultValue={dateInputValue}
                />
              </div>
              <button
                type="submit"
                className="inline-flex w-full lg:w-auto items-center justify-center gap-2 rounded-lg bg-red-600 text-white px-5 py-2 text-sm font-bold shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all whitespace-nowrap"
                name="report_forwarderTable"
                value="1"
              >
                <i className="fas fa-search" aria-hidden></i> ค้นหาข้อมูล
              </button>
            </form>

            {/* the search-result caption */}
            {didSearch && (
              <p className="mt-3 text-xs md:text-sm text-red-600">
                ผลลัพธ์การค้นหา โดยสถานะ : {US_STATUS_LABEL[usStatusRaw] ?? ""}{" "}
                ตั้งแต่วันที่ : {dateRaw}
              </p>
            )}

            <hr className="my-3 border-t border-dashed border-border" />

            {/* ── The report list ── */}
            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">ไม่พบรายการ</p>
            ) : (
              <>
                {/* ── Mobile: stacked cards (md:hidden) ── */}
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <div
                      key={row.usID}
                      className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-all font-mono text-sm font-semibold text-foreground">
                          {row.fTrackingCHN || `#${row.usID}`}
                        </span>
                        <span className="shrink-0">{fStatusBadge(row.fStatus)}</span>
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted">{row.userID}</p>
                      <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-dashed border-border pt-2 text-center">
                        <div>
                          <div className="text-[10px] text-muted">CBM</div>
                          <div className="text-sm font-semibold tabular-nums font-mono">
                            {numberFormat(row.fVolume, 5)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted">Kg</div>
                          <div className="text-sm font-semibold tabular-nums font-mono">
                            {numberFormat(row.fWeight, 2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted">ค่าฝากนำเข้าจีน</div>
                          <div className="text-sm font-bold tabular-nums font-mono text-red-600">
                            {numberFormat(row.fTotalPrice, 2)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                        <span className="text-[11px] text-muted">
                          {row.dateLabel} {row.timeLabel} น.
                        </span>
                        <span>{nameStatusUserPay(row.usStatus)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Desktop: table (plain div wrapper isolates Tailwind
                    from the legacy `.dataTable` cascade) ── */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                  <table id="myTable" className="dataTable w-full text-sm">
                    <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">วันที่สถานะสำเร็จ</th>
                        <th className="px-3 py-3 font-medium whitespace-nowrap">รหัสสมาชิก</th>
                        <th className="px-3 py-3 font-medium whitespace-nowrap">เลขแทรคกิ้ง</th>
                        <th className="px-3 py-3 font-medium text-right whitespace-nowrap">ปริมาตร(CBM)</th>
                        <th className="px-3 py-3 font-medium text-right whitespace-nowrap">น้ำหนัก(Kg)</th>
                        <th className="px-3 py-3 font-medium text-right whitespace-nowrap">ค่าฝากนำเข้าจีน</th>
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">สถานะ</th>
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">สถานะเบิกเงินส่วนแบ่ง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.usID}
                          className="border-t border-border hover:bg-surface-alt/30"
                        >
                          <td className="px-3 py-2.5 text-center text-xs text-muted whitespace-nowrap">
                            {row.dateLabel} {row.timeLabel} น.
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">
                            {row.userID}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">
                            {row.fTrackingCHN}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-mono text-foreground">
                            {numberFormat(row.fVolume, 5)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-mono text-foreground">
                            {numberFormat(row.fWeight, 2)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-red-600">
                            {numberFormat(row.fTotalPrice, 2)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {fStatusBadge(row.fStatus)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {nameStatusUserPay(row.usStatus)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

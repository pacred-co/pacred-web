import { redirect } from "next/navigation";
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

  let rows: UnpaidRow[] = [];
  if (teamUserIds.length > 0) {
    // 2. tb_user_sales WHERE usStatus=1 — only the unclaimed rows.
    //    ORDER BY date DESC (L66).
    const { data: usRaw, error: usRawErr } = await admin
      .from("tb_user_sales")
      .select("id, usstatus, date, idf")
      .eq("usstatus", "1")
      .order("date", { ascending: false });
    if (usRawErr) {
      console.error(`[tb_user_sales list] failed`, { code: usRawErr.code, message: usRawErr.message });
    }
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
      {/* Legacy PCS theme CSS — kept for layout-scope globals; the
          visible surface below is Tailwind (2026-05-30 rebuild · ปอน). */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales-add.php <title> L14 (fidelity-record comment):
          รายงานยอดขายทีม {userIDMain} | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-24 md:py-6">
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* ── Header ── */}
          <div className="border-b border-border px-3 py-3 md:px-5 md:py-4">
            <h3 className="text-base md:text-xl font-bold text-foreground">
              รายการที่ยังไม่ได้เบิกเงิน {userIDMain}
            </h3>
          </div>

          {/* L69-133 — the payout form. Legacy method="POST"
              action="report-user-sales-add/" — the submit is the deferred
              Server Action (file header §1/§3). method/action/autoComplete
              + form id (myTable) + #select1 + #list-forwarder-data are kept
              verbatim so the legacy select→confirm→pay jQuery still wires. */}
          <form
            className="form-horizontal px-3 py-3 md:px-5 md:py-4"
            method="POST"
            action="/sales/report/add"
            autoComplete="off"
          >
            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                ไม่มีรายการที่ยังไม่ได้เบิกเงิน
              </p>
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
                      <p className="mt-1 font-mono text-xs text-muted">
                        ID {row.usID} · {row.userID}
                      </p>
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

                {/* ── Desktop: table (#myTable kept for DataTables JS;
                    plain div wrapper isolates Tailwind from the legacy
                    `.dataTable` cascade) ── */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                  <table id="myTable" className="dataTable w-full text-sm">
                    <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-3 font-medium whitespace-nowrap">ID</th>
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
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground">{row.usID}</td>
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
                          <td className="px-3 py-2.5 text-center">{fStatusBadge(row.fStatus)}</td>
                          <td className="px-3 py-2.5 text-center">{nameStatusUserPay(row.usStatus)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* L130-132 — the fixed-position payout trigger. Legacy:
                jQuery #select1 click → AJAX getListForwarder.php (deferred
                Server Action, file header §3). id="select1" preserved;
                restyled to a Tailwind floating bar (clears FloatingTabs
                on mobile via bottom-24). */}
            <div
              className="btn-group fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-6 z-[999]"
              role="group"
              aria-label="Basic example"
            >
              <a href="#">
                <span
                  className="inline-flex items-center justify-center rounded-full bg-red-600 text-white px-6 py-3 text-sm font-bold shadow-lg shadow-red-600/30 hover:bg-red-700 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
                  id="select1"
                >
                  ทำรายการเบิกเงินรายการที่เลือก
                </span>
              </a>
            </div>
          </form>
        </section>
      </div>
      {/* L150 — the jQuery AJAX target div for getListForwarder.php */}
      <div id="list-forwarder-data"></div>
    </div>
  );
}

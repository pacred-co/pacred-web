import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyMemberUrl } from "@/lib/legacy-image";
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
  const { data: payoutsRaw, error: payoutsRawErr } = await admin
    .from("tb_user_sales_admin_pay")
    .select("id, status, date, imagesslip, amount, admincreate, useridmain")
    .eq("useridmain", userIDMain);
  if (payoutsRawErr) {
    console.error(`[tb_user_sales_admin_pay list] failed`, { code: payoutsRawErr.code, message: payoutsRawErr.message });
  }

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
      {/* Legacy PCS theme CSS — kept for layout-scope globals; the
          visible surface below is Tailwind (2026-05-30 rebuild · ปอน). */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales-history.php <title> L113 (fidelity-record
          comment):  ประวัติจ่ายเงินลูกค้าตัวแทน | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* L153-171 — title + the "ทำรายการเบิกเงิน" CTA */}
          <div className="flex flex-col gap-2.5 border-b border-border px-3 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
            <h3 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
              <span className="font-30 ft-users" aria-hidden></span>
              ประวัติจ่ายเงินลูกค้าตัวแทน
            </h3>
            <Link
              href="/sales/report/add"
              className="self-start md:self-auto shrink-0 inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 py-2 pl-2 pr-4 text-sm font-semibold text-white shadow-sm transition-colors"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-white/25">
                <i className="ft-plus" aria-hidden></i>
              </span>
              ทำรายการเบิกเงิน
            </Link>
          </div>

          {/* L172-221 — the payout-history list */}
          <div className="px-3 py-3 md:px-5 md:py-4">
            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                ยังไม่มีประวัติการจ่ายเงิน
              </p>
            ) : (
              <>
                {/* ── Mobile: stacked cards (md:hidden) ── */}
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <div
                      key={row.ID}
                      className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs text-muted">
                          {row.userIDMain}
                        </span>
                        {nameStatusUserPay(row.status)}
                      </div>
                      <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-red-600">
                        {numberFormat(row.amount, 2)}{" "}
                        <span className="text-xs font-normal text-muted">บาท</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                        <span className="text-[11px] text-muted">
                          {row.dateLabel} {row.timeLabel} น.
                        </span>
                        <div className="flex items-center gap-3">
                          {/* L199-204 — slip link shows only when status==3. */}
                          {row.status === "3" && (
                            <a
                              className="image-popup-vertical-fit el-link text-xs font-medium text-sky-600 hover:underline"
                              href={legacyMemberUrl(`storage/slip/${row.imagesSlip ?? ""}`)}
                            >
                              ดูสลิป
                            </a>
                          )}
                          <Link
                            href={`/sales/history/${row.ID}`}
                            className="rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                          >
                            ดูรายละเอียด
                          </Link>
                        </div>
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
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">วันที่ทำรายการ</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">รหัสตัวแทนขาย</th>
                        <th className="px-4 py-3 font-medium text-right whitespace-nowrap">จำนวนเงิน</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">สลิป</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">สถานะรายการ</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">ตัวเลือก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.ID}
                          className="border-t border-border hover:bg-surface-alt/30"
                        >
                          <td className="px-4 py-3 text-center text-xs text-muted whitespace-nowrap">
                            {row.dateLabel} {row.timeLabel} น.
                          </td>
                          <td className="px-4 py-3 text-center font-mono text-xs text-foreground">
                            {row.userIDMain}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-mono font-semibold text-red-600">
                            {numberFormat(row.amount, 2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {/* L199-204 — the slip link shows only when status==3. */}
                            {row.status === "3" && (
                              <a
                                className="image-popup-vertical-fit el-link text-xs font-medium text-sky-600 hover:underline"
                                href={legacyMemberUrl(`storage/slip/${row.imagesSlip ?? ""}`)}
                              >
                                ดูสลิป
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {nameStatusUserPay(row.status)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link
                              href={`/sales/history/${row.ID}`}
                              className="inline-block rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              ดูรายละเอียด
                            </Link>
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

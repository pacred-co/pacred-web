import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSalesAgent } from "../../team-map";
import { computeCommission } from "@/lib/sales-commission/calc";
import { WithdrawClient, type UnpaidRowForWithdraw } from "./withdraw-client";

// PHP number_format($n, 2) — shown on the summary card.
function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  /** ftotalprice − fdiscount = the row's gross contribution (getListForwarder.php L97). */
  fNet: number;
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
  const t = await getTranslations("salesPort");
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
        fdiscount: number | string | null;
        fstatus: string | null;
      }
    >();
    if (forwarderIds.length > 0) {
      const { data: fwdRaw, error: fwdRawErr } = await admin
        .from("tb_forwarder")
        .select("id, userid, ftrackingchn, fvolume, fweight, ftotalprice, fdiscount, fstatus")
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
        fdiscount: number | string | null;
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
          fNet: Number(f.ftotalprice ?? 0) - Number(f.fdiscount ?? 0),
          fStatus: f.fstatus,
          usStatus: us.usstatus,
          dateLabel: date,
          timeLabel: time,
        };
      })
      .filter((r): r is UnpaidRow => r !== null);
  }

  // Map the unpaid rows into the withdraw-client shape (the interactive
  // selector + commission breakdown + bank/PDF modal). The client computes
  // the live breakdown; the SERVER recomputes it on submit (anti-tamper).
  const withdrawRows: UnpaidRowForWithdraw[] = rows.map((r) => ({
    usID: r.usID,
    userID: r.userID,
    fTrackingCHN: r.fTrackingCHN,
    net: r.fNet,
    fTotalPrice: r.fTotalPrice,
  }));

  // ── SUMMARY (P0-23 · ADR-0020) — the total commission AVAILABLE = sum of
  //   ALL unpaid (usstatus='1') earned rows × 1% − 3% WHT. This is the
  //   "earned minus already-withdrawn" figure (withdrawn rows have flipped to
  //   usstatus='2', so they're already excluded). The agent then selects a
  //   subset to actually claim below. ──
  const totalGross = withdrawRows.reduce((sum, r) => sum + r.net, 0);
  const summary = computeCommission(totalGross, agent.percen);

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
              {t("unpaidItemsTitle", { userIDMain })}
            </h3>
          </div>

          {/* ── SUMMARY card — total commission available (all unpaid rows) ── */}
          {rows.length > 0 && (
            <div className="border-b border-border bg-surface-alt/30 px-3 py-3 md:px-5 md:py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {t("totalCommissionAvailable")}
                </span>
                <span className="font-mono text-xl font-bold tabular-nums text-red-600">
                  {fmt2(summary.net)}{" "}
                  <span className="text-xs font-normal text-muted">{t("baht")}</span>
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
                <div className="flex justify-between sm:block">
                  <dt>{t("totalChinaShipping")}</dt>
                  <dd className="font-mono tabular-nums text-foreground sm:mt-0.5">{fmt2(summary.gross)}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt>{t("commission1pct")}</dt>
                  <dd className="font-mono tabular-nums text-foreground sm:mt-0.5">{fmt2(summary.commission)}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt>{t("wht3pct")}</dt>
                  <dd className="font-mono tabular-nums text-foreground sm:mt-0.5">{fmt2(summary.wht)}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt>{t("withdrawableItems")}</dt>
                  <dd className="font-mono tabular-nums text-foreground sm:mt-0.5">{rows.length}</dd>
                </div>
              </dl>
              {!summary.eligible && (
                <p className="mt-2 text-xs text-amber-600">
                  {t("belowMinNote")}
                </p>
              )}
            </div>
          )}

          {/* L69-180 — the payout flow (P0-23 · ADR-0020). The legacy
              `#select1` jQuery button + the AJAX `getListForwarder.php`
              confirm modal are now a real React island: the agent checks
              the unpaid rows, sees the live 1% − 3% commission breakdown,
              then submits the bank info + ID-card PDF via the faithful
              `submitSalesWithdrawal` Server Action (actions/commissions-tb.ts).
              Reads/writes the legacy tb_user_sales family, NOT the rebuilt
              empty sales_commissions tables. */}
          <div className="px-3 py-3 md:px-5 md:py-4">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">
                {t("emptyUnpaidItems")}
              </p>
            ) : (
              <WithdrawClient rows={withdrawRows} percen={agent.percen} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

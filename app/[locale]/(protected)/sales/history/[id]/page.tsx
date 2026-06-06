import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyMemberBase } from "@/lib/legacy-image";
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
  const t = await getTranslations("salesPort");
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

  // Legacy `member/storage/` base — resolved via the Supabase mirror
  // (ภูม upload 2026-05-24, see lib/legacy-image.ts). Customer-visible —
  // NEVER hardcode pcscargo.co.th.
  const STORAGE = `${legacyMemberBase()}/storage`;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for layout-scope globals; the
          visible surface below is Tailwind (2026-05-30 rebuild · ปอน). */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* report-user-sales-history.php detail <title> L303 (fidelity-
          record comment):  ประวัติจ่ายเงินลูกค้าตัวแทน #{ID} | Pacred Admin */}

      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* L320-332 — breadcrumb */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs md:text-sm text-muted">
          <Link href="/dashboard" className="hover:text-foreground">{t("home")}</Link>
          <span aria-hidden>/</span>
          <Link href="/sales/history" className="hover:text-foreground">
            {t("payoutHistoryTitle")}
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-foreground">#{rowMain.id}</span>
        </nav>

        {/* L338-398 — card #1: the payout summary */}
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden mb-3 md:mb-4">
          <div className="px-4 py-4 md:px-6 md:py-5">
            {/* L344-393 — branch on status: 2 → "รอดำเนินการ" + the
                card-file link · else → "สำเร็จ" + the slip image. The
                bank-info block is identical in both. file/slip hrefs +
                image-popup hook preserved verbatim. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <dl className="space-y-1.5 text-sm">
                <div className="flex flex-wrap gap-x-1">
                  <dt className="text-muted">{t("bankNameColon")}</dt>
                  <dd className="font-medium text-foreground">{rowMain.name_blank}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1">
                  <dt className="text-muted">{t("accountNumberColon")}</dt>
                  <dd className="font-mono font-medium text-foreground">{rowMain.no_blank}</dd>
                </div>
                <div className="flex flex-wrap gap-x-1">
                  <dt className="text-muted">{t("accountNameColon")}</dt>
                  <dd className="font-medium text-foreground">{rowMain.name_account}</dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-1">
                  <dt className="text-muted">{t("amountColon")}</dt>
                  <dd>
                    <span className="font-mono text-lg font-bold tabular-nums text-red-600">
                      {numberFormat(amount, 2)}
                    </span>{" "}
                    <span className="text-xs text-muted">{t("baht")}</span>
                  </dd>
                </div>
              </dl>
              <div className="text-sm">
                {rowMain.status === "2" ? (
                  <>
                    <p className="flex items-center gap-2">
                      <span className="text-muted">{t("statusColon")}</span>
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        {t("pending")}
                      </span>
                    </p>
                    <p className="mt-2">
                      <span className="text-muted">{t("idCardCopyColon")} </span>
                      <a
                        href={`${STORAGE}/file/${rowMain.file ?? ""}`}
                        className="font-medium text-sky-600 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("viewFile")}
                      </a>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2">
                      <span className="text-muted">{t("statusColon")}</span>
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                        {t("success")}
                      </span>
                    </p>
                    <a
                      className="image-popup-vertical-fit el-link mt-2 inline-block"
                      href={`${STORAGE}/slip/${rowMain.imagesslip ?? ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        width={120}
                        src={`${STORAGE}/slip/${rowMain.imagesslip ?? ""}`}
                        alt=""
                        className="rounded-lg border border-border"
                      />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* L400-491 — card #2: the items in this payout */}
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="border-b border-border px-4 py-3 md:px-6 md:py-4">
            <h3 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
              <span className="font-30 ft-users" aria-hidden></span>
              {t("payoutDetailTitle", { id: rowMain.id })}
            </h3>
          </div>
          <div className="px-3 py-3 md:px-5 md:py-4">
            {items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t("noItems")}</p>
            ) : (
              <>
                {/* ── Mobile: stacked cards (md:hidden) ── */}
                <div className="space-y-3 md:hidden">
                  {items.map((row, i) => (
                    <div
                      key={row.usID}
                      className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-all font-mono text-sm font-semibold text-foreground">
                          <span className="mr-1 text-muted">#{i + 1}</span>
                          {row.fTrackingCHN || `#${row.usID}`}
                        </span>
                        <span className="shrink-0">{fStatusBadge(row.fStatus, t)}</span>
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
                          <div className="text-[10px] text-muted">{t("chinaImportFee")}</div>
                          <div className="text-sm font-bold tabular-nums font-mono text-red-600">
                            {numberFormat(row.fTotalPrice, 2)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                        <span className="text-[11px] text-muted">
                          {row.dateLabel} {row.timeLabel} {t("timeSuffix")}
                        </span>
                        <span>{nameStatusUserPay(row.usStatus, t)}</span>
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
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">{t("sequence")}</th>
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">{t("completedDate")}</th>
                        <th className="px-3 py-3 font-medium whitespace-nowrap">{t("memberCode")}</th>
                        <th className="px-3 py-3 font-medium whitespace-nowrap">{t("trackingNumber")}</th>
                        <th className="px-3 py-3 font-medium text-right whitespace-nowrap">{t("volumeCbm")}</th>
                        <th className="px-3 py-3 font-medium text-right whitespace-nowrap">{t("weightKg")}</th>
                        <th className="px-3 py-3 font-medium text-right whitespace-nowrap">{t("chinaImportFee")}</th>
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">{t("status")}</th>
                        <th className="px-3 py-3 font-medium text-center whitespace-nowrap">{t("commissionWithdrawStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((row, i) => (
                        <tr
                          key={row.usID}
                          className="border-t border-border hover:bg-surface-alt/30"
                        >
                          <td className="px-3 py-2.5 text-center text-xs text-muted">{i + 1}</td>
                          <td className="px-3 py-2.5 text-center text-xs text-muted whitespace-nowrap">
                            {row.dateLabel} {row.timeLabel} {t("timeSuffix")}
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
                          <td className="px-3 py-2.5 text-center">{fStatusBadge(row.fStatus, t)}</td>
                          <td className="px-3 py-2.5 text-center">{nameStatusUserPay(row.usStatus, t)}</td>
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

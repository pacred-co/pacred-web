import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/**
 * Freight (ฝากนำเข้า) receipt history — a FAITHFUL 1:1 TRANSCRIPTION
 * of the legacy PCS Cargo `member/receipt-f-hs.php`
 * ("ประวัติใบเสร็จรายการฝากนำเข้าสินค้า" — the history of receipts
 * issued for ฝากนำเข้า / forwarder import orders). D1 / ADR-0017 ·
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `receipt-f-hs.php` renders — same Bootstrap-4
 * elements, same class names, same Thai labels, same column order.
 * The visual identity comes from the legacy CSS, brought in verbatim
 * as the static `.pcs-legacy`-scoped `public/legacy/pcs/receipt-f-hs.css`
 * (= the receipt-f-hs.php inline <style> block + the BS4 + DataTables
 * subset the markup uses), loaded via a plain <link> so it bypasses
 * the app's Tailwind v4 / PostCSS pipeline.
 *
 * Route: `/freight/receipts/history` — the F-suffix (freight) sub-tree
 * of the customer portal. Legacy `forwarder/detail/<fID>` links map to
 * the Pacred `/service-import/<fID>` route; the bulk-print form action
 * is the transcribed Pacred print route `/freight/receipts/print/<rID>`.
 *
 * ── Data — legacy receipt-f-hs.php SQL transcribed 1:1 to `tb_*` ──
 * `tb_*` is RLS-locked to service_role → reads go through the admin
 * client; the customer is the logged-in member (member_code = the
 * "PR<n>" code === legacy tb_*.userid).
 *
 *   1. $arrItem — receipt-f-hs.php L54-64:
 *        SELECT rID, fID FROM tb_receipt_item
 *      Builds a map  rID → comma-joined fID list. The legacy reads
 *      the WHOLE table (no WHERE) and indexes it in PHP. The port
 *      narrows it to the rIDs that belong to this customer's
 *      receipts (an equivalent, faithful result — the customer can
 *      only ever see their own rows on this screen anyway).
 *
 *   2. $sql_Table — receipt-f-hs.php L65-81:
 *        SELECT reCompName, reCompAddress, r.rID, rDate, r.userID,
 *               u.userName, u.userLastName, corporateNumber,
 *               corporateName, corporateAddress, userCompany,
 *               statusPrint, adminIDprint, rDatePrint,
 *               statusPrintCopy, adminIDprintCopy, rDatePrintCopy,
 *               rStatus, rAmount
 *        FROM tb_receipt AS r
 *        LEFT JOIN tb_receipt_item AS ri ON r.rID=ri.rID
 *        LEFT JOIN tb_users        AS u  ON u.userID=r.userID
 *        LEFT JOIN tb_corporate    AS c  ON u.userID=c.userID
 *        WHERE u.userID='$userID' AND reCompName<>''
 *          AND (DATE(rDate) BETWEEN '$startDate' AND '$endDate')
 *        GROUP BY r.rID ORDER BY r.ID DESC
 *      The `GROUP BY r.rID` only deduplicates the row-multiplication
 *      caused by the `tb_receipt_item` join. The port queries
 *      `tb_receipt` directly (no item join) and resolves the fID
 *      list separately via $arrItem — so there is no multiplication
 *      and the GROUP BY is structurally unnecessary; the row set is
 *      identical. The `tb_users` / `tb_corporate` joins fetch
 *      columns the legacy SELECTs but the rendered TABLE never
 *      prints (userName, corporateName, …) — only `WHERE u.userID`
 *      acts as the customer filter, reproduced here by the
 *      member_code equality. Faithful: same visible rows, same order.
 *
 * The rendered table prints ONLY: rID, rDate, the print link, the
 * $arrItem fID links, number_format(rAmount,2), and the print badge
 * (receipt-f-hs.php L99-145).
 *
 * ── Print endpoint ──
 *  A. printReceiptF.php — the legacy receipt-PDF print endpoint —
 *     is transcribed at `/freight/receipts/print/[id]` (the sibling
 *     page.tsx). The two single-receipt print links on this screen
 *     (the "เลขที่ใบเสร็จ" cell link + the "พิมพ์ใบเสร็จ" badge) point
 *     at it via `/<rID>`, opened in a new tab — exactly as the legacy
 *     does (`printReceiptF.php?id=<rID>` becomes the new dynamic
 *     route param).
 *  B. The DataTables checkbox-select + the fixed-bottom bulk
 *     "พิมพ์ใบเสร็จ" button (receipt-f-hs.php L98-155 + the page
 *     JS L177-250) — selecting N rows then opening
 *     `printReceiptF.php?type=1&id=<csv>`. The markup is
 *     transcribed VERBATIM (the `#frm-example` form, the hidden
 *     `#arrID` input, the `#myTable` classes, the `#select1`
 *     button) so the staged jQuery + DataTables vendor bundle
 *     enhances it 1:1 at runtime. The print route accepts a
 *     comma-joined list in its `[id]` segment, so the legacy
 *     `id=PCS123,PCS456` form-submit reaches the new route as
 *     `/freight/receipts/print/PCS123,PCS456`.
 *
 * A Server Component render is a PURE READ — receipt-f-hs.php has no
 * render-time INSERT/UPDATE, so there is nothing to defer.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 */
export const dynamic = "force-dynamic";

// receipt-f-hs.php has no <img> raster assets — the icons are the
// FontAwesome (`fas`) + Line-Awesome (`la`) icon fonts staged with
// the global vendor bundle. No binary assets to copy.

// The transcribed printReceiptF.php print route — an in-app route.
// The single-receipt cell links use <Link>; the bulk form posts here
// with method=GET. The base path with the comma-joined `id` is built
// at the link site (cell links) or by the page JS (bulk form).
const PRINT_BASE = "/freight/receipts/print";

type ReceiptRow = {
  id: number;
  rid: string;
  rdate: string | null;
  ramount: number | null;
};

/** number_format($n, 2) — the PHP money formatter receipt-f-hs.php
 *  uses on rAmount (L135). */
function numberFormat(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** date("Y-m-d") for an offset of N days from today — transcribes
 *  the PHP `date("Y-m-d", strtotime("-60 days", ...))` default
 *  range (receipt-f-hs.php L77-78). */
function ymd(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

type SearchParams = { date?: string };

export default async function FreightReceiptsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // header.php L9-72: a logged-out visitor is redirected to /login.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  // $userID — the customer's member code ("PR<n>" === legacy
  // tb_*.userid).
  const userID = profile.member_code ?? "";

  const sp = await searchParams;

  // receipt-f-hs.php L72-80 — the date range. When ?date is set the
  // legacy splits "YYYY-MM-DD - YYYY-MM-DD" at substr(0,10) /
  // substr(13); otherwise it defaults to the last 60 days.
  const defaultStart = ymd(-60);
  const defaultEnd = ymd(0);
  let startDate = defaultStart;
  let endDate = defaultEnd;
  const hasDateParam = typeof sp.date === "string";
  if (hasDateParam) {
    startDate = (sp.date as string).substring(0, 10);
    endDate = (sp.date as string).substring(13);
  }

  // ── $sql_Table — tb_receipt rows for this customer ───────────
  // SELECT … FROM tb_receipt AS r WHERE userID=$userID
  //   AND reCompName<>'' AND DATE(rDate) BETWEEN start AND end
  //   ORDER BY r.ID DESC   (GROUP BY r.rID — see header note).
  // The tb_users / tb_corporate joins fetch columns the rendered
  // table never prints; only the userID filter is load-bearing,
  // reproduced by the member_code equality below.
  const { data: receiptRows, error: receiptRowsErr } = await admin
    .from("tb_receipt")
    .select("id, rid, rdate, ramount")
    .eq("userid", userID)
    .neq("recompname", "")
    .gte("rdate", `${startDate} 00:00:00`)
    .lte("rdate", `${endDate} 23:59:59`)
    .order("id", { ascending: false });
  if (receiptRowsErr) {
    console.error(`[tb_receipt list] failed`, { code: receiptRowsErr.code, message: receiptRowsErr.message });
  }

  const receipts = (receiptRows ?? []) as unknown as ReceiptRow[];

  // ── $arrItem — tb_receipt_item: rID → comma-joined fID list ───
  // receipt-f-hs.php L54-64. Narrowed to this customer's receipt
  // IDs (an equivalent, faithful subset — see header note).
  const arrItem: Record<string, string[]> = {};
  const receiptIds = receipts.map((r) => r.rid);
  if (receiptIds.length > 0) {
    const { data: itemRows, error: itemRowsErr } = await admin
      .from("tb_receipt_item")
      .select("rid, fid")
      .in("rid", receiptIds);
    if (itemRowsErr) {
      console.error(`[tb_receipt_item list] failed`, { code: itemRowsErr.code, message: itemRowsErr.message });
    }
    for (const row of (itemRows ?? []) as { rid: string; fid: number }[]) {
      // legacy keeps the first-seen order: $arrItem[rID] .= ','.fID
      if (!arrItem[row.rid]) arrItem[row.rid] = [];
      arrItem[row.rid].push(String(row.fid));
    }
  }

  // receipt-f-hs.php L112/L148 — $btn=1 only when there is ≥1 row;
  // the fixed-bottom bulk-print button renders only then.
  const btn = receipts.length > 0;

  // Tailwind rebuild (ปอน 2026-05-30 — "rebuild chrome เป็น tailwind mobile-
  // first; ห้ามแตะ data/relation/href/id/name"). Bootstrap-4 chrome
  // (.card / .table-bordered / .badge-* / .btn-*) rendered UNSTYLED after
  // the BS CSS was dropped — converted to Tailwind matching the sibling
  // /service-import/receipts list (card → mobile cards + desktop table).
  // ZERO query / href / id / name / hook-class changed: the date <input>
  // keeps `name="date"` + `shawCalRanges`, the print form keeps
  // `#frm-example` action=PRINT_BASE + hidden `#arrID` (page JS rewrites
  // the URL to /print/<csv>), the table keeps `#myTable .dataTable`, the
  // bulk button keeps `#select1` name=type value=1, the wrapper keeps
  // `notranslate` so the staged jQuery + DataTables vendor bundle still
  // enhances it 1:1.
  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, loaded via a
          plain <link> so it bypasses the Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/receipt-f-hs.css" />

      {/* BEGIN: Content — receipt-f-hs.php L42. Bottom padding clears the
          fixed bulk-print bar + the mobile FloatingTabs bottom-nav. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-28 md:py-6 md:pb-24">
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {/* ── card-header — receipt-f-hs.php L85-95: title + date filter ── */}
          <div className="border-b border-border px-3 py-3 md:px-5 md:py-4">
            <h1 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
              <i className="la la-print text-xl md:text-2xl text-primary-600" aria-hidden></i>
              <span>ประวัติใบเสร็จรายการฝากนำเข้าสินค้า</span>
            </h1>

            {/* Date-range filter. `name="date"` + the `shawCalRanges` hook
                class kept verbatim — legacy daterangepicker JS attaches to
                it; submit GET re-filters by ?date=. */}
            <form className="mt-3" method="GET" action="">
              <label
                className="block text-xs font-medium text-muted mb-1"
                htmlFor="date"
              >
                วันที่ชำระเงิน
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  className="shawCalRanges w-full sm:max-w-xs rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                  name="date"
                  defaultValue={`${defaultStart} - ${defaultEnd}`}
                />
                <button
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border border-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 active:scale-[0.98] transition-all whitespace-nowrap"
                  type="submit"
                >
                  <i className="fas fa-search" aria-hidden></i> ค้นหาข้อมูล
                </button>
              </div>
              {/* receipt-f-hs.php L91-93 — search-result caption */}
              {hasDateParam ? (
                <p className="mt-2 text-xs text-red-600">
                  ผลลัพธ์การค้นหา {startDate} - {endDate}{" "}
                </p>
              ) : null}
            </form>
          </div>

          {/* ── List body. `notranslate` kept (legacy hook). ── */}
          <div className="px-3 py-3 md:px-5 md:py-4 notranslate">
            {/* receipt-f-hs.php L97-146 — the print form. Markup hooks kept
                VERBATIM (`#frm-example` action=PRINT_BASE, hidden `#arrID`,
                `#myTable .dataTable`) so the staged jQuery + DataTables
                vendor bundle enhances it 1:1. The legacy used
                `printReceiptF.php?id=<csv>`; the new dynamic route accepts
                the csv as a path segment, so the form's `action` is a
                relative base and the page JS rewrites the URL to include
                the csv as `/print/<csv>`. */}
            <form
              className=""
              id="frm-example"
              action={PRINT_BASE}
              method="GET"
            >
              <input type="hidden" name="id" id="arrID" />

              {receipts.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <i className="la la-print text-2xl text-muted/40" aria-hidden></i>
                  <p className="text-sm text-muted">
                    ไม่พบใบเสร็จในช่วงวันที่ที่เลือก
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Mobile: stacked cards (no horizontal scroll) ── */}
                  <div className="space-y-3 md:hidden">
                    {receipts.map((row) => {
                      const fIds = arrItem[row.rid] ?? [];
                      return (
                        <div
                          key={row.id}
                          className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="text-[11px] text-muted">
                                เลขที่ใบเสร็จ
                              </span>
                              <Link
                                href={`${PRINT_BASE}/${row.rid}`}
                                target="_blank"
                                className="block font-mono text-sm font-semibold text-red-600 hover:underline break-all"
                              >
                                {row.rid}
                              </Link>
                            </div>
                            <span className="shrink-0 font-mono text-sm font-bold text-red-600 tabular-nums">
                              {numberFormat(Number(row.ramount ?? 0))}
                            </span>
                          </div>

                          {/* receipt-f-hs.php L123-131 — the $arrItem fID
                              links → /service-import/[fID]. */}
                          <div className="mt-2 text-xs text-foreground">
                            <span className="text-[11px] text-muted">
                              เลขที่ฝากนำเข้า:{" "}
                            </span>
                            {fIds.map((fid) => (
                              <span key={fid}>
                                <Link
                                  href={`/service-import/${fid}`}
                                  target="_blank"
                                  className="text-sky-600 hover:underline"
                                >
                                  {fid}
                                </Link>
                                {", "}
                              </span>
                            ))}
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                            <span className="text-[11px] text-muted">
                              {row.rdate}
                            </span>
                            {/* receipt-f-hs.php L138 — "พิมพ์ใบเสร็จ" link. */}
                            <Link
                              href={`${PRINT_BASE}/${row.rid}`}
                              target="_blank"
                              className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                            >
                              พิมพ์ใบเสร็จ
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Desktop: table (wrapped in plain div so Tailwind
                      hidden/block isolates from the legacy `.dataTable`
                      display cascade). `#myTable .dataTable` kept. ── */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                    <table
                      id="myTable"
                      className="dataTable no-footer dtr-inline w-full text-sm"
                    >
                      <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-4 py-3 text-center font-medium">ID</th>
                          <th className="px-4 py-3 font-medium">วันที่สร้าง</th>
                          <th className="px-4 py-3 font-medium">เลขที่ใบเสร็จ</th>
                          <th className="px-4 py-3 font-medium">เลขที่ฝากนำเข้า</th>
                          <th className="px-4 py-3 text-right font-medium">จำนวนเงิน</th>
                          <th className="px-4 py-3 text-center font-medium">พิมพ์ใบเสร็จ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* receipt-f-hs.php L111-143 — one <tr> per
                            tb_receipt row. */}
                        {receipts.map((row) => {
                          const fIds = arrItem[row.rid] ?? [];
                          return (
                            <tr
                              key={row.id}
                              className="border-t border-border align-top hover:bg-surface-alt/30"
                            >
                              <td className="px-4 py-3 text-center font-mono text-xs text-muted">
                                {row.rid}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                                {row.rdate}
                              </td>
                              <td className="px-4 py-3">
                                {/* receipt-f-hs.php L121 — "เลขที่ใบเสร็จ"
                                    cell link → the transcribed print route. */}
                                <Link
                                  href={`${PRINT_BASE}/${row.rid}`}
                                  target="_blank"
                                  className="font-mono text-red-600 hover:underline"
                                >
                                  {row.rid}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {/* receipt-f-hs.php L123-131 — the $arrItem
                                    fID links. Legacy points at
                                    forwarder/detail/<fID>; the Pacred
                                    equivalent is the /service-import/[fID]
                                    route. */}
                                {fIds.map((fid) => (
                                  <span key={fid}>
                                    <Link
                                      href={`/service-import/${fid}`}
                                      target="_blank"
                                      className="text-sky-600 hover:underline"
                                    >
                                      {fid}
                                    </Link>
                                    {", "}
                                  </span>
                                ))}
                              </td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-red-600 tabular-nums">
                                {numberFormat(Number(row.ramount ?? 0))}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {/* receipt-f-hs.php L138 — the "พิมพ์ใบเสร็จ"
                                    badge link → the transcribed print route. */}
                                <Link
                                  href={`${PRINT_BASE}/${row.rid}`}
                                  target="_blank"
                                  className="inline-flex items-center rounded-full border border-amber-400 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                >
                                  พิมพ์ใบเสร็จ
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </form>
          </div>
        </section>
      </div>

      {/* receipt-f-hs.php L147-155 — the fixed-bottom bulk-print button;
          rendered only when $btn==1 (≥1 row). The #select1 handler (page
          JS L234-240) opens the print route with the selected csv as the
          [id] path segment — id / name / value / type kept verbatim.
          Mobile: bottom-24 clears the FloatingTabs bottom-nav; desktop
          flush to the bottom edge. */}
      {btn ? (
        <div className="fixed inset-x-0 z-[40] bottom-24 md:bottom-4 flex justify-center md:justify-end px-3 md:px-6 md:pr-[88px]">
          <button
            type="submit"
            id="select1"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 text-white px-5 py-2.5 text-sm font-bold shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all"
            name="type"
            value="1"
          >
            <i className="fas fa-box-open" aria-hidden></i> พิมพ์ใบเสร็จ
          </button>
        </div>
      ) : null}
      {/* END: Content */}
    </div>
  );
}

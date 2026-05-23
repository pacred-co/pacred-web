import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/**
 * Import-receipt history — a FAITHFUL 1:1 TRANSCRIPTION of the legacy
 * PCS Cargo `member/receipt-f-hs.php` ("ประวัติใบเสร็จรายการฝากนำเข้า
 * สินค้า" — the history of receipts issued for ฝากนำเข้า / forwarder
 * import orders). D1 / ADR-0017 · faithful-port transcription ·
 * runbook `docs/runbook/faithful-port-transcription.md`.
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
 * Route: NEW sub-route `/service-import/receipts` — the launchpad
 * icon 3 (menu.php) "ประวัติใบเสร็จรายการนำเข้า" target. Legacy
 * `forwarder/detail/<fID>` links map to the Pacred `/service-import/
 * [fNo]` route; Next.js owns routing, markup + labels are unchanged.
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
 * The rendered table prints ONLY: rID, rDate, the printReceiptF
 * link, the $arrItem fID links, number_format(rAmount,2), and the
 * print badge (receipt-f-hs.php L99-145).
 *
 * ── Print endpoint — now transcribed (closes the former FLAG A/B) ──
 *   A. printReceiptF.php — the legacy receipt-PDF print endpoint —
 *      IS now transcribed to the Pacred route `/service-import/
 *      receipts/print` (page.tsx alongside this file). The two
 *      single-receipt print links on this screen (the "เลขที่ใบเสร็จ"
 *      cell link + the "พิมพ์ใบเสร็จ" badge) point at it via
 *      `?id=<rID>`, opened in a new tab — exactly as the legacy does.
 *   B. The DataTables checkbox-select + the fixed-bottom bulk
 *      "พิมพ์ใบเสร็จ" button (receipt-f-hs.php L98-155 + the page
 *      JS L177-250) — selecting N rows then opening
 *      `printReceiptF.php?type=1&id=<csv>`. The markup is
 *      transcribed VERBATIM (the `#frm-example` form, the hidden
 *      `#arrID` input, the `#myTable` classes, the `#select1`
 *      button) so the staged jQuery + DataTables vendor bundle
 *      enhances it 1:1 at runtime. The form `action` now targets the
 *      transcribed Pacred print route; the print page reads `?id` as
 *      the comma-joined list the `#arrID` field carries.
 *
 * A Server Component render is a PURE READ — receipt-f-hs.php has no
 * render-time INSERT/UPDATE, so there is nothing to defer.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + "PR Cargo" / Pacred.
 */

// receipt-f-hs.php has no <img> raster assets — the icons are the
// FontAwesome (`fas`) + Line-Awesome (`la`) icon fonts staged with
// the global vendor bundle. No binary assets to copy.

// The transcribed printReceiptF.php print route (see FLAG A). An
// in-app route — the single-receipt cell links use <Link>; the bulk
// form posts here with method=GET (default-locale path, no prefix).
const PRINT_ROUTE = "/service-import/receipts/print";

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

export default async function ServiceImportReceiptsPage({
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
  const { data: receiptRows } = await admin
    .from("tb_receipt")
    .select("id, rid, rdate, ramount")
    .eq("userid", userID)
    .neq("recompname", "")
    .gte("rdate", `${startDate} 00:00:00`)
    .lte("rdate", `${endDate} 23:59:59`)
    .order("id", { ascending: false });

  const receipts = (receiptRows ?? []) as ReceiptRow[];

  // ── $arrItem — tb_receipt_item: rID → comma-joined fID list ───
  // receipt-f-hs.php L54-64. Narrowed to this customer's receipt
  // IDs (an equivalent, faithful subset — see header note).
  const arrItem: Record<string, string[]> = {};
  const receiptIds = receipts.map((r) => r.rid);
  if (receiptIds.length > 0) {
    const { data: itemRows } = await admin
      .from("tb_receipt_item")
      .select("rid, fid")
      .in("rid", receiptIds);
    for (const row of (itemRows ?? []) as { rid: string; fid: number }[]) {
      // legacy keeps the first-seen order: $arrItem[rID] .= ','.fID
      if (!arrItem[row.rid]) arrItem[row.rid] = [];
      arrItem[row.rid].push(String(row.fid));
    }
  }

  // receipt-f-hs.php L112/L148 — $btn=1 only when there is ≥1 row;
  // the fixed-bottom bulk-print button renders only then.
  const btn = receipts.length > 0;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — static public/ asset, loaded via a
          plain <link> so it bypasses the Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/receipt-f-hs.css" />

      {/* BEGIN: Content — receipt-f-hs.php L42 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            <div className="card">
              <section>
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    {/* card-header — receipt-f-hs.php L85-95 */}
                    <div className="card-header pb-0">
                      <h3 className="">
                        <i className="la la-print" style={{ fontSize: "2rem" }}></i>{" "}
                        ประวัติใบเสร็จรายการฝากนำเข้าสินค้า
                      </h3>
                      <form className="" method="GET" action="">
                        <label className="form-control-label" htmlFor="date">
                          วันที่ชำระเงิน
                        </label>
                        <input
                          type="text"
                          className="form-control2 shawCalRanges"
                          name="date"
                          defaultValue={`${defaultStart} - ${defaultEnd}`}
                        />
                        <button
                          className="btn btn-outline-success btn-sm btn-rounded"
                          type="submit"
                        >
                          <i className="fas fa-search"></i> ค้นหาข้อมูล
                        </button>
                        {/* receipt-f-hs.php L91-93 — search-result caption */}
                        {hasDateParam ? (
                          <span className="font-14 text-danger">
                            ผลลัพธ์การค้นหา {startDate} - {endDate}{" "}
                          </span>
                        ) : null}
                      </form>
                    </div>

                    <div className="table-responsive p-05 notranslate">
                      {/* receipt-f-hs.php L97-146 — the print form +
                          DataTables-checkbox table. Markup transcribed
                          VERBATIM so the staged jQuery + DataTables
                          vendor bundle enhances it 1:1. The bulk-print
                          form action is the transcribed Pacred print
                          route (method=GET, default-locale path). */}
                      <form
                        className="p-1"
                        id="frm-example"
                        action={PRINT_ROUTE}
                        method="GET"
                      >
                        <input type="hidden" name="id" id="arrID" />
                        <table
                          id="myTable"
                          className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                        >
                          <thead>
                            <tr className="text-center bg-white">
                              <th>ID</th>
                              <th>วันที่สร้าง</th>
                              <th>เลขที่ใบเสร็จ</th>
                              <th>เลขที่ฝากนำเข้า</th>
                              <th>จำนวนเงิน</th>
                              <th>พิมพ์ใบเสร็จ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* receipt-f-hs.php L111-143 — one <tr> per
                                tb_receipt row. */}
                            {receipts.map((row) => {
                              const fIds = arrItem[row.rid] ?? [];
                              return (
                                <tr key={row.id}>
                                  <td className="cursor-pointer text-center">
                                    {row.rid}
                                  </td>
                                  <td>{row.rdate}</td>
                                  <td>
                                    {/* receipt-f-hs.php L121 — the
                                        "เลขที่ใบเสร็จ" cell link →
                                        the transcribed print route. */}
                                    <Link
                                      href={`${PRINT_ROUTE}?id=${row.rid}`}
                                      target="_blank"
                                    >
                                      {row.rid}
                                    </Link>
                                  </td>
                                  <td>
                                    {/* receipt-f-hs.php L123-131 — the
                                        $arrItem fID links. Legacy points
                                        at forwarder/detail/<fID>; the
                                        Pacred equivalent is the
                                        /service-import/[fNo] route. */}
                                    {fIds.map((fid) => (
                                      <span key={fid}>
                                        <Link
                                          href={`/service-import/${fid}`}
                                          target="_blank"
                                        >
                                          <span
                                            className="text-primary"
                                            style={{ fontSize: "12px" }}
                                          >
                                            {fid}
                                          </span>
                                        </Link>
                                        {", "}
                                      </span>
                                    ))}
                                  </td>
                                  <td className="text-right">
                                    {numberFormat(Number(row.ramount ?? 0))}
                                  </td>
                                  <td className="text-center">
                                    {/* receipt-f-hs.php L138 — the
                                        "พิมพ์ใบเสร็จ" badge link →
                                        the transcribed print route. */}
                                    <Link
                                      href={`${PRINT_ROUTE}?id=${row.rid}`}
                                      target="_blank"
                                    >
                                      <span className=" badge badge-warning badge-pill font-14">
                                        พิมพ์ใบเสร็จ
                                      </span>
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </form>
                      {/* receipt-f-hs.php L147-155 — the fixed-bottom
                          bulk-print button; rendered only when $btn==1
                          (≥1 row). The #select1 handler (page JS
                          L234-240) opens printReceiptF.php?type=1&id=
                          <selected csv> — FLAGGED (A)/(B). */}
                      {btn ? (
                        <div
                          className="btn-group"
                          style={{ position: "fixed", bottom: "20px" }}
                        >
                          <button
                            type="submit"
                            id="select1"
                            className="btn btn-success waves-effect round"
                            name="type"
                            value="1"
                          >
                            <i className="fas fa-box-open"></i> พิมพ์ใบเสร็จ
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}

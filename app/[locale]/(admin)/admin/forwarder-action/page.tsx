/**
 * /admin/forwarder-action?action=… — 9 audit queues
 *
 * Faithful port of legacy `member/pcs-admin/forwarder-action.php` (1192 LOC).
 * 9 audit queues, each with a different `fNote`/`fCover`/`fCabinetNumber`/
 * `fShipBy`/`fCredit` condition driving the result set.
 *
 * Wave 1 — `tb_forwarder` queues: Note, notPhoto, notPortage, notContainer,
 *           NotDateContainerClose, fCreditError. (shipped)
 * Wave 2 — adds (this commit):
 *   - NoteShop          → joins `tb_header_order` (hNote<>'') with hStatus
 *                          tab strip (?q=1..6). NB: legacy comment said
 *                          `tb_shop`; the actual SQL (forwarder-action.php
 *                          L631+) reads `tb_header_order`. We follow the
 *                          SQL, not the stale comment.
 *   - NotShipFree       → fAddressZIPCode IN (free-shipping list) AND
 *                          fShipBy NOT IN ('PCS','PCSF') AND fDate>2022-01-15
 *   - NotShipFreeError  → fAddressZIPCode NOT IN (free-shipping list) AND
 *                          fShipBy='PCSF' AND fDate>2022-01-15
 *
 * The ZIP-code list is the union of the 6 PHP $arrZIPCode* arrays defined in
 * `member/include/function.php` L3 + `member/pcs-admin/include/function.php`
 * L1734-1740 (BKK + NakhonPathom + Nonthaburi + PathumThani(empty) +
 * SamutPrakan + SamutSakhon). Dedup'd. Source-of-truth = the PHP.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { PageHeader } from "@/components/admin/page-header";
import { FREE_SHIPPING_ZIPS } from "@/lib/forwarder/free-shipping-zips";
import { NotPortageCombinePanel, type NotPortageRow } from "./notportage-combine-panel";
import { CsvButton, type CsvRow, type CsvCol } from "@/components/admin/csv-button";
import { exportForwarderActionAll } from "@/actions/admin/export/forwarder-action";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

type SP = { action?: string; q?: string; page?: string };

/**
 * Legacy URL → Pacred QA queue redirect map (Wave 26 · 2026-05-28 ดึก).
 *
 * The legacy `pcs-admin/.../QAAndQC.php` menu links to URLs like
 * `forwarder-action.php?action=delayedPaymentShop&s=1` for the 11 QA queues.
 * Each Pacred queue lives at its own `/admin/qa/<slug>` page (Wave 10 +
 * this commit's `order-cancellations`). This map preserves the legacy
 * URL contract so staff trained on the legacy menu can paste the old
 * URL and land in the right place.
 *
 * The 10 legacy `action=*` names map to the Pacred slugs as follows.
 * Source: `04-staff-workflow-by-role.md` §2.3.
 */
const QA_QUEUE_REDIRECTS: Record<string, string> = {
  delayedPaymentShop:         "/admin/qa/pay-shop-over-1d",
  delayedPaymentForwarder:    "/admin/qa/pay-fwd-over-2d",
  orderCancellationList:      "/admin/qa/order-cancellations",
  creditOverdueForwarder:     "/admin/qa/credit-overdue",
  shopS1Over10Min:            "/admin/qa/order-over-10min",
  chineseShopDelay:           "/admin/qa/chn-shop-over-2d",
  delayedWarehouseChineseEntry: "/admin/qa/chn-wh-over-2d",
  thaiDeliveryDelay:          "/admin/qa/transit-overdue",
  ownerlessProducts:          "/admin/qa/ownerless-goods",
  shippingPrepOverdue:        "/admin/qa/prepare-overdue",
  newClientFollowUpDelay:     "/admin/qa/new-client-no-contact",
};

const ACTION_LABEL: Record<string, string> = {
  Note: "หมายเหตุนำเข้า",
  NoteShop: "หมายเหตุสั่งซื้อ",
  notPhoto: "ไม่ได้ถ่ายสินค้า",
  notPortage: "ไม่ใส่ค่าขนส่ง",
  notContainer: "ไม่ใส่เบอร์ตู้",
  NotDateContainerClose: "ไม่ใส่วันที่ปิดตู้",
  NotShipFree: "ไม่เลือกขนส่งฟรี",
  NotShipFreeError: "เลือกขนส่งฟรีผิด",
  fCreditError: "เครดิตเกินกำหนด",
};

const ACTION_CONDITION: Record<string, string> = {
  Note: "AND fnote <> '' AND fnote IS NOT NULL",
  NoteShop: "tb_header_order: hnote<>'' AND hstatus IN (1..6)",
  notPhoto: "AND fcover = '' AND fstatus > 1 AND fdate > 2022-01-15",
  notPortage: "(ftransportprice=0 OR fshipby=PCSE) AND ftransportpricesum≠1 AND fshipby∉(PCS,PCSF) AND paymethod=1 AND fstatus∈(4,5,6) AND fdate>2022-01-15",
  notContainer: "AND fcabinetnumber = '' AND fdate > 2022-01-15",
  NotDateContainerClose: "AND fdatecontainerclose IS NULL AND fdate > 2022-01-15",
  NotShipFree: "AND faddresszipcode IN (FREE_SHIPPING_ZIPS) AND fshipby NOT IN ('PCS','PCSF') AND fdate > 2022-01-15",
  NotShipFreeError: "AND faddresszipcode NOT IN (FREE_SHIPPING_ZIPS) AND fshipby = 'PCSF' AND fdate > 2022-01-15",
  fCreditError: "AND fcredit = '1' AND fcreditdate < NOW()",
};

/**
 * Free-shipping ZIP codes — the union of 6 PHP $arrZIPCode* arrays
 * (BKK + Nakhon Pathom + Nonthaburi + Pathum Thani(empty) + Samut Prakan +
 * Samut Sakhon), de-duplicated. Source: `member/pcs-admin/include/function.php`
 * L1734-1740 (and identical lists scattered across cart / forwarder PHP).
 *
 * Stored as strings because `tb_forwarder.faddresszipcode` is varchar(5)
 * and `.in()` requires matching types.
 */
// FREE_SHIPPING_ZIPS is the single source of truth in
// @/lib/forwarder/free-shipping-zips (imported above) — shared with the
// CSV export + the top-menubar badge counts so the list can't drift.

const NOTE_SHOP_TABS: { q: string | null; label: string }[] = [
  { q: null, label: "ทั้งหมด" },
  { q: "1", label: "รอดำเนินการ" },
  { q: "2", label: "รอชำระเงิน" },
  { q: "3", label: "สั่งสินค้า" },
  { q: "4", label: "รอร้านจีนจัดส่ง" },
  { q: "40", label: "ถึงโกดังจีน" },
  { q: "5", label: "สำเร็จ" },
  { q: "6", label: "ออเดอร์ที่ยกเลิก" },
];

/**
 * tb_forwarder fStatus tab strip (?q=1..7) — faithful to legacy
 * `forwarder-action.php:290-375`. Labels match the legacy <a> text exactly:
 *   1=รอเข้าโกดังจีน · 2=ถึงโกดังจีนแล้ว · 3=กำลังส่งมาไทย · 4=ถึงไทยแล้ว ·
 *   5=รอชำระเงิน · 6=เตรียมส่ง · 7=ส่งแล้ว.
 * (The legacy q=6.1 "กำลังจัดส่ง" driver sub-status isn't a plain fStatus eq,
 *  so it's omitted here.)
 */
const FWD_STATUS_TABS: { q: string; label: string }[] = [
  { q: "1", label: "รอเข้าโกดังจีน" },
  { q: "2", label: "ถึงโกดังจีนแล้ว" },
  { q: "3", label: "กำลังส่งมาไทย" },
  { q: "4", label: "ถึงไทยแล้ว" },
  { q: "5", label: "รอชำระเงิน" },
  { q: "6", label: "เตรียมส่ง" },
  { q: "7", label: "ส่งแล้ว" },
];

export default async function AdminForwarderActionPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);
  const sp = await searchParams;
  const page = parsePage(sp.page);
  const { from: rowFrom, to: rowTo } = pageRange(page);
  const action = sp.action ?? "";

  // Wave 26: redirect legacy QA queue URLs to the dedicated /admin/qa/* pages.
  // Staff trained on the legacy `QAAndQC.php` menu can paste the old URL and
  // land in the right Pacred queue without 404.
  const qaRedirect = QA_QUEUE_REDIRECTS[action];
  if (qaRedirect) {
    const locale = await getLocale();
    redirect({ href: qaRedirect, locale });
  }

  const label = ACTION_LABEL[action];

  if (!action || !label) {
    return (
      <>
        <TopMenuReport activeHref={`/admin/forwarder-action`} />
        <main className="p-6 lg:p-8">
          {/* §0h — consistent page-title hierarchy via <PageHeader>. Display-only. */}
          <PageHeader
            eyebrow="ADMIN · AUDIT"
            title="forwarder-action"
            subtitle="กรุณาเลือกหัวข้อจากเมนูด้านบน (9 audit queues)"
          />
        </main>
      </>
    );
  }

  const admin = createAdminClient();

  // --- NoteShop branch: reads tb_header_order, not tb_forwarder ---
  if (action === "NoteShop") {
    const fStatusQ = sp.q;
    let shopQ = admin
      .from("tb_header_order")
      .select("id,hdate,hno,userid,hcover,htitle,hcount,htotalpricechn,hstatus,hnote,hrate,hdateupdate", { count: "exact" })
      .neq("hnote", "")
      .not("hnote", "is", null)
      .range(rowFrom, rowTo)
      .order("hdate", { ascending: false });

    if (fStatusQ && /^[1-6]$/.test(fStatusQ)) {
      shopQ = shopQ.eq("hstatus", fStatusQ);
    }

    const { data: shopRows, error: shopError, count: totalShopNotes } = await shopQ;

    const shopCsvCols: CsvCol[] = [
      { key: "id", label: "ID" },
      { key: "hdate", label: "วันที่สร้าง" },
      { key: "hno", label: "เลขที่ออเดอร์" },
      { key: "userid", label: "รหัสสมาชิก" },
      { key: "htitle", label: "สินค้า" },
      { key: "htotalpricechn", label: "ราคารวม (¥)" },
      { key: "hstatus", label: "สถานะ" },
      { key: "hnote", label: "หมายเหตุ" },
    ];
    const shopCsvRows: CsvRow[] = (shopRows ?? []).map((r) => ({
      id: r.id as number,
      hdate: r.hdate ? String(r.hdate).slice(0, 10) : "",
      hno: (r.hno as string) ?? "",
      userid: (r.userid as string) ?? "",
      htitle: `${(r.htitle as string) ?? ""}${r.hcount ? ` (${r.hcount as number})` : ""}`.trim(),
      htotalpricechn: Number(r.htotalpricechn ?? 0).toFixed(2),
      hstatus: (r.hstatus as string) ?? "",
      hnote: (r.hnote as string) ?? "",
    }));
    const shopQForExport = fStatusQ;

    return (
      <>
        <TopMenuReport activeHref={`/admin/forwarder-action?action=${action}`} />
        <main className="p-4 lg:p-6 space-y-4">
          {/* §0h — consistent page-title hierarchy via <PageHeader>. Display-only
              swap; same eyebrow + title + subtitle + CSV action. */}
          <PageHeader
            eyebrow="ADMIN · AUDIT"
            title={label}
            subtitle={
              <>
                Legacy condition: <code className="rounded bg-surface-alt px-1 py-0.5">{ACTION_CONDITION[action]}</code>
              </>
            }
            actions={
              <CsvButton
                rows={shopCsvRows}
                cols={shopCsvCols}
                filename={`forwarder-action-NoteShop${shopQForExport ? `-q${shopQForExport}` : ""}.csv`}
                fetchAll={async () => {
                  "use server";
                  return exportForwarderActionAll({ action: "NoteShop", q: shopQForExport });
                }}
              />
            }
          />

          {/* Status tab strip (?q=1..6) */}
          <div className="flex flex-wrap gap-1 border-b border-border">
            {NOTE_SHOP_TABS.map((t) => {
              const isActive = (t.q ?? "") === (fStatusQ ?? "");
              const href = t.q
                ? `/admin/forwarder-action?action=NoteShop&q=${t.q}`
                : `/admin/forwarder-action?action=NoteShop`;
              return (
                <Link
                  key={t.label}
                  href={href}
                  className={
                    "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
                    (isActive
                      ? "border-primary-600 text-primary-600 font-semibold"
                      : "border-transparent text-muted hover:text-foreground")
                  }
                >
                  {t.label}
                </Link>
              );
            })}
          </div>

          {shopError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              โหลดข้อมูลไม่สำเร็จ: {shopError.message}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
            {!shopRows || shopRows.length === 0 ? (
              <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในคิวนี้</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                  <thead className="bg-surface-alt/50 text-[11px] uppercase text-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">ID</th>
                      <th className="px-2 py-2 text-left">วันที่สร้าง</th>
                      <th className="px-2 py-2 text-left">เลขที่ออเดอร์</th>
                      <th className="px-2 py-2 text-left">รหัสสมาชิก</th>
                      <th className="px-2 py-2 text-left">สินค้า</th>
                      <th className="px-2 py-2 text-right">ราคารวม (¥)</th>
                      <th className="px-2 py-2 text-center">สถานะ</th>
                      <th className="px-2 py-2 text-left">หมายเหตุ</th>
                      <th className="px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopRows.map((r) => (
                      <tr key={r.id as number} className="border-t border-border">
                        <td className="px-2 py-2 font-mono">{r.id as number}</td>
                        <td className="px-2 py-2">{r.hdate ? String(r.hdate).slice(0, 10) : "-"}</td>
                        <td className="px-2 py-2 font-mono">{(r.hno as string) || "-"}</td>
                        <td className="px-2 py-2 font-mono">{(r.userid as string) || "-"}</td>
                        <td className="px-2 py-2 max-w-[240px] truncate" title={(r.htitle as string) ?? ""}>
                          {(r.htitle as string) || "-"} {r.hcount ? `(${r.hcount as number})` : ""}
                        </td>
                        <td className="px-2 py-2 text-right">{Number(r.htotalpricechn ?? 0).toFixed(2)}</td>
                        <td className="px-2 py-2 text-center">{r.hstatus as string}</td>
                        <td className="px-2 py-2 max-w-[280px] truncate" title={(r.hnote as string) ?? ""}>
                          {(r.hnote as string) || "-"}
                        </td>
                        <td className="px-2 py-2">
                          <Link
                            href={`/admin/service-orders/${r.hno as string}`}
                            className="text-primary-600 hover:underline text-[11px]"
                          >
                            ดู
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={totalShopNotes ?? 0}
            basePath="/admin/forwarder-action"
            params={{ action: "NoteShop", q: sp.q }}
          />
        </main>
      </>
    );
  }

  // --- All other actions: read tb_forwarder ---
  const cutoff = "2022-01-15 00:00:00";

  // The action's base filter, shared by the paginated list query AND the
  // per-fStatus tab-count queries (legacy `$sql_action`+`$sql_date`). Applying
  // the SAME builder to both means the tab counts can't drift from the list.
  function applyActionFilter<T>(base: T): T {
    // PostgREST filter methods (.eq/.or/.in/.not/…) live on the post-.select()
    // builder, not on base from(); type qb as any for the chain, cast back to T.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qb = base as any;
    if (action === "Note") {
      qb = qb.not("fnote", "is", null).neq("fnote", "");
    } else if (action === "notPhoto") {
      qb = qb.eq("fcover", "").gt("fstatus", "1").gte("fdate", cutoff);
    } else if (action === "notPortage") {
      // Legacy forwarder-action.php:171 + header-theme.php:40 — the full queue:
      //   (fTransportPrice=0 OR fShipBy='PCSE')                — needs a TH charge
      //   AND fTransportPriceSum not '1'                       — not already combined
      //   AND fShipBy NOT IN ('PCS','PCSF')                    — exclude PCS pickup + free
      //   AND payMethod='1'                                    — ต้นทาง (customer pays origin)
      //   AND fDate>cutoff AND fStatus IN (4,5,6)              — recent, delivered-ish
      qb = qb
        .or("ftransportprice.eq.0,fshipby.eq.PCSE")
        .or("ftransportpricesum.is.null,ftransportpricesum.neq.1")
        .neq("fshipby", "PCS")
        .neq("fshipby", "PCSF")
        .eq("paymethod", "1")
        .gte("fdate", cutoff)
        .in("fstatus", ["4", "5", "6"]);
    } else if (action === "notContainer") {
      qb = qb.eq("fcabinetnumber", "").gte("fdate", cutoff);
    } else if (action === "NotDateContainerClose") {
      qb = qb.is("fdatecontainerclose", null).gte("fdate", cutoff);
    } else if (action === "fCreditError") {
      qb = qb.eq("fcredit", "1").lt("fcreditdate", new Date().toISOString());
    } else if (action === "NotShipFree") {
      // ZIP in free-shipping list, but customer chose a non-free carrier
      qb = qb
        .in("faddresszipcode", FREE_SHIPPING_ZIPS)
        .not("fshipby", "in", `(PCS,PCSF)`)
        .gte("fdate", cutoff);
    } else if (action === "NotShipFreeError") {
      // ZIP NOT in free-shipping list, but customer chose free carrier (PCSF) — error case
      qb = qb
        .not("faddresszipcode", "in", `(${FREE_SHIPPING_ZIPS.join(",")})`)
        .eq("fshipby", "PCSF")
        .gte("fdate", cutoff);
    }
    return qb as T;
  }

  let q = applyActionFilter(
    admin
      .from("tb_forwarder")
      .select(
        "id,fdate,fcabinetnumber,ftrackingchn,fstatus,fnote,fcover,fwarehousename,ftotalprice,fshipby,faddresszipcode,faddressname,faddressprovince,faddresstel,famount,fweight,ftransportprice",
        { count: "exact" },
      )
      .range(rowFrom, rowTo)
      .order("fdate", { ascending: false }),
  );

  const fStatusQ = sp.q;
  if (fStatusQ) q = q.eq("fstatus", fStatusQ);

  const { data: rows, error, count: totalForwarderRows } = await q;

  // Per-fStatus tab counts — one head-only COUNT per status (1..7) over the
  // action's base filter, mirroring the legacy
  //   SELECT COUNT(ID), fStatus FROM tb_forwarder WHERE 1=1 <sql_action> GROUP BY fStatus.
  // A grouped count isn't expressible via the PostgREST builder, so we run a
  // bounded per-status head-count loop (7 queries) — accepted per the W3.4
  // spec. `Promise.allSettled` keeps one broken filter from blanking them all.
  const tabCountResults = await Promise.allSettled(
    FWD_STATUS_TABS.map((t) =>
      applyActionFilter(
        admin.from("tb_forwarder").select("id", { count: "exact", head: true }),
      )
        .eq("fstatus", t.q)
        .then((r) => {
          if (r.error) throw r.error;
          return r.count ?? 0;
        }),
    ),
  );
  const tabCounts: Record<string, number> = {};
  FWD_STATUS_TABS.forEach((t, i) => {
    const res = tabCountResults[i];
    tabCounts[t.q] = res.status === "fulfilled" ? res.value : 0;
  });
  const tabCountTotal = Object.values(tabCounts).reduce((a, b) => a + b, 0);

  // Wave 13: batch-resolve every forwarder-cover filename in parallel
  // so the row template can render the thumbnail next to the F-id.
  // Empty / null → null → row shows no thumbnail.
  type ForwarderListRow = {
    id: number;
    fcover: string | null;
  };
  const coverUrlByRowId = await resolveLegacyUrlMap(
    ((rows ?? []) as unknown as ForwarderListRow[]).map((r) => ({ id: r.id, filename: r.fcover })),
    "cover",
  );

  const isShipQueue = action === "NotShipFree" || action === "NotShipFreeError";
  const fwdCsvCols: CsvCol[] = [
    { key: "id", label: "ID" },
    { key: "fdate", label: "วันที่" },
    { key: "fcabinetnumber", label: "เบอร์ตู้" },
    { key: "ftrackingchn", label: "tracking จีน" },
    { key: "fstatus", label: "สถานะ" },
    ...(isShipQueue
      ? [
          { key: "faddresszipcode", label: "ZIP" },
          { key: "fshipby", label: "ShipBy" },
        ]
      : []),
    { key: "fnote", label: "หมายเหตุ" },
    { key: "ftotalprice", label: "ราคา" },
  ];
  const fwdCsvRows: CsvRow[] = (rows ?? []).map((r) => {
    const row: CsvRow = {
      id: r.id as number,
      fdate: r.fdate ? String(r.fdate).slice(0, 10) : "",
      fcabinetnumber: (r.fcabinetnumber as string) ?? "",
      ftrackingchn: (r.ftrackingchn as string) ?? "",
      fstatus: (r.fstatus as string) ?? "",
    };
    if (isShipQueue) {
      row.faddresszipcode = (r.faddresszipcode as string) ?? "";
      row.fshipby = (r.fshipby as string) ?? "";
    }
    row.fnote = (r.fnote as string) ?? "";
    row.ftotalprice = Number(r.ftotalprice ?? 0).toFixed(2);
    return row;
  });

  return (
    <>
      <TopMenuReport activeHref={`/admin/forwarder-action?action=${action}`} />
      <main className="p-4 lg:p-6 space-y-4">
        {/* §0h — consistent page-title hierarchy via <PageHeader>. Display-only
            swap; same eyebrow + title + subtitle (legacy condition + conditional
            ship-queue ZIP note) + CSV action. */}
        <PageHeader
          eyebrow="ADMIN · AUDIT"
          title={label}
          subtitle={
            <>
              Legacy condition: <code className="rounded bg-surface-alt px-1 py-0.5">{ACTION_CONDITION[action] ?? "TBD"}</code>
              {isShipQueue && (
                <span className="mt-1 block text-[11px] text-muted">
                  Free-shipping ZIP list: {FREE_SHIPPING_ZIPS.length} codes (BKK + นนทบุรี + ปทุมธานี + นครปฐม + สมุทรปราการ + สมุทรสาคร)
                </span>
              )}
            </>
          }
          actions={
            <CsvButton
              rows={fwdCsvRows}
              cols={fwdCsvCols}
              filename={`forwarder-action-${action}${fStatusQ ? `-q${fStatusQ}` : ""}.csv`}
              fetchAll={async () => {
                "use server";
                return exportForwarderActionAll({ action, q: fStatusQ });
              }}
            />
          }
        />

        {/* Per-fStatus tab strip (?q=1..7) — legacy forwarder-action.php:290-375.
            Renders above WHATEVER body follows, including the notPortage panel. */}
        <div className="flex flex-wrap gap-1 border-b border-border">
          <Link
            href={`/admin/forwarder-action?action=${action}`}
            className={
              "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
              (!fStatusQ
                ? "border-primary-600 text-primary-600 font-semibold"
                : "border-transparent text-muted hover:text-foreground")
            }
          >
            ทั้งหมด
            {tabCountTotal > 0 && (
              <span className="ml-1 inline-flex items-center rounded-full bg-surface-alt px-1.5 text-[11px] font-semibold">
                {tabCountTotal}
              </span>
            )}
          </Link>
          {FWD_STATUS_TABS.map((t) => {
            const isActive = fStatusQ === t.q;
            const n = tabCounts[t.q] ?? 0;
            return (
              <Link
                key={t.q}
                href={`/admin/forwarder-action?action=${action}&q=${t.q}`}
                className={
                  "px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px " +
                  (isActive
                    ? "border-primary-600 text-primary-600 font-semibold"
                    : "border-transparent text-muted hover:text-foreground")
                }
              >
                {t.label}
                {n > 0 && (
                  <span className="ml-1 inline-flex items-center rounded-full bg-surface-alt px-1.5 text-[11px] font-semibold">
                    {n}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error.message}
          </div>
        )}

        {action === "notPortage" && rows && rows.length > 0 ? (
          <NotPortageCombinePanel
            rows={(rows as unknown as Array<Record<string, unknown>>).map((r): NotPortageRow => ({
              id:               r.id as number,
              fdate:            (r.fdate as string) ?? null,
              ftrackingchn:     (r.ftrackingchn as string) ?? null,
              faddressname:     (r.faddressname as string) ?? null,
              faddressprovince: (r.faddressprovince as string) ?? null,
              faddresstel:      (r.faddresstel as string) ?? null,
              famount:          Number(r.famount ?? 0),
              fweight:          Number(r.fweight ?? 0),
              ftransportprice:  Number(r.ftransportprice ?? 0),
              fstatus:          (r.fstatus as string) ?? null,
            }))}
          />
        ) : (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {!rows || rows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่มีรายการในคิวนี้</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                <thead className="bg-surface-alt/50 text-[11px] uppercase text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">ID</th>
                    <th className="px-2 py-2 text-left">รูป</th>
                    <th className="px-2 py-2 text-left">วันที่</th>
                    <th className="px-2 py-2 text-left">เบอร์ตู้</th>
                    <th className="px-2 py-2 text-left">tracking จีน</th>
                    <th className="px-2 py-2 text-center">สถานะ</th>
                    {(action === "NotShipFree" || action === "NotShipFreeError") && (
                      <>
                        <th className="px-2 py-2 text-left">ZIP</th>
                        <th className="px-2 py-2 text-left">ShipBy</th>
                      </>
                    )}
                    <th className="px-2 py-2 text-left">หมายเหตุ</th>
                    <th className="px-2 py-2 text-right">ราคา</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const coverUrl = coverUrlByRowId[String(r.id as number)];
                    return (
                    <tr key={r.id as number} className="border-t border-border">
                      <td className="px-2 py-2 font-mono">{r.id as number}</td>
                      <td className="px-2 py-2">
                        {coverUrl ? (
                          <a href={coverUrl} target="_blank" rel="noopener noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={coverUrl}
                              alt={`cover-${r.id as number}`}
                              className="w-10 h-10 rounded object-cover border border-border"
                            />
                          </a>
                        ) : (
                          <span className="text-muted text-[11px]">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">{r.fdate ? String(r.fdate).slice(0, 10) : "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.fcabinetnumber as string) || "-"}</td>
                      <td className="px-2 py-2 font-mono">{(r.ftrackingchn as string) || "-"}</td>
                      <td className="px-2 py-2 text-center">{r.fstatus as string}</td>
                      {(action === "NotShipFree" || action === "NotShipFreeError") && (
                        <>
                          <td className="px-2 py-2 font-mono">{(r.faddresszipcode as string) || "-"}</td>
                          <td className="px-2 py-2 font-mono">{(r.fshipby as string) || "-"}</td>
                        </>
                      )}
                      <td className="px-2 py-2 max-w-[280px] truncate" title={(r.fnote as string) ?? ""}>{(r.fnote as string) ?? "-"}</td>
                      <td className="px-2 py-2 text-right">{Number(r.ftotalprice ?? 0).toFixed(2)}</td>
                      <td className="px-2 py-2">
                        <Link href={`/admin/forwarders/${r.id as number}`} className="text-primary-600 hover:underline text-[11px]">
                          ดู
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}

        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={totalForwarderRows ?? 0}
          basePath="/admin/forwarder-action"
          params={{ action: sp.action, q: sp.q }}
        />
      </main>
    </>
  );
}

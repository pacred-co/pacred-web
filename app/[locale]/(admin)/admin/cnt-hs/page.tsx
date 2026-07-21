import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { parsePage } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CntHsTable, type CntHsRow } from "./cnt-hs-table";
import {
  loadCabinetBillingCoverage,
  rollupCabinetCoverages,
  type CabinetBillingCoverage,
} from "@/lib/admin/cabinet-billing-coverage";
import { PageHeader } from "@/components/admin/page-header";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportCntHsAll } from "@/actions/admin/export/cnt-hs";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";

const CNT_STATUS_CSV_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ", "2": "สำเร็จแล้ว", "3": "ปฏิเสธ",
};

/**
 * Admin > "รายการจ่ายเงินตู้" — container-payment (ตู้-ค่าจ่าย) ledger.
 *
 * Wave 24 ROW-COLOR-RESTORE (2026-05-28 ดึก · Agent P3): restored row tint
 * per cntStatus + sortable column headers + orange summary band that the
 * Wave 23 P1-11.a rewrite (cd21c4f0) had silently dropped. ภูม + พี่ป๊อป
 * opened the page, couldn't read state from a row at-a-glance, found the
 * ledger unusable. The fix:
 *   - Row tint via canonical `CNTHS_ROW_TINT` (amber-200 unpaid · emerald-200
 *     paid · red-200 rejected) — SOLID Tailwind, not `/30` opacity.
 *   - Sortable headers via `ArrowUpDown` + client state on every data column.
 *   - Orange summary band under thead — matches `report-cnt/cnt-list-table.tsx`
 *     L188-198 pattern with total ฿ + N รายการ + N ตู้.
 *   - Status chip palette swapped from washed `-100` tints to solid
 *     `CNTSTATUS_CFG` chips so the chip reads in <1s.
 *
 * AGENTS.md §0a clarification: chip-color + row-tint are LOGIC, not chrome.
 * "Steal the LOGIC + apply OUR OWN polish" means cleaner typography, modern
 * spacing — NOT stripping the visual state encoding that staff trained on.
 * The earlier rewrite header (Wave 23 P1 #11.a) framed those affordances as
 * "legacy chrome to drop"; that read §0a incorrectly. This commit corrects.
 *
 * Wave 23 P1 #9 (kept): "ข้อมูลเพิ่มเติม" column's GZE/cabinet codes are
 * capped via `<CabinetListCell>` (3 visible chips + dialog for the rest).
 *
 * Workflow / data unchanged:
 *   - Reads `tb_cnt` (ledger header) + `tb_cnt_item` (cabinet fan-out)
 *   - Status filter `?q=1` (รอดำเนินการ) / `?q=2` (สำเร็จแล้ว)
 *   - Free-text search across id / nameblank / noblank
 *   - 200-row pagination via `?offset=`
 *   - Mutations stay on `/admin/cnt-hs/[id]` detail (this list is read-only)
 *
 * RBAC: super + ops + accounting (closest V3 mapping to legacy
 * cnt-hs.php L185 CEO/Manager/QA&QC/Accounting/ITDT gate).
 */

export const dynamic = "force-dynamic";

// ============================================================================
// Row shape — relevant subset of tb_cnt (server query · pre-CntHsRow shape)
// ============================================================================

type CntRow = {
  ID: number;
  cntName: string;
  cntStatus: string;
  cntAmount: number;
  cntImagesSlip: string;
  cntFile: string;
  date: string | null;
  adminIDCreate: string;
  nameBlank: string;
  noBlank: string;
  nameAccount: string;
};

type SP = { q?: string; search?: string; page?: string };

const PAGE_SIZE = 200;

// Wave 23 P1 #9 — cap visible GZE codes at 3, rest in <details>.
// CABINET_VISIBLE moved into CabinetListCell client island (Wave 23 P1 #E).
// Wave 24 ROW-COLOR-RESTORE — table chrome + sort + summary moved into
// <CntHsTable> client wrapper (./cnt-hs-table.tsx).

export default async function CntHsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { roles } = await requireAdmin(["super", "ops", "accounting"]);

  const sp = await searchParams;

  // G6 — default queue filter per role. CSPurchasing (interpreter)
  // lands on ?q=1 (รอดำเนินการ — their pending initiations); other
  // roles see the full ledger (review queue). Matrix in
  // lib/admin/default-queue-filter.ts.
  const defaultRedirect = buildDefaultLandingRedirect(
    "/admin/cnt-hs",
    roles,
    sp as Record<string, unknown>,
  );
  if (defaultRedirect) redirect(defaultRedirect);

  const admin = createAdminClient();

  // ── tb_cnt_item fan-out (cnt-hs.php L202-213) ───────────────────
  const { data: itemsData, error: itemsErr } = await admin
    .from("tb_cnt_item")
    .select("cntID, fCabinetNumber");
  if (itemsErr) {
    console.error(`[tb_cnt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const arrItem = new Map<number, string[]>();
  for (const r of (itemsData ?? []) as Array<{ cntID: number; fCabinetNumber: string }>) {
    const arr = arrItem.get(r.cntID);
    if (arr) arr.push(r.fCabinetNumber);
    else arrItem.set(r.cntID, [r.fCabinetNumber]);
  }

  // ── pagination + search resolve (2026-06-04 · ?page=N + shared Pagination)
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;
  const searchTerm = (sp.search ?? "").trim();
  const qIsStatus = sp.q === "1" || sp.q === "2";
  const qAsSearch = !qIsStatus ? (sp.q ?? "").trim() : "";
  const search = searchTerm || qAsSearch;

  let q = admin
    .from("tb_cnt")
    .select(
      "ID, cntName, cntStatus, cntAmount, cntImagesSlip, cntFile, date, " +
        "adminIDCreate, nameBlank, noBlank, nameAccount",
      { count: "exact" },
    )
    .order("date", { ascending: false, nullsFirst: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (qIsStatus) q = q.eq("cntStatus", sp.q!);
  if (search) {
    const safe = search.replace(/[(),]/g, " ");
    const pattern = `%${safe}%`;
    // Note: PostgREST .or() string uses identifier names verbatim — quote
    // camelCase columns so they aren't lowercased by the planner.
    q = q.or(
      `"ID"::text.ilike.${pattern},"nameBlank".ilike.${pattern},"noBlank".ilike.${pattern}`,
    );
  }

  // ── status overview counts ──────────────────────────────────────
  const [tableRes, countAllRes, count1Res] = await Promise.all([
    q,
    admin.from("tb_cnt").select("ID", { count: "exact", head: true }),
    admin.from("tb_cnt").select("ID", { count: "exact", head: true }).eq("cntStatus", "1"),
  ]);

  if (tableRes.error) {
    console.error(`[tb_cnt list] failed`, { code: tableRes.error.code, message: tableRes.error.message });
  }

  const rows: CntRow[] = (tableRes.data ?? []) as unknown as CntRow[];
  const countAll = countAllRes.count ?? 0;
  const count1 = count1Res.count ?? 0;
  const count2 = countAll - count1;
  const resultTotal = tableRes.count ?? rows.length;

  // Wave 24 ROW-COLOR-RESTORE — pre-resolve cabinets server-side so the
  // client wrapper gets a JSON-serializable shape (string[]). Prefer the
  // normalized `tb_cnt_item` fan-out; fall back to parsing the legacy
  // `tb_cnt.cntname` CSV when the fan-out is empty (legacy data often
  // wrote the CSV but never populated tb_cnt_item — would show "—" if we
  // relied on fan-out only).
  // Pre-coverage shape — the ครบ-gate chip fields (coverageState/coverageLabel) are added
  // below in tableRowsWithCoverage once the invoice-line coverage is resolved.
  const tableRows: Array<Omit<CntHsRow, "coverageState" | "coverageLabel">> = rows.map((row) => {
    const fanOut = arrItem.get(row.ID) ?? [];
    const cabinets =
      fanOut.length > 0
        ? fanOut
        : (row.cntName ?? "")
            .split(/[,\s]+/)
            .map((s) => s.trim())
            .filter(Boolean);
    return {
      ID: row.ID,
      cntName: row.cntName ?? "",
      cntStatus: row.cntStatus ?? "1",
      cntAmount: Number(row.cntAmount ?? 0),
      cntImagesSlip: row.cntImagesSlip ?? "",
      cntFile: row.cntFile ?? "",
      date: row.date,
      adminIDCreate: row.adminIDCreate ?? "",
      nameBlank: row.nameBlank ?? "",
      noBlank: row.noBlank ?? "",
      nameAccount: row.nameAccount ?? "",
      cabinets,
    };
  });

  // ครบ-gate coverage chip per row (owner 2026-07-21 · MOMO bills per tracking, we pay per
  // ตู้). CHEAP + bounded: first probe the small cabinet-indexed momo_invoice_line to find
  // which of this page's ตู้ have ANY invoice line; only THOSE need the fuller coverage read
  // (the rest short-circuit to "ยังไม่มีข้อมูลใบ" with zero extra queries). Skipped on a
  // pathological mega-page (legacy CSV can hold 90+ ตู้/row) to protect the list query.
  const allCabs = Array.from(new Set(tableRows.flatMap((r) => r.cabinets))).filter(Boolean);
  let covByCab: Record<string, CabinetBillingCoverage> = {};
  if (allCabs.length > 0 && allCabs.length <= 1000) {
    const { data: lineCabs, error: lineErr } = await admin
      .from("momo_invoice_line")
      .select("fcabinetnumber")
      .in("fcabinetnumber", allCabs)
      .limit(50_000); // explicit — a silent default truncation could miss a cabinet's lines
    if (lineErr) {
      // most common during rollout: mig 0267 not applied yet → no chips (safe).
      console.warn("[cnt-hs coverage probe] failed", { code: lineErr.code, message: lineErr.message });
    }
    const cabsWithLines = Array.from(
      new Set((lineCabs ?? []).map((r) => ((r as { fcabinetnumber: string | null }).fcabinetnumber ?? "").trim()).filter(Boolean)),
    );
    if (cabsWithLines.length > 0) {
      covByCab = await loadCabinetBillingCoverage(admin, cabsWithLines);
    }
  }
  const noData = (c: string): CabinetBillingCoverage => ({
    cabinet: c, totalRows: 0, billedRows: 0, billedForRealThb: 0, storedCostThb: 0,
    state: "no_invoice_data", chipLabel: "ยังไม่มีข้อมูลใบ", remainingRows: 0,
  });
  const tableRowsWithCoverage: CntHsRow[] = tableRows.map((r) => {
    const roll = rollupCabinetCoverages(r.cabinets.map((c) => covByCab[c] ?? noData(c)));
    return { ...r, coverageState: roll.state, coverageLabel: roll.chipLabel };
  });

  // CSV rows for the on-screen "⬇ CSV หน้านี้" (identical keys to the export-all
  // action — actions/admin/export/cnt-hs.ts). §0-audit 2026-07-08: cnt-hs was the
  // one admin list missing the export the other ~72 surfaces + legacy DataTables had.
  const csvRows: CsvRow[] = tableRows.map((r) => ({
    "เลขที่": r.ID,
    "วันที่": r.date ? formatThaiDateTime(r.date) : "",
    "หมายเลขตู้": r.cabinets.join(" "),
    "จำนวนเงิน": r.cntAmount.toFixed(2),
    "ธนาคาร": r.nameBlank,
    "เลขที่บัญชี": r.noBlank,
    "ชื่อบัญชี": r.nameAccount,
    "ผู้ทำรายการ": r.adminIDCreate,
    "สถานะ": CNT_STATUS_CSV_LABEL[r.cntStatus] ?? r.cntStatus,
  }));
  const csvExportStatus = sp.q === "1" || sp.q === "2" ? sp.q : "all";
  const csvExportSearch = search;

  const activeTab: "all" | "1" | "2" =
    sp.q === "1" ? "1" : sp.q === "2" ? "2" : "all";


  // Tab pill class helper.
  const tabCls = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "border-primary-200 bg-primary-50 text-primary-700"
        : "border-border bg-white text-foreground hover:bg-surface-alt"
    }`;
  const badgeCls = (active: boolean) =>
    `rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      active ? "bg-primary-600 text-white" : "bg-surface-alt text-muted"
    }`;

  return (
    <>
      <TopMenuReport activeHref="/admin/cnt-hs" />
      <main className="p-6 lg:p-8 space-y-5">
        {/* §0h — one consistent page-title hierarchy via <PageHeader>. Display-only
            swap; same eyebrow + title + subtitle (+ ดูทั้งหมด) and the breadcrumb
            moves into the actions slot. */}
        <PageHeader
          eyebrow="ADMIN"
          title="รายการจ่ายเงินตู้"
          subtitle={
            <>
              จัดการการชำระเงินค่าตู้คอนเทนเนอร์ (tb_cnt) · {countAll.toLocaleString()} รายการทั้งหมด
              {sp.q && (
                <>
                  {" · "}
                  <Link
                    href="/admin/cnt-hs?nofilter=1"
                    className="text-primary-600 hover:underline"
                    title="ล้างฟิลเตอร์เริ่มต้นตามบทบาท · แสดงรายการทั้งหมด"
                  >
                    ดูทั้งหมด
                  </Link>
                </>
              )}
            </>
          }
          actions={
            <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center">
              <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
              <span>/</span>
              <span className="text-foreground">รายการจ่ายเงินตู้</span>
            </nav>
          }
        />

        {/* Status tabs */}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/cnt-hs" className={tabCls(activeTab === "all")}>
            ทั้งหมด
            {countAll > 0 && <span className={badgeCls(activeTab === "all")}>{countAll}</span>}
          </Link>
          <Link href={{ pathname: "/admin/cnt-hs", query: { q: "1" } }} className={tabCls(activeTab === "1")}>
            รอดำเนินการ
            {count1 > 0 && <span className={badgeCls(activeTab === "1")}>{count1}</span>}
          </Link>
          <Link href={{ pathname: "/admin/cnt-hs", query: { q: "2" } }} className={tabCls(activeTab === "2")}>
            สำเร็จแล้ว
            {count2 > 0 && <span className={badgeCls(activeTab === "2")}>{count2}</span>}
          </Link>
        </div>

        {/* Search bar */}
        <form action="/admin/cnt-hs" method="GET" className="flex flex-wrap items-center gap-2">
          {sp.q && <input type="hidden" name="q" value={sp.q} />}
          <input
            type="text"
            name="search"
            defaultValue={searchTerm}
            placeholder="ค้นหา ID / ธนาคาร / เลขที่บัญชี"
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm w-72"
          />
          <button
            type="submit"
            className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700"
          >
            ค้นหา
          </button>
          {searchTerm && (
            <Link
              href={sp.q ? `/admin/cnt-hs?q=${sp.q}` : "/admin/cnt-hs"}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt"
            >
              ล้าง
            </Link>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted">
              พบ {resultTotal.toLocaleString()} รายการ
            {resultTotal > PAGE_SIZE &&
              ` · แสดง ${(offset + 1).toLocaleString()}–${Math.min(offset + rows.length, resultTotal).toLocaleString()}`}
            </span>
            <CsvButton
              rows={csvRows}
              cols={Object.keys(csvRows[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={`cnt-hs${csvExportStatus !== "all" ? `-${csvExportStatus}` : ""}.csv`}
              fetchAll={async () => {
                "use server";
                return exportCntHsAll({ status: csvExportStatus, search: csvExportSearch });
              }}
            />
          </div>
        </form>

        {/* Table card */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          {tableRows.length === 0 ? (
            <p className="p-12 text-center text-sm text-muted">ไม่พบรายการจ่ายเงินตู้</p>
          ) : (
            <>
              <CntHsTable rows={tableRowsWithCoverage} />
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={resultTotal}
                basePath="/admin/cnt-hs"
                params={{ q: sp.q, search: searchTerm }}
              />
            </>
          )}
        </div>
      </main>
    </>
  );
}

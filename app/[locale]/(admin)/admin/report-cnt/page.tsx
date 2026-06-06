/**
 * /admin/report-cnt — รายงานตู้
 *
 * Faithful port of legacy `member/pcs-admin/report-cnt.php` (2487 LOC).
 * Reads from `tb_forwarder` (migration 0081); groups by `fCabinetNumber`
 * (ตู้); displays the container summary table with two status views
 * (รอเข้าโกดังไทย / เข้าโกดังไทยแล้ว) and three transport-mode filters
 * (ทั้งหมด / ทางรถ / ทางเรือ).
 *
 * Replaces the rebuilt "spine" page `/admin/warehouse/containers` per
 * ภูม brief 2026-05-20 ค่ำ — Option C (replace spine wholesale with
 * faithful port). The spine page now shows a tombstone notice + redirect
 * link to this page.
 *
 * Legacy SQL (verbatim from report-cnt.php L184-254):
 *   SELECT
 *     cntitem.fCabinetNumber AS fCabinetNumberPay,
 *     fWarehouseName, fDateStatus4, fStatus,
 *     f.fCabinetNumber, DATE(fDateContainerClose),
 *     fTransportType,
 *     COUNT(f.ID), SUM(fVolume), SUM(fWeight),
 *     SUM(fCostTotalPrice), SUM(fTotalPrice)
 *   FROM tb_forwarder f
 *   LEFT JOIN tb_cnt_item cntitem ON cntitem.fCabinetNumber=f.fCabinetNumber
 *   WHERE f.fCabinetNumber<>'' AND f.fCabinetNumber IS NOT NULL
 *     AND f.fCabinetNumber<>'0'
 *     [page filter: fStatus<4 OR fStatus>3]
 *     [transport: fTransportType=1|2|all]
 *     [actionPay: cntitem.fCabinetNumber IS NULL|NOT NULL]
 *     [date range: DATE(fDateContainerClose) BETWEEN start AND end]
 *   GROUP BY f.fCabinetNumber
 *
 * Cost/Price/Profit columns are role-gated to CEO / Manager / QA / Accounting / IT
 * per legacy `departmentKey` check (L399-401). The Pacred role mapping:
 *   - super  → CEO/IT
 *   - ops    → Manager (sees cost+price)
 *   - accounting → Accounting (sees cost+price+profit)
 *   - warehouse → no money columns
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { CntListTable, type CntListRow } from "./cnt-list-table";

export const dynamic = "force-dynamic";

type SP = {
  page?: string;          // 'waiting' (default) | 'succeed'
  transportType?: string; // 'all' (default) | '1' (รถ) | '2' (เรือ)
  actionPay?: string;     // 'all' (default) | '1' (ยังไม่จ่าย) | '2' (จ่ายแล้ว)
  date?: string;          // 'YYYY-MM-DD-YYYY-MM-DD' (for succeed page)
  historyTable?: string;  // present when user submits date range form
};

// Legacy nameWarehouse() — fWarehouseName int → display name
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

// Legacy nameTransportType2() — fTransportType
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚛 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ",
};

// Legacy statusForwarderBadge() — fStatus 1..7 — uses the canonical
// FSTATUS_CFG palette from `@/lib/admin/forwarder-status`. The earlier
// inline map here had WRONG labels (e.g. fstatus=4 → "ถึงไทย" instead of
// the legacy "ถึงไทยแล้ว") + opacity-100 chip colors invisible at-a-glance.
// CntListTable now consumes FSTATUS_CFG directly — no prop wiring needed.

type Row = {
  fwarehousename: string;
  fdatestatus4: string | null;
  fstatus: string;
  fcabinetnumber: string;
  fdatecontainerclose: string | null;
  ftransporttype: string;
  fvolume: number;
  fweight: number;
  fcosttotalprice: number;
  ftotalprice: number;
};

type Grouped = {
  fcabinetnumber: string;
  fwarehousename: string;
  fdatecontainerclose: string | null;
  fdatestatus4: string | null;
  ftransporttype: string;
  fstatus: string;
  trackCount: number;
  volumeSum: number;
  weightSum: number;
  costSum: number;
  priceSum: number;
  isPaid: boolean; // join into tb_cnt_item — has payment record
};

// Group at the application layer (PostgREST has no SUM/GROUP BY in select)
function groupByContainer(rows: Row[], paidContainers: Set<string>): Grouped[] {
  const byContainer = new Map<string, Grouped>();
  for (const r of rows) {
    const k = r.fcabinetnumber;
    const existing = byContainer.get(k);
    if (existing) {
      existing.trackCount += 1;
      existing.volumeSum += Number(r.fvolume ?? 0);
      existing.weightSum += Number(r.fweight ?? 0);
      existing.costSum   += Number(r.fcosttotalprice ?? 0);
      existing.priceSum  += Number(r.ftotalprice ?? 0);
      // Keep the most recent fdatestatus4 / fdatecontainerclose (legacy emits any)
      if (r.fdatestatus4 && (!existing.fdatestatus4 || r.fdatestatus4 > existing.fdatestatus4)) {
        existing.fdatestatus4 = r.fdatestatus4;
      }
    } else {
      byContainer.set(k, {
        fcabinetnumber: k,
        fwarehousename: r.fwarehousename,
        fdatecontainerclose: r.fdatecontainerclose,
        fdatestatus4: r.fdatestatus4,
        ftransporttype: r.ftransporttype,
        fstatus: r.fstatus,
        trackCount: 1,
        volumeSum: Number(r.fvolume ?? 0),
        weightSum: Number(r.fweight ?? 0),
        costSum:   Number(r.fcosttotalprice ?? 0),
        priceSum:  Number(r.ftotalprice ?? 0),
        isPaid:    paidContainers.has(k),
      });
    }
  }
  return Array.from(byContainer.values()).sort((a, b) => {
    // Default sort by fdatecontainerclose desc (legacy 'order': [[3, 'desc']])
    if (!a.fdatecontainerclose) return 1;
    if (!b.fdatecontainerclose) return -1;
    return b.fdatecontainerclose.localeCompare(a.fdatecontainerclose);
  });
}

// Wave 17 ux-fix: diffDateNow + diffDateCNT moved to cnt-list-table.tsx
// (now the only consumer · client-side rendering after table extraction).

export default async function AdminReportCntPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { roles } = await requireAdmin(["super", "ops", "accounting", "warehouse"]);
  const sp = await searchParams;

  const isWaiting = !sp.page || sp.page === "waiting";
  const transportType = sp.transportType ?? "all";
  const actionPay = sp.actionPay ?? "all";

  // Money-column visibility (legacy departmentKey gate — CEO/Manager/QA/Accounting/IT).
  // Warehouse role sees the list but not cost/price/profit.
  const showMoney =
    roles.includes("super") ||
    roles.includes("ops") ||
    roles.includes("accounting");

  // Date range — only for 'succeed' page; default -90 days
  let startDate = "";
  let endDate = "";
  if (!isWaiting) {
    if (sp.date) {
      // 'YYYY-MM-DD - YYYY-MM-DD'
      const m = sp.date.split(" - ");
      startDate = m[0] || "";
      endDate   = m[1] || "";
    } else {
      const today = new Date();
      const ninetyAgo = new Date();
      ninetyAgo.setDate(ninetyAgo.getDate() - 90);
      startDate = ninetyAgo.toISOString().slice(0, 10);
      endDate   = today.toISOString().slice(0, 10);
    }
  }

  const admin = createAdminClient();

  // 2026-06-06 (ภูม B5 fix · save-point 2026-06-05 late-PM):
  //   The legacy path pulled 50,000 tb_forwarder rows + JS-grouped into
  //   ~5,603 containers · 12-23 MB wire per page-load. Replaced with the
  //   `get_container_summary` RPC (migration 0146) that does GROUP BY +
  //   SUM server-side · returns ~5,603 pre-aggregated rows directly.
  //   Wire payload shrinks ~88×.
  //
  // The RPC output already matches the Grouped shape (less isPaid, joined
  // separately below). If the RPC fails (e.g. migration 0146 not applied
  // yet), we fall back to the original 50k-row + JS-group path so the
  // page never breaks.

  type RpcSummary = {
    fcabinetnumber:       string;
    ftransporttype:       string | null;
    fwarehousename:       string | null;
    fdatecontainerclose:  string | null;
    latest_fdatestatus4:  string | null;
    row_count:            number;
    sum_weight:           number | string;
    sum_volume:           number | string;
    sum_cost:             number | string;
    sum_price:            number | string;
  };

  let groupedNoPaid: Omit<Grouped, "isPaid">[] = [];
  let queryFailed = false;

  const rpcRes = await admin.rpc("get_container_summary", {
    p_page:      isWaiting ? "waiting" : "succeed",
    p_transport: transportType === "1" || transportType === "2" ? transportType : null,
    p_start:     (!isWaiting && startDate) ? startDate : null,
    p_end:       (!isWaiting && endDate)   ? endDate   : null,
  });

  if (rpcRes.error) {
    console.warn(
      "[get_container_summary RPC] failed → falling back to 50k-row pull",
      { code: rpcRes.error.code, message: rpcRes.error.message },
    );
    // Fallback to legacy 50k-row pull
    let q = admin
      .from("tb_forwarder")
      .select(
        "fwarehousename,fdatestatus4,fstatus,fcabinetnumber,fdatecontainerclose,ftransporttype,fvolume,fweight,fcosttotalprice,ftotalprice",
      )
      .not("fcabinetnumber", "is", null)
      .neq("fcabinetnumber", "")
      .neq("fcabinetnumber", "0")
      .limit(50_000);
    if (isWaiting) q = q.lt("fstatus", "4");
    else            q = q.gt("fstatus", "3");
    if (transportType === "1") q = q.eq("ftransporttype", "1");
    if (transportType === "2") q = q.eq("ftransporttype", "2");
    if (!isWaiting && startDate && endDate) {
      q = q.gte("fdatecontainerclose", startDate + " 00:00:00")
           .lte("fdatecontainerclose", endDate   + " 23:59:59");
    }
    const { data: rows, error } = await q;
    queryFailed = !!error;
    if (!error && rows) {
      // Run the JS group AND strip isPaid so the merge step below remains
      // uniform across both paths.
      const tmp = groupByContainer(rows as Row[], new Set<string>());
      groupedNoPaid = tmp.map(({ isPaid: _isPaid, ...rest }) => rest);
    }
  } else {
    // Happy path — RPC available + returned pre-aggregated rows.
    groupedNoPaid = ((rpcRes.data ?? []) as RpcSummary[]).map((r) => ({
      fcabinetnumber:      r.fcabinetnumber,
      fwarehousename:      r.fwarehousename ?? "",
      fdatecontainerclose: r.fdatecontainerclose,
      fdatestatus4:        r.latest_fdatestatus4,
      ftransporttype:      r.ftransporttype ?? "",
      // fstatus is a per-row attribute · with aggregation we surface the
      // bucket label as a stand-in for the table renderer (it only uses
      // fstatus to determine the bucket).
      fstatus:             isWaiting ? "1" : "7",
      trackCount:          Number(r.row_count ?? 0),
      volumeSum:           Number(r.sum_volume ?? 0),
      weightSum:           Number(r.sum_weight ?? 0),
      costSum:             Number(r.sum_cost ?? 0),
      priceSum:            Number(r.sum_price ?? 0),
    }));
  }

  // Wave 21 P2 Phase A: scope tb_cnt_item fetch to ONLY the cabinet numbers
  // visible on this page instead of pulling the entire join table. Per survey
  // docs/research/wave-21-p2-query-survey.md §4 — only ~30-100 distinct
  // containers render at once, so a full-table fetch is wasteful. Saves
  // ~200-500ms per page-load + smaller wire payload.
  const visibleCabs = Array.from(
    new Set(groupedNoPaid.map((r) => r.fcabinetnumber).filter(Boolean)),
  );
  let paidSet = new Set<string>();
  if (visibleCabs.length > 0) {
    const { data: paidRows, error: paidRowsErr } = await admin
      .from("tb_cnt_item")
      .select("fCabinetNumber")
      .in("fCabinetNumber", visibleCabs);
    if (paidRowsErr) {
      console.error(`[tb_cnt_item list] failed`, { code: paidRowsErr.code, message: paidRowsErr.message });
    }
    paidSet = new Set((paidRows ?? []).map((r) => (r as { fCabinetNumber: string }).fCabinetNumber));
  }

  let grouped: Grouped[] = queryFailed
    ? []
    : groupedNoPaid.map((g) => ({ ...g, isPaid: paidSet.has(g.fcabinetnumber) }));

  if (actionPay === "1") grouped = grouped.filter((g) => !g.isPaid);
  if (actionPay === "2") grouped = grouped.filter((g) =>  g.isPaid);

  // Wave 17 ux-fix: totals computation moved to <CntListTable> client
  // component (alongside rendering) — keeps the server query minimal.

  // Header counts (independent of date filter — match legacy)
  const counts = await loadHeaderCounts(admin, startDate, endDate);

  return (
    <>
      <TopMenuReport activeHref="/admin/report-cnt" />
      <main className="p-4 lg:p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · WAREHOUSE</p>
          <h1 className="mt-1 text-2xl font-bold">รายงานตู้</h1>
          <p className="text-sm text-muted">
            กลุ่มตามหมายเลขตู้ (fCabinetNumber) — รวมจาก tb_forwarder
          </p>
        </div>

        {/* Tab: รอเข้าโกดังไทย / เข้าโกดังไทยแล้ว */}
        <div className="flex gap-1 border-b border-border">
          <TabLink href="/admin/report-cnt?page=waiting" active={isWaiting} count={counts.waiting}>
            รอเข้าโกดังไทย
          </TabLink>
          <TabLink href="/admin/report-cnt?page=succeed" active={!isWaiting} count={counts.succeed}>
            เข้าโกดังไทยแล้ว
          </TabLink>
        </div>

        {/* Search form — only on succeed page */}
        {!isWaiting && (
          <form className="flex flex-wrap items-end gap-2 text-xs" method="GET" action="/admin/report-cnt">
            <input type="hidden" name="page" value="succeed" />
            <label className="flex flex-col gap-1">
              <span className="text-muted">วันที่ถึงไทย</span>
              <input
                type="text"
                name="date"
                defaultValue={`${startDate} - ${endDate}`}
                placeholder="YYYY-MM-DD - YYYY-MM-DD"
                className="rounded-md border border-border px-2 py-1 w-56"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted">การจ่ายเงินตู้</span>
              <select name="actionPay" defaultValue={actionPay} className="rounded-md border border-border px-2 py-1">
                <option value="all">ทั้งหมด</option>
                <option value="1">ยังไม่จ่าย</option>
                <option value="2">จ่ายแล้ว</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-muted">ประเภทการขนส่ง</span>
              <select name="transportType" defaultValue={transportType} className="rounded-md border border-border px-2 py-1">
                <option value="all">ทั้งหมด</option>
                <option value="1">ทางรถ</option>
                <option value="2">ทางเรือ</option>
              </select>
            </label>
            <input type="hidden" name="historyTable" value="1" />
            <button type="submit" className="rounded-md border border-primary-500 bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600">
              ค้นหาข้อมูล
            </button>
            <span className="text-[11px] text-muted ml-1">
              {sp.historyTable
                ? `ผลลัพธ์การค้นหา ตั้งแต่: ${startDate} – ${endDate}`
                : "ผลลัพธ์การค้นหาย้อนหลัง 90 วัน"}
            </span>
          </form>
        )}

        {/* Transport-mode tabs */}
        <div className="flex gap-1 border-b border-border">
          <TabLink
            href={buildHref(sp, { transportType: "all" })}
            active={transportType === "all"}
            count={counts.transportAll(isWaiting)}
          >🚛🚢 ทั้งหมด</TabLink>
          <TabLink
            href={buildHref(sp, { transportType: "1" })}
            active={transportType === "1"}
            count={counts.transportTruck(isWaiting)}
          >🚛 ทางรถ</TabLink>
          <TabLink
            href={buildHref(sp, { transportType: "2" })}
            active={transportType === "2"}
            count={counts.transportShip(isWaiting)}
          >🚢 ทางเรือ</TabLink>
        </div>

        {queryFailed && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ — ทั้ง RPC <code>get_container_summary</code> และ fallback ดึงตู้ไม่ได้
          </div>
        )}

        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center text-sm text-muted">
            ไม่มีตู้ที่ตรงกับ filter
          </div>
        ) : (
          /* Wave 17 fix (2026-05-25 ค่ำ): table moved to <CntListTable>
             (client component) so admin can tick containers + open the
             "ทำรายการเบิกเงินค่าตู้" modal inline — matching the legacy
             AJAX flow at report-cnt.php L502-505. Old fixed-bottom Link
             that navigated to /admin/report-cnt/pay is replaced by the
             client component's floating bar. */
          <CntListTable
            rows={grouped as CntListRow[]}
            showMoney={showMoney}
            isWaiting={isWaiting}
            warehouseLabel={WAREHOUSE_LABEL}
            transportLabel={TRANSPORT_LABEL}
          />
        )}
        {/* Wave 17 fix (2026-05-25 ค่ำ): the fixed-bottom action buttons
            ("ทำรายการเบิกเงินค่าตู้" + "ประวัติรายการ") are now rendered
            inside <CntListTable> so they only show on the succeed tab and
            wire up to the per-row checkbox selection (matching the legacy
            AJAX flow at report-cnt.php L502-505). No more navigating to
            /admin/report-cnt/pay — the modal opens inline. */}
      </main>
    </>
  );
}

function TabLink({ href, active, count, children }: { href: string; active: boolean; count: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1 px-3 py-2 text-sm font-medium border-b-2 ${
        active ? "border-primary-500 text-primary-700" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      <span>{children}</span>
      {count > 0 && (
        <span className="inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5">
          {count}
        </span>
      )}
    </Link>
  );
}

function buildHref(sp: SP, overrides: Partial<SP>): string {
  const params = new URLSearchParams();
  const merged: Partial<SP> = { ...sp, ...overrides };
  Object.entries(merged).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return `/admin/report-cnt${params.toString() ? "?" + params.toString() : ""}`;
}

async function loadHeaderCounts(
  admin: ReturnType<typeof createAdminClient>,
  startDate: string,
  endDate: string,
): Promise<{
  waiting: number;
  succeed: number;
  transportAll:   (isWaiting: boolean) => number;
  transportTruck: (isWaiting: boolean) => number;
  transportShip:  (isWaiting: boolean) => number;
}> {
  // 2026-06-06 (ภูม B2 fix · save-point 2026-06-05 late-PM):
  //   The old `count: "exact"` queries counted ROWS — wrong for the badge,
  //   which represents distinct CABINETS. Replace with the RPC
  //   `count_distinct_cabinets` (migration 0146 · same filter semantics).
  //
  // Concrete fix: succeed badge went from 46,339 ROWS → 5,603 CABINETS
  // (8.3× lower) · waiting badge went from 283 ROWS → 32 CABINETS (8.8×).
  // พี่ป๊อป + ภูม no longer think workload is 8× larger than reality.
  //
  // Graceful fallback: if the RPC doesn't exist yet (migration 0146 not
  // applied), each call returns null and we fall through to the original
  // row-count query so the page never breaks. The fallback is the legacy
  // over-count behaviour, so this can ship safely before the migration apply.
  async function rpcDistinct(
    page: "waiting" | "succeed",
    transport?: string,
  ): Promise<number | null> {
    const { data, error } = await admin.rpc("count_distinct_cabinets", {
      p_page:      page,
      p_transport: transport ?? null,
      p_start:     (page === "succeed" && startDate) ? startDate : null,
      p_end:       (page === "succeed" && endDate)   ? endDate   : null,
    });
    if (error) {
      // Fail-safe — log + signal fallback path. Most common reason during
      // rollout: migration 0146 not applied yet.
      console.warn(
        "[count_distinct_cabinets RPC] failed → falling back to row-count",
        { code: error.code, message: error.message },
      );
      return null;
    }
    return Number(data ?? 0);
  }

  // Original row-count path — kept verbatim as the fallback for when the
  // RPC isn't available yet (e.g. migration 0146 still pending apply).
  async function countWaitingRowsFallback(transportType?: string): Promise<number> {
    let q = admin
      .from("tb_forwarder")
      .select("fcabinetnumber", { count: "exact", head: true })
      .not("fcabinetnumber", "is", null)
      .neq("fcabinetnumber", "")
      .neq("fcabinetnumber", "0")
      .lt("fstatus", "4");
    if (transportType) q = q.eq("ftransporttype", transportType);
    const r = await q;
    return r.count ?? 0;
  }
  async function countSucceedRowsFallback(transportType?: string): Promise<number> {
    let q = admin
      .from("tb_forwarder")
      .select("fcabinetnumber", { count: "exact", head: true })
      .not("fcabinetnumber", "is", null)
      .neq("fcabinetnumber", "")
      .neq("fcabinetnumber", "0")
      .gt("fstatus", "3");
    if (transportType) q = q.eq("ftransporttype", transportType);
    if (startDate && endDate) {
      q = q.gte("fdatecontainerclose", startDate + " 00:00:00").lte("fdatecontainerclose", endDate + " 23:59:59");
    }
    const r = await q;
    return r.count ?? 0;
  }

  async function countWaiting(transportType?: string): Promise<number> {
    const v = await rpcDistinct("waiting", transportType);
    return v ?? (await countWaitingRowsFallback(transportType));
  }
  async function countSucceed(transportType?: string): Promise<number> {
    const v = await rpcDistinct("succeed", transportType);
    return v ?? (await countSucceedRowsFallback(transportType));
  }

  const [waitingAll, waitingTruck, waitingShip, succeedAll, succeedTruck, succeedShip] = await Promise.all([
    countWaiting(),
    countWaiting("1"),
    countWaiting("2"),
    countSucceed(),
    countSucceed("1"),
    countSucceed("2"),
  ]);

  return {
    waiting:        waitingAll,
    succeed:        succeedAll,
    transportAll:   (isWaiting) => isWaiting ? waitingAll   : succeedAll,
    transportTruck: (isWaiting) => isWaiting ? waitingTruck : succeedTruck,
    transportShip:  (isWaiting) => isWaiting ? waitingShip  : succeedShip,
  };
}

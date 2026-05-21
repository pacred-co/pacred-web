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

// Legacy statusForwarderBadge() — fStatus 1..7
const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  "1": { label: "รอตรวจสอบ",       cls: "bg-yellow-100 text-yellow-700" },
  "2": { label: "เตรียมส่ง",      cls: "bg-blue-100 text-blue-700" },
  "3": { label: "กำลังส่งมาไทย",  cls: "bg-pink-100 text-pink-700" },
  "4": { label: "ถึงไทย",          cls: "bg-purple-100 text-purple-700" },
  "5": { label: "กำลังส่งให้",    cls: "bg-amber-100 text-amber-700" },
  "6": { label: "สำเร็จ",          cls: "bg-green-100 text-green-700" },
  "7": { label: "ยกเลิก",          cls: "bg-gray-100 text-gray-700" },
};

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

function diffDateNow(closeDate: string | null): string {
  if (!closeDate) return "-";
  const d = new Date(closeDate);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  return `${days} วัน`;
}

function diffDateCNT(closeDate: string | null, arrivedDate: string | null): string {
  if (!closeDate || !arrivedDate) return "-";
  const c = new Date(closeDate);
  const a = new Date(arrivedDate);
  const days = Math.floor((a.getTime() - c.getTime()) / 86_400_000);
  return `${days} วัน`;
}

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

  // Pull tb_forwarder rows matching the page+filter combination. The
  // legacy GROUP BY fCabinetNumber is applied client-side because
  // PostgREST cannot return SUM/COUNT aggregates without an RPC.
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

  // Pull paid container codes (tb_cnt_item is the join table; presence = paid)
  const { data: paidRows } = await admin.from("tb_cnt_item").select("fcabinetnumber").limit(50_000);
  const paidSet = new Set((paidRows ?? []).map((r) => r.fcabinetnumber as string));

  let grouped: Grouped[] = error || !rows ? [] : groupByContainer(rows as Row[], paidSet);

  if (actionPay === "1") grouped = grouped.filter((g) => !g.isPaid);
  if (actionPay === "2") grouped = grouped.filter((g) =>  g.isPaid);

  // Aggregate totals row
  const total = grouped.reduce(
    (acc, g) => ({
      trackCount: acc.trackCount + g.trackCount,
      volumeSum:  acc.volumeSum  + g.volumeSum,
      weightSum:  acc.weightSum  + g.weightSum,
      costSum:    acc.costSum    + g.costSum,
      priceSum:   acc.priceSum   + g.priceSum,
      profitSum:  acc.profitSum  + (g.priceSum - g.costSum),
    }),
    { trackCount: 0, volumeSum: 0, weightSum: 0, costSum: 0, priceSum: 0, profitSum: 0 },
  );

  // Header counts (independent of date filter — match legacy)
  const counts = await loadHeaderCounts(admin, startDate, endDate);

  return (
    <>
      <TopMenuReport activeHref="/admin/report-cnt" />
      <main className="p-4 lg:p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN · WAREHOUSE</p>
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

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            โหลดข้อมูลไม่สำเร็จ: {error.message}
          </div>
        )}

        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-12 text-center text-sm text-muted">
            ไม่มีตู้ที่ตรงกับ filter
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">หมายเลขตู้</th>
                  <th className="px-2 py-2 text-left">โกดัง</th>
                  <th className="px-2 py-2 text-left">วันที่ปิดตู้</th>
                  <th className="px-2 py-2 text-center">ขนส่ง</th>
                  <th className="px-2 py-2 text-right">{isWaiting ? "รอเข้าโกดัง" : "เดินทาง"}</th>
                  <th className="px-2 py-2 text-right">{isWaiting ? "วันที่รอเข้าโกดัง" : "วันที่เดินทาง"}</th>
                  <th className="px-2 py-2 text-right">จำนวนแทรคกิ้ง</th>
                  <th className="px-2 py-2 text-right">ปริมาตร</th>
                  <th className="px-2 py-2 text-right">น้ำหนัก</th>
                  {showMoney && <th className="px-2 py-2 text-right">ต้นทุนตู้</th>}
                  {showMoney && <th className="px-2 py-2 text-right">ราคาขาย</th>}
                  {showMoney && <th className="px-2 py-2 text-right">กำไร</th>}
                  <th className="px-2 py-2 text-center">สถานะตู้</th>
                  <th className="px-2 py-2 text-center">สถานะจ่ายค่าตู้</th>
                </tr>
              </thead>
              <tbody>
                {/* Totals row (bg-color in legacy) */}
                <tr className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-medium">
                  <td className="px-2 py-2" colSpan={6}>รวม ({grouped.length} ตู้)</td>
                  <td className="px-2 py-2 text-right">{total.trackCount.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{total.volumeSum.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right">{total.weightSum.toFixed(2)}</td>
                  {showMoney && <td className="px-2 py-2 text-right">{total.costSum.toFixed(2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{total.priceSum.toFixed(2)}</td>}
                  {showMoney && <td className="px-2 py-2 text-right">{total.profitSum.toFixed(2)}</td>}
                  <td className="px-2 py-2" colSpan={2}></td>
                </tr>
                {grouped.map((g) => {
                  const badge = STATUS_BADGE[g.fstatus] ?? { label: g.fstatus, cls: "bg-gray-100" };
                  return (
                    <tr key={g.fcabinetnumber} className={`border-t border-border ${g.isPaid ? "bg-green-50/30" : ""}`}>
                      <td className="px-2 py-2 font-mono">
                        <Link href={`/admin/report-cnt?id=${encodeURIComponent(g.fcabinetnumber)}`} className="text-primary-600 hover:underline">
                          {g.fcabinetnumber}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{WAREHOUSE_LABEL[g.fwarehousename] ?? g.fwarehousename}</td>
                      <td className="px-2 py-2 text-right">
                        {g.fdatecontainerclose ? g.fdatecontainerclose.slice(0, 10) : "-"}
                      </td>
                      <td className="px-2 py-2 text-center">{TRANSPORT_LABEL[g.ftransporttype] ?? g.ftransporttype}</td>
                      <td className="px-2 py-2 text-right">
                        {isWaiting ? diffDateNow(g.fdatecontainerclose) : diffDateCNT(g.fdatecontainerclose, g.fdatestatus4)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {g.fdatestatus4 ? g.fdatestatus4.slice(0, 10) : "-"}
                      </td>
                      <td className="px-2 py-2 text-right">{g.trackCount.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right">{g.volumeSum.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">{g.weightSum.toFixed(2)}</td>
                      {showMoney && <td className="px-2 py-2 text-right">{g.costSum.toFixed(2)}</td>}
                      {showMoney && <td className="px-2 py-2 text-right">{g.priceSum.toFixed(2)}</td>}
                      {showMoney && <td className="px-2 py-2 text-right">{(g.priceSum - g.costSum).toFixed(2)}</td>}
                      <td className="px-2 py-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-2 py-2 text-center">
                        {g.isPaid ? (
                          <span className="inline-block rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px]">จ่ายแล้ว</span>
                        ) : (
                          <span className="inline-block rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px]">ยังไม่จ่าย</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Action buttons — only visible to money-tier roles.
            Faithful port of `report-cnt.php` L502-505 — the fixed-bottom
            "ทำรายการจ่ายเงินตู้" + "ประวัติรายการจ่ายเงินตู้" pair. */}
        {showMoney && (
          <div className="pcs-safe-area-bottom fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-50">
            <Link
              href="/admin/report-cnt/pay"
              className="rounded-full bg-green-600 text-white px-4 py-2 text-xs font-medium shadow-lg hover:bg-green-700"
            >
              ทำรายการจ่ายเงินตู้
            </Link>
            <Link
              href="/admin/cnt-hs"
              className="rounded-full bg-primary-500 text-white px-4 py-2 text-xs font-medium shadow-lg hover:bg-primary-600"
            >
              ประวัติรายการจ่ายเงินตู้
            </Link>
          </div>
        )}
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
  // Run 6 count queries in parallel. We avoid building a typed
  // helper closure (the Supabase builder return type compounds and
  // trips TS2589 "type instantiation excessively deep"); instead
  // each query is its own expression and we treat results uniformly.
  async function countWaiting(transportType?: string): Promise<number> {
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
  async function countSucceed(transportType?: string): Promise<number> {
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

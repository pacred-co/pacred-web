"use server";

/**
 * Export-all (CSV) for /admin/report-cnt — รายงานตู้ (container summary).
 *
 * The page (app/[locale]/(admin)/admin/report-cnt/page.tsx) groups tb_forwarder
 * by fCabinetNumber via the `get_container_summary` RPC (migration 0146 ·
 * GROUP BY + SUM server-side), then joins tb_cnt_item for the จ่ายแล้ว/ยังไม่จ่าย
 * flag and applies the page/transport/date-range/actionPay filters. The RPC
 * already returns ALL distinct cabinets (it does NOT .range-paginate), so the
 * on-screen "⬇ CSV หน้านี้" already covers the full filtered result.
 *
 * This action backs the 2nd "⬇ CSV ทั้งหมด" button. Because the page is NOT
 * paginated, the rows it returns are byte-identical to the on-screen export —
 * the value of the "ทั้งหมด" path here is the admin_export_log audit trail (PII:
 * cabinet workload + MONEY: cost/price/profit columns — owner directive
 * 2026-06-07). The export path NEVER drifts from the page because it re-runs the
 * IDENTICAL RPC + IDENTICAL fallback + IDENTICAL join + IDENTICAL filters +
 * IDENTICAL column mapping (including the `showMoney` role gate).
 *
 * DRIFT-FREE (AGENTS rule A): the page builds `grouped` + `csvRows` INLINE (no
 * shared paginated fetch to parameterize), so this helper REPLICATES the page's
 * pipeline step-for-step. The ONLY thing missing is pagination — and there is
 * none on the page, so there is nothing to lift.
 *
 * COLUMN-IDENTICAL (AGENTS rule B): the CSV row keys + value mapping mirror the
 * page's csvRows 1:1, and the money columns (ต้นทุนรวม / ราคาขายรวม / กำไร) are
 * included ONLY when `showMoney` is true — the SAME gate the page applies.
 *
 * PLACEMENT (AGENTS rule D): new co-located file; the page wires it via an
 * inline "use server" closure capturing isWaiting/transportType/actionPay/
 * startDate/endDate + showMoney. Does NOT touch csv-button.tsx / export-log.ts /
 * leads.* / any other surface.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors leads EXPORT_CAP).
// The full container universe is ~5,603 cabinets — comfortably under 10k — but
// the fallback 50k-row tb_forwarder pull is also bounded by the page's own
// .limit(50_000). The aggregated cabinet count is what the export caps on.
const EXPORT_CAP = 10000;

// Mirror of the page's WAREHOUSE_LABEL (legacy nameWarehouse()).
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
};

// Mirror of the page's TRANSPORT_LABEL (legacy nameTransportType2()).
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚛 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ",
};

// Mirror of the page's `Row` shape (fallback 50k-row path).
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

// Mirror of the page's `Grouped` shape.
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
  isPaid: boolean;
};

// Mirror of the page's `RpcSummary` shape.
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

// Mirror of the page's groupByContainer() (used only on the fallback path).
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
    if (!a.fdatecontainerclose) return 1;
    if (!b.fdatecontainerclose) return -1;
    return b.fdatecontainerclose.localeCompare(a.fdatecontainerclose);
  });
}

export type ReportCntExportFilter = {
  isWaiting: boolean;
  transportType: string; // 'all' | '1' | '2' | '3'
  actionPay: string;     // 'all' | '1' (ยังไม่จ่าย) | '2' (จ่ายแล้ว)
  startDate: string;     // 'YYYY-MM-DD' (succeed page only)
  endDate: string;       // 'YYYY-MM-DD' (succeed page only)
  showMoney: boolean;    // page's role-gated money-column flag (passed in)
};

/**
 * Export the entire filtered container summary as CSV rows. Re-runs the page's
 * EXACT pipeline (RPC + fallback + tb_cnt_item join + actionPay filter + column
 * mapping with the showMoney gate) and writes an admin_export_log audit row.
 */
export async function exportReportCntAll(
  filter: ReportCntExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same role gate as the page (super · ops · accounting · warehouse).
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);

  const { isWaiting, transportType, actionPay, startDate, endDate, showMoney } = filter;
  const admin = createAdminClient();

  let groupedNoPaid: Omit<Grouped, "isPaid">[] = [];
  let queryFailed = false;

  // ── Step 1: the RPC (IDENTICAL params to the page) ──
  const rpcRes = await admin.rpc("get_container_summary", {
    p_page:      isWaiting ? "waiting" : "succeed",
    p_transport: ["1", "2", "3"].includes(transportType) ? transportType : null,
    p_start:     (!isWaiting && startDate) ? startDate : null,
    p_end:       (!isWaiting && endDate)   ? endDate   : null,
  });

  if (rpcRes.error) {
    console.warn(
      "[exportReportCntAll get_container_summary RPC] failed → falling back to 50k-row pull",
      { code: rpcRes.error.code, message: rpcRes.error.message },
    );
    // ── Fallback: the page's legacy 50k-row pull (IDENTICAL filters) ──
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
    if (transportType === "3") q = q.eq("ftransporttype", "3");
    if (!isWaiting && startDate && endDate) {
      q = q.gte("fdatecontainerclose", startDate + " 00:00:00")
           .lte("fdatecontainerclose", endDate   + " 23:59:59");
    }
    const { data: rows, error } = await q;
    queryFailed = !!error;
    if (error) {
      console.error(`[exportReportCntAll tb_forwarder fallback] failed`, { code: error.code, message: error.message });
    }
    if (!error && rows) {
      const tmp = groupByContainer(rows as Row[], new Set<string>());
      groupedNoPaid = tmp.map(({ isPaid: _isPaid, ...rest }) => rest);
    }
  } else {
    // ── Happy path — RPC pre-aggregated rows (IDENTICAL mapping to the page) ──
    groupedNoPaid = ((rpcRes.data ?? []) as RpcSummary[]).map((r) => ({
      fcabinetnumber:      r.fcabinetnumber,
      fwarehousename:      r.fwarehousename ?? "",
      fdatecontainerclose: r.fdatecontainerclose,
      fdatestatus4:        r.latest_fdatestatus4,
      ftransporttype:      r.ftransporttype ?? "",
      fstatus:             isWaiting ? "1" : "7",
      trackCount:          Number(r.row_count ?? 0),
      volumeSum:           Number(r.sum_volume ?? 0),
      weightSum:           Number(r.sum_weight ?? 0),
      costSum:             Number(r.sum_cost ?? 0),
      priceSum:            Number(r.sum_price ?? 0),
    }));
  }

  // ── Step 2: join tb_cnt_item for isPaid (IDENTICAL to the page) ──
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
      console.error(`[exportReportCntAll tb_cnt_item] failed`, { code: paidRowsErr.code, message: paidRowsErr.message });
    }
    paidSet = new Set((paidRows ?? []).map((r) => (r as { fCabinetNumber: string }).fCabinetNumber));
  }

  let grouped: Grouped[] = queryFailed
    ? []
    : groupedNoPaid.map((g) => ({ ...g, isPaid: paidSet.has(g.fcabinetnumber) }));

  // ── Step 3: the actionPay filter (IDENTICAL to the page) ──
  if (actionPay === "1") grouped = grouped.filter((g) => !g.isPaid);
  if (actionPay === "2") grouped = grouped.filter((g) =>  g.isPaid);

  // Honest truncation flag on the aggregated cabinet count.
  const truncated = grouped.length > EXPORT_CAP;
  if (truncated) grouped = grouped.slice(0, EXPORT_CAP);

  // ── Step 4: map to CSV rows — IDENTICAL keys/labels/value-mapping + showMoney gate ──
  const rows: CsvRow[] = grouped.map((g) => {
    const profit = g.priceSum - g.costSum;
    return {
      "หมายเลขตู้":        g.fcabinetnumber,
      "โกดัง":             WAREHOUSE_LABEL[g.fwarehousename] ?? g.fwarehousename,
      "ขนส่ง":             TRANSPORT_LABEL[g.ftransporttype] ?? g.ftransporttype,
      "วันที่ปิดตู้":       g.fdatecontainerclose ?? "",
      "วันที่ถึงไทย":       g.fdatestatus4 ?? "",
      "จำนวนแทร็คกิ้ง":    g.trackCount,
      "ปริมาตรรวม (CBM)":  g.volumeSum.toFixed(4),
      "น้ำหนัก (KG)":      g.weightSum.toFixed(2),
      ...(showMoney ? {
        "ต้นทุนรวม":  g.costSum.toFixed(2),
        "ราคาขายรวม": g.priceSum.toFixed(2),
        "กำไร":      profit.toFixed(2),
      } : {}),
      "สถานะจ่ายค่าตู้":   g.isPaid ? "จ่ายแล้ว" : "ยังไม่จ่าย",
    };
  });

  await logAdminExport({
    dataset: "report-cnt",
    filters: {
      page: isWaiting ? "waiting" : "succeed",
      transportType,
      actionPay,
      startDate: !isWaiting ? startDate : "",
      endDate: !isWaiting ? endDate : "",
      showMoney,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

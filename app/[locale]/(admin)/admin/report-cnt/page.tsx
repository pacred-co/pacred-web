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
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { Truck } from "lucide-react";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
// Faithful legacy report-cnt.php look (ปอน's theme · scoped .pcs-rc) — reused from the
// detail page so the LIST header/tabs get the same dashed-red-pill frame + colors.
import "./[fNo]/legacy-report-cnt.css";
import { Explain } from "@/components/ui/tooltip";
import { exportReportCntAll } from "@/actions/admin/export/report-cnt";
import { CntListTable, type CntListRow } from "./cnt-list-table";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { isContainerInBucket } from "@/lib/admin/report-cnt-bucket";
import { resolvePackingConfirmedCabs } from "@/lib/admin/packing-confirmed-cabs";
import {
  getContainerCompletenessBatch,
  type ContainerCompleteness,
} from "@/lib/warehouse/container-completeness";
import {
  resolveMomoContainerInfo,
  type MomoContainerInfo,
} from "@/lib/admin/momo-container-resolve";

export const dynamic = "force-dynamic";

type SP = {
  page?: string;          // 'waiting' (default) | 'succeed'
  transportType?: string; // 'all' (default) | '1' (รถ) | '2' (เรือ)
  actionPay?: string;     // 'all' (default) | '1' (ยังไม่จ่าย) | '2' (จ่ายแล้ว)
  date?: string;          // 'YYYY-MM-DD-YYYY-MM-DD' (for succeed page)
  historyTable?: string;  // present when user submits date range form
  /** CSV ของเลขตู้ที่จะติ๊กให้ล่วงหน้า — มาจากหน้า "ลงต้นทุนจากใบแจ้งหนี้ MOMO"
   *  (แพทเทิร์นเดียวกับ billing-run/add?cabinet= · customs-doc?cabinet=).
   *  prod verified 2026-07-17: ไม่มีเลขตู้ไหนมี comma/space → CSV ปลอดภัย. */
  cabinet?: string;
  /** เลขที่ใบแจ้งหนี้ MOMO ที่พามา — โชว์เป็น context ว่ากำลังจ่ายรอบไหน. */
  invoice?: string;
};

// Legacy nameWarehouse() — fWarehouseName int → display name
// โกดัง = the freight OPERATOR (fwarehousename). "8" = MOMO (กวางโจว route),
// "9" = TTW (อี้อู/Yiwu route · owner 2026-07-18: "ถ้ามาจากทาง อี้อู ตอนนี้เราใช้ TTW
// ไม่ใช่ MOMO"). The origin CITY (กวางโจว/อี้อู) is a SEPARATE axis = fwarehousechina,
// shown in the new "POD ต้นทาง" column via WAREHOUSE_CHINA_LABEL below.
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO", "9": "TTW",
};

// POD ต้นทาง = origin warehouse CITY (fwarehousechina). Matches the detail
// page's WAREHOUSE_CHINA_LABEL so list ↔ detail agree (owner 2026-07-18 "เพิ่ม
// คอลัมน์ POD ต้นทาง เป็น กวางโจว หรือ อี้อู").
const WAREHOUSE_CHINA_LABEL: Record<string, string> = { "1": "กวางโจว", "2": "อี้อู" };

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
  fwarehousechina: string;
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
  fwarehousechina: string; // origin CITY code (1=กวางโจว · 2=อี้อู) → POD ต้นทาง column
  fdatecontainerclose: string | null;
  fdatestatus4: string | null;
  ftransporttype: string;
  fstatus: string;    // MIN(fstatus) — representative display status (least-advanced)
  maxFstatus: string; // MAX(fstatus) — drives the tab BUCKET (0261 "any arrived")
  trackCount: number;
  volumeSum: number;
  weightSum: number;
  costSum: number;
  priceSum: number;
  isPaid: boolean; // join into tb_cnt_item — has payment record
};

// T/T (transit time) for the CSV — ETA − ETD in whole days (owner ภูม 2026-06-20).
// Mirrors cnt-list-table.tsx::transitTT. "" when either date is missing/invalid.
function transitDaysCsv(etd: string | null, eta: string | null): string {
  if (!etd || !eta) return "";
  const e = new Date(etd.slice(0, 10)).getTime();
  const a = new Date(eta.slice(0, 10)).getTime();
  if (!Number.isFinite(e) || !Number.isFinite(a)) return "";
  const d = Math.round((a - e) / 86_400_000);
  return d >= 0 ? String(d) : "";
}

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
      // 0189 fix: container status = MIN(fstatus) across its trackings (the
      // least-advanced = the true overall stage), matching the RPC path. Was:
      // kept the FIRST row's fstatus → arbitrary/wrong. Ignore empty/null on
      // BOTH sides so a blank first row can't pin the MIN (true SQL MIN).
      if (r.fstatus && (!existing.fstatus || r.fstatus < existing.fstatus)) existing.fstatus = r.fstatus;
      // 0261: MAX(fstatus) = most-advanced tracking → drives the tab BUCKET
      // ("any arrived" · owner 2026-07-18). Ignore empty so blanks can't pin it.
      if (r.fstatus && r.fstatus > existing.maxFstatus) existing.maxFstatus = r.fstatus;
      // Keep the most recent fdatestatus4 / fdatecontainerclose (legacy emits any)
      if (r.fdatestatus4 && (!existing.fdatestatus4 || r.fdatestatus4 > existing.fdatestatus4)) {
        existing.fdatestatus4 = r.fdatestatus4;
      }
    } else {
      byContainer.set(k, {
        fcabinetnumber: k,
        fwarehousename: r.fwarehousename,
        fwarehousechina: r.fwarehousechina ?? "",
        fdatecontainerclose: r.fdatecontainerclose,
        fdatestatus4: r.fdatestatus4,
        ftransporttype: r.ftransporttype,
        fstatus: r.fstatus,
        maxFstatus: r.fstatus ?? "",
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
  // ?cabinet=A,B → ติ๊กตู้ให้ล่วงหน้า (มาจากหน้าลงต้นทุนใบแจ้งหนี้ MOMO). display-only:
  // แค่ seed การติ๊ก — ไม่กรองรายการ ไม่แตะเงิน · ตู้ที่จ่ายแล้วจะถูก <CntListTable> ตัดออกเอง
  // (selectableRows filter !isPaid) → พาไปติ๊กตู้ที่จ่ายแล้วไม่ได้.
  const preselectCabinets = (sp.cabinet ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Money-column visibility (owner · mig 0189: super loses money internals).
  // Cost/price/profit are visible ONLY to ultra/accounting/pricing — super, ops
  // and warehouse see the list but NOT cost/price/profit. canViewCostProfit
  // EXCLUDES super by design.
  const showMoney = canViewCostProfit(roles);

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
    // 0189 (2026-06-18): the real per-cabinet status. min_fstatus = the
    // least-advanced tracking = the container's true overall stage. Optional
    // because prod runs the OLD 0146 RPC until เดฟ applies 0189 (the page
    // falls back to a safe physical-milestone default below).
    min_fstatus?:         string | null;
    max_fstatus?:         string | null;
  };

  let groupedNoPaid: Omit<Grouped, "isPaid">[] = [];
  let queryFailed = false;

  const rpcRes = await admin.rpc("get_container_summary", {
    p_page:      isWaiting ? "waiting" : "succeed",
    p_transport: ["1", "2", "3"].includes(transportType) ? transportType : null,
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
        "fwarehousename,fwarehousechina,fdatestatus4,fstatus,fcabinetnumber,fdatecontainerclose,ftransporttype,fvolume,fweight,fcosttotalprice,ftotalprice",
      )
      .not("fcabinetnumber", "is", null)
      .neq("fcabinetnumber", "")
      .neq("fcabinetnumber", "0")
      .neq("fstatus", "99") // 0190: drop cancelled containers (parity with the RPC)
      .limit(50_000);
    // 0243: NO row-level fstatus bucket here — fetch ALL non-99 rows of the
    // matching cabinets, then bucket by the CONTAINER-WIDE MIN(fstatus) after
    // grouping (below), matching the RPC's HAVING MIN. The <>'99', transport +
    // succeed-date filters still apply at the row level (parity with the RPC).
    if (transportType === "1") q = q.eq("ftransporttype", "1");
    if (transportType === "2") q = q.eq("ftransporttype", "2");
    if (transportType === "3") q = q.eq("ftransporttype", "3");
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
      // 0261: container-level bucket by MAX(fstatus) — "any arrived". groupByContainer
      // folds the container-wide max into g.maxFstatus (skipping empty/null), so a
      // cabinet is in exactly ONE tab — mixed cabinets no longer double-list.
      // Same predicate as the RPC's HAVING (isContainerInBucket = shared SOT).
      const page = isWaiting ? "waiting" : "succeed";
      const bucketed = tmp.filter((g) => isContainerInBucket(g.maxFstatus ?? "", page));
      groupedNoPaid = bucketed.map(({ isPaid: _isPaid, ...rest }) => rest);
    }
  } else {
    // Happy path — RPC available + returned pre-aggregated rows.
    groupedNoPaid = ((rpcRes.data ?? []) as RpcSummary[]).map((r) => ({
      fcabinetnumber:      r.fcabinetnumber,
      fwarehousename:      r.fwarehousename ?? "",
      fwarehousechina:     "", // RPC doesn't aggregate origin → filled by the podByCab map below
      fdatecontainerclose: r.fdatecontainerclose,
      fdatestatus4:        r.latest_fdatestatus4,
      ftransporttype:      r.ftransporttype ?? "",
      // 0189 fix (2026-06-18 · ภูม/พี่ป๊อป "สถานะตู้มั่ว"): show the REAL
      // representative status — MIN(fstatus) across the cabinet's trackings
      // (the least-advanced one = the container's true stage). The old code
      // HARDCODED `isWaiting ? '1' : '7'`, so a freshly scan-arrived container
      // (fstatus 4 = ถึงไทยแล้ว) wrongly read "ส่งแล้ว" (7). Fallback when the
      // RPC predates 0189 (prod, until เดฟ applies): the safe physical
      // milestone — waiting → 1 (รอเข้าโกดังจีน), succeed → 4 (ถึงไทยแล้ว) —
      // which ALREADY fixes the headline complaint (never a false "ส่งแล้ว").
      fstatus:             r.min_fstatus ?? (isWaiting ? "1" : "4"),
      // 0261: MAX drives the bucket; the RPC already bucketed via HAVING MAX, so
      // this is carried for parity only. Fallback: succeed → '4', waiting → '1'.
      maxFstatus:          r.max_fstatus ?? (isWaiting ? "1" : "4"),
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

  // POD ต้นทาง (origin city) per container — the RPC only aggregates fwarehousename
  // (operator), not fwarehousechina (origin). One cheap scoped read of the visible
  // cabinets fills it (owner 2026-07-18: "เพิ่มคอลัมน์ POD ต้นทาง"). Uses the MAX
  // origin code per cabinet (mirrors the RPC's MAX(fwarehousename) discipline).
  const podByCab = new Map<string, string>();
  if (visibleCabs.length > 0) {
    const { data: podRows, error: podErr } = await admin
      .from("tb_forwarder")
      .select("fcabinetnumber,fwarehousechina")
      .in("fcabinetnumber", visibleCabs);
    if (podErr) {
      console.error(`[report-cnt POD origin] failed`, { code: podErr.code, message: podErr.message });
    }
    for (const r of (podRows ?? []) as { fcabinetnumber: string; fwarehousechina: string | null }[]) {
      const cur = podByCab.get(r.fcabinetnumber) ?? "";
      const v = r.fwarehousechina ?? "";
      if (v && v > cur) podByCab.set(r.fcabinetnumber, v);
      else if (!podByCab.has(r.fcabinetnumber)) podByCab.set(r.fcabinetnumber, cur);
    }
  }

  let grouped: Grouped[] = queryFailed
    ? []
    : groupedNoPaid.map((g) => ({
        ...g,
        fwarehousechina: g.fwarehousechina || (podByCab.get(g.fcabinetnumber) ?? ""),
        isPaid: paidSet.has(g.fcabinetnumber),
      }));

  if (actionPay === "1") grouped = grouped.filter((g) => !g.isPaid);
  if (actionPay === "2") grouped = grouped.filter((g) =>  g.isPaid);

  // Phase 3 (ops-workflow audit §30) — per-container completeness for the
  // "ยิงครบ" badge. ONE round-trip via getContainerCompletenessBatch — sums
  // famount (expected) and fi2amount (scanned) for the visible cabinets so
  // the column shows e.g. "45/52" and the cell tints red when short.
  // Owner headline ask: "ของยิงเข้าโกดังครบยัง" without manual counting.
  const completenessByCab: Record<string, ContainerCompleteness> =
    grouped.length > 0
      ? await getContainerCompletenessBatch(
          admin,
          grouped.map((g) => g.fcabinetnumber),
        )
      : {};

  // Search support (ภูม 2026-06-23) — each visible cabinet's tracking numbers so
  // the client search box matches by แทรคกิง too (not only เลขตู้). Two tiny
  // columns scoped to the visible cabinets — cheap next to the avoided 50k pull.
  // Computed BEFORE resolveMomoContainerInfo (2026-07-10) because the resolver now
  // needs the per-cabinet trackings to resolve a placeholder from ITS OWN parcels.
  const tracksByCab: Record<string, string[]> = {};
  if (grouped.length > 0) {
    const { data: trackRows, error: trackErr } = await admin
      .from("tb_forwarder")
      .select("fcabinetnumber,ftrackingchn")
      .in("fcabinetnumber", grouped.map((g) => g.fcabinetnumber))
      .limit(50_000);
    if (trackErr) {
      console.error("[report-cnt tracksByCab] failed", { code: trackErr.code, message: trackErr.message });
    }
    for (const tr of (trackRows ?? []) as { fcabinetnumber: string; ftrackingchn: string | null }[]) {
      if (!tr.ftrackingchn) continue;
      (tracksByCab[tr.fcabinetnumber] ??= []).push(tr.ftrackingchn);
    }
  }

  // report-cnt #4 (owner 2026-06-19/20) — resolve MOMO routing-batch placeholder
  // cabinets (the "SEA0x" rows like PR20260605-SEA03 / MO20260523-SEA02 that
  // MOMO generates BEFORE the container closes) → the REAL container code
  // (container_batch_no · GZS260601-1) or, while the container is still open, the
  // sack number (เลขกระสอบ · CBX260523-EK01). ALSO pulls ETD/ETA — แต้ม-primary
  // (taem_container_etd_eta) + MOMO-fallback from momo_container_details (the
  // Container Closed sync · 0120 · ETD_CN_KODANG / ESTIMATE_DATE). The old
  // momo_import_tracks.etd/eta read was DEAD (per-tracking · always NULL) — that's
  // why ETD/ETA showed "—" even though the MOMO sync page had them (ภูม 2026-06-20).
  // 2026-07-10: pass tracksByCab so a placeholder resolves to a real container only
  // from ITS OWN under-placeholder parcels (fixes the "ตู้ซ้ำ 2 แถว" false dupe).
  const momoInfoByCab: Record<string, MomoContainerInfo> =
    grouped.length > 0
      ? await resolveMomoContainerInfo(admin, grouped.map((g) => g.fcabinetnumber), tracksByCab)
      : {};

  // G1 combo-flow (2026-07-08) — which of the visible containers are packing-confirmed.
  // Drives the "📦 packing ✓ / ⏳ ยังไม่อัพ" badge so staff see which containers are
  // ready to bill.
  //
  // 🔴 owner 2026-07-16 "อัพแพคกิ้งลิสไปแล้ว GZE260714-1/GZS260710-2/GZS260712-1 แต่หน้า
  // รายการตู้บอกยังไม่อัพ" — this read ONLY container_packing_reconcile (mig 0245) while
  // the upload the banner tells staff to use writes momo_packing_upload (mig 0254). The
  // billing gate was fixed for exactly this on 2026-07-14 but THIS page kept its own copy
  // of the query → the same class stayed alive on a second surface. Both now go through
  // the ONE SOT (reconcile OR upload = confirmed) so they can never disagree again.
  const packingConfirmed = await resolvePackingConfirmedCabs(admin, grouped.map((g) => g.fcabinetnumber));
  const packingByCab: Record<string, boolean> = {};
  for (const cab of packingConfirmed) packingByCab[cab] = true;

  // Wave 17 ux-fix: totals computation moved to <CntListTable> client
  // component (alongside rendering) — keeps the server query minimal.

  // Header counts — now actionPay-aware (0191) so the tab/transport badges match
  // the actionPay-filtered list exactly ("badge numbers EXACT"). actionPay 'all'
  // → no paid filter (the old behaviour).
  const counts = await loadHeaderCounts(admin, startDate, endDate, actionPay);

  // 2026-06-06 (ภูม follow-up to B-batch): CSV export for accountants. Builds
  // from the SAME `grouped` array the table renders, so the filtered view
  // exports exactly what's on screen. Money columns respect `showMoney`
  // (warehouse role doesn't see cost/price/profit). 1 row per cabinet.
  const csvRows: CsvRow[] = grouped.map((g) => {
    const profit = g.priceSum - g.costSum;
    const momo = momoInfoByCab[g.fcabinetnumber];
    // เลขตู้/กระสอบจริง — for a SEA0x placeholder, the real container (or, while
    // the container is still open, the sack) from MOMO. Else the cabinet itself.
    const realContainer = momo?.realContainer ?? (momo?.sackNo ? `กระสอบ ${momo.sackNo}` : g.fcabinetnumber);
    return {
      "หมายเลขตู้":        g.fcabinetnumber,
      "เลขตู้/กระสอบจริง":  realContainer,
      "โกดัง":             WAREHOUSE_LABEL[g.fwarehousename] ?? g.fwarehousename,
      "POD ต้นทาง":        WAREHOUSE_CHINA_LABEL[g.fwarehousechina] ?? "",
      "ขนส่ง":             TRANSPORT_LABEL[resolveTransportMode(g.fcabinetnumber, g.ftransporttype)] ?? g.ftransporttype,
      "วันที่ปิดตู้":       g.fdatecontainerclose ?? "",
      // ETD/ETA — แต้ม-primary · MOMO-fallback (momo_container_details · 0120).
      // T/T (transit time) = ETA − ETD in whole days. Empty keeps the column stable.
      "ETD (เรือออกจีน)":  momo?.etd ?? "",
      "ETA (ถึงไทย)":      momo?.eta ?? "",
      "T/T (วัน)":         transitDaysCsv(momo?.etd ?? null, momo?.eta ?? null),
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
  const csvFilename = `pacred-report-cnt-${isWaiting ? "waiting" : "succeed"}-${transportType}-${
    !isWaiting && startDate && endDate ? `${startDate}_to_${endDate}` : "all"
  }.csv`;

  return (
    <main className="p-4 lg:p-6 space-y-4">
      {/* Faithful legacy report-cnt.php header (owner 2026-07-16 "ทำกรอบให้เหมือน legacy
          เป๊ะๆ 100%"): exception-tabs + title + sub-tabs + transport all live in ONE framed
          .pcs-card with ปอน's legacy dashed-red-pill tabs (.pcs-tabs). Scope .pcs-rc to the
          header ONLY — the table below keeps its own Tailwind theme (no blast radius). */}
      <div className="pcs-rc">
        <section className="pcs-card">
          {/* exception-tabs strip — embedded as the card's top header row (dashed frame) */}
          <TopMenuReport activeHref="/admin/report-cnt" embedded />

          <h3 className="flex items-center gap-2">
            <Truck size={24} strokeWidth={1.5} className="inline-block" aria-hidden /> รายงานตู้
          </h3>
          <p className="-mt-1 mb-2 text-[13px] text-[#6b6f82]">กลุ่มตามหมายเลขตู้ (fCabinetNumber) — รวมจาก tb_forwarder</p>

          {/* Sub-tabs: รอเข้าโกดังไทย / เข้าโกดังไทยแล้ว — legacy dashed pills (.pcs-tabs) */}
          <ul className="pcs-tabs">
            <li>
              <PcsTab href="/admin/report-cnt?page=waiting" active={isWaiting} count={counts.waiting}>
                รอเข้าโกดังไทย
              </PcsTab>
            </li>
            <li>
              <PcsTab href="/admin/report-cnt?page=succeed" active={!isWaiting} count={counts.succeed}>
                เข้าโกดังไทยแล้ว
              </PcsTab>
            </li>
          </ul>

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
              <Explain
                label={<span className="text-muted">การจ่ายเงินตู้</span>}
                def="สถานะจ่ายค่าตู้ — “จ่ายแล้ว” = ทำรายการเบิกจ่ายค่าตู้ (ค่าขนส่งจีน-ไทยให้ต้นทาง) ของตู้นี้แล้ว · “ยังไม่จ่าย” = ยังต้องเบิกจ่าย"
              />
              <select name="actionPay" defaultValue={actionPay} className="rounded-md border border-border px-2 py-1">
                <option value="all">ทั้งหมด</option>
                <option value="1">ยังไม่จ่าย</option>
                <option value="2">จ่ายแล้ว</option>
              </select>
            </label>
            {/* ประเภทการขนส่ง = the chip-tab strip below (with per-type counts).
                The old redundant <select name="transportType"> was removed
                2026-07-08 — one control per param (§0f), the tabs are the SOT.
                Preserve the current selection across a search submit so the
                form doesn't reset the transport filter. */}
            <input type="hidden" name="transportType" value={transportType} />
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

          {/* Transport-mode tabs — legacy dashed pills (.pcs-tabs) */}
          <ul className="pcs-tabs">
            <li><PcsTab href={buildHref(sp, { transportType: "all" })} active={transportType === "all"} count={counts.transportAll(isWaiting)}>🚛🚢 ทั้งหมด</PcsTab></li>
            <li><PcsTab href={buildHref(sp, { transportType: "1" })} active={transportType === "1"} count={counts.transportTruck(isWaiting)}>🚛 ทางรถ</PcsTab></li>
            <li><PcsTab href={buildHref(sp, { transportType: "2" })} active={transportType === "2"} count={counts.transportShip(isWaiting)}>🚢 ทางเรือ</PcsTab></li>
            {/* 2026-06-06 B3: air pill · renders 0 gracefully when there are no air containers. */}
            <li><PcsTab href={buildHref(sp, { transportType: "3" })} active={transportType === "3"} count={counts.transportAir(isWaiting)}>✈️ ทางอากาศ</PcsTab></li>
          </ul>

          {/* CSV export (accountants) — exports the EXACT filtered + grouped rows shown.
              Money columns honour the `showMoney` role gate; the page is un-paginated so
              "ทั้งหมด" mirrors the on-screen CSV (its added value = admin_export_log audit). */}
          <div className="flex justify-end pt-1.5">
            <CsvButton
              rows={csvRows}
              cols={Object.keys(csvRows[0] ?? {}).map((k) => ({ key: k, label: k }))}
              filename={csvFilename}
              fetchAll={async () => {
                "use server";
                return exportReportCntAll({ isWaiting, transportType, actionPay, startDate, endDate, showMoney });
              }}
            />
          </div>
        </section>
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
            rows={
              // DATA-LAYER hide (security · mig 0189): when the viewer may NOT
              // see money internals, strip cost/price from the rows BEFORE they
              // serialize to the client — never ship a hidden-but-present cost.
              // profitSum is derived (price − cost) in the table, so zeroing both
              // closes the derived-value leak too.
              (showMoney
                ? grouped
                : grouped.map((g) => ({ ...g, costSum: 0, priceSum: 0 }))) as CntListRow[]
            }
            showMoney={showMoney}
            isWaiting={isWaiting}
            warehouseLabel={WAREHOUSE_LABEL}
            warehouseChinaLabel={WAREHOUSE_CHINA_LABEL}
            transportLabel={TRANSPORT_LABEL}
            completenessByCab={completenessByCab}
            momoInfoByCab={momoInfoByCab}
            tracksByCab={tracksByCab}
            packingByCab={packingByCab}
            preselectCabinets={preselectCabinets}
            fromInvoice={sp.invoice ?? null}
          />
        )}
        {/* The fixed-bottom action bar ("ทำรายการจ่ายเงินตู้" + billing entries) is
            rendered inside <CntListTable> (per-row checkbox selection · legacy AJAX flow
            report-cnt.php L502-505). */}
      </main>
  );
}

// Legacy report-cnt.php nav tab — a dashed red pill (.pcs-tab · inactive = pink dashed +
// black label · active = red dashed #cc3333 on pink bg · red count badge). Styling comes
// from ปอน's legacy-report-cnt.css (scoped .pcs-rc), matching the exception-tab strip.
function PcsTab({ href, active, count, children }: { href: string; active: boolean; count: number; children: React.ReactNode }) {
  return (
    <Link href={href} className={`pcs-tab${active ? " active" : ""}`}>
      <span>{children}</span>
      {count > 0 && <span className="badge badge-danger badge-pill ml-1.5">{count}</span>}
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
  actionPay: string, // 'all' | '1' (ยังไม่จ่าย) | '2' (จ่ายแล้ว) — 0191
): Promise<{
  waiting: number;
  succeed: number;
  transportAll:   (isWaiting: boolean) => number;
  transportTruck: (isWaiting: boolean) => number;
  transportShip:  (isWaiting: boolean) => number;
  transportAir:   (isWaiting: boolean) => number;
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
    // 0191: pass p_action_pay ONLY when a non-default paid filter is active, so
    // the common 'all' case stays a 4-arg call that matches the pre-0191 RPC on
    // prod (no badge regression before เดฟ applies 0191). The actionPay-filtered
    // case needs the 5-arg 0191 RPC; if it's not applied yet it errors → the
    // row-count fallback below (graceful).
    const rpcArgs: Record<string, string | null> = {
      p_page:      page,
      p_transport: transport ?? null,
      p_start:     (page === "succeed" && startDate) ? startDate : null,
      p_end:       (page === "succeed" && endDate)   ? endDate   : null,
    };
    if (actionPay && actionPay !== "all") rpcArgs.p_action_pay = actionPay;
    const { data, error } = await admin.rpc("count_distinct_cabinets", rpcArgs);
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
      .neq("fstatus", "99") // 0190: drop cancelled
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
      .neq("fstatus", "99") // 0190: drop cancelled
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

  const [
    waitingAll, waitingTruck, waitingShip, waitingAir,
    succeedAll, succeedTruck, succeedShip, succeedAir,
  ] = await Promise.all([
    countWaiting(),
    countWaiting("1"),
    countWaiting("2"),
    countWaiting("3"),
    countSucceed(),
    countSucceed("1"),
    countSucceed("2"),
    countSucceed("3"),
  ]);

  return {
    waiting:        waitingAll,
    succeed:        succeedAll,
    transportAll:   (isWaiting) => isWaiting ? waitingAll   : succeedAll,
    transportTruck: (isWaiting) => isWaiting ? waitingTruck : succeedTruck,
    transportShip:  (isWaiting) => isWaiting ? waitingShip  : succeedShip,
    transportAir:   (isWaiting) => isWaiting ? waitingAir   : succeedAir,
  };
}

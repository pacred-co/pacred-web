/**
 * Daily container bulletin — per-cabinet forwarder rollup for the staff
 * LINE group.
 *
 * WHY THIS EXISTS (Phase-B closeout · 2026-06-09)
 * -----------------------------------------------
 * The original "daily bulletin generator" (U2-1) was built on the retired
 * warehouse "spine" tables (`cargo_containers` + a status enum) and was
 * TOMBSTONED in D1 Wave 3 (see `app/[locale]/(admin)/admin/warehouse/
 * bulletin/page.tsx`). The tombstone left a clear instruction for the
 * faithful re-build:
 *
 *   "deferred to Phase C when a faithful port of the legacy LINE-bulletin
 *    workflow can be built directly from tb_forwarder GROUP BY fCabinetNumber"
 *
 * This module is that faithful re-build. It reads the SAME canonical data
 * the `report-cnt.php` port already reads (`tb_forwarder` grouped by
 * `fcabinetnumber` — see `app/[locale]/(admin)/admin/report-cnt/page.tsx`),
 * rolls it into a concise per-cabinet summary, and formats a Thai staff
 * message. The cron at `/api/cron/container-bulletin` sends it to the LINE
 * staff group every morning via `notifyStaffGroup` (best-effort).
 *
 * READ-ONLY on tb_forwarder. No money path. No writes. Safe to ship.
 *
 * Column casing (tb_forwarder is ALL LOWERCASE — verified report-cnt port):
 *   fcabinetnumber · fstatus · ftransporttype · fwarehousename ·
 *   fdatecontainerclose · fdatestatus4 · fvolume · fweight
 */

import "server-only";
import { totalCbmOf } from "@/lib/forwarder/quantities";
import type { createAdminClient } from "@/lib/supabase/admin";
import { FSTATUS_CFG, type FStatus } from "@/lib/admin/forwarder-status";

type AdminClient = ReturnType<typeof createAdminClient>;

// Legacy nameWarehouse() — fwarehousename int → display name
// (mirrors report-cnt/page.tsx WAREHOUSE_LABEL).
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
  "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO", "9": "TTW",
};

// Legacy nameTransportType2() — ftransporttype
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚛 รถ", "2": "🚢 เรือ", "3": "✈️ อากาศ",
};

/**
 * fstatus is the cabinet lifecycle:
 *   1 รอเข้าโกดังจีน · 2 ถึงโกดังจีนแล้ว · 3 กำลังส่งมาไทย ·
 *   4 ถึงไทยแล้ว · 5 รอชำระเงิน · 6 เตรียมส่ง · 7 ส่งแล้ว
 *
 * The bulletin only covers cabinets still IN-FLIGHT (fstatus < 7) — once a
 * cabinet is fully delivered (7) there's nothing for the warehouse team to
 * action that morning. We surface two "needs attention" buckets:
 *   - ARRIVED   : fstatus === '4' (ถึงไทยแล้ว — landed, needs intake/scan)
 *   - READY     : fstatus === '6' (เตรียมส่ง — ready to dispatch to customers)
 */
const ARRIVED_STATUS: FStatus = "4";
const READY_STATUS: FStatus = "6";

type ForwarderRow = {
  fcabinetnumber: string;
  fstatus: string | null;
  ftransporttype: string | null;
  fwarehousename: string | null;
  fdatecontainerclose: string | null;
  fdatestatus4: string | null;
  fvolume: number | null;
  famount: number | string | null;
  famountcount: number | string | null;
  fweight: number | null;
};

export type CabinetSummary = {
  fcabinetnumber: string;
  /** Dominant warehouse label for the cabinet. */
  warehouse: string;
  /** Dominant transport-mode label for the cabinet. */
  transport: string;
  /** Total forwarder rows (parcels) in the cabinet. */
  trackCount: number;
  /** Sum of fvolume across the cabinet (CBM). */
  volumeSum: number;
  /** Sum of fweight across the cabinet (KG). */
  weightSum: number;
  /** Count per fstatus, e.g. { "4": 12, "5": 3 }. */
  statusCounts: Record<string, number>;
  /** The "headline" status = the most common fstatus in the cabinet. */
  dominantStatus: string;
  /** Most recent fdatestatus4 (date the cabinet reached Thailand), or null. */
  latestArrivalDate: string | null;
  /** Most recent fdatecontainerclose, or null. */
  latestCloseDate: string | null;
  /** TRUE when any forwarder in the cabinet is at fstatus '4' (ถึงไทยแล้ว). */
  hasArrived: boolean;
  /** TRUE when any forwarder in the cabinet is at fstatus '6' (เตรียมส่ง). */
  hasReady: boolean;
};

export type ContainerBulletin = {
  /** ICT date (YYYY-MM-DD) the bulletin was generated for. */
  dateIct: string;
  /** All in-flight cabinets (fstatus < 7), sorted by attention then date. */
  cabinets: CabinetSummary[];
  /** Total distinct in-flight cabinets. */
  totalCabinets: number;
  /** Total forwarder rows across all in-flight cabinets. */
  totalParcels: number;
  /** Cabinets that have just arrived in Thailand (any row at fstatus '4'). */
  arrived: CabinetSummary[];
  /** Cabinets ready to dispatch (any row at fstatus '6'). */
  ready: CabinetSummary[];
  /** TRUE when there is nothing in-flight (empty bulletin). */
  isEmpty: boolean;
};

const PARCEL_FETCH_LIMIT = 100_000;

/** Pick the key with the highest count from a counts map (ties → lowest key). */
function dominantKey(counts: Record<string, number>): string {
  let best = "";
  let bestN = -1;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN || (n === bestN && (best === "" || k < best))) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

/**
 * Build the daily container bulletin from tb_forwarder.
 *
 * Faithful to the report-cnt "waiting/in-flight" view: we read every
 * forwarder row with a real cabinet number that is NOT yet fully delivered
 * (fstatus < 7), group by fcabinetnumber, and roll up.
 *
 * Returns an EMPTY bulletin (isEmpty=true) on query failure or no data — the
 * caller logs + degrades gracefully; the cron never crashes.
 */
export async function buildContainerBulletin(
  admin: AdminClient,
  opts: { dateIct?: string } = {},
): Promise<ContainerBulletin> {
  const dateIct =
    opts.dateIct ??
    new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const empty: ContainerBulletin = {
    dateIct,
    cabinets: [],
    totalCabinets: 0,
    totalParcels: 0,
    arrived: [],
    ready: [],
    isEmpty: true,
  };

  // In-flight = has a real cabinet number AND not fully delivered.
  // fstatus is stored as a varchar; "< 7" works lexicographically for the
  // single-digit 1..7 domain (same convention report-cnt uses with .lt).
  const { data, error } = await admin
    .from("tb_forwarder")
    .select(
      "fcabinetnumber,fstatus,ftransporttype,fwarehousename,fdatecontainerclose,fdatestatus4,fvolume,famount,famountcount,fweight",
    )
    .not("fcabinetnumber", "is", null)
    .neq("fcabinetnumber", "")
    .neq("fcabinetnumber", "0")
    .lt("fstatus", "7")
    .limit(PARCEL_FETCH_LIMIT);

  if (error) {
    console.error("[buildContainerBulletin tb_forwarder] failed", {
      code: error.code,
      message: error.message,
    });
    return empty;
  }

  const rows = (data ?? []) as ForwarderRow[];
  if (rows.length === 0) return empty;

  // Group by cabinet
  type Acc = {
    fcabinetnumber: string;
    trackCount: number;
    volumeSum: number;
    weightSum: number;
    statusCounts: Record<string, number>;
    warehouseCounts: Record<string, number>;
    transportCounts: Record<string, number>;
    latestArrivalDate: string | null;
    latestCloseDate: string | null;
  };
  const byCabinet = new Map<string, Acc>();

  for (const r of rows) {
    const cab = r.fcabinetnumber;
    if (!cab) continue;
    let acc = byCabinet.get(cab);
    if (!acc) {
      acc = {
        fcabinetnumber: cab,
        trackCount: 0,
        volumeSum: 0,
        weightSum: 0,
        statusCounts: {},
        warehouseCounts: {},
        transportCounts: {},
        latestArrivalDate: null,
        latestCloseDate: null,
      };
      byCabinet.set(cab, acc);
    }
    acc.trackCount += 1;
    acc.volumeSum += totalCbmOf(r); // row-TOTAL CBM (famountcount rule)
    acc.weightSum += Number(r.fweight ?? 0);

    const st = (r.fstatus ?? "").trim();
    if (st) acc.statusCounts[st] = (acc.statusCounts[st] ?? 0) + 1;

    const wh = (r.fwarehousename ?? "").trim();
    if (wh) acc.warehouseCounts[wh] = (acc.warehouseCounts[wh] ?? 0) + 1;

    const tr = (r.ftransporttype ?? "").trim();
    if (tr) acc.transportCounts[tr] = (acc.transportCounts[tr] ?? 0) + 1;

    if (r.fdatestatus4 && (!acc.latestArrivalDate || r.fdatestatus4 > acc.latestArrivalDate)) {
      acc.latestArrivalDate = r.fdatestatus4;
    }
    if (r.fdatecontainerclose && (!acc.latestCloseDate || r.fdatecontainerclose > acc.latestCloseDate)) {
      acc.latestCloseDate = r.fdatecontainerclose;
    }
  }

  const cabinets: CabinetSummary[] = Array.from(byCabinet.values()).map((a) => {
    const dominantWarehouseKey = dominantKey(a.warehouseCounts);
    const dominantTransportKey = dominantKey(a.transportCounts);
    const dominantStatus = dominantKey(a.statusCounts);
    return {
      fcabinetnumber: a.fcabinetnumber,
      warehouse: WAREHOUSE_LABEL[dominantWarehouseKey] ?? (dominantWarehouseKey || "-"),
      transport: TRANSPORT_LABEL[dominantTransportKey] ?? (dominantTransportKey || "-"),
      trackCount: a.trackCount,
      volumeSum: a.volumeSum,
      weightSum: a.weightSum,
      statusCounts: a.statusCounts,
      dominantStatus,
      latestArrivalDate: a.latestArrivalDate,
      latestCloseDate: a.latestCloseDate,
      hasArrived: (a.statusCounts[ARRIVED_STATUS] ?? 0) > 0,
      hasReady: (a.statusCounts[READY_STATUS] ?? 0) > 0,
    };
  });

  // Sort: attention buckets first (arrived, then ready), then by most-recent
  // close date desc (mirrors report-cnt default sort), then cabinet number.
  cabinets.sort((a, b) => {
    const aScore = (a.hasArrived ? 2 : 0) + (a.hasReady ? 1 : 0);
    const bScore = (b.hasArrived ? 2 : 0) + (b.hasReady ? 1 : 0);
    if (aScore !== bScore) return bScore - aScore;
    if (a.latestCloseDate && b.latestCloseDate && a.latestCloseDate !== b.latestCloseDate) {
      return b.latestCloseDate.localeCompare(a.latestCloseDate);
    }
    if (a.latestCloseDate && !b.latestCloseDate) return -1;
    if (!a.latestCloseDate && b.latestCloseDate) return 1;
    return a.fcabinetnumber.localeCompare(b.fcabinetnumber);
  });

  const arrived = cabinets.filter((c) => c.hasArrived);
  const ready = cabinets.filter((c) => c.hasReady);
  const totalParcels = cabinets.reduce((s, c) => s + c.trackCount, 0);

  return {
    dateIct,
    cabinets,
    totalCabinets: cabinets.length,
    totalParcels,
    arrived,
    ready,
    isEmpty: cabinets.length === 0,
  };
}

const fmtN = (n: number, dp = 2) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Short status-breakdown string, e.g. "ถึงไทยแล้ว 12 · รอชำระเงิน 3". */
function statusBreakdownLine(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([st, n]) => `${FSTATUS_CFG[st as FStatus]?.label ?? st} ${n}`)
    .join(" · ");
}

/** One concise line per cabinet for the bulletin body. */
function cabinetLine(c: CabinetSummary): string {
  const flags: string[] = [];
  if (c.hasArrived) flags.push("🟫 ถึงไทย");
  if (c.hasReady) flags.push("🟦 พร้อมส่ง");
  const flagStr = flags.length ? ` [${flags.join(" / ")}]` : "";
  const arr = c.latestArrivalDate ? ` · ถึงไทย ${c.latestArrivalDate.slice(0, 10)}` : "";
  return (
    `📦 ตู้ ${c.fcabinetnumber} (${c.warehouse} ${c.transport})${flagStr}\n` +
    `   ${c.trackCount} พัสดุ · ${fmtN(c.volumeSum, 3)} CBM · ${fmtN(c.weightSum)} KG${arr}\n` +
    `   ${statusBreakdownLine(c.statusCounts)}`
  );
}

/**
 * Format the bulletin into a concise Thai staff message.
 *
 * Caps the per-cabinet detail at `maxLines` cabinets (default 25) so the
 * LINE bubble stays readable — the headline counts always reflect ALL
 * cabinets. Attention cabinets (arrived/ready) sort first so they're never
 * truncated away.
 */
export function formatBulletinMessage(
  bulletin: ContainerBulletin,
  opts: { maxLines?: number } = {},
): string {
  const maxLines = opts.maxLines ?? 25;

  if (bulletin.isEmpty) {
    return `📋 บุลเลตินตู้ประจำวัน ${bulletin.dateIct}\n\nไม่มีตู้ที่อยู่ระหว่างขนส่ง (in-flight) วันนี้`;
  }

  const header = [
    `📋 บุลเลตินตู้ประจำวัน ${bulletin.dateIct}`,
    "",
    `รวม ${bulletin.totalCabinets} ตู้ · ${bulletin.totalParcels} พัสดุ (อยู่ระหว่างขนส่ง)`,
    `🟫 ถึงไทยแล้ว ${bulletin.arrived.length} ตู้ · 🟦 พร้อมส่ง ${bulletin.ready.length} ตู้`,
  ];

  const shown = bulletin.cabinets.slice(0, maxLines);
  const bodyLines = shown.map(cabinetLine);

  const footer: string[] = [];
  if (bulletin.cabinets.length > shown.length) {
    footer.push(`… และอีก ${bulletin.cabinets.length - shown.length} ตู้ (ดูทั้งหมดที่หน้ารายงานตู้)`);
  }

  return [...header, "", ...bodyLines, ...(footer.length ? ["", ...footer] : [])].join("\n");
}

"use server";

/**
 * Export-all (CSV) for /admin/forwarders/warehouse-history — the WAREHOUSE view
 * of Thai-warehouse scan-events (legacy pcs-admin/forwarder-import-warehouse.php).
 *
 * The page (app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx)
 * lists every tb_forwarder_import2 scan-event in the resolved date range, split
 * into two sections:
 *   - ORPHAN  (fid IS NULL)     — scans not yet linked to a tb_forwarder
 *   - MATCHED (fid IS NOT NULL) — scans joined to their parent tb_forwarder
 *                                 (and tb_users.coID for the VIP badge)
 * The page loads BOTH lists in full (no DB pagination — capped at ALL_MODE_CAP =
 * 5000 in 'all' mode, unbounded for 'default-week' / 'range'). This action backs
 * the "⬇ CSV ทั้งหมด" button: it re-runs the page's EXACT filtered queries
 * unpaginated (capped at EXPORT_CAP), flattens both sections into one CSV stream,
 * then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the page's exact filter:
 *   matched: .not("fid","is",null) [+ date range]  .order("fi2date", desc)
 *   orphan : .is("fid",null)        [+ date range]  .order("fi2date", desc)
 * with the same parent tb_forwarder lookup + tb_users.coID join, and the CSV
 * columns mirror the page's <thead> 1:1 (flattened: multi-line cells split out).
 * The date-bound resolution is identical to the page (default-week / range / all).
 *
 * RBAC matches the page: super / ops / warehouse.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * filter { mode, startDate, endDate }.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path. The page caps 'all' mode at
// 5000; we cap the export at 10000 so range/default-week exports never run away.
const EXPORT_CAP = 10000;

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped (matches page). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Legacy `priceWaiting($price)` — 0 → "รอคำนวณ", else "฿"+grouped (matches page). */
function priceWaiting(price: number | string | null | undefined): string {
  const v = typeof price === "string" ? Number(price) : (price ?? 0);
  if (!v || v === 0) return "รอคำนวณ";
  return `฿${numberFormat2(v)}`;
}

/** Legacy `nameProductsType($int)` (matches page). */
function nameProductsType(t: string | null): string {
  switch (t) {
    case "1": return "ทั่วไป";
    case "2": return "มอก.";
    case "3": return "อย.";
    case "4": return "พิเศษ";
    default:  return "ไม่พบข้อมูล";
  }
}

/** Legacy `nameTransportType2($int)` (matches page, plain-text for CSV). */
function transportTypeText(t: string | null): string {
  if (t === "1") return "ทางรถ";
  if (t === "2") return "ทางเรือ";
  return "";
}

/** Legacy `statusForwarderAll($fStatus)` (matches page, plain-text for CSV). */
function statusText(s: string | null): string {
  const map: Record<string, string> = {
    "1": "รอสินค้าเข้าโกดังจีน",
    "2": "ถึงโกดังจีนแล้ว",
    "3": "กำลังส่งมาไทย",
    "4": "ถึงไทยแล้ว",
    "5": "รอชำระเงิน",
    "6": "เตรียมส่ง",
    "7": "ส่งแล้ว",
  };
  return s ? map[s] ?? "" : "";
}

/** Legacy `badgeNameWarehouseChina($int)` (matches page, plain-text for CSV). */
function warehouseChinaText(w: string | null): string {
  if (w === "1") return "กวางโจว";
  if (w === "2") return "อี้อู";
  return "";
}

/** YYYY-MM-DD HH:MM:SS split into { date, time } — matches page splitDateTime. */
function splitDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const parts = iso.includes("T") ? iso.split("T") : iso.split(" ");
  return { date: parts[0] ?? "", time: (parts[1] ?? "").slice(0, 8) };
}

/** DD/MM/YYYY — matches page formatDDMMYYYY. */
function formatDDMMYYYY(iso: string | null): string {
  if (!iso) return "";
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

type ScanRow = {
  id: number;
  fid: number | null;
  keysearch: string;
  fipallet: string;
  fi2amount: number;
  fi2date: string | null;
  adminid: string;
};

type ForwarderRow = {
  id: number;
  fstatus: string | null;
  famount: number | null;
  userid: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  fdatecontainerclose: string | null;
  fdatestatus2: string | null;
  fproductstype: string | null;
  ftransporttype: string | null;
  fwarehousechina: string | null;
  fdetail: string | null;
  ftotalprice: number | null;
  ftransportprice: number | null;
  fpriceupdate: number | null;
  fshippingservice: number | null;
  fdiscount: number | null;
  fweight: number | null;
  fvolume: number | null;
  reforder: string | null;
  adminidkey: string | null;
};

/**
 * Active filters the page passes through — the resolved date-mode + range.
 * Mirrors the page's `mode` / `startDate` / `endDate` resolution.
 */
export type WarehouseHistoryExportFilter = {
  /** 'default-week' (last 7 days) · 'range' (date_from..date_to) · 'all' (no date). */
  mode: "default-week" | "range" | "all";
  /** Range start (YYYY-MM-DD) — null in 'all' mode. */
  startDate: string | null;
  /** Range end (YYYY-MM-DD) — null in 'all' mode. */
  endDate: string | null;
};

/**
 * Export the entire filtered warehouse scan-event list (orphan + matched, the
 * resolved date range, capped at EXPORT_CAP) as CSV rows for the
 * "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered queries unpaginated
 * + the same tb_forwarder/tb_users lookups. Writes an admin_export_log audit row.
 */
export async function exportWarehouseHistoryAll(
  filter: WarehouseHistoryExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same RBAC gate as the page.
  await requireAdmin(["super", "ops", "warehouse"]);

  const { mode, startDate, endDate } = filter;
  const admin = createAdminClient();

  // ── Date-filter bounds — identical to the page (mode-driven) ──────
  const dateGte =
    mode === "all"
      ? null
      : startDate
        ? `${startDate} 00:00:00`
        : null;
  const dateLte =
    mode === "all"
      ? null
      : endDate
        ? `${endDate} 23:59:59`
        : null;

  const scanColumns = "id, fid, keysearch, fipallet, fi2amount, fi2date, adminid";

  // ── Matched scans (fid IS NOT NULL) — same filter as the page ─────
  let matchedQ = admin
    .from("tb_forwarder_import2")
    .select(scanColumns)
    .not("fid", "is", null);
  if (dateGte) matchedQ = matchedQ.gte("fi2date", dateGte);
  if (dateLte) matchedQ = matchedQ.lte("fi2date", dateLte);
  const matchedFinal = matchedQ
    .order("fi2date", { ascending: false, nullsFirst: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  // ── Orphan scans (fid IS NULL) — same filter as the page ──────────
  let orphanQ = admin
    .from("tb_forwarder_import2")
    .select(scanColumns)
    .is("fid", null);
  if (dateGte) orphanQ = orphanQ.gte("fi2date", dateGte);
  if (dateLte) orphanQ = orphanQ.lte("fi2date", dateLte);
  const orphanFinal = orphanQ
    .order("fi2date", { ascending: false, nullsFirst: false })
    .range(0, EXPORT_CAP);

  const [matchedRes, orphanRes] = await Promise.all([matchedFinal, orphanFinal]);
  if (matchedRes.error) {
    console.error(`[exportWarehouseHistoryAll matched] failed`, {
      code: matchedRes.error.code,
      message: matchedRes.error.message,
    });
  }
  if (orphanRes.error) {
    console.error(`[exportWarehouseHistoryAll orphan] failed`, {
      code: orphanRes.error.code,
      message: orphanRes.error.message,
    });
  }

  const matchedAll = (matchedRes.data ?? []) as unknown as ScanRow[];
  const orphanAll = (orphanRes.data ?? []) as unknown as ScanRow[];
  const matchedTruncated = matchedAll.length > EXPORT_CAP;
  const orphanTruncated = orphanAll.length > EXPORT_CAP;
  const truncated = matchedTruncated || orphanTruncated;
  const matchedScans = matchedTruncated ? matchedAll.slice(0, EXPORT_CAP) : matchedAll;
  const orphanScans = orphanTruncated ? orphanAll.slice(0, EXPORT_CAP) : orphanAll;

  // ── Parent tb_forwarder lookup for the matched scans (same as page) ──
  const fIds = Array.from(
    new Set(matchedScans.map((r) => r.fid).filter((v): v is number => v != null)),
  );
  const forwardersById = new Map<number, ForwarderRow>();
  if (fIds.length > 0) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, fstatus, famount, userid, ftrackingchn, fcabinetnumber, " +
          "fdatecontainerclose, fdatestatus2, fproductstype, ftransporttype, " +
          "fwarehousechina, fdetail, ftotalprice, ftransportprice, fpriceupdate, " +
          "fshippingservice, fdiscount, fweight, fvolume, reforder, adminidkey",
      )
      .in("id", fIds);
    if (fwdErr) {
      console.error(`[exportWarehouseHistoryAll tb_forwarder] failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
    }
    for (const r of (fwdRows ?? []) as unknown as ForwarderRow[]) {
      forwardersById.set(r.id, r);
    }
  }

  // ── tb_users.coID for the VIP badge (same as page) ────────────────
  const userIds = Array.from(
    new Set(
      Array.from(forwardersById.values())
        .map((f) => f.userid)
        .filter((v): v is string => !!v && v !== ""),
    ),
  );
  const coidByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: usersRows, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, coID")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportWarehouseHistoryAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const r of (usersRows ?? []) as Array<{ userID: string; coID: string | null }>) {
      coidByUserId.set(r.userID, r.coID);
    }
  }

  // ── Flatten ORPHAN rows (mirrors the orphan <tr> cells) ───────────
  const orphanCsv: CsvRow[] = orphanScans.map((row) => {
    const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
    return {
      section: "รอเชื่อม (orphan)",
      f_id: "",
      scan_date: scanDate,
      scan_time: scanTime,
      keysearch: row.keysearch,
      userid: "",
      coid: "",
      box: `${row.fi2amount}/0`,
      detail: "ไม่พบรายการ กรุณาเลือกเชื่อมรายการ",
      products_type: "",
      amount_due: "",
      weight: "",
      volume: "",
      tracking_chn: "",
      cabinet: "",
      transport_type: "",
      warehouse_china: "",
      container_close: "",
      status: "",
      arrive_china: "",
      scanned_by: row.adminid,
    } satisfies CsvRow;
  });

  // ── Flatten MATCHED rows (mirrors the matched <tr> cells) ─────────
  const matchedCsv: CsvRow[] = matchedScans.map((row) => {
    const f = row.fid != null ? forwardersById.get(row.fid) : undefined;
    const { date: scanDate, time: scanTime } = splitDateTime(row.fi2date);
    const coid = f?.userid ? coidByUserId.get(f.userid) ?? null : null;
    const sumPrice =
      (Number(f?.ftotalprice ?? 0) +
        Number(f?.ftransportprice ?? 0) +
        Number(f?.fpriceupdate ?? 0) +
        Number(f?.fshippingservice ?? 0)) -
      Number(f?.fdiscount ?? 0);
    const volumeTotal =
      f?.fvolume && f?.famount ? Number(f.fvolume) * Number(f.famount) : null;
    return {
      section: "เชื่อมแล้ว (matched)",
      f_id: f?.id ?? "",
      scan_date: scanDate,
      scan_time: scanTime,
      keysearch: row.keysearch,
      userid: f?.userid ?? "",
      coid: !coid || coid === "PCS" ? "" : coid,
      box: `${row.fi2amount}/${f?.famount ?? 0}`,
      detail: f?.fdetail ?? "",
      products_type: nameProductsType(f?.fproductstype ?? null),
      amount_due: priceWaiting(sumPrice),
      weight:
        f?.fweight != null && Number(f.fweight) > 0 ? `${f.fweight} Kg` : "",
      volume:
        volumeTotal != null && Number(volumeTotal) > 0 ? `${volumeTotal} CBM` : "",
      tracking_chn: f?.ftrackingchn ?? "",
      cabinet: f?.fcabinetnumber ?? "",
      transport_type: transportTypeText(f?.ftransporttype ?? null),
      warehouse_china: warehouseChinaText(f?.fwarehousechina ?? null),
      container_close: formatDDMMYYYY(f?.fdatecontainerclose ?? null),
      status: statusText(f?.fstatus ?? null),
      arrive_china: f?.fdatestatus2?.slice(0, 10) ?? "",
      scanned_by: row.adminid,
    } satisfies CsvRow;
  });

  // Orphans first (page renders them above matched), then matched.
  const rows: CsvRow[] = [...orphanCsv, ...matchedCsv];

  await logAdminExport({
    dataset: "warehouse-history",
    filters: { mode, startDate, endDate },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

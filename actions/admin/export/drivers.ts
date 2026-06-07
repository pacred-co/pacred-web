"use server";

/**
 * Export-all (CSV) for /admin/drivers — the driver-batch list (faithful port of
 * legacy pcs-admin/forwarder-driver.php default mode).
 *
 * The page (app/[locale]/(admin)/admin/drivers/page.tsx) lists every
 * tb_forwarder_driver batch (1 driver · N stops) ordered by id DESC, filtered by:
 *   - status  → fdstatus '1' | '2' | '3' (กำลังดำเนินการ / สำเร็จ / ไม่สำเร็จ)
 *   - range   → "90d" (default · fddate ≥ today−90d) | "all"
 * and server-side paginated 50/page. The on-screen "⬇ CSV หน้านี้" downloads only
 * the visible window; this action backs the "⬇ CSV ทั้งหมด" button — the ENTIRE
 * filtered range (capped at EXPORT_CAP) — then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .select("id, fddate, fdname, fdadminid, fdadmincreator, fdstatus, fdamount, endtime")
 *   .order("id", { ascending: false })
 *   [.eq("fdstatus", status)]                 // only when a status chip is active
 *   [.gte("fddate", today−90d)]               // only when range !== "all"
 * plus the SAME in-memory joins the page does:
 *   - tb_forwarder_driver_item   → per-batch tracking count + done count
 *   - tb_forwarder.famount       → per-batch box-sum (joined via item.fid)
 *   - tb_users (userID/userName) → driver display name
 * The CSV columns mirror the page's <thead> 1:1 (with the multi-line cells split
 * into their own flat columns). The ONLY difference vs the page is the unpaginated
 * .range(0, EXPORT_CAP) window + the audit log.
 *
 * RBAC matches the page: ops / super.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing { status, range }.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

const STATUS_LABEL: Record<string, string> = {
  "1": "กำลังดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

function statusName(s: string | null): string {
  return STATUS_LABEL[s ?? ""] ?? "ไม่ระบุ";
}

type FdStatus = "1" | "2" | "3";

type BatchRaw = {
  id: number;
  fddate: string | null;
  fdname: string | null;
  fdadminid: string | null;
  fdadmincreator: string | null;
  fdstatus: string | null;
  fdamount: number | null;
  endtime: string | null;
};

type AggItemRow = { fdid: number; fid: number; fdistatus: string | null };
type FwdAmtRow = { id: number; famount: number | null };
type URow = { userID: string; userName: string | null; userLastName: string | null };

/** Active filters the page passes through. */
export type DriversExportFilter = {
  /** fdstatus chip — '1' | '2' | '3' or null (ทั้งหมด). */
  status: FdStatus | null;
  /** date range — "90d" (default) | "all". */
  range: string;
};

/** Same 90-days-ago cutoff (YYYY-MM-DD) the page applies. */
function cutoff90d(): string {
  const c = new Date();
  c.setDate(c.getDate() - 90);
  return c.toISOString().substring(0, 10);
}

/**
 * Export the entire filtered driver-batch list (the active status chip + date
 * range, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact filtered query + the same in-memory joins, unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportDriversAll(
  filter: DriversExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["ops", "super"]);

  const { status, range } = filter;
  const admin = createAdminClient();

  // ── Pass 1: the batch list (SAME filter as the page, unpaginated) ──
  let q = admin
    .from("tb_forwarder_driver")
    .select("id, fddate, fdname, fdadminid, fdadmincreator, fdstatus, fdamount, endtime")
    .order("id", { ascending: false })
    .range(0, EXPORT_CAP); // up to EXPORT_CAP+1 rows (detect truncation)

  if (status) q = q.eq("fdstatus", status);
  if (range !== "all") q = q.gte("fddate", cutoff90d());

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error(`[exportDriversAll tb_forwarder_driver] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const allBatches = (rowsRaw ?? []) as unknown as BatchRaw[];
  const truncated = allBatches.length > EXPORT_CAP;
  const batches = truncated ? allBatches.slice(0, EXPORT_CAP) : allBatches;

  // ── Pass 2: per-batch item aggregate (tracking count + done count) ──
  const batchIds = batches.map((b) => b.id);
  let items: AggItemRow[] = [];
  if (batchIds.length > 0) {
    const { data: itemData, error: itemErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fdid, fid, fdistatus")
      .in("fdid", batchIds);
    if (itemErr) {
      console.error(`[exportDriversAll tb_forwarder_driver_item] failed`, {
        code: itemErr.code,
        message: itemErr.message,
      });
    }
    items = (itemData ?? []) as unknown as AggItemRow[];
  }

  // ── Pass 3: tb_forwarder.famount (box-count) for the visible fids ──
  const visibleFids = Array.from(new Set(items.map((i) => i.fid)));
  const famountById = new Map<number, number>();
  if (visibleFids.length > 0) {
    const { data: fwdData, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, famount")
      .in("id", visibleFids);
    if (fwdErr) {
      console.error(`[exportDriversAll tb_forwarder] failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
    }
    for (const r of (fwdData ?? []) as unknown as FwdAmtRow[]) {
      famountById.set(r.id, r.famount ?? 0);
    }
  }

  const itemAgg = new Map<number, { itemCount: number; boxSum: number; doneCount: number }>();
  for (const it of items) {
    const cur = itemAgg.get(it.fdid) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
    cur.itemCount += 1;
    cur.boxSum += famountById.get(it.fid) ?? 0;
    if (it.fdistatus === "2") cur.doneCount += 1;
    itemAgg.set(it.fdid, cur);
  }

  // ── Pass 4: tb_users → driver display name (SAME join as the page) ──
  const driverIds = Array.from(
    new Set(batches.map((b) => b.fdadminid).filter(Boolean) as string[]),
  );
  const driverName = new Map<string, string>();
  if (driverIds.length > 0) {
    const { data: usersData, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", driverIds);
    if (usersErr) {
      console.error(`[exportDriversAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersData ?? []) as unknown as URow[]) {
      const name = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim();
      driverName.set(u.userID, name || "—");
    }
  }

  // SAME row mapping + column keys as the page's CsvButton cols.
  const rows: CsvRow[] = batches.map((b) => {
    const agg = itemAgg.get(b.id) ?? { itemCount: 0, boxSum: 0, doneCount: 0 };
    const driverDisplay = b.fdadminid ? driverName.get(b.fdadminid) ?? "" : "";
    const row: CsvRow = {
      id: b.id,
      fddate: b.fddate ? b.fddate.slice(0, 10) : "",
      endtime: b.endtime ? b.endtime.slice(0, 16).replace("T", " ") : "",
      fdname: b.fdname ?? `รอบ #${b.id}`,
      driver_id: b.fdadminid ?? "",
      driver_name: driverDisplay,
      creator: b.fdadmincreator ?? "",
      item_count: agg.itemCount,
      box_sum: agg.boxSum,
      stop_count: b.fdamount ?? 0,
      done_count: agg.doneCount,
      status: statusName(b.fdstatus),
    };
    return row;
  });

  await logAdminExport({
    dataset: "drivers",
    filters: { status: status ?? "all", range },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

/**
 * Per-container BOX-DIMENSION breakdown — "ตู้นี้มีกล่องขนาดไหนบ้าง กี่กล่อง".
 *
 * Owner ask (2026-06-19 · ปอน): expanding a container row in /admin/report-cnt
 * should drop down the box detail like the import page (หน้านำเข้า) —
 * กว้าง / ยาว / สูง / CBM / จำนวนกล่อง — GROUPED by identical dimension. A
 * container with 9 boxes where 6 share one size and 3 share another size shows
 * 2 rows (6× sizeA, 3× sizeB).
 *
 * Each `tb_forwarder` row carries ONE box dimension (fwidth/flength/fheight) +
 * its box count (famount) + CBM (fvolume). Mixed sizes in a container therefore
 * come from SEPARATE rows, so grouping across the rows by (w,l,h) yields the
 * breakdown the owner wants.
 *
 * Drops the MOMO หัวบิล placeholder (filterCountableForwarderRows) so the box Σ
 * here matches the list page's จำนวนกล่อง / ปริมาตร columns. Read-only · no money
 * path. The pure `groupBoxesByDimension` is unit-tested; `getContainerBoxBreakdown`
 * takes the admin client as a param (no server-only runtime dep → testable).
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

type AdminClient = ReturnType<typeof createAdminClient>;

/** The minimal forwarder shape the breakdown needs. */
export type FwForBreakdown = {
  id: number;
  famount: number | null;
  famountcount: number | string | null;
  fvolume: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  // read only to drop the MOMO หัวบิล placeholder
  ftrackingchn: string | null;
  fweight: number | string | null;
  userid: string | null;
};

export type BoxDimGroup = {
  width: number;
  length: number;
  height: number;
  /** Σ boxes (famount) across the rows sharing this dimension. */
  boxes: number;
  /** Σ CBM (rowCbm) across the rows sharing this dimension — matches the cost engine. */
  cbm: number;
  /**
   * report-cnt #4 (B) — the distinct tracking numbers (ftrackingchn) of the
   * forwarder rows folded into this dimension group, in first-seen order. The
   * breakdown panel shows these IN PLACE OF the ลำดับ sequence #, which the
   * owner found hard to read. Usually 1 tracking per group; a group can hold
   * several when multiple parcels share the exact same box size.
   */
  trackings: string[];
};

/**
 * CBM for one forwarder row — MUST match lib/forwarder/live-rate.ts L284 + the
 * import items table (forwarder-import-items-table.tsx rowCbm): fvolume is the
 * TOTAL when famountcount==='1' (every MOMO commit writes the whole-parcel CBM,
 * e.g. 1.728 for a 48-box parcel — NEVER ×boxes again) and PER-BOX otherwise
 * (manual multi-box entries → × famount). Keeps the Σ equal to the cost the
 * engine actually charged + the list page's ปริมาตร column.
 */
export function rowCbm(
  fvolume: number | string | null,
  famount: number | null,
  famountcount: number | string | null,
): number {
  const vol = Number(fvolume ?? 0);
  if (String(famountcount ?? "").trim() === "1") return vol; // total (MOMO)
  return vol * (Number(famount ?? 0) || 1); // per-box × boxes (manual multi-box)
}

/**
 * Pure — group countable forwarder rows by (width, length, height); Σ boxes +
 * Σ CBM per dimension group. Largest groups first (most boxes, then CBM). Rows
 * with no dimensions (e.g. MOMO parcels that only carry a total CBM) collapse
 * into the (0,0,0) group — the consumer renders that as "ไม่ระบุขนาด".
 */
export function groupBoxesByDimension(rows: FwForBreakdown[]): BoxDimGroup[] {
  const map = new Map<string, BoxDimGroup>();
  for (const r of rows) {
    const width = Number(r.fwidth ?? 0) || 0;
    const length = Number(r.flength ?? 0) || 0;
    const height = Number(r.fheight ?? 0) || 0;
    const boxes = Number(r.famount ?? 0) || 0;
    const cbm = rowCbm(r.fvolume, r.famount, r.famountcount);
    const tracking = (r.ftrackingchn ?? "").trim();
    const key = `${width}|${length}|${height}`;
    const g = map.get(key);
    if (g) {
      g.boxes += boxes;
      g.cbm += cbm;
      if (tracking && !g.trackings.includes(tracking)) g.trackings.push(tracking);
    } else {
      map.set(key, { width, length, height, boxes, cbm, trackings: tracking ? [tracking] : [] });
    }
  }
  return [...map.values()].sort((a, b) => b.boxes - a.boxes || b.cbm - a.cbm);
}

/** Column set kept in sync with FwForBreakdown. */
const BREAKDOWN_SELECT =
  "id, famount, famountcount, fvolume, fwidth, flength, fheight, ftrackingchn, fweight, userid";

/**
 * Fetch + group the box-dimension breakdown for ONE container. Called lazily
 * on row-expand (NOT eagerly for every container — most are never opened).
 * Returns [] on any DB error (the UI degrades to "ไม่มีข้อมูล").
 */
export async function getContainerBoxBreakdown(
  admin: AdminClient,
  fcabinetnumber: string,
): Promise<BoxDimGroup[]> {
  if (!fcabinetnumber) return [];

  const { data, error } = await admin
    .from("tb_forwarder")
    .select(BREAKDOWN_SELECT)
    .eq("fcabinetnumber", fcabinetnumber)
    .limit(50_000);
  if (error) {
    console.error(`[getContainerBoxBreakdown] failed`, {
      code: error.code,
      message: error.message,
      fcabinetnumber,
    });
    return [];
  }

  const rows = (data ?? []) as unknown as FwForBreakdown[];
  // Drop the MOMO หัวบิล placeholder so box Σ matches the list page columns.
  const countable = filterCountableForwarderRows(rows, {
    tracking: (r) => r.ftrackingchn,
    weight: (r) => Number(r.fweight ?? 0),
    userid: (r) => r.userid ?? "",
  });
  return groupBoxesByDimension(countable.length > 0 ? countable : rows);
}

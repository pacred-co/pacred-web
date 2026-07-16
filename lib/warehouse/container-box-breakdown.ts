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
  /** SELL freight — the money signal for the หัวบิล drop (aggregate/เหมาๆ-only bare = 0). */
  ftotalprice: number | string | null;
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
  /**
   * ภูม 2026-06-30 — the distinct customer codes (PR · userid) of the forwarder
   * rows folded into this group, in first-seen order. The breakdown panel shows
   * these as the first column ("รหัสลูกค้า") so staff can tell whose boxes these
   * are at a glance. Usually 1 customer per group (= 1 tracking); a group spans
   * several only when different customers happen to ship the exact same box size.
   */
  userids: string[];
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
    const userid = (r.userid ?? "").trim();
    addToGroup(map, { width, length, height, boxes, cbm, tracking, userid });
  }
  return sortGroups(map);
}

// ── report-cnt แยกตามขนาด v2 (owner/ภูม 2026-07-02) ────────────────────────
//
// The v1 grouping above keys purely on the tb_forwarder row's (w,l,h). But a MOMO
// tracking split into N boxes with DIFFERENT sizes stores only its AGGREGATE on
// ONE tb_forwarder row, whose ก×ย×ส is left BLANK on purpose (a merged dim would be
// meaningless — see propagate-live-data.ts). So EVERY such multi-box row falls into
// the (0,0,0) bucket → the panel showed a fake "1 ขนาด" cramming many trackings +
// customers into one row (the bug ภูม flagged on GZE260701-1).
//
// v2 uses the per-box detail (momo_box_detail) to EXPAND a blank-dim row into its
// real distinct sizes: a blank-dim row that has per-box detail contributes one box
// UNIT per detail box (grouped by that box's ACTUAL size, boxes = the box's pieces,
// CBM = per-piece × pieces). A blank-dim row with NO detail stays in the genuine
// "ไม่ระบุขนาด" bucket. Rows that already carry real dims (manual / single-box) are
// grouped by their own size, unchanged.
//
// 💰 The tb_forwarder aggregate is untouched — this only decides how the DISPLAY
// buckets the boxes. The price still uses fvolume (คิวรวม).

/** One split box's per-box detail — the grouping input (subset of momo_box_detail). */
export type BoxDetailForGrouping = {
  base_tracking: string;
  member_code: string | null;
  /** per-box dims (cm) */
  width: number | string | null;
  length: number | string | null;
  height: number | string | null;
  /** per-PIECE volume (คิว) — the box total = cbm × quantity */
  cbm: number | string | null;
  /** pieces in this box */
  quantity: number | string | null;
};

/** True when a forwarder row carries NO real dimension (all three are 0/blank). */
function rowHasNoDims(r: FwForBreakdown): boolean {
  return (
    !(Number(r.fwidth ?? 0) > 0) &&
    !(Number(r.flength ?? 0) > 0) &&
    !(Number(r.fheight ?? 0) > 0)
  );
}

/** Add a box contribution to the dimension map (merge on identical size). */
function addToGroup(
  map: Map<string, BoxDimGroup>,
  c: { width: number; length: number; height: number; boxes: number; cbm: number; tracking: string; userid: string },
): void {
  const key = `${c.width}|${c.length}|${c.height}`;
  const g = map.get(key);
  if (g) {
    g.boxes += c.boxes;
    g.cbm += c.cbm;
    if (c.tracking && !g.trackings.includes(c.tracking)) g.trackings.push(c.tracking);
    if (c.userid && !g.userids.includes(c.userid)) g.userids.push(c.userid);
  } else {
    map.set(key, {
      width: c.width,
      length: c.length,
      height: c.height,
      boxes: c.boxes,
      cbm: c.cbm,
      trackings: c.tracking ? [c.tracking] : [],
      userids: c.userid ? [c.userid] : [],
    });
  }
}

/** Largest groups first (most boxes, then CBM). */
function sortGroups(map: Map<string, BoxDimGroup>): BoxDimGroup[] {
  return [...map.values()].sort((a, b) => b.boxes - a.boxes || b.cbm - a.cbm);
}

/**
 * Pure — group a container's boxes by ACTUAL size, expanding blank-dim MOMO rows
 * via their per-box detail. `boxDetailsByBase` maps a BASE tracking → its per-box
 * detail rows (from momo_box_detail).
 *
 *  - Row WITH real dims  → grouped by its own (w,l,h) with famount boxes (v1 rule).
 *  - Row with BLANK dims + detail → one contribution PER detail box, grouped by the
 *    box's real (w,l,h); boxes = box.quantity, CBM = box.cbm × quantity.
 *  - Row with BLANK dims + NO detail → the genuine (0,0,0) "ไม่ระบุขนาด" bucket
 *    (aggregate rowCbm + famount), NOT merged with real sizes.
 *
 * A detail box that itself has no size falls into "ไม่ระบุขนาด" too. Sorted largest
 * first, same as v1.
 */
export function groupBoxesWithDetail(
  rows: FwForBreakdown[],
  boxDetailsByBase: Map<string, BoxDetailForGrouping[]>,
): BoxDimGroup[] {
  const map = new Map<string, BoxDimGroup>();
  for (const r of rows) {
    const tracking = (r.ftrackingchn ?? "").trim();
    const userid = (r.userid ?? "").trim();

    // Manual / single-box row that already carries a real dim → group as-is (v1).
    if (!rowHasNoDims(r)) {
      addToGroup(map, {
        width: Number(r.fwidth ?? 0) || 0,
        length: Number(r.flength ?? 0) || 0,
        height: Number(r.fheight ?? 0) || 0,
        boxes: Number(r.famount ?? 0) || 0,
        cbm: rowCbm(r.fvolume, r.famount, r.famountcount),
        tracking,
        userid,
      });
      continue;
    }

    // Blank-dim row → try to expand via the per-box detail (keyed by BASE tracking).
    const base = baseOfTracking(tracking);
    const detail = base ? boxDetailsByBase.get(base) : undefined;
    if (detail && detail.length > 0) {
      for (const b of detail) {
        const w = Number(b.width ?? 0) || 0;
        const l = Number(b.length ?? 0) || 0;
        const h = Number(b.height ?? 0) || 0;
        const qty = Math.max(1, Math.round(Number(b.quantity ?? 0)) || 0) || 1;
        const boxCbm = (Number(b.cbm ?? 0) || 0) * qty;
        addToGroup(map, {
          width: w,
          length: l,
          height: h,
          boxes: qty,
          cbm: boxCbm,
          tracking,
          userid: (b.member_code ?? "").trim() || userid,
        });
      }
      continue;
    }

    // Blank-dim row with no detail → genuine "ไม่ระบุขนาด" (aggregate, unmerged with sizes).
    addToGroup(map, {
      width: 0,
      length: 0,
      height: 0,
      boxes: Number(r.famount ?? 0) || 0,
      cbm: rowCbm(r.fvolume, r.famount, r.famountcount),
      tracking,
      userid,
    });
  }
  return sortGroups(map);
}

/**
 * Strip a MOMO "-i/n" (or "-i") split-suffix → the BASE tracking. Identical
 * convention to lib/integrations/momo-web/live-parcel-metrics.ts baseTrackingOf
 * (kept local so this pure module has no server-only import): strips a NUMERIC
 * split-suffix ONLY ("-3" / "-1/3"); a legit hyphenated tracking like
 * "CBX260620-SEA07" is left intact (SEA isn't digits).
 */
export function baseOfTracking(tracking: string): string {
  return (tracking ?? "").trim().replace(/-\d+(\/\d+)?$/, "");
}

/** Column set kept in sync with FwForBreakdown. */
const BREAKDOWN_SELECT =
  "id, famount, famountcount, fvolume, fwidth, flength, fheight, ftrackingchn, fweight, userid, ftotalprice";

/** momo_box_detail columns the grouping needs. */
const BOX_DETAIL_SELECT =
  "base_tracking, member_code, width, length, height, cbm, quantity";

/**
 * Fetch the per-box detail for a container and index it by BASE tracking. Best-
 * effort: if the table is absent (prod before mig 0240) or the query fails, we
 * return an EMPTY map so the grouping falls back to the v1 (blank-dim → "ไม่ระบุ
 * ขนาด") behaviour — never fatal. Keyed by container_name = fcabinetnumber.
 */
async function fetchBoxDetailByBase(
  admin: AdminClient,
  fcabinetnumber: string,
): Promise<Map<string, BoxDetailForGrouping[]>> {
  const byBase = new Map<string, BoxDetailForGrouping[]>();
  const { data, error } = await admin
    .from("momo_box_detail")
    .select(BOX_DETAIL_SELECT)
    .eq("container_name", fcabinetnumber)
    .limit(50_000);
  if (error) {
    // Missing table (42P01) or any error → degrade silently to no-detail.
    console.error(`[getContainerBoxBreakdown] box-detail lookup failed (fallback to no-detail)`, {
      code: error.code,
      message: error.message,
      fcabinetnumber,
    });
    return byBase;
  }
  for (const b of (data ?? []) as unknown as BoxDetailForGrouping[]) {
    const base = (b.base_tracking ?? "").trim();
    if (!base) continue;
    const arr = byBase.get(base);
    if (arr) arr.push(b);
    else byBase.set(base, [b]);
  }
  return byBase;
}

/**
 * Fetch + group the box-dimension breakdown for ONE container. Called lazily
 * on row-expand (NOT eagerly for every container — most are never opened).
 * Returns [] on any DB error (the UI degrades to "ไม่มีข้อมูล").
 *
 * Uses the MOMO per-box detail (momo_box_detail) to expand a multi-box tracking
 * whose tb_forwarder ก×ย×ส is blank into its real distinct sizes (owner/ภูม
 * 2026-07-02). Falls back to the v1 aggregate grouping when no detail exists.
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
    // ftotalprice drops an aggregate-weight bare base (owner #52559) so the box Σ matches the
    // list page; a real priced anchor (ftotalprice>0) stays in the breakdown.
    money: (r) => Number(r.ftotalprice ?? 0),
  });
  const grouping = countable.length > 0 ? countable : rows;

  // Per-box detail (best-effort) — expands blank-dim MOMO rows into real sizes.
  const boxDetailsByBase = await fetchBoxDetailByBase(admin, fcabinetnumber);
  return groupBoxesWithDetail(grouping, boxDetailsByBase);
}

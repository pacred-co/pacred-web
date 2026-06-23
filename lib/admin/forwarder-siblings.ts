/**
 * SINGLE source of truth for "which tb_forwarder rows make up ONE shipment".
 *
 * A split parcel = several tb_forwarder rows that share (baseTracking, userid)
 * — MOMO `-N/M` boxes or a manually-split order. The detail page renders the
 * landed row's order, but the รายการสินค้า table AND the ยอดเก็บจริง collect calc
 * must BOTH span the whole sibling set, or they disagree on scope.
 *
 * ภูม 2026-06-23: that exact drift was a money bug — the ยอดเก็บจริง box summed
 * the ONE landed row (฿410) while the items table summed all 6 siblings (฿4,424).
 * Routing both surfaces through this one helper makes them physically unable to
 * disagree again.
 *
 * Logic mirrors the original inline fetch in forwarder-import-items-table.tsx:
 * narrow by a prefix ILIKE, keep EXACT baseTracking matches (so "178055573"
 * doesn't absorb "1780555731"), drop the MOMO หัวบิล bill-header
 * (filterCountableForwarderRows), and sort by box suffix. On ANY db error or an
 * empty result, fall back to `[landed]` — never lose the landed row.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  baseTracking,
  trackingSuffix,
  filterCountableForwarderRows,
} from "./momo-bill-header";

// The column superset both callers need: the items-table display fields + the
// collect-calc pricing fields (fshipby drives the เหมาๆ/PCSF detection). A caller
// may pass a narrower select; the default covers everything.
export const FORWARDER_SIBLING_SELECT =
  "id, userid, fshipby, ftrackingchn, reforder, fdetail, fproductstype, famount, famountcount, " +
  "fweight, fvolume, fwidth, flength, fheight, fwarehousename, frefprice, frefrate, ftotalprice, " +
  "fpriceupdate, pricecrate, ftransportpricechnthb, ftransportprice, fshippingservice, priceother, fdiscount";

/**
 * Fetch the countable sibling tracking rows for a landed forwarder order.
 *
 * Generic over the landed row type `T` — each caller passes its own row shape
 * (+ matching `select`) and gets the same shape back, reading whatever subset it
 * needs. The shared part (which rows ARE siblings, drop the หัวบิล, sort) lives
 * here so it can never drift between the two surfaces.
 */
export async function fetchCountableForwarderSiblings<
  T extends {
    id: number;
    ftrackingchn?: string | null;
    fweight?: number | string | null;
    userid?: string | null;
  },
>(admin: SupabaseClient, landed: T, select: string = FORWARDER_SIBLING_SELECT): Promise<T[]> {
  const base = baseTracking(landed.ftrackingchn);
  let rows: T[] = [landed];
  if (base && landed.userid) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(select)
      .eq("userid", landed.userid)
      .ilike("ftrackingchn", `${base}%`)
      .limit(200);
    if (error) {
      console.error("[fetchCountableForwarderSiblings]", {
        code: error.code, message: error.message, base, userid: landed.userid,
      });
    } else {
      const exact = ((data ?? []) as unknown as T[]).filter(
        (row) => baseTracking(row.ftrackingchn) === base,
      );
      if (exact.length > 0) rows = exact;
    }
  }
  const countable = filterCountableForwarderRows(rows, {
    tracking: (row) => row.ftrackingchn,
    weight: (row) => Number(row.fweight ?? 0),
    userid: (row) => row.userid ?? "",
  });
  return (countable.length > 0 ? countable : rows)
    .slice()
    .sort(
      (a, b) =>
        trackingSuffix(a.ftrackingchn) - trackingSuffix(b.ftrackingchn) || a.id - b.id,
    );
}

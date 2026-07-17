/**
 * WHICH ROW CARRIES THE เหมาๆ ฿100 — the PURE election (no DB · no "server-only").
 * Unit-tested in mao-anchor-plan.test.ts; the DB reader lives in mao-anchor.ts.
 *
 * 🔴 owner 2026-07-16 "ระวังไปเก็บซ้ำด้วยนะครับเหมาๆ · อย่าให้เกิดขึ้นอีก" — this is the
 * money-critical decision, so it is pure and pinned by tests rather than buried in a
 * server action.
 *
 * The engine (forwarder-debit-total.ts) decides PER ROW: a เหมาๆ carrier whose Thai leg
 * is 0 may anchor; a `-N` box sub-row may not (the 2026-06-23 กันเก็บตังเบิ้ล rule). That
 * silently DROPS the fee when MOMO splits at commit and no bare base row exists. Lifting
 * the election to the SHIPMENT fixes the drop — but only if it also honours the two things
 * the per-row rule was protecting:
 *
 *   1. a row that ALREADY carries a Thai leg is already charged → never add ฿100 on top
 *      (prod 1783051207: base row holds ฿100 + 19 zero-leg siblings → electing a sibling
 *      would bill ฿200 for one ลอบส่ง)
 *   2. the elected row must be a property of the SHIPMENT, not of the batch → two bills
 *      can never both hold it
 */

import { trackingSuffix } from "@/lib/admin/momo-bill-header";
import { isMaoCarrier } from "@/lib/forwarder/mao-fee";

/** The minimum a row must expose for the election. */
export type MaoCandidateRow = {
  id: number;
  ftrackingchn: string | null;
  fshipby: string | null;
  ftransportprice: number | string | null;
};

/**
 * Elect the ONE row of a shipment that may carry the เหมาๆ ฿100 — or null when the
 * shipment must not be charged a flat fee at all.
 *
 * @param siblings EVERY row of one base tracking (bare + all `-N` / `-N/M`). Passing a
 *                 partial set is a bug: the election would then depend on the batch.
 * @returns the elected fid, or null when
 *          • no row is a เหมาๆ carrier, or
 *          • some เหมาๆ row already carries a Thai leg (the shipment is already charged)
 */
export function electMaoCarrier(siblings: readonly MaoCandidateRow[]): number | null {
  const maoRows = siblings.filter((r) => isMaoCarrier(r.fshipby));
  if (maoRows.length === 0) return null;

  // (1) already charged on a row → elect nobody (see the doc block above).
  if (maoRows.some((r) => Number(r.ftransportprice ?? 0) > 0)) return null;

  // (2) the bare base wins; else the lowest suffix. Tie-break on id so the election can
  //     never flip between two reads of the same data.
  const eligible = maoRows.filter((r) => Number(r.ftransportprice ?? 0) === 0);
  if (eligible.length === 0) return null;
  const carrier = eligible.reduce((best, r) => {
    const bs = trackingSuffix(best.ftrackingchn);
    const rs = trackingSuffix(r.ftrackingchn);
    if (rs !== bs) return rs < bs ? r : best;
    return Number(r.id) < Number(best.id) ? r : best;
  });
  return Number(carrier.id);
}

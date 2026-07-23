/**
 * resolve-box-dims.ts — the ONE rule for the "ขนาด (ก×ย×ส)" display on the
 * customer money-docs (จ่ายแทนลูกค้า ใบแจ้งหนี้ + ใบวางบิล).
 *
 * The bug (owner 2026-07-23): a MULTI-BOX MOMO shipment leaves ก×ย×ส BLANK on its
 * aggregate tb_forwarder row ON PURPOSE — its boxes differ in size, so merging them
 * into one ก×ย×ส would be a lie (propagate-live-data.ts fills dims only for a
 * single-box tracking). A single-box row can also be blank while Live hasn't
 * propagated yet. In BOTH cases the real per-box dims live in momo_box_detail. The
 * money-docs read tb_forwarder.fwidth/flength/fheight directly, so those rows print
 * "—". This resolver renders what's REAL:
 *   1. the row's OWN dim when it carries one (single-box / manual / already-filled), else
 *   2. one "w×l×h" per DISTINCT box size from the per-box detail (grouped · " ×N"), else
 *   3. "—" when nothing is known.
 * It NEVER merges the boxes into one fake dim.
 *
 * Pure — no DB, no server-only import (the CALLER loads momo_box_detail + passes the
 * boxDims in). Deterministic + length-capped so it stays safe in a small table cell.
 */

/** One split box's own size + piece count (subset of momo_box_detail). */
export type BoxDimInput = {
  /** ก (cm) */
  width: number;
  /** ย (cm) */
  length: number;
  /** ส (cm) */
  height: number;
  /** จำนวนชิ้นในกล่องขนาดนี้ */
  quantity: number;
};

export type ResolveDimsArgs = {
  /** The tb_forwarder row's OWN dims (ก/ย/ส · cm) — 0 when unmeasured/blank. */
  fwidth: number;
  flength: number;
  fheight: number;
  /**
   * Per-box detail for this row's BASE tracking (from momo_box_detail). Used ONLY
   * when the row carries no own dim — each box's own w/l/h + its piece count.
   */
  boxDims?: BoxDimInput[];
};

/** Cap on the number of DISTINCT sizes rendered before "…" (keeps the cell short). */
const MAX_DISTINCT_SIZES = 6;

/** cm value → clean string (≤2 dp, no trailing zeros): 50→"50", 50.50→"50.5". */
function cleanDim(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return String(Math.round(v * 100) / 100);
}

/** True when at least one of the three dims is a positive, finite number. */
function anyPositive(w: number, l: number, h: number): boolean {
  return Number(w) > 0 || Number(l) > 0 || Number(h) > 0;
}

/** One box's "ก×ย×ส" (width×length×height · matches the ขนาด(ก×ย×ส) column). */
function dimStr(w: number, l: number, h: number): string {
  return `${cleanDim(w)}×${cleanDim(l)}×${cleanDim(h)}`;
}

/**
 * The single "ขนาด (ก×ย×ส)" display string for one cargo row (see file header).
 * Never merges boxes into a fake dim; returns "—" when nothing is known.
 *
 * Examples:
 *   own dim wins          → resolveDimsDisplay({ fwidth:30, flength:40, fheight:50 })            = "30×40×50"
 *   single per-box        → { fwidth:0,…, boxDims:[{50,46,40,q1}] }                              = "50×46×40"
 *   multi distinct sizes  → { …, boxDims:[{50,46,40,q1},{47,52,79,q3}] }                         = "50×46×40, 47×52×79 ×3"
 *   repeated same size    → { …, boxDims:[{50,46,40,q1},{50,46,40,q1}] }                         = "50×46×40 ×2"
 *   all-zero / empty      → { fwidth:0,…, boxDims:[{0,0,0,q3}] } | { fwidth:0,… }                = "—"
 */
export function resolveDimsDisplay(args: ResolveDimsArgs): string {
  const fw = Number(args.fwidth) || 0;
  const fl = Number(args.flength) || 0;
  const fh = Number(args.fheight) || 0;

  // 1. The row already carries its own dim (single-box / manual / already-filled) →
  //    show it as-is (the propagated / manually-measured single box).
  if (anyPositive(fw, fl, fh)) return dimStr(fw, fl, fh);

  // 2. No own dim → expand from the per-box detail: one "w×l×h" per DISTINCT size,
  //    grouped, with " ×N" when a size totals more than one piece. Keeps the
  //    first-seen order of the distinct sizes.
  const boxes = args.boxDims ?? [];
  const order: string[] = [];
  const byKey = new Map<string, { label: string; qty: number }>();
  for (const b of boxes) {
    const w = Number(b.width) || 0;
    const l = Number(b.length) || 0;
    const h = Number(b.height) || 0;
    if (!anyPositive(w, l, h)) continue; // a box with no size of its own → drop
    const key = `${cleanDim(w)}|${cleanDim(l)}|${cleanDim(h)}`;
    const qty = Math.max(1, Math.round(Number(b.quantity) || 0) || 1);
    const seen = byKey.get(key);
    if (seen) {
      seen.qty += qty;
    } else {
      byKey.set(key, { label: dimStr(w, l, h), qty });
      order.push(key);
    }
  }

  if (order.length === 0) return "—"; // no own dim AND no usable per-box detail

  const parts = order.slice(0, MAX_DISTINCT_SIZES).map((k) => {
    const g = byKey.get(k)!;
    return g.qty > 1 ? `${g.label} ×${g.qty}` : g.label;
  });
  if (order.length > MAX_DISTINCT_SIZES) parts.push("…");
  return parts.join(", ");
}

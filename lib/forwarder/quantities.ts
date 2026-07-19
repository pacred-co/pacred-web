/**
 * quantities.ts — THE per-row quantity SOT (owner 2026-07-19 "ตอนเอา คิว กิโล
 * จำนวนกล่อง แต่ละแทรคกิ้งมารวมเข้าชิปเม้น ต้องบวกรวมให้ตรง ไม่ใช่หายหรือบัค").
 *
 * tb_forwarder stores volume in TWO conventions, discriminated by `famountcount`
 * (legacy forwarder.php L1935-1941 · the "รวมกล่อง" checkbox):
 *
 *   famountcount === '1'  → fvolume is ALREADY the row TOTAL CBM
 *                           (the MOMO commit path always writes this)
 *   anything else         → fvolume is PER-BOX CBM → row total = fvolume × famount
 *                           (the manual editor / legacy / TTW keyed rows)
 *
 * `fweight` is ALWAYS the row total (no per-box weight convention) and `famount`
 * is ALWAYS the row's box count. Only CBM has the split.
 *
 * The SELL side has always honoured this ("CBMProduct" in resolve-rate/live-rate),
 * but the COST side + several Σ displays (report-cnt container totals · ตรวจตู้
 * cost write · data-health) consumed RAW fvolume → a per-box row under-reported
 * CBM (and cost) by ×famount. Every consumer MUST route through this module —
 * summing raw fvolume across mixed-convention rows is ALWAYS a bug.
 *
 * Pure + client-safe (no server imports) so both RSC and "use client" tables and
 * plain-node scripts can share the exact same rule.
 */

export type QuantityRow = {
  fvolume: number | string | null | undefined;
  famount: number | string | null | undefined;
  famountcount: number | string | null | undefined;
};

const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Is this row's fvolume already the TOTAL (the famountcount='1' convention)? */
export function volumeIsTotal(famountcount: number | string | null | undefined): boolean {
  return String(famountcount ?? "").trim() === "1";
}

/**
 * The row's TOTAL CBM (the legacy "CBMProduct"):
 *   famountcount='1' → fvolume · else → fvolume × max(famount, 1).
 * (famount 0/null on a per-box row ⇒ treat as 1 box — never zero out a real
 * volume because a count is missing.)
 */
export function totalCbmOf(row: QuantityRow): number {
  const v = num(row.fvolume);
  if (v <= 0) return 0;
  if (volumeIsTotal(row.famountcount)) return v;
  const boxes = num(row.famount);
  return v * (boxes > 0 ? boxes : 1);
}

/** The row's box count (famount · always a total — no convention split). */
export function totalBoxesOf(row: Pick<QuantityRow, "famount">): number {
  return num(row.famount);
}

/** The row's total weight (fweight is ALWAYS a row total). */
export function totalWeightOf(row: { fweight: number | string | null | undefined }): number {
  return num(row.fweight);
}

/**
 * Shipment/container aggregate — Σ over rows using the per-row rule. Use this
 * for every "รวมทุกแทรคกิง" / per-ตู้ figure so a mixed batch (MOMO total-rows +
 * manually-keyed per-box rows) can never mis-sum.
 */
export function sumQuantities(
  rows: Array<QuantityRow & { fweight?: number | string | null }>,
): { boxes: number; weightKg: number; cbm: number } {
  let boxes = 0, weightKg = 0, cbm = 0;
  for (const r of rows) {
    boxes += totalBoxesOf(r);
    weightKg += num(r.fweight);
    cbm += totalCbmOf(r);
  }
  return { boxes, weightKg, cbm: Math.round(cbm * 1e6) / 1e6 };
}

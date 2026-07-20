/**
 * cg-range.ts — the CG box-number SOT (owner 2026-07-19).
 *
 * MOMO labels every physical BOX with a CG number; a tracking's boxes are a
 * CONTIGUOUS range, sent as (packing-list col T "CG." / raw CG_NO):
 *
 *   "CG84280723002-CG84280723007"  → boxes CG…002..CG…007  (6 กล่อง)
 *   "CG84280723015"                → one box               (1 กล่อง)
 *
 * The hierarchy: ชิปเม้น (base tracking) → แทรคกิ้ง (box GROUP · -N/M) → กล่อง (CG).
 * The range's box count MUST equal the tracking's Total Parcel (famount/qty) —
 * a mismatch is a MOMO-data inconsistency to surface, never silently trust.
 *
 * Canonical storage on tb_forwarder = `fbox_mark` (already live — the แต้ม
 * packing reconcile fills it; the MOMO commit now fills it too, fill-when-empty).
 * Pure + client-safe.
 */

export type CgRange = {
  /** the raw value as given (trimmed) — the display form */
  display: string;
  /** first box number (full CG string) */
  start: string;
  /** last box number (full CG string) — same as start for a single box */
  end: string;
  /** how many boxes the range spans (end − start + 1) · null when unparseable */
  count: number | null;
};

/** Trailing digit run of a CG token. CG ids are ≤13 digits (< 2^53) so Number is
 *  exact; a run longer than 15 digits → refuse (never a float-rounded count). */
function tailNum(token: string): { prefix: string; num: number; width: number } | null {
  const m = token.match(/^(.*?)(\d+)$/);
  if (!m || m[2].length > 15) return null;
  return { prefix: m[1], num: Number(m[2]), width: m[2].length };
}

/**
 * Parse a CG cell. Accepts "CGa-CGb" (range) or "CGa" (single). Returns null on
 * empty. `count` is null when the two ends don't share a prefix / b < a (garbage
 * → surface, don't guess).
 */
export function parseCgRange(raw: string | null | undefined): CgRange | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const parts = v.split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    return { display: v, start: parts[0], end: parts[0], count: 1 };
  }
  if (parts.length === 2) {
    const a = tailNum(parts[0]);
    const b = tailNum(parts[1]);
    if (a && b && a.prefix === b.prefix && b.num >= a.num) {
      const span = b.num - a.num + 1;
      // a sane box range is small — a huge span = mis-keyed, refuse the count
      const count = span <= 10_000 ? span : null;
      return { display: v, start: parts[0], end: parts[1], count };
    }
    return { display: v, start: parts[0], end: parts[1], count: null };
  }
  return { display: v, start: parts[0], end: parts[parts.length - 1], count: null };
}

/**
 * Does the CG range agree with the declared box count? true = consistent,
 * false = MISMATCH (flag it), null = can't judge (no CG / unparseable count /
 * no declared qty).
 */
export function cgMatchesQty(raw: string | null | undefined, qty: number | null | undefined): boolean | null {
  const r = parseCgRange(raw);
  if (!r || r.count == null) return null;
  if (qty == null || !(qty > 0)) return null;
  return r.count === qty;
}

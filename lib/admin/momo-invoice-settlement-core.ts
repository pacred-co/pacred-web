/**
 * MOMO invoice SETTLEMENT — pure decision core (no I/O · tsx-testable).
 *
 * The เหตุผล lives here; the fetch/write wrapper is actions/admin/momo-invoice-settlement.ts.
 * Read migration 0273 first for the domain (why settlement is keyed to the BILL, not the
 * ตู้ — a MOMO bill is billed per tracking and can span multiple containers).
 *
 * THREE pure functions, each independently unit-locked:
 *   - nextMomoSettlementSeq / momoSettlementDocNoFor — the running doc_no (MCS{yyMM}-{NNNN}).
 *   - selectSettleableLines — given a preview + an optional fid selection, split into the
 *     lines that CAN settle vs the requested ones that are BLOCKED (with a Thai reason).
 *   - decideDoublePayRefusal — refuse (naming the doc_no) if a selected row is already
 *     covered by a non-void settlement (the create-side double-pay guard · cnt-hs 2026-06-14).
 *
 * NO import from the "use server" action file → this module never pulls a server runtime dep.
 */

export const MOMO_SETTLEMENT_PREFIX = "MCS";

/** Build a settlement doc_no from a month token + sequence: MCS2607-0001. */
export function momoSettlementDocNoFor(yyMm: string, seq: number): string {
  return `${MOMO_SETTLEMENT_PREFIX}${yyMm}-${String(seq).padStart(4, "0")}`;
}

/**
 * Next sequence number for a month, given the existing settlement doc_nos. Robust to
 * zero-pad width (parses the numeric suffix, takes max+1) and ignores docs from other
 * months / malformed rows. First doc of the month → 1.
 */
export function nextMomoSettlementSeq(existingDocNos: readonly (string | null | undefined)[], yyMm: string): number {
  const prefix = `${MOMO_SETTLEMENT_PREFIX}${yyMm}-`;
  let max = 0;
  for (const d of existingDocNos) {
    if (typeof d !== "string" || !d.startsWith(prefix)) continue;
    const seq = Number.parseInt(d.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max + 1;
}

/** yyMM token (e.g. "2607") — kept here so the pure test doesn't reach into a date lib. */
export function yyMmToken(d: Date): string {
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The minimal preview-row shape the settlement decision needs (a subset of
 *  MomoIngestPreviewRow — declared here to avoid importing the "use server" action). */
export type SettlePreviewLine = {
  fid: number | null;
  tracking: string;
  fcabinetnumber: string | null;
  invoiceCost: number;
  currentCost: number | null;
  matched: boolean;
  cabinetConflict: boolean;
  duplicateFid: boolean;
};

/** A line that is eligible to settle — positively identified (matched · ตู้ตรง · not shared). */
export type SettleableLine = {
  fid: number;
  tracking: string;
  cabinet: string | null;
  amount: number;
  /** tb_forwarder.fcosttotalprice already == the invoice amount (the บันทึกต้นทุน step ran). */
  costWritten: boolean;
};

export type SettleSelection = {
  eligible: SettleableLine[];
  /** Requested fids that resolve to a blocked line (ineligible) — with the Thai reason. */
  blocked: { fid: number | null; tracking: string; reason: string }[];
};

const EPS = 0.005;

/** Is this a positively-identified, settleable line? (independent of the fid selection) */
function lineIsEligible(r: SettlePreviewLine): boolean {
  return r.matched && r.fid != null && !r.cabinetConflict && !r.duplicateFid;
}

/** Thai reason a matched-but-blocked line can't settle. */
function blockReasonOf(r: SettlePreviewLine): string {
  if (!r.matched) return "ไม่พบแทรคกิ้งนี้ในระบบ — ตัดจ่ายไม่ได้ (ยังจับคู่รายการนำเข้าไม่ได้)";
  if (r.cabinetConflict) return "ตู้ไม่ตรงกับที่ระบบผูกไว้ — ต้องตรวจให้ตรงกันก่อน จึงจะตัดจ่ายได้";
  if (r.duplicateFid) return "มีหลายบรรทัดบนใบชี้มาที่รายการเดียวกัน — ตัดจ่ายไม่ได้ (กันเขียนซ้ำ)";
  return "รายการนี้ยังตัดจ่ายไม่ได้";
}

/**
 * Split the preview into settleable lines vs blocked-but-requested lines.
 *
 * @param rows           the preview rows (server re-derived)
 * @param requestedFids  when given, settle ONLY these fids (per-line ตัดจ่าย / a chosen set);
 *                       when omitted, settle every eligible line (ตัดจ่ายทั้งบิล).
 *
 * `blocked` only reports fids the caller EXPLICITLY requested (so ตัดจ่ายทั้งบิล doesn't
 * surface every unmatched line as an error — those simply aren't billable here).
 */
export function selectSettleableLines(
  rows: readonly SettlePreviewLine[],
  requestedFids?: readonly number[],
): SettleSelection {
  const requested = requestedFids ? new Set(requestedFids) : null;
  const eligible: SettleableLine[] = [];
  const blocked: SettleSelection["blocked"] = [];
  // A requested fid that doesn't resolve to any row at all (stale client) → surface it.
  const seenRequestedFids = new Set<number>();

  for (const r of rows) {
    const requestedThis = requested == null || (r.fid != null && requested.has(r.fid));
    if (requested != null && r.fid != null && requested.has(r.fid)) seenRequestedFids.add(r.fid);
    if (!requestedThis) continue;

    if (lineIsEligible(r)) {
      eligible.push({
        fid: r.fid as number,
        tracking: r.tracking,
        cabinet: r.fcabinetnumber,
        amount: r.invoiceCost,
        costWritten: Math.abs((r.currentCost ?? 0) - r.invoiceCost) <= EPS,
      });
    } else if (requested != null) {
      // Only report explicitly-requested rows as blocked (ทั้งบิล mode skips the noise).
      blocked.push({ fid: r.fid, tracking: r.tracking, reason: blockReasonOf(r) });
    }
  }

  // Dedupe eligible by fid (a preview can't share a fid across rows without duplicateFid,
  // but stay defensive) — first wins.
  const byFid = new Map<number, SettleableLine>();
  for (const l of eligible) if (!byFid.has(l.fid)) byFid.set(l.fid, l);

  // Requested fids that matched no row at all (stale selection).
  if (requested != null) {
    for (const fid of requested) {
      if (!byFid.has(fid) && !seenRequestedFids.has(fid) && !blocked.some((b) => b.fid === fid)) {
        blocked.push({ fid, tracking: `#${fid}`, reason: "ไม่พบรายการนี้ในใบที่อ่านล่าสุด — โหลดใบใหม่อีกครั้ง" });
      }
    }
  }

  return { eligible: [...byFid.values()], blocked };
}

/**
 * Refuse (with a Thai message naming the doc_no) if any selected line is already covered by
 * a non-void settlement. `paidByFid` maps fid → the doc_no of the settlement already covering
 * it (built from a query of non-void settlement lines). null = clear to settle.
 */
export function decideDoublePayRefusal(
  selected: readonly SettleableLine[],
  paidByFid: ReadonlyMap<number, string>,
): string | null {
  const hits = selected.filter((l) => paidByFid.has(l.fid));
  if (hits.length === 0) return null;
  const list = hits.map((l) => `${l.tracking} (บิล ${paidByFid.get(l.fid)})`).join(" · ");
  return `รายการนี้ตัดจ่ายไปแล้ว — ตัดจ่ายซ้ำไม่ได้: ${list}`;
}

/** Round to 2dp (money) — shared so the header total matches the summed lines exactly. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

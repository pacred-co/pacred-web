/**
 * Yiwu upload-2 (packing list) → MONEY-FREE reconcile planner (2026-07-16 · ภูม · Phase 3).
 *
 * WHY A PURE PLANNER (the money-safety lesson · 2026-07-15):
 * ─────────────────────────────────────────────────────────
 * The first attempt fed Yiwu into the MOMO `momo-packing-reconcile` and broadened its
 * sibling match with a LIKE `<base>-%`. Adversarial review (3 skeptics) killed it —
 * in the MOMO path the sibling SET drives the SELL basis (fweight/fvolume) + reprice,
 * so a stray off-file `<base>-N` (or a cross-customer prefix collision) changed the
 * verdict/writeFid → mis-priced / double-billed / under-billed MOMO rows. That was
 * REVERTED; the MOMO reconcile is pristine.
 *
 * This Yiwu planner is a SEPARATE, money-free path. It computes NOTHING about money:
 * the ใบส่งของ (upload-1) already set the basis + price. Upload-2 only:
 *   1) precisely re-filters the LIKE candidates to the EXACT base (baseTrackingOf === base),
 *   2) refuses to write if the matched set spans >1 customer (userid-consistency guard),
 *   3) assigns the container to rows whose cabinet is EMPTY (never overwrites),
 *   4) advances fstatus 1/2 → 3 (never a billed 5/6/7, never a demote).
 * A misread here can at worst touch the wrong cabinet/status on a guarded row — it can
 * NEVER mis-compute money, because no money is computed. That is the safety by design.
 */

import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";

export type YiwuSibling = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
  userid: string | null;
};

export type YiwuReconcilePlan =
  | {
      ok: true;
      base: string;
      userid: string;
      matched: number;          // exact-base siblings found
      assignCabinetFids: number[]; // non-billed rows with an EMPTY cabinet → set container
      advanceFids: number[];    // non-billed rows at fstatus 1/2 → advance to 3
      alreadyDone: boolean;     // nothing left to write (idempotent re-run)
    }
  | { ok: false; base: string; skipped: true; reason: string };

const BILLED = new Set(["5", "6", "7"]);
const EARLY = new Set(["1", "2"]);

const clean = (s: string | null | undefined) => (s ?? "").trim();

/**
 * Plan the money-free writes for ONE packing-list base 单号 against the tb_forwarder rows
 * the DB returned for it (fetched via `.or(eq base, like base-%)`). Pure + testable.
 *
 * @param base       the 单号 off the packing list
 * @param container  the container name (→ fcabinetnumber). "" → no cabinet write, only advance.
 * @param candidates rows the LIKE returned (a superset — this function narrows to the exact base)
 */
export function planYiwuReconcile(
  base: string,
  container: string,
  candidates: YiwuSibling[],
): YiwuReconcilePlan {
  const b = base.trim();
  // (1) precise filter — a raw prefix LIKE can false-match "123" vs "1234-1/2";
  //     baseTrackingOf strips the "-N/M" suffix so only the true base survives.
  const exact = candidates.filter((s) => baseTrackingOf(clean(s.ftrackingchn)) === b);
  if (exact.length === 0) {
    return { ok: false, base: b, skipped: true, reason: "ไม่พบออเดอร์ในระบบ (ยังไม่อัปใบส่งของ?)" };
  }

  // (2) userid-consistency guard — the upload-1 split siblings are ONE PR. More than
  //     one distinct userid = a cross-customer collision → refuse to write, flag it.
  const uids = new Set(exact.map((s) => clean(s.userid)).filter(Boolean));
  if (uids.size !== 1) {
    return { ok: false, base: b, skipped: true, reason: `ชนข้ามลูกค้า (พบ ${uids.size} รหัสลูกค้าในเลขเดียวกัน)` };
  }
  const userid = [...uids][0]!;

  // (3)+(4) never touch a billed row; assign cabinet only where empty; advance only 1/2.
  const nonBilled = exact.filter((s) => !BILLED.has(clean(s.fstatus)));
  const cab = container.trim();
  const assignCabinetFids = cab
    ? nonBilled.filter((s) => clean(s.fcabinetnumber) === "").map((s) => s.id)
    : [];
  const advanceFids = nonBilled.filter((s) => EARLY.has(clean(s.fstatus))).map((s) => s.id);

  return {
    ok: true,
    base: b,
    userid,
    matched: exact.length,
    assignCabinetFids,
    advanceFids,
    alreadyDone: assignCabinetFids.length === 0 && advanceFids.length === 0,
  };
}

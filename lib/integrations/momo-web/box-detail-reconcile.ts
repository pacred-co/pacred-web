import "server-only";

/**
 * MOMO box-count SELF-HEAL — the SQL writer (owner 2026-07-16 · money-critical).
 *
 * The 6th best-effort pass of propagateMomoLiveStatusAndData (after STATUS, DATA,
 * per-box detail, CABINET, BOX-SPLIT). Where the SPLIT pass CREATES sibling rows
 * (and is idempotent — it skips a base that already has ANY sibling), THIS pass
 * REPAIRS a base whose siblings already exist but drifted from the momo_box_detail
 * truth: a leftover aggregate-weight BARE base that double-counts, or a "-N/M" detail
 * row that wrongly carries the group aggregate. It CONVERGES each multi-box group to
 * the momo_box_detail truth every cron, so the corruption CLASS can never persist.
 *
 * The DECISION (which rows to fix/zero + every money guard) lives in the PURE,
 * unit-tested `box-detail-reconcile-plan.ts`. THIS module does the SQL: load the group
 * rows + boxes, apply the plan, and persist — UNBILLED-ONLY, momo-corroborated, never
 * a money-carrying anchor. See the plan header for the full guard set.
 *
 * 💰 MONEY-SAFETY: every write is guarded WHERE fstatus ∈ {1,2,3,4} (the .in() gate
 *    makes a race into billing update 0 rows · TOCTOU-safe); a bare-zero also requires
 *    ftotalprice ≤ 0 (never zeroes a priced anchor). A priced detail fix writes the
 *    twin-corroborated re-price; an unpriced fix sets the metrics then re-prices from
 *    its own คิว via the proven computeAndFillForwarderImportRate (which itself writes
 *    ONLY the 3 rate columns and never a silent ฿0). Best-effort per base: a failure
 *    never throws / aborts the cron. IDEMPOTENT: a healthy base is a no-op.
 *
 * @see lib/integrations/momo-web/box-detail-reconcile-plan.ts  — the pure plan + guard (unit-tested)
 * @see lib/integrations/momo-web/split-box-rows.ts             — the CREATE-siblings pass (pass 5)
 * @see lib/integrations/momo-web/propagate-live-data.ts         — the caller (pass 6)
 * @see lib/forwarder/live-rate.ts                               — computeAndFillForwarderImportRate (re-price)
 * @see scripts/fix-momo-boxcount-corrupt-2026-07-16.mjs         — the one-off data-fix these guards are ported from
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import {
  planBoxDetailReconcile,
  baseOf,
  type ReconcileForwarderRow,
  type ReconcileBox,
  type ReconcileReviewKind,
} from "./box-detail-reconcile-plan";

/** fstatus codes a self-heal MAY write to (everything not in/through billing). The
 *  `.in()` WHERE makes a race into billing update 0 rows (TOCTOU-safe · defence #2;
 *  the plan's isBilled guard is defence #1). */
const FILLABLE_FSTATUS: string[] = ["1", "2", "3", "4"];

export type BoxDetailReconcileResult = {
  /** Distinct base trackings scanned (the multi-box candidate set). */
  basesScanned: number;
  /** base+userid groups that produced at least one fix/zero. */
  groupsReconciled: number;
  /** "-N/M" detail rows converged to their momo box truth. */
  detailFixed: number;
  /** Detail rows re-priced after an UNPRICED fix (via the engine). */
  repriced: number;
  /** Leftover aggregate bare bases zeroed. */
  baresZeroed: number;
  /** Rows the plan REFUSED to auto-heal, counted by reason (money-sensitive / momo-suspect). */
  reviews: Partial<Record<ReconcileReviewKind, number>>;
  /** Per-item errors. Best-effort: an error never aborts the whole run. */
  errors: Array<{ scope: string; message: string }>;
};

export function emptyBoxDetailReconcileResult(): BoxDetailReconcileResult {
  return {
    basesScanned: 0,
    groupsReconciled: 0,
    detailFixed: 0,
    repriced: 0,
    baresZeroed: 0,
    reviews: {},
    errors: [],
  };
}

/** A momo_box_detail row shape as stored. */
type BoxDetailRow = {
  base_tracking: string | null;
  box_tracking: string | null;
  width: number | string | null;
  length: number | string | null;
  height: number | string | null;
  weight_kg: number | string | null;
  cbm: number | string | null;
  quantity: number | string | null;
};

/** The tb_forwarder columns the plan needs. */
const FWD_COLS =
  "id, ftrackingchn, fstatus, famount, famountcount, fweight, fvolume, " +
  "fwidth, flength, fheight, ftotalprice, frefrate, frefprice, userid";

type FwdRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  famount: number | string | null;
  famountcount: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  ftotalprice: number | string | null;
  frefrate: number | string | null;
  frefprice: number | string | null;
  userid: string | null;
};

function toPlanRow(r: FwdRow): ReconcileForwarderRow {
  return {
    id: Number(r.id),
    ftrackingchn: String(r.ftrackingchn ?? ""),
    fstatus: r.fstatus,
    famount: r.famount,
    famountcount: r.famountcount,
    fweight: r.fweight,
    fvolume: r.fvolume,
    fwidth: r.fwidth,
    flength: r.flength,
    fheight: r.fheight,
    ftotalprice: r.ftotalprice,
    frefrate: r.frefrate,
    frefprice: r.frefprice,
  };
}

/**
 * Reconcile the multi-box bases in `baseTrackings` to the momo_box_detail truth.
 * Money-safe, best-effort, idempotent. The cron passes the DURABLE multi-box set
 * (findMultiBoxBases) so a stranded corrupt base still gets healed.
 *
 * @param admin        service-role client (bypasses RLS · server-only)
 * @param baseTrackings the base trackings to consider (dedup'd internally)
 */
export async function reconcileMomoBoxDetailRows(
  admin: SupabaseClient,
  baseTrackings: readonly string[],
  result: BoxDetailReconcileResult = emptyBoxDetailReconcileResult(),
): Promise<BoxDetailReconcileResult> {
  const bases = Array.from(
    new Set(baseTrackings.map((t) => baseOf((t ?? "").trim())).filter(Boolean)),
  );
  if (bases.length === 0) return result;

  // ── 1. Load momo_box_detail boxes for these bases (chunked) ──
  const boxesByBase = new Map<string, BoxDetailRow[]>();
  const CHUNK = 200;
  for (let i = 0; i < bases.length; i += CHUNK) {
    const slice = bases.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("momo_box_detail")
      .select("base_tracking, box_tracking, width, length, height, weight_kg, cbm, quantity")
      .in("base_tracking", slice);
    if (error) {
      console.error("[reconcileMomoBoxDetail] momo_box_detail lookup failed", {
        code: error.code, message: error.message,
      });
      result.errors.push({ scope: "box_detail_lookup", message: `${error.code} ${error.message}` });
      continue;
    }
    for (const r of (data ?? []) as unknown as BoxDetailRow[]) {
      const base = (r.base_tracking ?? "").trim();
      if (!base) continue;
      const arr = boxesByBase.get(base) ?? [];
      arr.push(r);
      boxesByBase.set(base, arr);
    }
  }

  // Only bases with >1 box are self-heal candidates (nothing to reconcile otherwise).
  const multiBoxBases = Array.from(boxesByBase.entries()).filter(([, rows]) => rows.length > 1);
  result.basesScanned = multiBoxBases.length;
  if (multiBoxBases.length === 0) return result;

  // ── 2. Per candidate base, load all tb_forwarder rows sharing it, plan, apply ──
  for (const [base, boxRows] of multiBoxBases) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(FWD_COLS)
      .or(`ftrackingchn.eq.${base},ftrackingchn.like.${base}-%`);
    if (fwdErr) {
      console.error("[reconcileMomoBoxDetail] tb_forwarder lookup failed", {
        code: fwdErr.code, message: fwdErr.message, base,
      });
      result.errors.push({ scope: `fwd_lookup:${base}`, message: `${fwdErr.code} ${fwdErr.message}` });
      continue;
    }
    // Keep ONLY rows whose base is EXACTLY this base (the .like could catch a longer
    // tracking that shares a prefix — e.g. base "178055573" vs "1780555731").
    const allRows = (fwdRows ?? []) as unknown as FwdRow[];
    const exact = allRows.filter((r) => baseOf(String(r.ftrackingchn ?? "")) === base);
    if (exact.length === 0) continue;

    // Group by userid — a base tracking belongs to one customer, but group defensively
    // so the plan's (base,userid) group contract holds even if data is dirty.
    const byUser = new Map<string, FwdRow[]>();
    for (const r of exact) {
      const key = String(r.userid ?? "");
      const arr = byUser.get(key) ?? [];
      arr.push(r);
      byUser.set(key, arr);
    }

    const boxes: ReconcileBox[] = boxRows.map((b) => ({
      boxTracking: (b.box_tracking ?? "").trim(),
      width: b.width,
      length: b.length,
      height: b.height,
      weightKg: b.weight_kg,
      cbm: b.cbm,
      quantity: b.quantity,
    }));

    for (const [, userRows] of byUser) {
      const group = userRows.map(toPlanRow);
      const plan = planBoxDetailReconcile(group, boxes);

      // tally reviews (visibility only — the writer never acts on them).
      for (const rev of plan.reviews) {
        result.reviews[rev.kind] = (result.reviews[rev.kind] ?? 0) + 1;
      }
      if (plan.detailFixes.length === 0 && plan.bareZeroes.length === 0) continue;

      let touchedGroup = false;

      // ── 2a. DETAIL fixes — converge a "-N/M" row to its box truth ──
      for (const fix of plan.detailFixes) {
        const update: Record<string, number | string> = {
          famount: fix.truth.famount,
          fweight: fix.truth.fweight,
          fvolume: fix.truth.fvolume,
          fwidth: fix.truth.fwidth,
          flength: fix.truth.flength,
          fheight: fix.truth.fheight,
          // truth.fvolume is the row TOTAL (Σ of its own box) → latch famountcount='1'
          // so no consumer re-multiplies by famount (the CBMProduct rule — same latch
          // as adminUpdateMomoBoxDetails + the แต้ม reconcile).
          famountcount: "1",
        };
        // A priced fix carries its own twin-corroborated re-price; an unpriced fix
        // leaves price to the engine re-price below (never write a guessed ฿).
        if (fix.priced) update.ftotalprice = fix.newPrice;

        const { data: updRows, error: updErr } = await admin
          .from("tb_forwarder")
          .update(update)
          .eq("id", fix.id)
          .in("fstatus", FILLABLE_FSTATUS) // TOCTOU: a race into billing → 0 rows → skip.
          .select("id");
        if (updErr) {
          console.error("[reconcileMomoBoxDetail] detail-fix update failed", {
            code: updErr.code, message: updErr.message, id: fix.id, base,
          });
          result.errors.push({ scope: `detail:${fix.id}`, message: `${updErr.code} ${updErr.message}` });
          continue;
        }
        if (!updRows || updRows.length === 0) continue; // raced into billing → skip.
        result.detailFixed += 1;
        touchedGroup = true;

        // UNPRICED fix → re-price from its own คิว via the proven engine (writes only
        // the 3 rate columns · refuses a silent ฿0). A priced fix already carries its
        // frozen twin-corroborated price → do NOT re-price (that would move money).
        if (!fix.priced) {
          try {
            const rr = await computeAndFillForwarderImportRate(admin, fix.id);
            if (rr.wrote) result.repriced += 1;
            else if (!rr.ok) {
              console.error("[reconcileMomoBoxDetail] re-price failed", { id: fix.id, reason: rr.reason });
            }
          } catch (e) {
            console.error("[reconcileMomoBoxDetail] re-price threw", {
              id: fix.id, error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      // ── 2b. BARE zeroes — a redundant aggregate header (metrics → 0) ──
      for (const bz of plan.bareZeroes) {
        const { data: zRows, error: zErr } = await admin
          .from("tb_forwarder")
          .update({ famount: 0, fweight: 0, fvolume: 0 })
          .eq("id", bz.id)
          .in("fstatus", FILLABLE_FSTATUS) // TOCTOU: race into billing → 0 rows → skip.
          .lte("ftotalprice", 0) // NEVER zero a priced anchor (price-race guard).
          .select("id");
        if (zErr) {
          console.error("[reconcileMomoBoxDetail] bare-zero update failed", {
            code: zErr.code, message: zErr.message, id: bz.id, base,
          });
          result.errors.push({ scope: `bare:${bz.id}`, message: `${zErr.code} ${zErr.message}` });
          continue;
        }
        if (!zRows || zRows.length === 0) continue; // raced (priced / billed) → skip.
        result.baresZeroed += 1;
        touchedGroup = true;
      }

      if (touchedGroup) result.groupsReconciled += 1;
    }
  }

  return result;
}

import "server-only";

/**
 * MOMO box-split → N sibling tb_forwarder rows — the SQL writer (owner/ภูม 2026-07-02).
 *
 * The 5th best-effort pass of propagateMomoLiveStatusAndData (after STATUS, DATA,
 * per-box detail, CABINET). It turns an AGGREGATE tb_forwarder row (one row per base
 * tracking, famount=N, the per-box ก×ย×ส stashed in momo_box_detail) into N SIBLING
 * rows — one per box — the SAME shape the already-correct trackings X90012661 /
 * 800117017081 have, so the normal editor + report render each box as its own row and
 * MOMO's "-1/n … -n/n" is mirrored 1:1.
 *
 * HOW (matches the 800117017081 pattern)
 * ──────────────────────────────────────
 *   - The FIRST box (the anchor) → UPDATE the EXISTING aggregate row in place: keep
 *     its id + its BARE base tracking (suffix 0 = the เหมาๆ anchor + preserves the
 *     momo_import_tracks.committed_forwarder_id linkage), set box-1's own metrics.
 *   - Boxes 2..N → INSERT new sibling rows: ftrackingchn = "<base>-i/n", CLONE every
 *     non-metric field from the aggregate (userid/carrier/address/cabinet/dates/…),
 *     set each box's own metrics, and reset the price columns to 0.
 *   - Then RE-PRICE every row (anchor + new) from its OWN คิว via
 *     computeAndFillForwarderImportRate — each row prices on its own box, and the Σ
 *     equals what the single aggregate row would have priced (money-neutral).
 *
 * 💰 MONEY-SAFETY — the money-neutral GUARD lives in the pure planBoxRowSplit
 *    (split-box-rows-plan.ts): it splits ONLY when the row is UNBILLED (fstatus
 *    1/2/3/4), UNPRICED (ftotalprice ≤ 0), has NO linked ฝากสั่งซื้อ (reforder=''),
 *    and the box_detail Σ(pieces/weight/คิว) MATCHES the aggregate famount/fweight/
 *    fvolume (so the split can never change the SELL basis). A mismatched/priced/
 *    billed aggregate is LEFT INTACT + counted as skipped. IDEMPOTENT: a base that
 *    already has sibling rows (suffix > 0) is skipped (never double-splits).
 *
 *    The INSERT/UPDATE touch ONLY this one shipment's rows; billing groups by base
 *    tracking so N siblings = ONE customer bill (verified: forwarder-debit-total.ts
 *    เหมาๆ anchor on suffix-0 + billing-run.ts per-row calcForwarderGross Σ).
 *
 * @see lib/integrations/momo-web/split-box-rows-plan.ts   — the pure plan + guard (unit-tested)
 * @see lib/integrations/momo-web/propagate-live-data.ts   — the caller (pass 5)
 * @see lib/integrations/momo-web/box-detail.ts            — pass 3 writes the momo_box_detail this reads
 * @see lib/forwarder/live-rate.ts                          — computeAndFillForwarderImportRate (re-price)
 * @see scripts/split-aggregated-momo-boxes-2026-07-02.ts   — the one-off backfill (shares this core)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import {
  planBoxRowSplit,
  baseOf,
  suffixOf,
  type BoxDetailInput,
  type AggregateRowInput,
  type SplitSkipReason,
} from "./split-box-rows-plan";

/** fstatus codes IN or THROUGH billing — a split must NEVER touch these rows (defence
 *  #1; the plan's guard is defence #2, the WHERE `.in('fstatus', …)` is defence #3). */
const FILLABLE_FSTATUS: string[] = ["1", "2", "3", "4"];

/** Metric/price columns we set per-sibling — everything else is CLONED from the aggregate. */
const CLONE_OMIT = new Set<string>([
  "id",
  // per-box metrics (set from the box)
  "ftrackingchn", "fweight", "fvolume", "fwidth", "flength", "fheight", "famount",
  // price columns (reset to 0 → re-priced from the box's own คิว)
  "ftotalprice", "frefrate", "frefprice",
]);

export type BoxSplitResult = {
  /** Distinct base trackings that had >1 box in momo_box_detail (candidates). */
  candidates: number;
  /** Aggregate rows actually split into siblings. */
  split: number;
  /** New sibling rows INSERTed (Σ of boxes 2..N across every split). */
  siblingsCreated: number;
  /** Rows re-priced after the split (anchor + new siblings). */
  repriced: number;
  /** Aggregates left intact, by reason (money-neutral guard / idempotency). */
  skipped: Record<SplitSkipReason | "already_split" | "no_aggregate_row", number>;
  /** Per-item errors. Best-effort: an error never aborts the whole run. */
  errors: Array<{ scope: string; message: string }>;
};

export function emptyBoxSplitResult(): BoxSplitResult {
  return {
    candidates: 0,
    split: 0,
    siblingsCreated: 0,
    repriced: 0,
    skipped: {
      already_billed: 0,
      has_reforder: 0,
      already_priced: 0,
      not_multi_box: 0,
      qty_mismatch: 0,
      weight_mismatch: 0,
      cbm_mismatch: 0,
      not_bare_base: 0,
      already_split: 0,
      no_aggregate_row: 0,
    },
    errors: [],
  };
}

/** A momo_box_detail row (the per-box dims MOMO Live already persisted in pass 3). */
type BoxDetailRow = {
  base_tracking: string;
  box_tracking: string;
  width: number | string | null;
  length: number | string | null;
  height: number | string | null;
  weight_kg: number | string | null;
  cbm: number | string | null;
  quantity: number | string | null;
};

function n(v: number | string | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const p = parseFloat(v);
  return Number.isFinite(p) ? p : 0;
}

/**
 * Split the aggregate tb_forwarder rows for the given base trackings into N sibling
 * box rows (one per momo_box_detail box), money-neutral + idempotent.
 *
 * @param admin        service-role client (bypasses RLS · server-only)
 * @param baseTrackings the base trackings to consider (dedup'd internally). When
 *                     omitted/empty, nothing runs — the caller (Live pass) derives
 *                     these from the multi-box bases seen on the current scrape.
 */
export async function splitAggregatedMomoBoxRows(
  admin: SupabaseClient,
  baseTrackings: readonly string[],
  result: BoxSplitResult = emptyBoxSplitResult(),
): Promise<BoxSplitResult> {
  const bases = Array.from(
    new Set(baseTrackings.map((t) => baseOf((t ?? "").trim())).filter(Boolean)),
  );
  if (bases.length === 0) return result;

  // ── 1. Load the momo_box_detail boxes for these bases (chunked) ──
  const boxesByBase = new Map<string, BoxDetailRow[]>();
  const CHUNK = 200;
  for (let i = 0; i < bases.length; i += CHUNK) {
    const slice = bases.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("momo_box_detail")
      .select("base_tracking, box_tracking, width, length, height, weight_kg, cbm, quantity")
      .in("base_tracking", slice);
    if (error) {
      console.error("[splitAggregatedMomoBoxRows] momo_box_detail lookup failed", {
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

  // Only bases with >1 box are split candidates.
  const multiBoxBases = Array.from(boxesByBase.entries()).filter(([, rows]) => rows.length > 1);
  result.candidates = multiBoxBases.length;
  if (multiBoxBases.length === 0) return result;

  // ── 2. For each candidate base, load ALL tb_forwarder rows sharing it (base + siblings) ──
  for (const [base, boxRows] of multiBoxBases) {
    // Look up by exact base AND its "-%" siblings so we can detect an already-split
    // shipment (a suffixed sibling already present → skip · idempotent).
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("*")
      .or(`ftrackingchn.eq.${base},ftrackingchn.like.${base}-%`);
    if (fwdErr) {
      console.error("[splitAggregatedMomoBoxRows] tb_forwarder lookup failed", {
        code: fwdErr.code, message: fwdErr.message, base,
      });
      result.errors.push({ scope: `fwd_lookup:${base}`, message: `${fwdErr.code} ${fwdErr.message}` });
      continue;
    }
    const rows = (fwdRows ?? []) as Array<Record<string, unknown>>;
    // Keep ONLY rows whose base tracking is EXACTLY this base (the .like could catch a
    // longer tracking that shares a prefix — e.g. base "178055573" vs "1780555731").
    const exact = rows.filter((r) => baseOf(String(r.ftrackingchn ?? "")) === base);

    if (exact.length === 0) {
      result.skipped.no_aggregate_row += 1;
      continue;
    }
    // IDEMPOTENT: if ANY sibling with a suffix already exists, this shipment is already
    // split → leave it (never double-split).
    const hasSuffixSibling = exact.some((r) => suffixOf(String(r.ftrackingchn ?? "")) > 0);
    if (hasSuffixSibling) {
      result.skipped.already_split += 1;
      continue;
    }
    // Exactly one aggregate row (the bare base) is expected.
    const aggregate = exact.find((r) => suffixOf(String(r.ftrackingchn ?? "")) === 0);
    if (!aggregate) {
      result.skipped.not_bare_base += 1;
      continue;
    }

    // ── 3. Ask the pure plan whether + how to split (money-neutral guard) ──
    const aggInput: AggregateRowInput = {
      id: Number(aggregate.id),
      ftrackingchn: String(aggregate.ftrackingchn ?? ""),
      fstatus: String(aggregate.fstatus ?? ""),
      reforder: String(aggregate.reforder ?? ""),
      ftotalprice: n(aggregate.ftotalprice as number | string | null),
      famount: n(aggregate.famount as number | string | null),
      fweight: n(aggregate.fweight as number | string | null),
      fvolume: n(aggregate.fvolume as number | string | null),
    };
    const boxInputs: BoxDetailInput[] = boxRows.map((b) => ({
      boxTracking: (b.box_tracking ?? "").trim(),
      weightKgPerPiece: n(b.weight_kg),
      cbmPerPiece: n(b.cbm),
      width: n(b.width),
      length: n(b.length),
      height: n(b.height),
      quantity: n(b.quantity),
    }));

    const decision = planBoxRowSplit(aggInput, boxInputs);
    if (!decision.split) {
      result.skipped[decision.reason] += 1;
      continue;
    }

    // ── 4. Apply the plan ──
    // Clone template = the aggregate row MINUS id/metrics/price columns.
    const template: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(aggregate)) {
      if (!CLONE_OMIT.has(k)) template[k] = v;
    }

    const touchedIds: number[] = [];
    let stepFailed = false;

    // 4a. Anchor — UPDATE the aggregate in place (keep id + bare base tracking).
    const anchor = decision.rows.find((r) => r.isAnchor)!;
    const { data: updRows, error: updErr } = await admin
      .from("tb_forwarder")
      .update({
        fweight: anchor.fweight,
        fvolume: anchor.fvolume,
        fwidth: anchor.fwidth,
        flength: anchor.flength,
        fheight: anchor.fheight,
        famount: anchor.famount,
        // reset price so the re-price below computes from the box's own คิว.
        ftotalprice: 0,
        frefrate: 0,
        frefprice: "0",
        adminidupdate: "sys-split",
      })
      .eq("id", aggInput.id)
      // TOCTOU: only if STILL unbilled AND STILL the aggregate (famount unchanged) AND
      // STILL unpriced — a row that raced into billing / got split / got priced → 0 rows.
      .in("fstatus", FILLABLE_FSTATUS)
      .eq("famount", aggInput.famount)
      .lte("ftotalprice", 0)
      .select("id");
    if (updErr) {
      console.error("[splitAggregatedMomoBoxRows] anchor update failed", {
        code: updErr.code, message: updErr.message, base, id: aggInput.id,
      });
      result.errors.push({ scope: `anchor:${base}`, message: `${updErr.code} ${updErr.message}` });
      continue;
    }
    if (!updRows || updRows.length === 0) {
      // Raced (billed / already split / priced between read + write) → skip, not an error.
      result.skipped.already_split += 1;
      continue;
    }
    touchedIds.push(aggInput.id);

    // 4b. New siblings — INSERT boxes 2..N (clone + own metrics + reset price).
    const newRows = decision.rows
      .filter((r) => !r.isAnchor)
      .map((r) => ({
        ...template,
        ftrackingchn: r.ftrackingchn,
        fweight: r.fweight,
        fvolume: r.fvolume,
        fwidth: r.fwidth,
        flength: r.flength,
        fheight: r.fheight,
        famount: r.famount,
        ftotalprice: 0,
        frefrate: 0,
        frefprice: "0",
        adminidupdate: "sys-split",
      }));
    if (newRows.length > 0) {
      const { data: ins, error: insErr } = await admin
        .from("tb_forwarder")
        .insert(newRows)
        .select("id");
      if (insErr) {
        console.error("[splitAggregatedMomoBoxRows] sibling insert failed", {
          code: insErr.code, message: insErr.message, base, count: newRows.length,
        });
        result.errors.push({ scope: `siblings:${base}`, message: `${insErr.code} ${insErr.message}` });
        stepFailed = true;
      } else {
        for (const row of (ins ?? []) as Array<{ id: number }>) touchedIds.push(row.id);
        result.siblingsCreated += (ins ?? []).length;
      }
    }

    if (!stepFailed) result.split += 1;

    // ── 5. Re-price every touched row from its OWN คิว (best-effort · money-isolated) ──
    // computeAndFillForwarderImportRate writes ONLY frefrate/frefprice/ftotalprice and
    // never persists a silent ฿0 — so a rate-missing box stays at 0 for an admin to fill.
    for (const id of touchedIds) {
      try {
        const rr = await computeAndFillForwarderImportRate(admin, id);
        if (rr.wrote) result.repriced += 1;
        else if (!rr.ok) {
          console.error("[splitAggregatedMomoBoxRows] re-price failed", { id, reason: rr.reason });
        }
      } catch (e) {
        console.error("[splitAggregatedMomoBoxRows] re-price threw", { id, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return result;
}

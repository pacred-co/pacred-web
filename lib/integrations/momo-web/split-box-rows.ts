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
  type BoxSplitOptions,
  type SplitSkipReason,
} from "./split-box-rows-plan";

/** fstatus codes IN or THROUGH billing — a split must NEVER touch these rows (defence
 *  #1; the plan's guard is defence #2, the WHERE `.in('fstatus', …)` is defence #3). */
const FILLABLE_FSTATUS: string[] = ["1", "2", "3", "4"];

/**
 * SHIPMENT-LEVEL money columns — they belong to the WHOLE shipment (once), NOT per box.
 * They STAY on the ANCHOR (the UPDATE never touches them → preserved) and are set to 0 on
 * every new sibling (via CLONE_OMIT below), so Σ across the siblings === the aggregate.
 * (Cloning them onto N siblings would MULTIPLY the bill/cost — the double-count trap.)
 * Prod check 2026-07-03: all 27 multi-box aggregates have otherCharges=0, but 5 carry a
 * non-zero fcosttotalprice → this anchor-only rule is load-bearing for cost integrity.
 */
const SHIPMENT_LEVEL_MONEY: string[] = [
  "ftransportprice", "fpriceupdate", "fshippingservice",
  "pricecrate", "ftransportpricechnthb", "priceother", "fdiscount",
  "fcosttotalprice",
];

/** Metric/price columns we set per-sibling — everything else is CLONED from the aggregate. */
const CLONE_OMIT = new Set<string>([
  "id",
  // per-box metrics (set from the box)
  "ftrackingchn", "fweight", "fvolume", "fwidth", "flength", "fheight", "famount",
  // per-box SELL freight (reset to 0 + re-priced for an unpriced split · preserved for a priced split)
  "ftotalprice", "frefrate", "frefprice",
  // shipment-level money — anchor keeps it, siblings get 0 (never multiply)
  ...SHIPMENT_LEVEL_MONEY,
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
  opts: BoxSplitOptions = {},
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
      famountcount: aggregate.famountcount as string | null,
      fweight: n(aggregate.fweight as number | string | null),
      fvolume: n(aggregate.fvolume as number | string | null),
      frefrate: aggregate.frefrate as number | string | null,
      frefprice: aggregate.frefprice as number | string | null,
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

    const decision = planBoxRowSplit(aggInput, boxInputs, { allowPriced: opts.allowPriced });
    if (!decision.split) {
      result.skipped[decision.reason] += 1;
      continue;
    }

    // 💰 PRICED-split defence: the plan forces Σ(sibling ftotalprice) === the aggregate,
    // but VERIFY it here before writing a single row — a mismatch aborts this base (leaves
    // it intact) rather than risk a bill that drifts by even a satang.
    if (decision.priced) {
      const planSum = decision.rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0);
      const drift = Math.abs(Math.round(planSum * 100) / 100 - Math.round(aggInput.ftotalprice * 100) / 100);
      if (drift > 0.005) {
        console.error("[splitAggregatedMomoBoxRows] priced-split Σ drift — ABORT base", {
          base, planSum, aggregate: aggInput.ftotalprice, drift,
        });
        result.errors.push({ scope: `priced-drift:${base}`, message: `Σ ${planSum} ≠ ${aggInput.ftotalprice}` });
        continue;
      }
    }

    // ── 4. Apply the plan ──
    // Clone template = the aggregate row MINUS id/metrics/price columns.
    const template: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(aggregate)) {
      if (!CLONE_OMIT.has(k)) template[k] = v;
    }

    const touchedIds: number[] = [];

    // 💰 ORDER = SIBLINGS-FIRST, then ANCHOR, with a compensating DELETE if the anchor fails.
    // There is no cross-statement DB txn from the JS client, so we order the writes so NO partial
    // failure can under-bill: the aggregate's money is reduced (anchor UPDATE) ONLY AFTER the
    // siblings that carry the rest are safely inserted. If the anchor UPDATE then fails/0-rows,
    // we DELETE the just-inserted siblings → the aggregate is left WHOLE (its full price intact).
    // (Money review 2026-07-03 — the old anchor-first order silently lost the siblings' share on
    // an insert failure, and a re-run re-split the reduced anchor. The backfill uses a real txn.)
    const anchor = decision.rows.find((r) => r.isAnchor)!;
    const anchorPrice = decision.priced
      ? { ftotalprice: Number(anchor.ftotalprice ?? 0), frefrate: anchor.frefrate ?? 0, frefprice: anchor.frefprice ?? "0" }
      : { ftotalprice: 0, frefrate: 0, frefprice: "0" };

    // 4a. INSERT siblings (boxes 2..N) FIRST. Clone non-money fields, set each box's own metrics,
    // FORCE every shipment-level money column to 0 (anchor keeps them · no multiply), set the
    // freight: 0 for an unpriced split (re-priced below) · the PRESERVED share for a priced split.
    const zeroShipmentMoney = Object.fromEntries(SHIPMENT_LEVEL_MONEY.map((k) => [k, 0]));
    const newRows = decision.rows
      .filter((r) => !r.isAnchor)
      .map((r) => ({
        ...template,
        ...zeroShipmentMoney,
        ftrackingchn: r.ftrackingchn,
        fweight: r.fweight,
        fvolume: r.fvolume,
        fwidth: r.fwidth,
        flength: r.flength,
        fheight: r.fheight,
        famount: r.famount,
        ftotalprice: decision.priced ? Number(r.ftotalprice ?? 0) : 0,
        frefrate: decision.priced ? (r.frefrate ?? 0) : 0,
        frefprice: decision.priced ? (r.frefprice ?? "0") : "0",
        adminidupdate: "sys-split",
      }));
    const insertedIds: number[] = [];
    if (newRows.length > 0) {
      const { data: ins, error: insErr } = await admin.from("tb_forwarder").insert(newRows).select("id");
      if (insErr) {
        // Siblings failed → the aggregate is UNTOUCHED (whole) → clean skip, no money moved.
        console.error("[splitAggregatedMomoBoxRows] sibling insert failed (aggregate intact)", {
          code: insErr.code, message: insErr.message, base, count: newRows.length,
        });
        result.errors.push({ scope: `siblings:${base}`, message: `${insErr.code} ${insErr.message}` });
        continue;
      }
      for (const row of (ins ?? []) as Array<{ id: number }>) insertedIds.push(row.id);
    }

    // 4b. UPDATE the anchor (keep id + bare base + shipment-level money) → reduce to its share.
    let updateQ = admin
      .from("tb_forwarder")
      .update({
        fweight: anchor.fweight,
        fvolume: anchor.fvolume,
        fwidth: anchor.fwidth,
        flength: anchor.flength,
        fheight: anchor.fheight,
        famount: anchor.famount,
        ...anchorPrice,
        adminidupdate: "sys-split",
      })
      .eq("id", aggInput.id)
      // TOCTOU: still unbilled AND still the aggregate (famount unchanged) — else 0 rows.
      .in("fstatus", FILLABLE_FSTATUS)
      .eq("famount", aggInput.famount);
    // Price-race guard: UNPRICED requires still-unpriced (≤0); PRICED requires price UNCHANGED.
    updateQ = decision.priced ? updateQ.eq("ftotalprice", aggInput.ftotalprice) : updateQ.lte("ftotalprice", 0);
    const { data: updRows, error: updErr } = await updateQ.select("id");

    if (updErr || !updRows || updRows.length === 0) {
      // Anchor failed/raced → COMPENSATE: delete the just-inserted siblings so the aggregate is
      // left WHOLE (full price on the untouched anchor). No under-bill, no over-bill.
      if (insertedIds.length > 0) {
        const { error: delErr } = await admin.from("tb_forwarder").delete().in("id", insertedIds);
        if (delErr) {
          // Double-failure — the ONLY over-count window. Log LOUD for a human to reconcile.
          console.error("[splitAggregatedMomoBoxRows] 🔴 CRITICAL: sibling rollback FAILED — over-count risk", {
            base, insertedIds, delCode: delErr.code, delMessage: delErr.message,
          });
          result.errors.push({ scope: `rollback:${base}`, message: `rollback failed: ${delErr.message}` });
        }
      }
      if (updErr) {
        console.error("[splitAggregatedMomoBoxRows] anchor update failed (siblings rolled back)", {
          code: updErr.code, message: updErr.message, base, id: aggInput.id,
        });
        result.errors.push({ scope: `anchor:${base}`, message: `${updErr.code} ${updErr.message}` });
      } else {
        result.skipped.already_split += 1; // raced (billed / split / re-priced)
      }
      continue;
    }

    touchedIds.push(aggInput.id, ...insertedIds);
    result.siblingsCreated += insertedIds.length;
    result.split += 1;

    // ── 5. Re-price every touched row from its OWN คิว (UNPRICED split ONLY) ──
    // For a PRICED split we PRESERVED the frozen per-box share (Σ === aggregate · the
    // customer's bill is byte-identical) — re-pricing it at the live rate would MOVE money
    // (rate drift · a per-box ค่าเทียบ kg/cbm flip), so we skip it. The row is now editable:
    // if MOMO's dims were wrong, staff edit a box → THAT re-prices just that box (intended).
    // computeAndFillForwarderImportRate writes ONLY frefrate/frefprice/ftotalprice and never
    // persists a silent ฿0 — so an unpriced rate-missing box stays 0 for an admin to fill.
    if (!decision.priced) {
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
  }

  return result;
}

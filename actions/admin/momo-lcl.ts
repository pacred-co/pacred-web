"use server";

/**
 * D1 Gap #6 — MOMO LCL sack tracking lookup (admin-only).
 *
 * Faithful port of legacy PCS Cargo PHP:
 *   backoffice.pcscargo.co.th/app/Controllers/Api/Routes/import-lcl-momo/check-tracks.php
 *
 * Flow (verbatim from check-tracks.php):
 *   1. Call MOMO sack-info API → { weight, tracks: ["CGxxx", "AAAA", ...] }
 *   2. For each track in `tracks`:
 *      - if starts with "CG" → SELECT productTracking, productCBMAll,
 *        productWeightAll FROM tb_tmp_forwarder_item_momo WHERE productID = ?
 *        On hit, REPLACE the displayed track with productTracking, accumulate.
 *      - else                → SELECT productCBMAll, productWeightAll
 *        FROM tb_tmp_forwarder_item_momo WHERE productTracking = ?
 *        On hit, accumulate (track unchanged).
 *   3. Return: { tracks (resolved), productCBMAllTotal, productWeightAllTotal,
 *              sackWeight }.
 *
 * tb_tmp_forwarder_item_momo is service-role-locked per migration 0081's RLS
 * pattern, so the admin client is correct.
 *
 * Auth gate: ops or accounting (super always passes via requireAdmin).
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { checkMomoSack, type MomoSackInfo } from "@/lib/integrations/momo-lcl/check-sack";
import { withAdmin, type AdminActionResult } from "./common";

const inputSchema = z.object({
  sackNo: z.string().trim().min(1, "กรุณาระบุ sack number").max(200),
});
export type CheckMomoSackInput = z.infer<typeof inputSchema>;

/**
 * One resolved track row, in MOMO's original order.
 * `track`            — the display tracking number (productTracking when a
 *                       CG-prefixed productID matched, else the raw MOMO track)
 * `momoTrack`        — the raw value MOMO returned (pre-resolution)
 * `matched`          — true when tb_tmp_forwarder_item_momo had a row
 * `matchedBy`        — which column the match came from
 * `productCBMAll`    — per-row CBM contribution (0 when no match)
 * `productWeightAll` — per-row weight contribution (0 when no match)
 */
export type ResolvedTrack = {
  track:            string;
  momoTrack:        string;
  matched:          boolean;
  matchedBy:        "productID" | "productTracking" | null;
  productCBMAll:    number;
  productWeightAll: number;
};

export type CheckMomoSackData = {
  sackNo:                 string;
  sackInfo:               MomoSackInfo;
  resolved:               ResolvedTrack[];
  productCBMAllTotal:     number;
  productWeightAllTotal:  number;
  matchedCount:           number;
  unmatchedCount:         number;
};

/**
 * Look up a MOMO LCL sack + join its tracks against the local
 * tb_tmp_forwarder_item_momo table. See file header for the algorithm.
 */
export async function adminCheckMomoSack(
  input: CheckMomoSackInput,
): Promise<AdminActionResult<CheckMomoSackData>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { sackNo } = parsed.data;

  return withAdmin(["ops", "accounting"], async () => {
    // ── 1. Hit MOMO ─────────────────────────────────────────────
    const sackRes = await checkMomoSack(sackNo);
    if (!sackRes.ok) {
      // not_configured is the expected "env missing" path — log as warn,
      // not error, so we don't spam Sentry during MOMO token rotation.
      if (sackRes.error === "not_configured") {
        logger.warn("momo-lcl", "MOMO_CARGO_SACK_TOKEN unset — degrade gracefully", { sackNo });
        return { ok: false, error: "momo_not_configured" };
      }
      logger.warn("momo-lcl", "MOMO sack lookup failed", { sackNo, error: sackRes.error });
      return { ok: false, error: sackRes.error };
    }
    const sackInfo = sackRes.data;

    // ── 2. Join tracks → tb_tmp_forwarder_item_momo ──────────────
    // Batch into two IN(...) queries (productid + producttracking) instead of
    // per-track round-trips. A typical MOMO sack carries 20-200 tracks; the
    // legacy PHP issues one query per track which is slow but identical
    // behaviour-wise to our batched form.
    const admin = createAdminClient();

    const cgInputs:    string[] = []; // tracks starting with "CG" → productid lookup
    const otherInputs: string[] = []; // remaining tracks            → producttracking lookup
    for (const t of sackInfo.tracks) {
      if (t.startsWith("CG")) cgInputs.push(t);
      else                    otherInputs.push(t);
    }

    type Row = { productid: string; producttracking: string; productcbmall: string | number; productweightall: string | number };

    // §0e dead-read fix (2026-06-15 · prod-probe-confirmed): the legacy staging
    // table `tb_tmp_forwarder_item_momo` is EMPTY on prod (0 rows) — Pacred's MOMO
    // sync lands per-track CBM/weight in `momo_import_tracks` (77 rows) instead. So
    // this lookup returned 0 for EVERY sack (the LCL verify tool was dead). Repoint
    // to the live table, aliasing columns back to the Row shape so downstream is
    // unchanged: productid←momo_cg_no (CG* tracks) · producttracking←momo_tracking_no
    // · productcbmall←cbm · productweightall←weight_kg (data-verified mapping).
    // NOTE: a few rows carry a COMPOUND momo_cg_no ("CGa-CGb"); exact .in() won't
    // match those — they stay unmatched (same as the prior all-empty behaviour · no
    // regression). Display-only tool (no money write).
    const sel = "productid:momo_cg_no, producttracking:momo_tracking_no, productcbmall:cbm, productweightall:weight_kg";

    const cgPromise = cgInputs.length === 0
      ? Promise.resolve({ data: [] as Row[], error: null })
      : admin
          .from("momo_import_tracks")
          .select(sel)
          .in("momo_cg_no", cgInputs);

    const otherPromise = otherInputs.length === 0
      ? Promise.resolve({ data: [] as Row[], error: null })
      : admin
          .from("momo_import_tracks")
          .select(sel)
          .in("momo_tracking_no", otherInputs);

    const [cgRes, otherRes] = await Promise.all([cgPromise, otherPromise]);
    if (cgRes.error)    logger.warn("momo-lcl", "CG lookup failed", { error: cgRes.error });
    if (otherRes.error) logger.warn("momo-lcl", "tracking lookup failed", { error: otherRes.error });

    // Index for O(1) lookup. The legacy script trusts the first DB hit so we
    // do the same (`fetch()` returns one row — if there are dupes we keep the
    // first).
    const byProductId       = new Map<string, Row>();
    const byProductTracking = new Map<string, Row>();
    for (const r of (cgRes.data ?? []) as Row[]) {
      if (!byProductId.has(r.productid)) byProductId.set(r.productid, r);
    }
    for (const r of (otherRes.data ?? []) as Row[]) {
      if (!byProductTracking.has(r.producttracking)) byProductTracking.set(r.producttracking, r);
    }

    // ── 3. Build resolved-track output ──────────────────────────
    let productCBMAllTotal    = 0;
    let productWeightAllTotal = 0;
    let matchedCount          = 0;

    const resolved: ResolvedTrack[] = sackInfo.tracks.map((rawTrack): ResolvedTrack => {
      if (rawTrack.startsWith("CG")) {
        const row = byProductId.get(rawTrack);
        if (row) {
          const cbm = Number(row.productcbmall ?? 0);
          const wt  = Number(row.productweightall ?? 0);
          productCBMAllTotal    += Number.isFinite(cbm) ? cbm : 0;
          productWeightAllTotal += Number.isFinite(wt)  ? wt  : 0;
          matchedCount++;
          return {
            track:            row.producttracking,
            momoTrack:        rawTrack,
            matched:          true,
            matchedBy:        "productID",
            productCBMAll:    Number.isFinite(cbm) ? cbm : 0,
            productWeightAll: Number.isFinite(wt)  ? wt  : 0,
          };
        }
        return {
          track:            rawTrack,
          momoTrack:        rawTrack,
          matched:          false,
          matchedBy:        null,
          productCBMAll:    0,
          productWeightAll: 0,
        };
      }

      const row = byProductTracking.get(rawTrack);
      if (row) {
        const cbm = Number(row.productcbmall ?? 0);
        const wt  = Number(row.productweightall ?? 0);
        productCBMAllTotal    += Number.isFinite(cbm) ? cbm : 0;
        productWeightAllTotal += Number.isFinite(wt)  ? wt  : 0;
        matchedCount++;
        return {
          track:            rawTrack,
          momoTrack:        rawTrack,
          matched:          true,
          matchedBy:        "productTracking",
          productCBMAll:    Number.isFinite(cbm) ? cbm : 0,
          productWeightAll: Number.isFinite(wt)  ? wt  : 0,
        };
      }
      return {
        track:            rawTrack,
        momoTrack:        rawTrack,
        matched:          false,
        matchedBy:        null,
        productCBMAll:    0,
        productWeightAll: 0,
      };
    });

    // The legacy PHP formats: CBM to 5dp, weight to 2dp via number_format()
    // then casts back to float. Replicate so the totals are byte-identical.
    productCBMAllTotal    = Number(productCBMAllTotal.toFixed(6));
    productWeightAllTotal = Number(productWeightAllTotal.toFixed(2));

    return {
      ok: true,
      data: {
        sackNo,
        sackInfo,
        resolved,
        productCBMAllTotal,
        productWeightAllTotal,
        matchedCount,
        unmatchedCount: resolved.length - matchedCount,
      },
    };
  });
}

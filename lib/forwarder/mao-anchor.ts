import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { baseTrackingOf } from "@/lib/integrations/momo-web/live-parcel-metrics";
import { electMaoCarrier } from "@/lib/forwarder/mao-anchor-plan";

/**
 * WHICH ROW CARRIES THE เหมาๆ ฿100 — resolved PER SHIPMENT, across every batch.
 *
 * 🔴 owner 2026-07-16: "จ่ายแทนลูกค้า /admin/forwarders/52474 เอกสารไม่แจงค่าเหมาๆ ·
 * ระวังไปเก็บซ้ำด้วยนะครับเหมาๆ เหมือนเดิมครับ อย่าให้เกิดขึ้นอีก"
 *
 * ── THE TWO FAILURE MODES (never conflate) ────────────────────────────────────
 * (1) DROP — `computeForwarderDebitBatch` anchors the fee on the BASE row (suffix 0)
 *     and, by the 2026-06-23 กันเก็บตังเบิ้ล rule, "a -N box sub-row NEVER anchors".
 *     When MOMO splits at commit there is NO bare base row at all (JYM800120650588
 *     exists only as -1/4 … -4/4) → no row is eligible → maoFee = 0 → the fee vanishes
 *     from จ่ายแทนลูกค้า (PR139: collected 1,085.55 vs the bill's 1,184.54 = ฿98.99 short)
 *     and staff hand-patch ฿100 into `delivery_th_thb`, where nothing itemises it.
 *     Prod: 7 of 60 PCSF shipments have no base row.
 * (2) DOUBLE — the anchor is currently elected WITHIN a batch. The naive fix ("let the
 *     lowest -N in the batch anchor when no base is present") re-opens exactly what the
 *     owner fears: bill A takes -1,-4 → ฿100; bill B takes -3,-4 → ฿100 again = ฿200
 *     for one ลอบส่ง.
 *
 * ── THE FIX: elect the carrier from the SHIPMENT, not from the batch ──────────
 * For each base tracking we read EVERY sibling that exists in tb_forwarder and elect
 * ONE carrier fid:
 *     the bare base row (suffix 0) if the shipment has one  ← identical to today
 *     else the LOWEST-suffix เหมาๆ-eligible sibling         ← the new, previously-dropped case
 * The election depends only on the shipment's own rows, so it is IDENTICAL no matter how
 * a bill/pay-batch is sliced. A batch charges ฿100 iff it contains the carrier:
 *
 *   shipment has a base:  bill(base,-2) → ฿100 · bill(-3,-4) → ฿0     (= today, unchanged)
 *   no base (MOMO split): bill(-1,-4)   → ฿100 · bill(-3,-4) → ฿0     (was ฿0 · ฿0)
 *   whole shipment在one bill            → ฿100 exactly once
 *
 * → the DROP closes and the DOUBLE is impossible BY CONSTRUCTION: two batches can never
 *   both hold the same single carrier row.
 *
 * The per-BILL rule (owner 2026-07-15 · one ฿100 per collection event, even across
 * containers) still lives in computeForwarderDebitBatch — it takes at most ONE anchor out
 * of whatever this returns. This helper only decides WHICH rows are ELIGIBLE to anchor.
 *
 * Money-safety: reads only; writes nothing. Fails OPEN-BUT-SAFE — on a DB error it
 * returns an empty set, and the engine falls back to its own base-only rule (the fee may
 * be under-charged, never double-charged).
 *
 * @param admin    service-role client (tb_forwarder is RLS-locked)
 * @param trackings the ftrackingchn values in the batch (any mix of base / -N / -N/M)
 * @returns fids that may anchor the เหมาๆ — pass to computeForwarderDebitBatch.maoAnchorIds
 */
export async function resolveMaoAnchorIds(
  admin: SupabaseClient,
  trackings: ReadonlyArray<string | null | undefined>,
): Promise<Set<number>> {
  const anchors = new Set<number>();
  const bases = Array.from(
    new Set(
      trackings
        .map((t) => baseTrackingOf((t ?? "").trim()))
        .filter((b): b is string => b !== ""),
    ),
  );
  if (bases.length === 0) return anchors;

  type Row = {
    id: number;
    ftrackingchn: string | null;
    fshipby: string | null;
    ftransportprice: number | string | null;
  };
  // Pull every sibling of each base. `.or(like)` per base keeps it one round-trip per
  // chunk; the client-side base re-check below removes a prefix over-reach
  // (1783582 must not swallow 1783582423).
  const CHUNK = 40;
  const byBase = new Map<string, Row[]>();
  for (let i = 0; i < bases.length; i += CHUNK) {
    const slice = bases.slice(i, i + CHUNK);
    const filter = slice
      .map((b) => `ftrackingchn.eq.${b},ftrackingchn.like.${b}-%`)
      .join(",");
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fshipby, ftransportprice")
      .or(filter)
      .limit(2000);
    if (error) {
      console.error("[resolveMaoAnchorIds] lookup failed", { code: error.code, message: error.message });
      continue; // fail safe → fewer anchors → under-charge, never double
    }
    for (const r of (data ?? []) as Row[]) {
      const b = baseTrackingOf((r.ftrackingchn ?? "").trim());
      if (!b || !slice.includes(b)) continue;
      const arr = byBase.get(b);
      if (arr) arr.push(r);
      else byBase.set(b, [r]);
    }
  }

  for (const [, siblings] of byBase) {
    // The money-critical decision is PURE + unit-pinned — see mao-anchor-plan.ts.
    const carrier = electMaoCarrier(siblings);
    if (carrier != null) anchors.add(carrier);
  }
  return anchors;
}

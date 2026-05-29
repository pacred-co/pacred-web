import "server-only";

/**
 * Wave 30.6 — MOMO → tb_forwarder match-by-tracking propagation (#230).
 *
 * Why this exists (ภูม flag 2026-05-30):
 *   "ทำไม PCS เป็นอีกสถานะแล้วแต่ของเรายังไม่เป็น"
 *
 * Before this module: MOMO sync only wrote into the isolated `momo_*` tables.
 * If a customer already had a `tb_forwarder` row with the matching tracking
 * number (created via /admin/forwarders/new or auto-spawned from a shop
 * order BEFORE MOMO got the shipment in), Pacred's tb_forwarder.fstatus
 * stayed frozen while MOMO already knew the parcel was "ถึงไทย". That's
 * the status drift ภูม sees vs the legacy PCS dashboard.
 *
 * Strategy — three FORWARD-ONLY field updates, each gated by safety rules:
 *   1. fcabinetnumber ← MOMO containerNo, only if currently empty
 *   2. fdatetothai    ← today, only if MOMO indicates arrival + tb_forwarder
 *                       has no fdatetothai yet
 *   3. fstatus        ← derived from MOMO shipmentStatus, only if STRICTLY
 *                       FORWARD progress (never roll back) AND gated behind
 *                       env `MOMO_SYNC_PROPAGATE_STATUS=true` (default OFF).
 *                       fstatus writes can fire SMS/LINE/email per the
 *                       legacy notification path, so this stays opt-in
 *                       until ภูม has eyeballed the propagation log.
 *
 * NEVER touched here:
 *   - Money columns (ftotalprice, paydeposit, fcredit, etc.)
 *   - userid (a wrong customer match would bill the wrong customer)
 *   - admin_* audit fields (we write to admin_audit_log separately)
 *
 * @see lib/integrations/momo-isolated/sync.ts — orchestrator that calls us
 * @see docs/research/momo-status-drift-2026-05-30.md — full diagnosis
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MomoInternalAdminRecord, MomoShipmentStatus } from "./types";

// ─────────────────────────────────────────────────────────────
// MOMO shipmentStatus → Pacred tb_forwarder.fstatus code (string).
// `null` = MOMO has no clear signal → skip propagation for this row.
// Mapping is faithful to legacy forwarder.php status keys 1..7.
// ─────────────────────────────────────────────────────────────
function momoStatusToFstatus(s: MomoShipmentStatus | null): string | null {
  if (!s) return null;
  switch (s) {
    case "WAITING_SELLER_SHIP":  return "1"; // รอเข้าโกดังจีน
    case "AT_WAREHOUSE_CN":
    case "CONSOLIDATING":
    case "TRUCK_CLOSED":         return "2"; // ถึงโกดังจีนแล้ว
    case "CUSTOMS_CN":
    case "DEPARTED":
    case "IN_TRANSIT":
    case "AT_MUKDAHAN":
    case "CUSTOMS_TH":           return "3"; // กำลังส่งมาไทย
    case "AT_WAREHOUSE_TH":      return "4"; // ถึงไทยแล้ว
    case "WAITING_PAYMENT":      return "5"; // รอชำระเงิน
    case "DISTRIBUTING":         return "6"; // เตรียมส่ง
    case "DELIVERING":           return "6"; // กำลังจัดส่ง (6.1 in UI · same fstatus)
    case "DELIVERED":            return "7"; // ส่งแล้ว
    default:                     return null;
  }
}

// Rank tb_forwarder fstatus for "forward only" comparison. Higher = later in
// the flow. Unknown codes get rank 0 so they never overwrite a known status.
const FSTATUS_RANK: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "99": 99,
};
function fstatusRank(v: string | null | undefined): number {
  if (!v) return 0;
  return FSTATUS_RANK[v] ?? 0;
}

// MOMO signals "the parcel is at the Thailand warehouse or later" — a clear
// "arrived in Thailand" gate for stamping fdatetothai.
function isArrivedInThailand(s: MomoShipmentStatus | null): boolean {
  if (!s) return false;
  return s === "AT_WAREHOUSE_TH"
      || s === "WAITING_PAYMENT"
      || s === "DISTRIBUTING"
      || s === "DELIVERING"
      || s === "DELIVERED";
}

// ─────────────────────────────────────────────────────────────
// Public result shape — surfaced into runMomoSync's result + sync_logs.
// ─────────────────────────────────────────────────────────────
export type PropagationResult = {
  /** Number of momo_import_tracks records we considered. */
  scanned:              number;
  /** Number of tb_forwarder rows we found a tracking match for. */
  matched:              number;
  /** Number of forwarder rows updated (1+ columns). */
  updated:              number;
  /** Number of forwarder rows where ALL columns were already up-to-date. */
  noopFresh:            number;
  /** Of `updated`: how many had fcabinetnumber filled. */
  cabinetWrites:        number;
  /** Of `updated`: how many had fdatetothai filled. */
  arrivedWrites:        number;
  /** Of `updated`: how many had fstatus advanced (gate-controlled). */
  statusAdvanceWrites:  number;
  /** Of `matched`: how many WOULD have advanced fstatus but the gate was
   *  off. Lets ภูม preview impact before flipping the env. */
  statusAdvanceSkippedByGate: number;
  /** Per-row errors. Best-effort: a row error doesn't fail the whole batch. */
  errors:               Array<{ trackingNo: string; message: string }>;
};

function emptyResult(): PropagationResult {
  return {
    scanned: 0,
    matched: 0,
    updated: 0,
    noopFresh: 0,
    cabinetWrites: 0,
    arrivedWrites: 0,
    statusAdvanceWrites: 0,
    statusAdvanceSkippedByGate: 0,
    errors: [],
  };
}

// ─────────────────────────────────────────────────────────────
// Main entry point.
// ─────────────────────────────────────────────────────────────
export async function propagateMomoToForwarders(
  admin: SupabaseClient,
  records: MomoInternalAdminRecord[],
): Promise<PropagationResult> {
  const result = emptyResult();
  const statusGate = process.env.MOMO_SYNC_PROPAGATE_STATUS === "true";

  // Filter to records with a real tracking number — that's our match key.
  const candidates = records.filter((r) => r.trackingNo);
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // Batch-lookup tb_forwarder by ftrackingchn IN (...). One query handles
  // all candidates — typical batch is < 200 rows so we don't need to chunk.
  const trackings = Array.from(
    new Set(candidates.map((r) => r.trackingNo!).filter(Boolean)),
  );
  const { data: matchedRows, error: lookupErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, fstatus, fcabinetnumber, fdatetothai")
    .in("ftrackingchn", trackings);
  if (lookupErr) {
    console.error("[propagateMomoToForwarders] tb_forwarder lookup failed", {
      code: lookupErr.code,
      message: lookupErr.message,
    });
    result.errors.push({
      trackingNo: "(batch)",
      message: `lookup failed: ${lookupErr.code} ${lookupErr.message}`,
    });
    return result;
  }

  type ForwarderHit = {
    id:              number;
    ftrackingchn:    string | null;
    fstatus:         string | null;
    fcabinetnumber:  string | null;
    fdatetothai:     string | null;
  };
  const forwardersByTracking = new Map<string, ForwarderHit[]>();
  for (const row of (matchedRows ?? []) as unknown as ForwarderHit[]) {
    const key = row.ftrackingchn ?? "";
    if (!key) continue;
    const list = forwardersByTracking.get(key) ?? [];
    list.push(row);
    forwardersByTracking.set(key, list);
  }
  result.matched = (matchedRows ?? []).length;

  const today = new Date().toISOString().slice(0, 10);

  // Walk each MOMO record + apply forward-only updates to its matched rows.
  for (const m of candidates) {
    const tracking = m.trackingNo!;
    const hits = forwardersByTracking.get(tracking);
    if (!hits || hits.length === 0) continue;

    const targetFstatus = momoStatusToFstatus(m.shipmentStatus);
    const targetFstatusRank = fstatusRank(targetFstatus);
    const isArrivalSignal = isArrivedInThailand(m.shipmentStatus);

    for (const f of hits) {
      const updates: Record<string, string> = {};

      // 1. cabinet — only when empty + MOMO has a containerNo.
      if (m.containerNo && (!f.fcabinetnumber || f.fcabinetnumber.trim() === "")) {
        updates.fcabinetnumber = m.containerNo;
        result.cabinetWrites += 1;
      }

      // 2. fdatetothai — only when MOMO signals arrival + tb_forwarder has
      //    no date yet (or "0000-00-00" legacy sentinel).
      const noFdateYet = !f.fdatetothai || f.fdatetothai === "0000-00-00";
      if (isArrivalSignal && noFdateYet) {
        updates.fdatetothai = today;
        result.arrivedWrites += 1;
      }

      // 3. fstatus — only when MOMO has a clear newer status AND the env gate
      //    is enabled. Forward-only.
      const currentRank = fstatusRank(f.fstatus);
      if (targetFstatus !== null && targetFstatusRank > currentRank) {
        if (statusGate) {
          updates.fstatus = targetFstatus;
          result.statusAdvanceWrites += 1;
        } else {
          result.statusAdvanceSkippedByGate += 1;
        }
      }

      if (Object.keys(updates).length === 0) {
        result.noopFresh += 1;
        continue;
      }

      const { error: updateErr } = await admin
        .from("tb_forwarder")
        .update(updates)
        .eq("id", f.id);
      if (updateErr) {
        console.error("[propagateMomoToForwarders] update failed", {
          forwarderId: f.id,
          tracking,
          updates,
          code: updateErr.code,
          message: updateErr.message,
        });
        result.errors.push({
          trackingNo: tracking,
          message: `forwarder #${f.id}: ${updateErr.code} ${updateErr.message}`,
        });
        continue;
      }
      result.updated += 1;
    }
  }

  return result;
}

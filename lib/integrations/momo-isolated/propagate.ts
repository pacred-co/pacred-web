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
 *   1. fcabinetnumber ← REAL cabinet (cid) from momo_import_tracks
 *                       .container_batch_no (sourced from
 *                       momo_container_closed.raw.cid). Writes when EMPTY
 *                       or when current value is a stale MOMO routing
 *                       batch ID (PR####-SEA##/EK## pattern · 2026-05-30
 *                       follow-up fix · see learning). NEVER writes the
 *                       MOMO routing batch (m.containerNo) itself — those
 *                       are MOMO-internal IDs that link to nothing in
 *                       Pacred + confuse staff/customers.
 *                       B4 · backlog #259 (migration 0150 · 2026-06-08):
 *                       ALSO skips the write when fcabinet_locked=true —
 *                       admin's defensive belt vs partner-API misroutes.
 *   2. fdatetothai    ← today, only if MOMO indicates arrival + tb_forwarder
 *                       has no fdatetothai yet
 *   3. fstatus        ← derived from MOMO shipmentStatus, only if STRICTLY
 *                       FORWARD progress (never roll back). 2026-06-19 (owner
 *                       "ไม่ต้องจำ env · ทำให้เลย"): now DEFAULT-ON — the gate
 *                       only disables when env MOMO_SYNC_PROPAGATE_STATUS="false".
 *                       This is STATUS-ONLY (forward-only, idempotent): it does a
 *                       raw tb_forwarder.update with NO sendNotification call (the
 *                       cron already writes fcabinetnumber/fdatetothai through the
 *                       same path ungated), so it never touches money/dispatch and
 *                       fires no customer SMS/LINE/email. Money collection stays
 *                       admin-review (Option B). Set the env to "false" to pause it.
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
import { advanceLinkedShopOrder } from "@/lib/admin/advance-linked-shop-order";
import type { MomoInternalAdminRecord, MomoShipmentStatus } from "./types";

/**
 * MOMO writes its own routing-batch ID into `container_no` BEFORE the
 * container actually closes (e.g. "PR20260527-SEA02" / "MO20260523-EK01").
 * Until the container closes, that value is NOT a real PCS cabinet —
 * staff can't drill into /admin/report-cnt/[cabinet], and customers
 * shouldn't see cryptic batch IDs as "เลขตู้".
 *
 * The REAL cabinet comes from `momo_container_closed.raw.cid` (e.g.
 * "GZS260525-2") and lives on `momo_import_tracks.container_batch_no`
 * once sync.ts step 2.5 has propagated it.
 *
 * Pattern: PR or MO prefix + 8-digit YYYYMMDD + dash + SEA or EK + 2-digit.
 * Used to (1) detect stale values to replace, (2) reject ever writing one.
 */
const MOMO_ROUTING_RX = /^(PR|MO)\d{8}-(SEA|EK)\d{2}$/;
function isMomoRoutingBatch(cab: string | null | undefined): boolean {
  return !!cab && MOMO_ROUTING_RX.test(cab.trim());
}

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
  /** B4 · backlog #259 (migration 0150 · 2026-06-08): how many rows would
   *  have had a cabinet write but we skipped because fcabinet_locked=true.
   *  Surfaced so staff can audit that the lock is doing its job. */
  cabinetLocked:        number;
  /** 2026-06-16: how many LINKED ฝากสั่งซื้อ orders (reforder→hno) were
   *  advanced 4 (รอร้านจีนจัดส่ง) → 40 (ถึงโกดังจีน) when their forwarder
   *  reached the china warehouse. Gate-controlled (same statusGate). */
  shopOrdersAdvanced:   number;
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
    cabinetLocked: 0,
    shopOrdersAdvanced: 0,
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
  // 2026-06-19 (owner): default-ON status propagation — auto-sync forwarder +
  // shop-order status on the MOMO cron so ฝากสั่งซื้อ no longer sticks. Opt OUT
  // only by setting the env to "false". Status-only · no money · no notifications.
  const statusGate = process.env.MOMO_SYNC_PROPAGATE_STATUS !== "false";

  // Filter to records with a real tracking number — that's our match key.
  const candidates = records.filter((r) => r.trackingNo);
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // Batch-lookup tb_forwarder by ftrackingchn IN (...). One query handles
  // all candidates — typical batch is < 200 rows so we don't need to chunk.
  const trackings = Array.from(
    new Set(candidates.map((r) => r.trackingNo!).filter(Boolean)),
  );
  // B4 · backlog #259 (migration 0150 · 2026-06-08): include fcabinet_locked
  // in the SELECT so the cabinet-write guard below can skip rows that admin
  // has manually locked against partner-sync overwrites.
  const { data: matchedRows, error: lookupErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, fstatus, fcabinetnumber, fdatetothai, fcabinet_locked, reforder")
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
    fcabinet_locked: boolean | null;
    reforder:        string | null;
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

  // Wave 30.6 follow-up (2026-05-30 evening · ภูม): pre-load the REAL cabinet
  // (cid) per tracking from momo_import_tracks.container_batch_no. We must
  // NEVER write `m.containerNo` (MOMO's routing batch ID) to tb_forwarder
  // because:
  //   - it doesn't link anywhere (no /admin/report-cnt/[routing-batch] page)
  //   - it confuses customers + staff reading the dashboard
  //   - it traps the column in a stale value (forward-only safety then
  //     blocks the real cabinet from ever being written later)
  // So we resolve `realCabinetByTracking` here and ONLY write that.
  const { data: cabinetRows, error: cabinetErr } = await admin
    .from("momo_import_tracks")
    .select("momo_tracking_no, container_batch_no")
    .in("momo_tracking_no", trackings)
    .not("container_batch_no", "is", null);
  if (cabinetErr) {
    // Non-fatal — if the lookup fails we just won't fill cabinets this round.
    // Status + arrival propagation still runs below.
    console.error("[propagateMomoToForwarders] cabinet lookup failed", {
      code: cabinetErr.code,
      message: cabinetErr.message,
    });
  }
  const realCabinetByTracking = new Map<string, string>();
  for (const r of (cabinetRows ?? []) as Array<{
    momo_tracking_no: string | null;
    container_batch_no: string | null;
  }>) {
    if (r.momo_tracking_no && r.container_batch_no) {
      realCabinetByTracking.set(r.momo_tracking_no, r.container_batch_no);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  // Walk each MOMO record + apply forward-only updates to its matched rows.
  for (const m of candidates) {
    const tracking = m.trackingNo!;
    const hits = forwardersByTracking.get(tracking);
    if (!hits || hits.length === 0) continue;

    const targetFstatus = momoStatusToFstatus(m.shipmentStatus);
    const targetFstatusRank = fstatusRank(targetFstatus);
    const isArrivalSignal = isArrivedInThailand(m.shipmentStatus);

    const realCabinet = realCabinetByTracking.get(tracking);

    for (const f of hits) {
      const updates: Record<string, string> = {};

      // 1. cabinet — write ONLY the real cid (e.g. "GZS260525-2"), NEVER
      //    the MOMO routing batch ID. Two cases trigger a write:
      //      (a) fcabinetnumber is empty + real cabinet known → fill it
      //      (b) fcabinetnumber holds a stale MOMO routing batch (from a
      //          legacy pre-fix propagation) + real cabinet known → replace
      //    If real cabinet is NOT known yet (container not closed by MOMO
      //    yet), leave fcabinetnumber alone — NULL is better than a routing
      //    batch ID that goes nowhere.
      //
      // B4 · backlog #259 (migration 0150 · 2026-06-08): if admin set
      // fcabinet_locked=true on this row, NEVER overwrite the cabinet —
      // the manual value is authoritative. We still let fdatetothai +
      // fstatus propagate (those are not the lock's concern). Log the
      // skip + count it so staff can audit lock impact.
      const current = f.fcabinetnumber?.trim() ?? "";
      const isEmpty = current === "";
      const isStaleRouting = isMomoRoutingBatch(current);
      if (realCabinet && realCabinet !== current && (isEmpty || isStaleRouting)) {
        if (f.fcabinet_locked === true) {
          // Locked — skip the cabinet write. Other column writes below
          // still apply because the lock is cabinet-only.
          console.info(
            `[propagateMomoToForwarders] cabinet-write SKIPPED (locked) ` +
            `fid=${f.id} tracking=${tracking} ` +
            `current=${JSON.stringify(current || null)} ` +
            `wouldHaveWritten=${JSON.stringify(realCabinet)}`,
          );
          result.cabinetLocked += 1;
        } else {
          updates.fcabinetnumber = realCabinet;
          result.cabinetWrites += 1;
        }
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

      // 4. Shop-order COMPLETE (2026-06-22 · owner "มี Tracking ฝากนำเข้าแล้ว → สำเร็จ").
      //    When a forwarder reaches the china warehouse or beyond (fstatus >= 2 =
      //    ถึงโกดังจีนแล้ว), the linked ฝากสั่งซื้อ has handed off to ฝากนำเข้า → complete
      //    the linked tb_header_order {4 รอร้านจีนจัดส่ง, 40 ถึงโกดังจีน} → 5 (สำเร็จ);
      //    the import fstatus then carries the tracking. The shared helper links by
      //    reforder OR by the recorded China tracking (MOMO rows have reforder="").
      //    FORWARD-ONLY + idempotent + best-effort. Gated with the SAME statusGate
      //    (Option B — dormant until the owner flips the env after a dry-run).
      const newFstatus = updates.fstatus ?? f.fstatus;
      if (statusGate && fstatusRank(newFstatus) >= fstatusRank("2")) {
        const advanced = await advanceLinkedShopOrder(
          admin,
          {
            reforder: f.reforder,
            ftrackingchn: f.ftrackingchn,
            fcabinetnumber: updates.fcabinetnumber ?? f.fcabinetnumber,
            fstatus: newFstatus,
          },
          today,
        );
        if (advanced) result.shopOrdersAdvanced += 1;
      }
    }
  }

  return result;
}

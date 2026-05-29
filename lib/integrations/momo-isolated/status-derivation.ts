/**
 * MOMO Isolated — derived status snapshot logic.
 *
 * Brief 2026-05-28 (ปอน) Phase C — given a tracking number, look across
 * all source endpoints (import_track / container_closed_tracks /
 * sack_tracks), apply priority rules, and return the current status.
 *
 * Priority (highest to lowest):
 *   5  delivery          (final)
 *   4  arrival (TH)      (is_arrival=true | eta_th_kodang present)
 *   3  container_closed  (closed + etd_cn_kodang)
 *   2  import_track      (status_date phases)
 *   1  sack_info         (lowest — sack-only data)
 *
 * The "delivery" phase isn't surfaced by the current MOMO endpoints
 * we sync, so its rules are scaffolded but never fire today — kept
 * for completeness.
 *
 * NOTE: this module is server-only because it imports the admin client
 * via the caller. The exported functions take the client as a parameter
 * rather than constructing it, so they're testable.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DerivedStatusPhase = "ORIGIN" | "TRANSIT" | "DESTINATION" | "UNKNOWN";
export type DerivedStatusPriority = 0 | 1 | 2 | 3 | 4 | 5;

/** Canonical status code → Thai label. */
export const DERIVED_STATUS_LABEL_TH: Record<string, string> = {
  ORIGIN_WAITING:             "รอเข้าโกดังจีน",
  ORIGIN_AT_WAREHOUSE_CN:     "ถึงโกดังจีนแล้ว",
  ORIGIN_CONSOLIDATING:       "กำลังรวมสินค้า",
  ORIGIN_ROUND_CLOSED:        "ปิดรอบรถแล้ว",
  CONTAINER_CLOSED:           "ปิดตู้แล้ว",
  DEPARTED_FROM_CN_WAREHOUSE: "ออกจากโกดังจีนแล้ว",
  IN_TRANSIT:                 "กำลังขนส่งระหว่างทาง",
  ETA_TH_WAREHOUSE:           "ใกล้ถึงโกดังไทย",
  ARRIVED:                    "ถึงไทยแล้ว",
  AT_TH_WAREHOUSE:            "ถึงโกดังไทยแล้ว",
  DELIVERED:                  "ส่งสำเร็จ",
  UNKNOWN:                    "รอข้อมูล",
};

/** Result shape produced by `deriveStatus` and the public refresher. */
export type DerivedStatus = {
  trackingNo:         string;
  currentPhase:       DerivedStatusPhase;
  currentStatusCode:  string;
  currentStatusLabel: string;
  sourceEndpoint:     string;             // 'import_track' | 'container_closed' | 'sack_info' | 'none'
  sourceRecordId:     string | null;      // UUID of the driving source row
  sourcePriority:     DerivedStatusPriority;
  momoContainerRef:   string | null;
  containerBatchNo:   string | null;
  realContainerNo:    string | null;
  sackNo:             string | null;
  shipBy:             string | null;
  weightKg:           number | null;
  cbm:                number | null;
  estimateDate:       string | null;      // ISO date
  lastEventAt:        string | null;      // ISO timestamptz
  mappingNotes:       string;
  rawSources:         Record<string, unknown>;
};

/** Signals collected for a single tracking — input to `deriveStatus`. */
export type DerivationSignals = {
  trackingNo: string;
  importTrack: {
    id:                string;
    momoContainerRef:  string | null;
    momoSackNo:        string | null;
    shipBy:            string | null;
    weightKg:          number | null;
    cbm:               number | null;
    momoUpdatedAt:     string | null;
    raw:               unknown;
  } | null;
  containerClosed: {
    id:                string;
    momoContainerRef:  string | null;
    containerBatchNo:  string | null;
    realContainerNo:   string | null;
    shipBy:            string | null;
    closedAt:          string | null;
    raw:               unknown;
  } | null;
  containerDetails: {
    estimateDate:      string | null;
    etdCnKodang:       string | null;
    etaThKodang:       string | null;
    blNo:              string | null;
    vesselNo:          string | null;
  } | null;
  sackTrack: {
    sackInfoId:        string;
    sackNo:            string;
  } | null;
};

// ─────────────────────────────────────────────────────────────
// Pure derivation
// ─────────────────────────────────────────────────────────────

function asBag(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  return null;
}

/**
 * Pure function: given the gathered signals, return the derived status.
 *
 * Priority rules:
 *   container_closed wins over import_track wins over sack_info.
 *   Within container_closed, fields decide which TRANSIT/DESTINATION
 *   sub-status fires.
 */
export function deriveStatus(signals: DerivationSignals): DerivedStatus {
  const { trackingNo, importTrack, containerClosed, containerDetails, sackTrack } = signals;
  const rawSources: Record<string, unknown> = {};
  if (importTrack)     rawSources.importTrackId     = importTrack.id;
  if (containerClosed) rawSources.containerClosedId = containerClosed.id;
  if (sackTrack)       rawSources.sackTrackId       = sackTrack.sackInfoId;

  // Default identifiers — fill from the strongest source we have.
  const containerRef = containerClosed?.momoContainerRef ?? importTrack?.momoContainerRef ?? null;
  const batchNo      = containerClosed?.containerBatchNo ?? null;
  const realNo       = containerClosed?.realContainerNo ?? null;
  const sackNo       = sackTrack?.sackNo ?? importTrack?.momoSackNo ?? null;
  const shipBy       = containerClosed?.shipBy ?? importTrack?.shipBy ?? null;
  const weightKg     = importTrack?.weightKg ?? null;
  const cbm          = importTrack?.cbm ?? null;
  const estimateDate = containerDetails?.estimateDate ?? null;

  // ── Priority 4-5: DESTINATION (highest) ──
  if (containerClosed) {
    const ccRaw = asBag(containerClosed.raw) ?? {};
    const isArrival = ccRaw.is_arrival === true;
    const etaTh = containerDetails?.etaThKodang ?? null;

    if (isArrival) {
      return finish({
        trackingNo, phase: "DESTINATION", code: "ARRIVED",
        source: "container_closed", sourceId: containerClosed.id, priority: 4,
        lastEventAt: containerClosed.closedAt ?? containerDetails?.etaThKodang ?? null,
        notes: "container_closed.raw.is_arrival = true",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
    if (etaTh) {
      return finish({
        trackingNo, phase: "DESTINATION", code: "ETA_TH_WAREHOUSE",
        source: "container_closed", sourceId: containerClosed.id, priority: 4,
        lastEventAt: etaTh,
        notes: "container_details.eta_th_kodang present",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
  }

  // ── Priority 3: TRANSIT (container closed + departed) ──
  if (containerClosed) {
    const ccRaw = asBag(containerClosed.raw) ?? {};
    const closed = ccRaw.closed === true;
    const etdCn = containerDetails?.etdCnKodang ?? null;

    if (etdCn) {
      return finish({
        trackingNo, phase: "TRANSIT", code: "DEPARTED_FROM_CN_WAREHOUSE",
        source: "container_closed", sourceId: containerClosed.id, priority: 3,
        lastEventAt: etdCn,
        notes: "container_details.etd_cn_kodang present",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
    if (closed) {
      return finish({
        trackingNo, phase: "TRANSIT", code: "CONTAINER_CLOSED",
        source: "container_closed", sourceId: containerClosed.id, priority: 3,
        lastEventAt: containerClosed.closedAt ?? null,
        notes: "container_closed.raw.closed = true (no ETD yet)",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
  }

  // ── Priority 2: ORIGIN — derived from import_track.status_date ──
  if (importTrack) {
    const sd = asBag((asBag(importTrack.raw) ?? {}).status_date) ?? {};
    const lastUpdatedAt = importTrack.momoUpdatedAt;

    if (asStr(sd.prepare_export)) {
      return finish({
        trackingNo, phase: "ORIGIN", code: "ORIGIN_ROUND_CLOSED",
        source: "import_track", sourceId: importTrack.id, priority: 2,
        lastEventAt: parseSdTs(sd.prepare_export) ?? lastUpdatedAt,
        notes: "status_date.prepare_export set; container_closed not yet arrived",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
    if (asStr(sd.mergebox) || asStr(sd.wooden_create)) {
      return finish({
        trackingNo, phase: "ORIGIN", code: "ORIGIN_CONSOLIDATING",
        source: "import_track", sourceId: importTrack.id, priority: 2,
        lastEventAt: parseSdTs(sd.mergebox) ?? parseSdTs(sd.wooden_create) ?? lastUpdatedAt,
        notes: "status_date.mergebox or wooden_create set",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
    if (asStr(sd.kodang)) {
      return finish({
        trackingNo, phase: "ORIGIN", code: "ORIGIN_AT_WAREHOUSE_CN",
        source: "import_track", sourceId: importTrack.id, priority: 2,
        lastEventAt: parseSdTs(sd.kodang) ?? lastUpdatedAt,
        notes: "status_date.kodang set",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
    if (asStr(sd.waiting)) {
      return finish({
        trackingNo, phase: "ORIGIN", code: "ORIGIN_WAITING",
        source: "import_track", sourceId: importTrack.id, priority: 2,
        lastEventAt: parseSdTs(sd.waiting) ?? lastUpdatedAt,
        notes: "status_date.waiting only",
        containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
      });
    }
    return finish({
      trackingNo, phase: "ORIGIN", code: "ORIGIN_WAITING",
      source: "import_track", sourceId: importTrack.id, priority: 2,
      lastEventAt: lastUpdatedAt,
      notes: "import_track exists but no status_date phase set",
      containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
    });
  }

  // ── Priority 1: sack only ──
  if (sackTrack) {
    return finish({
      trackingNo, phase: "ORIGIN", code: "ORIGIN_AT_WAREHOUSE_CN",
      source: "sack_info", sourceId: sackTrack.sackInfoId, priority: 1,
      lastEventAt: null,
      notes: "tracking found only inside a sack (sack_info.tracks[])",
      containerRef, batchNo, realNo, sackNo, shipBy, weightKg, cbm, estimateDate, rawSources,
    });
  }

  // ── Nothing matched ──
  return {
    trackingNo,
    currentPhase:       "UNKNOWN",
    currentStatusCode:  "UNKNOWN",
    currentStatusLabel: DERIVED_STATUS_LABEL_TH.UNKNOWN,
    sourceEndpoint:     "none",
    sourceRecordId:     null,
    sourcePriority:     0,
    momoContainerRef:   null,
    containerBatchNo:   null,
    realContainerNo:    null,
    sackNo:             null,
    shipBy:             null,
    weightKg:           null,
    cbm:                null,
    estimateDate:       null,
    lastEventAt:        null,
    mappingNotes:       "ไม่พบ tracking ใน import_track / container_closed_tracks / sack_tracks",
    rawSources:         {},
  };
}

function parseSdTs(v: unknown): string | null {
  const s = asStr(v);
  if (!s) return null;
  const t = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

function finish(args: {
  trackingNo:    string;
  phase:         DerivedStatusPhase;
  code:          string;
  source:        string;
  sourceId:      string | null;
  priority:      DerivedStatusPriority;
  lastEventAt:   string | null;
  notes:         string;
  containerRef:  string | null;
  batchNo:       string | null;
  realNo:        string | null;
  sackNo:        string | null;
  shipBy:        string | null;
  weightKg:      number | null;
  cbm:           number | null;
  estimateDate:  string | null;
  rawSources:    Record<string, unknown>;
}): DerivedStatus {
  return {
    trackingNo:         args.trackingNo,
    currentPhase:       args.phase,
    currentStatusCode:  args.code,
    currentStatusLabel: DERIVED_STATUS_LABEL_TH[args.code] ?? args.code,
    sourceEndpoint:     args.source,
    sourceRecordId:     args.sourceId,
    sourcePriority:     args.priority,
    momoContainerRef:   args.containerRef,
    containerBatchNo:   args.batchNo,
    realContainerNo:    args.realNo,
    sackNo:             args.sackNo,
    shipBy:             args.shipBy,
    weightKg:           args.weightKg,
    cbm:                args.cbm,
    estimateDate:       args.estimateDate,
    lastEventAt:        args.lastEventAt,
    mappingNotes:       args.notes,
    rawSources:         args.rawSources,
  };
}

// ─────────────────────────────────────────────────────────────
// Async helpers — load signals + persist snapshot
// ─────────────────────────────────────────────────────────────

type AdminClient = SupabaseClient;

/**
 * Load all known signals for one tracking number. 3 queries (import_track,
 * container_closed_track→container_closed→container_details, sack_track).
 */
export async function loadSignalsForTracking(
  admin: AdminClient,
  trackingNo: string,
): Promise<DerivationSignals> {
  const [itQ, cctQ, stQ] = await Promise.all([
    admin
      .from("momo_import_tracks")
      .select("id, momo_container_ref, momo_sack_no, ship_by, weight_kg, cbm, momo_updated_at, raw")
      .eq("momo_tracking_no", trackingNo)
      .maybeSingle(),
    admin
      .from("momo_container_closed_tracks")
      .select("container_closed_id")
      .eq("momo_tracking_no", trackingNo)
      .order("updated_at", { ascending: false })
      .limit(1),
    admin
      .from("momo_sack_tracks")
      .select("sack_info_id, sack_no")
      .eq("momo_tracking_no", trackingNo)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  let containerClosed: DerivationSignals["containerClosed"] = null;
  let containerDetails: DerivationSignals["containerDetails"] = null;
  const ccTrackParentId = (cctQ.data?.[0] as { container_closed_id?: string } | undefined)?.container_closed_id;
  if (ccTrackParentId) {
    const [ccQ, cdQ] = await Promise.all([
      admin
        .from("momo_container_closed")
        .select("id, momo_container_ref, container_batch_no, real_container_no, ship_by, closed_at, raw")
        .eq("id", ccTrackParentId)
        .maybeSingle(),
      admin
        .from("momo_container_details")
        .select("estimate_date, etd_cn_kodang, eta_th_kodang, bl_no, vessel_no")
        .eq("container_closed_id", ccTrackParentId)
        .maybeSingle(),
    ]);
    const cc = ccQ.data as {
      id: string;
      momo_container_ref: string | null;
      container_batch_no: string | null;
      real_container_no:  string | null;
      ship_by:            string | null;
      closed_at:          string | null;
      raw:                unknown;
    } | null;
    if (cc) {
      containerClosed = {
        id:                cc.id,
        momoContainerRef:  cc.momo_container_ref,
        containerBatchNo:  cc.container_batch_no,
        realContainerNo:   cc.real_container_no,
        shipBy:            cc.ship_by,
        closedAt:          cc.closed_at,
        raw:               cc.raw,
      };
    }
    const cd = cdQ.data as {
      estimate_date:    string | null;
      etd_cn_kodang:    string | null;
      eta_th_kodang:    string | null;
      bl_no:            string | null;
      vessel_no:        string | null;
    } | null;
    if (cd) {
      containerDetails = {
        estimateDate:   cd.estimate_date,
        etdCnKodang:    cd.etd_cn_kodang,
        etaThKodang:    cd.eta_th_kodang,
        blNo:           cd.bl_no,
        vesselNo:       cd.vessel_no,
      };
    }
  }

  const it = itQ.data as {
    id: string;
    momo_container_ref: string | null;
    momo_sack_no:       string | null;
    ship_by:            string | null;
    weight_kg:          number | null;
    cbm:                number | null;
    momo_updated_at:    string | null;
    raw:                unknown;
  } | null;
  const importTrack: DerivationSignals["importTrack"] = it
    ? {
        id:                it.id,
        momoContainerRef:  it.momo_container_ref,
        momoSackNo:        it.momo_sack_no,
        shipBy:            it.ship_by,
        weightKg:          it.weight_kg,
        cbm:               it.cbm,
        momoUpdatedAt:     it.momo_updated_at,
        raw:               it.raw,
      }
    : null;

  const stRow = (stQ.data?.[0] as { sack_info_id?: string; sack_no?: string } | undefined);
  const sackTrack: DerivationSignals["sackTrack"] = stRow?.sack_info_id && stRow?.sack_no
    ? { sackInfoId: stRow.sack_info_id, sackNo: stRow.sack_no }
    : null;

  return { trackingNo, importTrack, containerClosed, containerDetails, sackTrack };
}

/**
 * Recompute a tracking's snapshot from scratch, upsert it, and write a
 * history row only if the result represents a real change (or a new row).
 *
 * Returns whether a history row was written.
 */
export async function refreshSnapshotForTracking(
  admin: AdminClient,
  trackingNo: string,
  syncRunId: string | null,
): Promise<{ changed: boolean; derived: DerivedStatus }> {
  const signals = await loadSignalsForTracking(admin, trackingNo);
  const derived = deriveStatus(signals);

  // Read existing snapshot — if any — to detect change.
  const { data: existing } = await admin
    .from("momo_tracking_status_snapshots")
    .select("current_phase, current_status_code, current_status_label, source_endpoint")
    .eq("momo_tracking_no", trackingNo)
    .maybeSingle();

  const nowIso = new Date().toISOString();

  const snapshotRow = {
    momo_tracking_no:      derived.trackingNo,
    current_phase:         derived.currentPhase,
    current_status_code:   derived.currentStatusCode,
    current_status_label:  derived.currentStatusLabel,
    source_endpoint:       derived.sourceEndpoint,
    source_record_id:      derived.sourceRecordId,
    source_priority:       derived.sourcePriority,
    momo_container_ref:    derived.momoContainerRef,
    container_batch_no:    derived.containerBatchNo,
    real_container_no:     derived.realContainerNo,
    sack_no:               derived.sackNo,
    ship_by:               derived.shipBy,
    weight_kg:             derived.weightKg,
    cbm:                   derived.cbm,
    estimate_date:         derived.estimateDate,
    last_event_at:         derived.lastEventAt,
    mapping_notes:         derived.mappingNotes,
    raw_sources:           derived.rawSources as never,
    updated_at:            nowIso,
  };

  await admin
    .from("momo_tracking_status_snapshots")
    .upsert(snapshotRow, { onConflict: "momo_tracking_no" });

  const ex = existing as {
    current_phase?:        string | null;
    current_status_code?:  string | null;
    current_status_label?: string | null;
    source_endpoint?:      string | null;
  } | null;

  const isNew = !ex;
  const phaseChanged  = ex && ex.current_phase       !== derived.currentPhase;
  const statusChanged = ex && ex.current_status_code !== derived.currentStatusCode;
  const sourceChanged = ex && ex.source_endpoint     !== derived.sourceEndpoint;
  const changed = isNew || !!phaseChanged || !!statusChanged || !!sourceChanged;

  if (changed) {
    await admin.from("momo_tracking_status_history").insert({
      momo_tracking_no:  derived.trackingNo,
      old_phase:         ex?.current_phase ?? null,
      new_phase:         derived.currentPhase,
      old_status_code:   ex?.current_status_code ?? null,
      new_status_code:   derived.currentStatusCode,
      old_status_label:  ex?.current_status_label ?? null,
      new_status_label:  derived.currentStatusLabel,
      source_endpoint:   derived.sourceEndpoint,
      source_record_id:  derived.sourceRecordId,
      matched_by:        derived.mappingNotes,
      raw_snapshot:      snapshotRow as never,
      sync_run_id:       syncRunId,
    });
  }

  return { changed, derived };
}

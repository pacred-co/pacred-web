/**
 * MOMO Isolated — response mapper (post-real-API-probe 2026-05-28).
 *
 * Brief 2026-05-28 §13 (ปอน): MOMO response → internal admin record.
 *
 * REAL MOMO SCHEMA (probed against live API on 2026-05-28):
 *
 * (1) Import Track item — `/api/func/get/import/track/{date}` → array of:
 *   {
 *     tracking:      "9822290862949",
 *     user_code:     "032", user_group: "PR",
 *     status:        7,                          ← numeric (MOMO's own)
 *     ship_by:       "car" | "ship" | "air",
 *     container_no:  "MO20260523-SEA02",
 *     sack_no:       "CBX260523-EK01",
 *     kg, cbm, quantity, width, length, height, type,
 *     created_date:  "2026-05-22 17:42:53",
 *     updated_date:  "2026-05-23 17:28:53",
 *     status_date: {                              ← THE phase signal
 *       waiting:        "2026-05-22 17:42:53",
 *       kodang:         "2026-05-22 17:42:53",
 *       mergebox:       "2026-05-23 10:06:47",
 *       wooden_create:  "",
 *       prepare_export: "2026-05-23 17:28:53",
 *       exported:       ""
 *     },
 *     sack_size: {...},  CG_NO, images[], real_container[]
 *   }
 *
 * (2) Container Closed item — `/api/func/get/container/closed/{date}` → array:
 *   {
 *     fid: "PR20260527-SEA01",                    ← Pacred group ID
 *     cid: "GZS260525-2",                          ← container code
 *     cid_code: "JXLU6157980",                     ← real container number
 *     ship_by: "ship",
 *     total_kg, total_cbm, total_parcel,
 *     container_details: {
 *       ETD_CN_KODANG, ESTIMATE_DATE, VESSEL_NO, BL_NO,
 *       ETD_IMMIGRATION, TRANSSHIPMENT, ETA_IMMIGRATION, ETA_TH_KODANG
 *     },
 *     closed: true, loading_date, updated_date,
 *     track_details: [{reTrack, kg, cbm, width, height, length, total_quantity}],
 *     is_arrival: false, note
 *   }
 *
 * (3) Sack Info — `/api/sack/get/info/{sackNo}` → SINGLE OBJECT (not array):
 *   {
 *     sack_id: "CBX260523-EK01",
 *     ship_by, weight, width, length, height, cbm, description,
 *     total_parcel, closed, closed_date,
 *     tracks: ["9822290862949", ...]               ← tracking numbers inside
 *   }
 */

import type {
  MomoBillingStatus,
  MomoInternalAdminRecord,
  MomoIssueStatus,
  MomoJobStatus,
  MomoPhase,
  MomoShipmentStatus,
} from "./types";
import { MOMO_STATUS_PHASE, MOMO_STATUS_TH } from "./types";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

type Bag = Record<string, unknown>;

function asBag(v: unknown): Bag | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Bag) : null;
}

function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t || null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

/** MOMO returns "YYYY-MM-DD HH:MM:SS" strings → ISO timestamptz. */
function asTs(v: unknown): string | null {
  const s = asStr(v);
  if (!s) return null;
  // MOMO uses "YYYY-MM-DD HH:MM:SS" without timezone → assume Bangkok ICT (+07).
  // Pass through to Date — JS treats space-separated as local; we then format ISO.
  const t = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Coerce to finite number — accepts number, numeric string ("0.5"), null/empty. */
function asNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Coerce to integer — rounds finite numerics, drops non-finite/empty. */
function asInt(v: unknown): number | null {
  const n = asNum(v);
  return n == null ? null : Math.trunc(n);
}

/** Map MOMO ship_by → typed enum (or null if unrecognised). */
function shipBy(v: unknown): "car" | "ship" | "air" | null {
  const s = asStr(v)?.toLowerCase();
  if (s === "car" || s === "ship" || s === "air") return s;
  return null;
}

// ─────────────────────────────────────────────────────────────
// (1) IMPORT TRACK item → MomoInternalAdminRecord
// ─────────────────────────────────────────────────────────────

/**
 * Derive shipmentStatus from MOMO's `status_date` object.
 *
 * MOMO populates `status_date.<phase>` with a timestamp when that phase
 * is reached. Empty string ("") means "not yet". We walk the phases in
 * order and take the LAST one with a non-empty timestamp → that's the
 * current state.
 *
 * MOMO phase → Pacred shipmentStatus mapping:
 *   waiting        → WAITING_SELLER_SHIP   (ORIGIN)
 *   kodang         → AT_WAREHOUSE_CN       (ORIGIN)
 *   mergebox       → CONSOLIDATING         (ORIGIN)
 *   wooden_create  → CONSOLIDATING         (ORIGIN, intermediate)
 *   prepare_export → TRUCK_CLOSED          (ORIGIN)
 *   exported       → DEPARTED              (TRANSIT)
 *
 * Note: phases beyond DEPARTED (CUSTOMS_*, IN_TRANSIT, AT_MUKDAHAN,
 * AT_WAREHOUSE_TH, ...) MOMO does NOT report directly — those need
 * separate join with cargo_thai / arrival events. For now, "exported"
 * is the last status we extract; admin can refine later from container.
 */
function deriveImportTrackStatus(record: Bag): MomoShipmentStatus | null {
  const sd = asBag(record.status_date);
  if (!sd) return null;
  // Reverse order — pick the last non-empty.
  const phases: Array<[string, MomoShipmentStatus]> = [
    ["exported",       "DEPARTED"],
    ["prepare_export", "TRUCK_CLOSED"],
    ["wooden_create",  "CONSOLIDATING"],
    ["mergebox",       "CONSOLIDATING"],
    ["kodang",         "AT_WAREHOUSE_CN"],
    ["waiting",        "WAITING_SELLER_SHIP"],
  ];
  for (const [key, status] of phases) {
    if (asStr(sd[key])) return status;
  }
  return null;
}

/** Latest non-empty timestamp from status_date — the "current as of" time. */
function deriveImportTrackUpdatedAt(record: Bag): string | null {
  const sd = asBag(record.status_date);
  if (!sd) return asTs(record.updated_date);
  const keys = ["exported", "prepare_export", "wooden_create", "mergebox", "kodang", "waiting"];
  for (const k of keys) {
    const ts = asTs(sd[k]);
    if (ts) return ts;
  }
  return asTs(record.updated_date);
}

export function mapImportTrackRecord(raw: unknown): MomoInternalAdminRecord {
  const r = asBag(raw);
  if (!r) return fallback(raw);

  const trackingNo  = asStr(r.tracking);
  const sackNo      = asStr(r.sack_no);
  const containerNo = asStr(r.container_no);

  const shipmentStatus = deriveImportTrackStatus(r);
  const phase: MomoPhase | null = shipmentStatus
    ? MOMO_STATUS_PHASE[shipmentStatus]
    : null;
  const adminStatusText =
    shipmentStatus != null
      ? MOMO_STATUS_TH[shipmentStatus]
      : "รอตรวจสอบสถานะจาก MOMO";

  // MOMO's numeric `status` (1..7) isn't billing/job — it's their own
  // shipment progression. We don't have a clean billing/job signal in
  // this endpoint, so leave them null.
  const billingStatus: MomoBillingStatus | null = null;
  const jobStatus:     MomoJobStatus     | null = null;
  const issueStatus:   MomoIssueStatus           = "NONE";

  return {
    trackingNo,
    sackNo,
    containerNo,
    // ── 0118 mirror fields — populate from raw subset ──
    momoUserCode:  asStr(r.user_code),
    momoUserGroup: asStr(r.user_group),
    momoCgNo:      asStr(r.CG_NO),
    shipBy:        shipBy(r.ship_by),
    weightKg:      asNum(r.kg),
    cbm:           asNum(r.cbm),
    quantity:      asInt(r.quantity),
    totalKg:       null,    // container-level only
    totalCbm:      null,
    totalParcel:   null,
    // ── status ──
    phase,
    shipmentStatus,
    billingStatus,
    jobStatus,
    issueStatus,
    adminStatusText,
    currentLocation: phase === "ORIGIN" ? "โกดังจีน" : null,
    etd:             null,                                  // not in this endpoint
    eta:             null,
    momoUpdatedAt:   deriveImportTrackUpdatedAt(r) ?? asTs(r.updated_date),
    raw,
  };
}

// ─────────────────────────────────────────────────────────────
// (2) CONTAINER CLOSED item → MomoInternalAdminRecord
// ─────────────────────────────────────────────────────────────

export function mapContainerClosedRecord(raw: unknown): MomoInternalAdminRecord {
  const r = asBag(raw);
  if (!r) return fallback(raw);

  // MOMO container has BOTH cid (group code, e.g. "GZS260525-2") AND
  // cid_code (real container number, e.g. "JXLU6157980"). Use cid_code
  // when present, else cid.
  const containerNo = asStr(r.cid_code) || asStr(r.cid);
  const trackingNo  = null;                          // closed-list is per-container
  const sackNo      = null;

  // `closed: true` means MOMO sealed the container → TRUCK_CLOSED at
  // origin → DEPARTED once it leaves (ship_by tells us truck/ship/air).
  const closed = r.closed === true;
  const isArrival = r.is_arrival === true;

  let shipmentStatus: MomoShipmentStatus | null = null;
  if (isArrival)       shipmentStatus = "AT_WAREHOUSE_TH";
  else if (closed)     shipmentStatus = "DEPARTED";
  else                 shipmentStatus = "TRUCK_CLOSED";

  const phase: MomoPhase | null = shipmentStatus
    ? MOMO_STATUS_PHASE[shipmentStatus]
    : null;

  // ETD/ETA come from `container_details`.
  const cd = asBag(r.container_details) ?? {};
  const etd = asTs(cd.ETD_CN_KODANG) ?? asTs(cd.ETD_IMMIGRATION);
  const eta = asTs(cd.ETA_TH_KODANG) ?? asTs(cd.ETA_IMMIGRATION) ?? asTs(cd.ESTIMATE_DATE);

  return {
    trackingNo,
    sackNo,
    containerNo,
    // ── 0118 mirror fields — container-level (no per-tracking weights) ──
    momoUserCode:  null,    // container is aggregate of many users
    momoUserGroup: null,
    momoCgNo:      null,
    shipBy:        shipBy(r.ship_by),
    weightKg:      null,    // see totalKg below
    cbm:           null,
    quantity:      null,
    totalKg:       asNum(r.total_kg),
    totalCbm:      asNum(r.total_cbm),
    totalParcel:   asInt(r.total_parcel),
    // ── status ──
    phase,
    shipmentStatus,
    billingStatus: null,
    jobStatus:     closed ? "CLOSED" : "ACTIVE",
    issueStatus:   "NONE",
    adminStatusText:
      shipmentStatus != null
        ? MOMO_STATUS_TH[shipmentStatus]
        : "รอตรวจสอบสถานะจาก MOMO",
    currentLocation: phase === "DESTINATION" ? "โกดังไทย" : phase === "TRANSIT" ? "ระหว่างทาง" : "โกดังจีน",
    etd,
    eta,
    momoUpdatedAt: asTs(r.updated_date) ?? asTs(r.loading_date),
    raw,
  };
}

// ─────────────────────────────────────────────────────────────
// (3) SACK INFO (single object, NOT array) → MomoInternalAdminRecord
// ─────────────────────────────────────────────────────────────

export function mapSackInfoRecord(raw: unknown): MomoInternalAdminRecord {
  const r = asBag(raw);
  if (!r) return fallback(raw);

  // MOMO sack info uses `sack_id` (not `sack_no` like the import-track row).
  const sackNo = asStr(r.sack_id) || asStr(r.sack_no);
  // Sack endpoint doesn't return a single tracking — it returns the
  // tracks[] array of all tracking numbers inside the sack. Surface
  // count instead of a single trackingNo.
  const tracks = Array.isArray(r.tracks) ? (r.tracks as unknown[]).length : 0;
  const trackingNo = tracks > 0 ? `${tracks} tracking inside` : null;
  const containerNo = null;

  // `closed: true` on a sack means it's sealed → CONSOLIDATING done,
  // ready for TRUCK_CLOSED at the container level.
  const closed = r.closed === true;
  const exported = r.is_export === true;

  let shipmentStatus: MomoShipmentStatus | null = null;
  if (exported)    shipmentStatus = "DEPARTED";
  else if (closed) shipmentStatus = "TRUCK_CLOSED";
  else             shipmentStatus = "CONSOLIDATING";

  const phase: MomoPhase | null = shipmentStatus
    ? MOMO_STATUS_PHASE[shipmentStatus]
    : null;

  return {
    trackingNo,
    sackNo,
    containerNo,
    // ── 0118 mirror fields — sack-level ──
    momoUserCode:  null,    // sack is aggregate; user_code is per-tracking
    momoUserGroup: null,
    momoCgNo:      null,
    shipBy:        shipBy(r.ship_by),
    weightKg:      asNum(r.weight),  // sack endpoint uses "weight" not "kg"
    cbm:           asNum(r.cbm),
    quantity:      null,
    totalKg:       null,
    totalCbm:      null,
    totalParcel:   asInt(r.total_parcel),
    // ── status ──
    phase,
    shipmentStatus,
    billingStatus: null,
    jobStatus:     closed ? "CLOSED" : "ACTIVE",
    issueStatus:   "NONE",
    adminStatusText:
      shipmentStatus != null
        ? MOMO_STATUS_TH[shipmentStatus]
        : "รอตรวจสอบสถานะจาก MOMO",
    currentLocation: "โกดังจีน",
    etd:             null,
    eta:             null,
    momoUpdatedAt:   asTs(r.closed_date) ?? asTs(r.created_date),
    raw,
  };
}

// ─────────────────────────────────────────────────────────────
// Fallback + array unwrap + back-compat wrappers
// ─────────────────────────────────────────────────────────────

function fallback(raw: unknown): MomoInternalAdminRecord {
  return {
    trackingNo:       null,
    sackNo:           null,
    containerNo:      null,
    momoUserCode:     null,
    momoUserGroup:    null,
    momoCgNo:         null,
    shipBy:           null,
    weightKg:         null,
    cbm:              null,
    quantity:         null,
    totalKg:          null,
    totalCbm:         null,
    totalParcel:      null,
    phase:            null,
    shipmentStatus:   null,
    billingStatus:    null,
    jobStatus:        null,
    issueStatus:      "NONE",
    adminStatusText:  "รอตรวจสอบสถานะจาก MOMO",
    currentLocation:  null,
    etd:              null,
    eta:              null,
    momoUpdatedAt:    null,
    raw,
  };
}

/** Smart dispatcher — detects which MOMO shape the record is and maps
 *  appropriately. Kept for back-compat with earlier callers. */
export function mapMomoStatusToInternalAdminStatus(
  raw: unknown,
): MomoInternalAdminRecord {
  const r = asBag(raw);
  if (!r) return fallback(raw);
  // Detect by signature fields.
  if ("status_date" in r || "tracking" in r) return mapImportTrackRecord(raw);
  if ("cid_code" in r || "cid" in r)         return mapContainerClosedRecord(raw);
  if ("sack_id" in r || ("tracks" in r && Array.isArray(r.tracks))) return mapSackInfoRecord(raw);
  return fallback(raw);
}

/** Map an `Import Track` array response. Unwraps `{data:[...]}` if needed. */
export function mapImportTrackArray(payload: unknown): MomoInternalAdminRecord[] {
  const arr = unwrapDataArray(payload);
  return arr.map(mapImportTrackRecord);
}

/** Map a `Container Closed` array response. */
export function mapContainerClosedArray(payload: unknown): MomoInternalAdminRecord[] {
  const arr = unwrapDataArray(payload);
  return arr.map(mapContainerClosedRecord);
}

/** Map a `Sack Info` SINGLE-OBJECT response. Returns [] if not parseable. */
export function mapSackInfoSingle(payload: unknown): MomoInternalAdminRecord[] {
  // Sack info comes back as `{status:..., data: {...sack...}}` — unwrap
  // .data if present, else use payload directly.
  const bag = asBag(payload);
  const inner = bag && "data" in bag ? bag.data : payload;
  const rec = asBag(inner);
  if (!rec) return [];
  return [mapSackInfoRecord(rec)];
}

/** Generic array unwrap — accepts either an array or `{data:[...]}`. */
function unwrapDataArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const bag = asBag(payload);
  if (bag && Array.isArray(bag.data)) return bag.data as unknown[];
  return [];
}

/** Back-compat: old name (used by previous routes). Auto-dispatches. */
export function mapMomoStatusArray(payload: unknown): MomoInternalAdminRecord[] {
  const arr = unwrapDataArray(payload);
  return arr.map(mapMomoStatusToInternalAdminStatus);
}

/** Extract date_from / date_to from internal record for table column. */
export function isoToDateOnly(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

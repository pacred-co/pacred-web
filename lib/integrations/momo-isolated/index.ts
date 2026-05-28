/**
 * MOMO Isolated — public exports.
 *
 * Brief 2026-05-28 (ปอน): parallel MOMO integration that writes only
 * to `momo_*` tables. Existing `lib/integrations/momo-jmf/*` (cron-
 * driver to cargo_* spine) is UNTOUCHED.
 *
 * Usage (server-only):
 *   import {
 *     getImportTrack,
 *     getContainerClosed,
 *     getSackInfo,
 *     mapMomoStatusArray,
 *     mapMomoStatusToInternalAdminStatus,
 *   } from "@/lib/integrations/momo-isolated";
 */

export {
  momoRequest,
  getImportTrack,
  getContainerClosed,
  getSackInfo,
  formatDateRange,
  momoErrorTh,
} from "./client";

export {
  mapMomoStatusToInternalAdminStatus,
  mapMomoStatusArray,
  // Specific per-endpoint mappers (post real-API probe 2026-05-28).
  mapImportTrackRecord,
  mapImportTrackArray,
  mapContainerClosedRecord,
  mapContainerClosedArray,
  mapSackInfoRecord,
  mapSackInfoSingle,
  // Migration 0119 — per-tracking explode from container_closed.raw.track_details[].
  extractContainerClosedTracks,
  isoToDateOnly,
} from "./mapper";

export type {
  MomoPhase,
  MomoShipmentStatus,
  MomoBillingStatus,
  MomoJobStatus,
  MomoIssueStatus,
  MomoBadgeColor,
  MomoInternalAdminRecord,
  MomoContainerClosedTrack,
  MomoClientResult,
  MomoErrorCode,
} from "./types";

export {
  MOMO_STATUS_BADGE,
  MOMO_STATUS_TH,
  MOMO_STATUS_PHASE,
} from "./types";

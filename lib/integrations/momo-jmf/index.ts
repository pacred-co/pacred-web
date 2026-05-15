/**
 * MOMO JMF — partner integration public surface.
 *
 * Import from `@/lib/integrations/momo-jmf` (NOT the individual files)
 * so internal refactors stay invisible to callers.
 *
 * @see docs/integrations/momo-jmf.md
 * @see docs/architecture/container-centric-model.md
 */

export type {
  MomoContainerStatus,
  MomoContainerSummary,
  MomoContainerDetail,
  MomoShipmentSummary,
  MomoTrackingEvent,
  MomoWebhookPayload,
} from "./types";

export { MOMO_STATUS_TO_PACRED } from "./types";

export type { MomoResult } from "./client";
export {
  listContainers,
  getContainer,
  getContainerManifest,
  getShipmentTracking,
} from "./client";

export type { SyncResult } from "./sync";
export { syncContainersFromMomo } from "./sync";

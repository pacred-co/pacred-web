/**
 * Warehouse spine — single export point for action callers (T-P2 / CT-2).
 *
 * Re-exports types + the 3 client modules so callers can:
 *
 *   import {
 *     createContainer, listContainers, setContainerStatus,
 *     createShipment, attachShipmentToContainer, setShipmentStatus,
 *     appendTrackingEvent, listTrackingEvents,
 *     buildContainerCode,
 *   } from "@/lib/warehouse";
 *
 * Per architecture/container-centric-model.md.
 */

export * from "./types";
export * from "./containers";
export * from "./shipments";
export * from "./tracking";
export { buildContainerCode, originPrefix, dateSlug } from "./code-gen";

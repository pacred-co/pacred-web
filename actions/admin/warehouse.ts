"use server";

import { z } from "zod";
import { withAdmin, type AdminActionResult } from "./common";

/**
 * Admin warehouse actions — STUB (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * The entire T-P2 / CT-4 spine — cargo_containers · cargo_shipments ·
 * cargo_shipment_tracking · cargo_sacks · the cascade RPC — was retired
 * under D1 Option A in Wave 2 in favour of the legacy `tb_forwarder`
 * single-source-of-truth pattern (faithful port of `report-cnt.php`).
 * Every admin UI that consumed these actions is now a tombstone
 * (see `app/[locale]/(admin)/admin/warehouse/{containers,bulletin,qa-inspections}/page.tsx`).
 *
 * This file used to wrap:
 *   - adminCreateContainer            (CT-4)
 *   - adminSetContainerStatus + cascade (P1-5 RPC)
 *   - adminAttachShipmentToContainer  (CT-4 + V-C3 close gate)
 *   - adminSetShipmentStatus          (cascade to forwarders / service_orders)
 *   - adminCreateShipmentManual       (U1-4)
 *   - adminSetShipmentReceivedQty     (U1-5)
 *   - adminSetShipmentCargoType       (V-D2)
 *   - adminSetContainerCloseAt        (V-C3)
 *   - adminAddTrackingEvent           (scan event)
 *
 * Replaced by: the legacy `tb_forwarder` flow — admin updates the
 * `fcabinetnumber` / `fstatus` columns directly on tb_forwarder rows
 * (see `/admin/forwarder-action` for the faithful port). Container-level
 * actions land in Phase C when the LINE bulletin + scan workflows are
 * faithfully ported.
 *
 * Action exports below preserve their shapes (so any mid-flight client
 * bundle compiles) and return a deprecation error so the issue surfaces.
 */

const DEPRECATION_ERROR =
  "Action นี้ถูกพักการใช้งานใน Wave 3 (spine retired) — ใช้ /admin/report-cnt + /admin/forwarder-action สำหรับการจัดการตู้/สถานะ shipment ในระบบ legacy แทน";

// ────────────────────────────────────────────────────────────
// Container status spine values — kept as a compile-time
// re-export so consumers that import from this module still type-check
// against a stable union. Mirrors the lib/warehouse/types.ts shape
// before deletion.
// ────────────────────────────────────────────────────────────

const CONTAINER_STATUS_VALUES_SPINE_LOCAL = [
  "packing", "sealed", "in_transit", "arrived", "unloading", "closed",
] as const;

const SHIPMENT_STATUS_VALUES_LOCAL = [
  "received_cn", "packed_cn", "sealed_in_container", "in_transit",
  "arrived_th", "unloaded", "out_for_delivery", "delivered",
] as const;

// ────────────────────────────────────────────────────────────
// Schemas — preserved so callers (mid-flight client forms) still validate
// ────────────────────────────────────────────────────────────

const createContainerSchema = z.object({
  code:                 z.string().trim().min(1).max(50).optional(),
  transport_mode:       z.enum(["truck", "sea", "air"]),
  origin:               z.string().trim().min(1).max(100),
  destination:          z.string().trim().min(1).max(100),
  source:               z.enum(["pacred", "momo", "self"]).default("pacred"),
  eta:                  z.string().date().optional(),
  status:               z.enum(CONTAINER_STATUS_VALUES_SPINE_LOCAL).default("packing"),
  carrier_container_no: z.string().trim().min(1).max(50).optional(),
  close_at:             z.string().datetime({ offset: true }).optional(),
});
export type CreateContainerInput = z.infer<typeof createContainerSchema>;

const setContainerStatusSchema = z.object({
  container_id: z.string().uuid(),
  status:       z.enum(CONTAINER_STATUS_VALUES_SPINE_LOCAL),
  note:         z.string().trim().max(500).optional(),
});
export type SetContainerStatusInput = z.infer<typeof setContainerStatusSchema>;

const attachShipmentSchema = z.object({
  shipment_id:  z.string().uuid(),
  container_id: z.string().uuid(),
});
export type AttachShipmentInput = z.infer<typeof attachShipmentSchema>;

const setShipmentStatusSchema = z.object({
  shipment_id: z.string().uuid(),
  status:      z.enum(SHIPMENT_STATUS_VALUES_LOCAL),
});
export type SetShipmentStatusInput = z.infer<typeof setShipmentStatusSchema>;

const addEventSchema = z.object({
  shipment_id: z.string().uuid(),
  event:       z.string().trim().min(1).max(50),
  location:    z.string().trim().max(100).optional(),
  box_no:      z.string().trim().max(50).optional(),
  note:        z.string().trim().max(500).optional(),
});
export type AddTrackingEventInput = z.infer<typeof addEventSchema>;

const createShipmentManualSchema = z.object({
  shipment_code:        z.string().trim().min(2).max(80),
  customer_ref:         z.string().trim().min(2).max(50),
  forwarder_f_no:       z.string().trim().max(50).optional(),
  service_order_h_no:   z.string().trim().max(50).optional(),
  cargo_container_id:   z.string().uuid().optional(),
  box_count:            z.number().int().min(1).max(100_000).default(1),
  weight_kg:            z.number().min(0).max(100_000).optional(),
  volume_cbm:           z.number().min(0).max(10_000).optional(),
  cargo_type:           z.string().trim().max(40).optional(),
  initial_scan:         z.boolean().default(true),
  initial_scan_location: z.string().trim().max(100).optional(),
});
export type CreateShipmentManualInput = z.infer<typeof createShipmentManualSchema>;

const setReceivedQtySchema = z.object({
  shipment_id:        z.string().uuid(),
  received_box_count: z.number().int().min(0).max(100_000),
});
export type SetShipmentReceivedQtyInput = z.infer<typeof setReceivedQtySchema>;

const setCargoTypeSchema = z.object({
  shipment_id: z.string().uuid(),
  cargo_type:  z.string().trim().max(40),
});
export type SetShipmentCargoTypeInput = z.infer<typeof setCargoTypeSchema>;

const setContainerCloseAtSchema = z.object({
  container_id: z.string().uuid(),
  close_at:     z.string().trim().max(40),
});
export type SetContainerCloseAtInput = z.infer<typeof setContainerCloseAtSchema>;

// ────────────────────────────────────────────────────────────
// Stubs — every entrypoint returns the deprecation error
// ────────────────────────────────────────────────────────────

export async function adminCreateContainer(
  _input: CreateContainerInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminSetContainerStatus(
  _input: SetContainerStatusInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminAttachShipmentToContainer(
  _input: AttachShipmentInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminSetShipmentStatus(
  _input: SetShipmentStatusInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminCreateShipmentManual(
  _input: CreateShipmentManualInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminSetShipmentReceivedQty(
  _input: SetShipmentReceivedQtyInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminSetShipmentCargoType(
  _input: SetShipmentCargoTypeInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminSetContainerCloseAt(
  _input: SetContainerCloseAtInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

export async function adminAddTrackingEvent(
  _input: AddTrackingEventInput,
): Promise<AdminActionResult> {
  return withAdmin(["super", "ops", "warehouse", "driver"], async () => {
    return { ok: false, error: DEPRECATION_ERROR };
  });
}

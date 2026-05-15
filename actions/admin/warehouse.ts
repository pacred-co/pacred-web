"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  createContainer as dbCreateContainer,
  setContainerStatus as dbSetContainerStatus,
  refreshContainerTotals,
  attachShipmentToContainer as dbAttachShipment,
  setShipmentStatus as dbSetShipmentStatus,
  appendTrackingEvent as dbAppendEvent,
  CONTAINER_STATUS_VALUES_SPINE,
  SHIPMENT_STATUS_VALUES,
  type ContainerStatusSpine,
  type ShipmentStatus,
  type Container,
  type Shipment,
  type TrackingEvent,
} from "@/lib/warehouse";

/**
 * Admin warehouse actions (T-P2 / CT-4).
 *
 * Thin Zod-validated wrappers over `lib/warehouse/*` typed clients.
 * RBAC: `withAdmin(["super","ops","warehouse"])` per ADR-0005 K-7 +
 * 0033 spec — warehouse role added in that migration; ops + super
 * keep full access for ad-hoc admin work.
 *
 * All mutations:
 *   - log audit (logAdminAction) for traceability
 *   - revalidatePath the affected admin pages
 *   - return AdminActionResult<T>
 */

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────

const createContainerSchema = z.object({
  // Optional — server auto-generates if omitted (origin-prefix + date + seq)
  code:           z.string().trim().min(1).max(50).optional(),
  transport_mode: z.enum(["truck", "sea", "air"]),
  origin:         z.string().trim().min(1).max(100),
  destination:    z.string().trim().min(1).max(100),
  source:         z.enum(["pacred", "momo", "self"]).default("pacred"),
  eta:            z.string().date().optional(),
  status:         z.enum(CONTAINER_STATUS_VALUES_SPINE).default("packing"),
});
export type CreateContainerInput = z.infer<typeof createContainerSchema>;

const setContainerStatusSchema = z.object({
  container_id: z.string().uuid(),
  status:       z.enum(CONTAINER_STATUS_VALUES_SPINE),
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
  status:      z.enum(SHIPMENT_STATUS_VALUES),
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

// ────────────────────────────────────────────────────────────
// CREATE container
// ────────────────────────────────────────────────────────────

export async function adminCreateContainer(
  input: CreateContainerInput,
): Promise<AdminActionResult<Container>> {
  const parsed = createContainerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<Container>(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await dbCreateContainer(admin, {
      code:           d.code,
      transport_mode: d.transport_mode,
      origin:         d.origin,
      destination:    d.destination,
      source:         d.source,
      status:         d.status,
      eta:            d.eta ?? null,
    });
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "container.create", "container", res.data.id, {
      code:           res.data.code,
      transport_mode: res.data.transport_mode,
      origin:         res.data.origin,
      destination:    res.data.destination,
      source:         res.data.source,
    });

    revalidatePath("/admin/warehouse/containers");
    if (res.data.code) {
      revalidatePath(`/admin/warehouse/containers/${res.data.code}`);
    }
    return { ok: true, data: res.data };
  });
}

// ────────────────────────────────────────────────────────────
// UPDATE container status (logs to container_status_history)
// ────────────────────────────────────────────────────────────

export async function adminSetContainerStatus(
  input: SetContainerStatusInput,
): Promise<AdminActionResult<Container>> {
  const parsed = setContainerStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<Container>(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await dbSetContainerStatus(admin, d.container_id, d.status as ContainerStatusSpine, {
      changedByAdmin: adminId,
      note:           d.note,
      source:         "pacred",
    });
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "container.set_status", "container", d.container_id, {
      to_status: d.status,
      note:      d.note ?? null,
    });

    revalidatePath("/admin/warehouse/containers");
    if (res.data.code) {
      revalidatePath(`/admin/warehouse/containers/${res.data.code}`);
    }
    return { ok: true, data: res.data };
  });
}

// ────────────────────────────────────────────────────────────
// ATTACH shipment to container (then refresh container totals)
// ────────────────────────────────────────────────────────────

export async function adminAttachShipmentToContainer(
  input: AttachShipmentInput,
): Promise<AdminActionResult<Shipment>> {
  const parsed = attachShipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<Shipment>(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await dbAttachShipment(admin, d.shipment_id, d.container_id);
    if (!res.ok) return { ok: false, error: res.error };

    // Keep the container's denorm cache fresh so the list view shows
    // accurate weight/box/cbm totals.
    await refreshContainerTotals(admin, d.container_id);

    await logAdminAction(adminId, "shipment.attach_container", "shipment", d.shipment_id, {
      container_id: d.container_id,
    });

    revalidatePath("/admin/warehouse/containers");
    return { ok: true, data: res.data };
  });
}

// ────────────────────────────────────────────────────────────
// SHIPMENT status transition
// ────────────────────────────────────────────────────────────

export async function adminSetShipmentStatus(
  input: SetShipmentStatusInput,
): Promise<AdminActionResult<Shipment>> {
  const parsed = setShipmentStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<Shipment>(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await dbSetShipmentStatus(admin, d.shipment_id, d.status as ShipmentStatus);
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "shipment.set_status", "shipment", d.shipment_id, {
      to_status: d.status,
    });

    revalidatePath("/admin/warehouse/containers");
    return { ok: true, data: res.data };
  });
}

// ────────────────────────────────────────────────────────────
// APPEND tracking event (scan)
// ────────────────────────────────────────────────────────────

export async function adminAddTrackingEvent(
  input: AddTrackingEventInput,
): Promise<AdminActionResult<TrackingEvent>> {
  const parsed = addEventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // RLS for shipment_tracking allows ['super','ops','warehouse','driver']
  // — drivers scan their own runs.  Match here.
  return withAdmin<TrackingEvent>(["super", "ops", "warehouse", "driver"], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await dbAppendEvent(admin, {
      cargo_shipment_id: d.shipment_id,
      event:             d.event,
      location:          d.location,
      box_no:            d.box_no,
      note:              d.note,
      scanned_by:        adminId,
      source:            "pacred",
    });
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "tracking.scan", "shipment", d.shipment_id, {
      event:    d.event,
      location: d.location ?? null,
      box_no:   d.box_no ?? null,
    });

    revalidatePath("/admin/warehouse/containers");
    return { ok: true, data: res.data };
  });
}

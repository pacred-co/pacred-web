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
  setShipmentReceivedQty as dbSetReceivedQty,
  createShipment as dbCreateShipment,
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
// U1-4: CREATE shipment manually (batch-ingest from supplier WeChat)
// ────────────────────────────────────────────────────────────
//
// Per chat IT (~15 asks/week): staff has tracking numbers from supplier
// WeChat batches and wants to register cargo_shipment rows BEFORE MOMO
// sync gets there (or when MOMO never gets there). This action:
//   1. Resolves customer by either profile_id (UUID) or member_code (PR####).
//   2. Validates source order belongs to that customer (forwarder OR
//      service_order; exactly one).
//   3. Creates cargo_shipment with optional container attachment.
//   4. Optional initial scan_receive event so the timeline shows a
//      "registered" entry for transparency (default ON).

const createShipmentManualSchema = z.object({
  shipment_code:        z.string().trim().min(2).max(80),
  /** Customer lookup — accepts profile_id (UUID) OR member_code (PR####). */
  customer_ref:         z.string().trim().min(2).max(50),
  forwarder_f_no:       z.string().trim().max(50).optional(),
  service_order_h_no:   z.string().trim().max(50).optional(),
  cargo_container_id:   z.string().uuid().optional(),
  box_count:            z.number().int().min(1).max(100_000).default(1),
  weight_kg:            z.number().min(0).max(100_000).optional(),
  volume_cbm:           z.number().min(0).max(10_000).optional(),
  initial_scan:         z.boolean().default(true),
  initial_scan_location: z.string().trim().max(100).optional(),
});
export type CreateShipmentManualInput = z.infer<typeof createShipmentManualSchema>;

type CreateShipmentManualResult = {
  shipment_id:   string;
  shipment_code: string;
  customer_id:   string;
  customer_member_code: string | null;
};

export async function adminCreateShipmentManual(
  input: CreateShipmentManualInput,
): Promise<AdminActionResult<CreateShipmentManualResult>> {
  const parsed = createShipmentManualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  // Cross-field: exactly one source order
  const hasFwd  = !!d.forwarder_f_no;
  const hasOrd  = !!d.service_order_h_no;
  if (hasFwd === hasOrd) {
    return { ok: false, error: "ต้องระบุ forwarder f_no หรือ service_order h_no อย่างใดอย่างหนึ่ง" };
  }

  return withAdmin<CreateShipmentManualResult>(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── 1. Resolve customer ──
    const refLooksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.customer_ref);
    const profileQuery = admin
      .from("profiles")
      .select("id, member_code")
      .limit(1);
    const { data: profile } = refLooksLikeUuid
      ? await profileQuery.eq("id", d.customer_ref).maybeSingle<{ id: string; member_code: string | null }>()
      : await profileQuery.eq("member_code", d.customer_ref.toUpperCase()).maybeSingle<{ id: string; member_code: string | null }>();
    if (!profile) return { ok: false, error: `ไม่พบลูกค้า "${d.customer_ref}"` };

    // ── 2. Validate source order belongs to this customer ──
    if (hasFwd) {
      const { data: f } = await admin
        .from("forwarders")
        .select("id, profile_id")
        .eq("f_no", d.forwarder_f_no!)
        .maybeSingle<{ id: string; profile_id: string }>();
      if (!f)                          return { ok: false, error: "ไม่พบ forwarder f_no นี้" };
      if (f.profile_id !== profile.id) return { ok: false, error: "forwarder ไม่ใช่ของลูกค้านี้" };
    } else {
      const { data: o } = await admin
        .from("service_orders")
        .select("id, profile_id")
        .eq("h_no", d.service_order_h_no!)
        .maybeSingle<{ id: string; profile_id: string }>();
      if (!o)                          return { ok: false, error: "ไม่พบ service_order h_no นี้" };
      if (o.profile_id !== profile.id) return { ok: false, error: "service_order ไม่ใช่ของลูกค้านี้" };
    }

    // ── 3. Create shipment ──
    const created = await dbCreateShipment(admin, {
      shipment_code:      d.shipment_code,
      profile_id:         profile.id,
      cargo_container_id: d.cargo_container_id ?? null,
      forwarder_f_no:     d.forwarder_f_no ?? null,
      service_order_h_no: d.service_order_h_no ?? null,
      box_count:          d.box_count,
      weight_kg:          d.weight_kg ?? null,
      volume_cbm:         d.volume_cbm ?? null,
      status:             "received_cn",       // newly registered = "received in CN"
    });
    if (!created.ok) {
      // Friendlier messages for common errors
      if (created.error.includes("duplicate") || created.error.includes("23505")) {
        return { ok: false, error: `shipment_code "${d.shipment_code}" มีอยู่แล้ว — ใช้รหัสอื่นหรือแก้ของเดิม` };
      }
      return { ok: false, error: created.error };
    }

    // ── 4. Initial scan event (default ON) ──
    if (d.initial_scan) {
      await dbAppendEvent(admin, {
        cargo_shipment_id: created.data.id,
        event:             "scan_receive",
        location:          d.initial_scan_location ?? "manual_register",
        scanned_by:        adminId,
        source:            "pacred",
        note:              "ลงทะเบียนด้วยมือ (admin manual entry — U1-4)",
      });
    }

    // ── 5. Refresh container totals if attached ──
    if (d.cargo_container_id) {
      await refreshContainerTotals(admin, d.cargo_container_id);
    }

    await logAdminAction(adminId, "shipment.create_manual", "shipment", created.data.id, {
      shipment_code:      d.shipment_code,
      customer_member:    profile.member_code,
      forwarder_f_no:     d.forwarder_f_no ?? null,
      service_order_h_no: d.service_order_h_no ?? null,
      cargo_container_id: d.cargo_container_id ?? null,
      box_count:          d.box_count,
    });

    revalidatePath("/admin/warehouse/containers");
    if (d.cargo_container_id) {
      // We don't have the container code here; revalidating the parent
      // is enough — admin clicks back into the detail to see the new row.
    }

    return {
      ok: true,
      data: {
        shipment_id:          created.data.id,
        shipment_code:        created.data.shipment_code,
        customer_id:          profile.id,
        customer_member_code: profile.member_code,
      },
    };
  });
}

// ────────────────────────────────────────────────────────────
// U1-5: SET shipment received_box_count (split-receipt aware)
// ────────────────────────────────────────────────────────────

const setReceivedQtySchema = z.object({
  shipment_id:        z.string().uuid(),
  received_box_count: z.number().int().min(0).max(100_000),
});
export type SetShipmentReceivedQtyInput = z.infer<typeof setReceivedQtySchema>;

export async function adminSetShipmentReceivedQty(
  input: SetShipmentReceivedQtyInput,
): Promise<AdminActionResult<Shipment>> {
  const parsed = setReceivedQtySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<Shipment>(["super", "ops", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const res = await dbSetReceivedQty(admin, d.shipment_id, d.received_box_count);
    if (!res.ok) return { ok: false, error: res.error };

    await logAdminAction(adminId, "shipment.set_received_qty", "shipment", d.shipment_id, {
      received_box_count: d.received_box_count,
      box_count_expected: res.data.box_count,
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

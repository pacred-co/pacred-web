/**
 * Shipment DB client (T-P2 / CT-2).
 *
 * Server-only typed wrappers around the `shipments` table.
 * Used by:
 *   - `actions/admin/warehouse.ts` (admin attach-to-container, status moves)
 *   - future MOMO sync (CT-5/6 — registers partner shipments)
 *   - `actions/shipments.ts` (customer-side; uses regular createClient + RLS)
 *
 * Naming: `shipment_code` is human-readable identifier (admin types it
 * during scan).  No auto-gen helper here because admin staff prefers to
 * write what's on the shipment label — not invent codes.  If a missing
 * code is a problem we'll add a generator later.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Shipment,
  ShipmentInsert,
  ShipmentStatus,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// READ
// ────────────────────────────────────────────────────────────

export async function getShipmentById(
  admin: SupabaseClient,
  id: string,
): Promise<Result<Shipment | null>> {
  const { data, error } = await admin
    .from("cargo_shipments")
    .select("*")
    .eq("id", id)
    .maybeSingle<Shipment>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

export async function getShipmentByCode(
  admin: SupabaseClient,
  code: string,
): Promise<Result<Shipment | null>> {
  const { data, error } = await admin
    .from("cargo_shipments")
    .select("*")
    .eq("shipment_code", code)
    .maybeSingle<Shipment>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

/** All shipments inside a container — used by container detail page. */
export async function listShipmentsByContainer(
  admin: SupabaseClient,
  containerId: string,
): Promise<Result<Shipment[]>> {
  const { data, error } = await admin
    .from("cargo_shipments")
    .select("*")
    .eq("cargo_container_id", containerId)
    .order("created_at", { ascending: true })
    .returns<Shipment[]>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

// ────────────────────────────────────────────────────────────
// WRITE
// ────────────────────────────────────────────────────────────

export async function createShipment(
  admin: SupabaseClient,
  input: ShipmentInsert,
): Promise<Result<Shipment>> {
  // Schema CHECK requires at least one parent order; double-check here
  // for a friendlier error message than Postgres' raw constraint name.
  if (!input.forwarder_f_no && !input.service_order_h_no) {
    return { ok: false, error: "shipment must reference a forwarder or service_order" };
  }

  const { data, error } = await admin
    .from("cargo_shipments")
    .insert({
      shipment_code:      input.shipment_code,
      profile_id:         input.profile_id,
      cargo_container_id: input.cargo_container_id ?? null,
      forwarder_f_no:     input.forwarder_f_no ?? null,
      service_order_h_no: input.service_order_h_no ?? null,
      box_count:          input.box_count ?? 1,
      weight_kg:          input.weight_kg ?? null,
      volume_cbm:         input.volume_cbm ?? null,
      status:             input.status ?? "received_cn",
    })
    .select("*")
    .single<Shipment>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function attachShipmentToContainer(
  admin: SupabaseClient,
  shipmentId: string,
  containerId: string,
): Promise<Result<Shipment>> {
  const { data, error } = await admin
    .from("cargo_shipments")
    .update({ cargo_container_id: containerId })
    .eq("id", shipmentId)
    .select("*")
    .single<Shipment>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * U1-5: update received_box_count + stamp received_at_partial.
 * Called when staff partial-receives boxes for a shipment in TH warehouse.
 */
export async function setShipmentReceivedQty(
  admin: SupabaseClient,
  shipmentId: string,
  receivedBoxCount: number,
): Promise<Result<Shipment>> {
  if (!Number.isInteger(receivedBoxCount) || receivedBoxCount < 0) {
    return { ok: false, error: "received_box_count must be a non-negative integer" };
  }
  const { data, error } = await admin
    .from("cargo_shipments")
    .update({
      received_box_count:  receivedBoxCount,
      received_at_partial: new Date().toISOString(),
    })
    .eq("id", shipmentId)
    .select("*")
    .single<Shipment>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

export async function setShipmentStatus(
  admin: SupabaseClient,
  shipmentId: string,
  toStatus: ShipmentStatus,
): Promise<Result<Shipment>> {
  // Stamp completion timestamps on terminal-ish transitions so receipts
  // + reports have an "actual" date instead of just the latest tracking
  // event.
  const update: Record<string, unknown> = { status: toStatus };
  const nowIso = new Date().toISOString();
  if (toStatus === "received_cn") update.received_at_cn  = nowIso;
  if (toStatus === "delivered")   update.delivered_at_th = nowIso;

  const { data, error } = await admin
    .from("cargo_shipments")
    .update(update)
    .eq("id", shipmentId)
    .select("*")
    .single<Shipment>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

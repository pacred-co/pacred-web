/**
 * Tracking-event DB client (T-P2 / CT-2).
 *
 * Append-only timeline of `scan_*` events per shipment. Higher-level
 * status transitions on the shipment row (received_cn → packed_cn → ...)
 * are caller's concern — this module just appends events.
 *
 * Convention: when the warehouse staff scans an event that corresponds
 * to a status transition (e.g. scan_pack → packed_cn), the caller should
 * also flip `shipments.status` via `setShipmentStatus`. This module
 * intentionally does NOT couple them so MOMO sync can append a scan
 * without inferring a status change (MOMO might send out-of-order scans).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TrackingEvent,
  TrackingEventInsert,
} from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function appendTrackingEvent(
  admin: SupabaseClient,
  input: TrackingEventInsert,
): Promise<Result<TrackingEvent>> {
  const { data, error } = await admin
    .from("shipment_tracking")
    .insert({
      shipment_id: input.shipment_id,
      box_no:      input.box_no ?? null,
      event:       input.event,
      location:    input.location ?? null,
      scanned_at:  input.scanned_at ?? new Date().toISOString(),
      scanned_by:  input.scanned_by ?? null,
      source:      input.source ?? "pacred",
      note:        input.note ?? null,
    })
    .select("*")
    .single<TrackingEvent>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

/**
 * Read the full timeline for a shipment (newest first).
 * Customer detail page uses `createClient()` + RLS; admin uses this
 * with `createAdminClient()` to see all sources.
 */
export async function listTrackingEvents(
  admin: SupabaseClient,
  shipmentId: string,
): Promise<Result<TrackingEvent[]>> {
  const { data, error } = await admin
    .from("shipment_tracking")
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("scanned_at", { ascending: false })
    .returns<TrackingEvent[]>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

/**
 * Latest event per shipment for a set of shipment IDs.
 * Cheap-ish: one IN-query + client-side group. Used by container detail
 * to show "last seen" per shipment without N+1.
 */
export async function latestEventsByShipments(
  admin: SupabaseClient,
  shipmentIds: string[],
): Promise<Result<Map<string, TrackingEvent>>> {
  if (shipmentIds.length === 0) return { ok: true, data: new Map() };
  const { data, error } = await admin
    .from("shipment_tracking")
    .select("*")
    .in("shipment_id", shipmentIds)
    .order("scanned_at", { ascending: false })
    .returns<TrackingEvent[]>();
  if (error) return { ok: false, error: error.message };

  const latest = new Map<string, TrackingEvent>();
  for (const e of (data ?? [])) {
    if (!latest.has(e.shipment_id)) latest.set(e.shipment_id, e);
  }
  return { ok: true, data: latest };
}

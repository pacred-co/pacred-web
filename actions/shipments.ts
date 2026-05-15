"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Customer-side shipment tracking (T-P2 / CT-3).
 *
 * Per Part T-P2: "Where's my container?" is the #1 customer churn factor.
 * Customer can see → return rate ↑.
 *
 * Auth: relies on Supabase RLS — `cargo_shipments_customer_read` policy
 * lets `auth.uid() = profile_id` read their own cargo_shipments +
 * cargo_containers join + cargo_shipment_tracking events. So we use the
 * regular `createClient()` (not admin client). If RLS blocks for any
 * reason, we get empty arrays — never a crash, never another customer's
 * data.
 *
 * The container record is reachable via FK and the
 * `cargo_containers_customer_read` policy lets a customer see any
 * container where they own ≥1 shipment. So
 * `container:cargo_containers!cargo_container_id` embed works without
 * admin escalation.
 *
 * Tables are `cargo_*` prefixed per the dave hotfix `936dff7` — distinct
 * from the legacy `public.containers` (0016 phase-H ops-tracking shape).
 */

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ShipmentSummary = {
  id:               string;
  shipment_code:    string;
  status:           string;
  box_count:        number | null;
  weight_kg:        number | null;
  volume_cbm:       number | null;
  received_at_cn:   string | null;
  delivered_at_th:  string | null;
  forwarder_f_no:   string | null;
  service_order_h_no: string | null;
  created_at:       string;
  container: {
    id:             string;
    code:           string;
    transport_mode: string;
    origin:         string;
    destination:    string;
    status:         string;
    eta:            string | null;
    actual_arrival: string | null;
  } | null;
  // Most recent tracking event (for "last seen" hint on the list page)
  latest_event:     { event: string; location: string | null; scanned_at: string } | null;
};

export type ShipmentDetail = ShipmentSummary & {
  events: Array<{
    id:         string;
    event:      string;
    location:   string | null;
    scanned_at: string;
    note:       string | null;
    source:     string;
  }>;
};

// ────────────────────────────────────────────────────────────
// LIST — customer's shipments (ordered newest first)
// ────────────────────────────────────────────────────────────
export async function listMyShipments(
  limit = 50,
): Promise<ActionResult<ShipmentSummary[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Pull shipments + container in one query.  shipment_tracking is fetched
  // separately to grab "latest event per shipment" without N+1 — single
  // query, group in TS.
  const { data: rows, error } = await supabase
    .from("cargo_shipments")
    .select(`
      id, shipment_code, status, box_count, weight_kg, volume_cbm,
      received_at_cn, delivered_at_th, forwarder_f_no, service_order_h_no, created_at,
      container:cargo_containers!cargo_container_id (
        id, code, transport_mode, origin, destination, status, eta, actual_arrival
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  type ContainerEmbed = ShipmentSummary["container"];
  type Raw = Omit<ShipmentSummary, "container" | "latest_event"> & {
    container: ContainerEmbed | ContainerEmbed[] | null;
  };

  const shipments = ((rows ?? []) as Raw[]).map((r) => ({
    ...r,
    container: Array.isArray(r.container) ? (r.container[0] ?? null) : r.container,
    latest_event: null as ShipmentSummary["latest_event"],
  }));

  if (shipments.length === 0) return { ok: true, data: shipments };

  // Latest event lookup — one query pulls the most-recent event per
  // cargo_shipment_id via "DESC + distinct on" emulated client-side
  // (Supabase JS doesn't expose distinct on; group manually).
  const ids = shipments.map((s) => s.id);
  const { data: events } = await supabase
    .from("cargo_shipment_tracking")
    .select("cargo_shipment_id, event, location, scanned_at")
    .in("cargo_shipment_id", ids)
    .order("scanned_at", { ascending: false });

  const latestByShipment = new Map<string, ShipmentSummary["latest_event"]>();
  for (const e of (events ?? []) as Array<{
    cargo_shipment_id: string; event: string; location: string | null; scanned_at: string;
  }>) {
    if (!latestByShipment.has(e.cargo_shipment_id)) {
      latestByShipment.set(e.cargo_shipment_id, {
        event:      e.event,
        location:   e.location,
        scanned_at: e.scanned_at,
      });
    }
  }

  for (const s of shipments) {
    s.latest_event = latestByShipment.get(s.id) ?? null;
  }

  return { ok: true, data: shipments };
}

// ────────────────────────────────────────────────────────────
// DETAIL — single shipment + full tracking timeline
// ────────────────────────────────────────────────────────────
export async function getMyShipment(
  shipmentCode: string,
): Promise<ActionResult<ShipmentDetail>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  if (!shipmentCode || shipmentCode.length > 100) {
    return { ok: false, error: "invalid_shipment_code" };
  }

  const { data, error } = await supabase
    .from("cargo_shipments")
    .select(`
      id, shipment_code, status, box_count, weight_kg, volume_cbm,
      received_at_cn, delivered_at_th, forwarder_f_no, service_order_h_no, created_at,
      container:cargo_containers!cargo_container_id (
        id, code, transport_mode, origin, destination, status, eta, actual_arrival
      )
    `)
    .eq("shipment_code", shipmentCode)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data)  return { ok: false, error: "not_found" };

  type ContainerEmbed = ShipmentSummary["container"];
  type Raw = Omit<ShipmentSummary, "container" | "latest_event"> & {
    container: ContainerEmbed | ContainerEmbed[] | null;
  };
  const r = data as unknown as Raw;
  const shipment: ShipmentDetail = {
    ...r,
    container: Array.isArray(r.container) ? (r.container[0] ?? null) : r.container,
    latest_event: null,
    events: [],
  };

  // Full timeline (newest first) — RLS lets the customer read these via
  // cargo_shipment_tracking_customer_read (parent-shipment ownership check).
  const { data: events } = await supabase
    .from("cargo_shipment_tracking")
    .select("id, event, location, scanned_at, note, source")
    .eq("cargo_shipment_id", shipment.id)
    .order("scanned_at", { ascending: false });

  shipment.events = (events ?? []) as ShipmentDetail["events"];
  if (shipment.events[0]) {
    shipment.latest_event = {
      event:      shipment.events[0].event,
      location:   shipment.events[0].location,
      scanned_at: shipment.events[0].scanned_at,
    };
  }

  return { ok: true, data: shipment };
}

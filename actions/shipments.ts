"use server";

/**
 * Customer-side shipment tracking — STUB (Wave 3 cleanup, 2026-05-20 ค่ำ).
 *
 * T-P2 / CT-3 was built on the retired spine tables (`cargo_shipments` +
 * `cargo_shipment_tracking` + `cargo_containers`). Under D1 Option A the
 * spine was retired in Wave 2 in favour of the legacy `tb_forwarder` flow.
 *
 * Customer "Where's my shipment?" tracking lands in Phase C when the
 * legacy scan + tracking workflow is faithfully ported on top of
 * `tb_forwarder` + `tb_forwarder_items`. Until then both functions
 * return empty result sets so the customer pages render their
 * empty-state UI instead of crashing.
 *
 * Replaced by: the per-order detail pages at `/service-import/[fNo]`
 * and `/service-order/[hNo]` for now (status + tracking_th visible
 * inline) until tracking is restored in Phase C.
 */

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ShipmentSummary = {
  id:               string;
  shipment_code:    string;
  status:           string;
  box_count:        number | null;
  received_box_count: number;
  received_at_partial: string | null;
  weight_kg:        number | null;
  volume_cbm:       number | null;
  cargo_type:       string | null;
  received_at_cn:   string | null;
  delivered_at_th:  string | null;
  forwarder_f_no:   string | null;
  service_order_h_no: string | null;
  created_at:       string;
  container: {
    id:                   string;
    code:                 string;
    transport_mode:       string;
    origin:               string;
    destination:          string;
    status:               string;
    eta:                  string | null;
    actual_arrival:       string | null;
    carrier_container_no: string | null;
    close_at:             string | null;
  } | null;
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

export async function listMyShipments(
  _limit = 50,
): Promise<ActionResult<ShipmentSummary[]>> {
  // STUB — spine retired; returns empty list (renders empty-state UI).
  return { ok: true, data: [] };
}

export async function getMyShipment(
  _shipmentCode: string,
): Promise<ActionResult<ShipmentDetail>> {
  // STUB — spine retired; signal not-found so the page renders its 404.
  return { ok: false, error: "not_found" };
}

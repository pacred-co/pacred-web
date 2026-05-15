/**
 * MOMO JMF — partner API typed shapes.
 *
 * MOMO is Pacred's container-closing partner (Thailand warehouse).
 * Pacred CONSUMES container/shipment data from MOMO until in-house
 * volume justifies self-closing.
 *
 * Endpoint inventory + exact response shapes are TBD pending ก๊อต
 * MOMO-1 call (call MOMO dev → confirm).  Until then, these types
 * represent the BEST-GUESS based on:
 *   - docs/architecture/container-centric-model.md design
 *   - Legacy cargo-thai wire format (PHP pcs-admin/api-forwarder-jmf/*.php)
 *
 * ภูม: when ก๊อต confirms actual MOMO response shape, adjust these
 * types + re-run any consumer to surface type errors.
 *
 * @see docs/integrations/momo-jmf.md
 * @see docs/architecture/container-centric-model.md
 */

// MOMO's container status enum (guess — pending MOMO-1 confirmation).
export type MomoContainerStatus =
  | "open"        // packing in progress at MOMO warehouse
  | "packing"     // alias for open (some legacy endpoints used this)
  | "closed"      // sealed; manifest finalised
  | "in_transit" // on carrier (truck/ship/plane)
  | "arrived"    // landed at destination warehouse
  | "unloading"  // breaking out of the container
  | "released";   // all shipments dispatched; container retired

// Map MOMO status → Pacred cargo_containers.status (per migration 0033).
// ภูม: extend mapping if MOMO returns additional values.
export const MOMO_STATUS_TO_PACRED: Record<MomoContainerStatus, string> = {
  open:       "packing",
  packing:    "packing",
  closed:     "sealed",
  in_transit: "in_transit",
  arrived:    "arrived",
  unloading:  "unloading",
  released:   "closed",
};

export interface MomoContainerSummary {
  code:            string;                       // e.g. "GZE260516-1"
  transport_mode:  "truck" | "sea" | "air";
  origin:          string;                       // warehouse code or city
  destination:     string;
  status:          MomoContainerStatus;
  eta:             string | null;                // ISO date
  packed_at:       string | null;                // ISO datetime
  sealed_at:       string | null;
  actual_arrival:  string | null;
  total_boxes:     number;
  total_weight_kg: number;
  total_cbm:       number;
  updated_at:      string;                       // for last-sync incremental filter
}

export interface MomoContainerDetail extends MomoContainerSummary {
  manifest: MomoShipmentSummary[];               // shipments inside this container
}

export interface MomoShipmentSummary {
  shipment_code: string;
  // Customer reference — MOMO might key on member_code (PR00###) or a
  // Pacred-side customer ID. ก๊อต confirms during MOMO-1; ภูม resolves
  // to profile_id via lookup at upsert time.
  customer_ref:  string;
  box_count:     number;
  weight_kg:     number | null;
  volume_cbm:    number | null;
  status:        string;                         // received_cn / packed_cn / sealed_in_container / in_transit / arrived_th / unloaded / out_for_delivery / delivered
}

export interface MomoTrackingEvent {
  shipment_code: string;
  box_no:        string | null;                  // null = shipment-level event
  event:         string;                         // scan_receive / scan_pack / scan_seal / etc.
  location:      string | null;
  scanned_at:    string;                         // ISO datetime
  note:          string | null;
}

// Inbound webhook payload — MOMO POSTs status changes to Pacred.
// Pacred verifies via shared secret (if MOMO provides one) + IP allowlist.
export interface MomoWebhookPayload {
  event_type:     "container.status_changed" | "shipment.status_changed" | "tracking.event";
  container_code?: string;
  shipment_code?:  string;
  payload:        Record<string, unknown>;
  timestamp:      string;
}

/**
 * Shared types for the warehouse spine (T-P2 / CT-2).
 *
 * Mirrors the schema in `supabase/migrations/0033_containers.sql` +
 * `0040_cargo_type_and_carrier_container.sql`. Lives outside
 * `server-only` so action callers + helper modules + future tsx tests
 * all share the same shape contracts.
 */

import type { CargoType } from "./cargo-type";

// ────────────────────────────────────────────────────────────
// Containers — physical shipping unit
// ────────────────────────────────────────────────────────────

/** Container status — UNION of 0016 phase-H + 0033 spine values per the
 *  fix-up migration (commit `bf7acf8`). New code should write 0033 values
 *  ('packing' / 'arrived' / 'unloading' / 'closed'); 0016 values are
 *  read-only legacy.  See container-centric-model.md. */
export const CONTAINER_STATUS_VALUES_SPINE = [
  "packing",
  "sealed",
  "in_transit",
  "arrived",
  "unloading",
  "closed",
] as const;

export const CONTAINER_STATUS_VALUES_LEGACY = [
  "preparing",
  "sealed",
  "in_transit",
  "arrived_port",
  "cleared_customs",
  "delivered",
  "cancelled",
] as const;

export type ContainerStatusSpine  = (typeof CONTAINER_STATUS_VALUES_SPINE)[number];
export type ContainerStatusLegacy = (typeof CONTAINER_STATUS_VALUES_LEGACY)[number];
export type ContainerStatus       = ContainerStatusSpine | ContainerStatusLegacy;

export type ContainerTransportMode = "truck" | "sea" | "air";
export type ContainerSource        = "pacred" | "momo" | "self";

export type Container = {
  id:              string;
  code:            string | null;            // 0033 spine code; nullable while migrating from 0016
  transport_mode:  ContainerTransportMode | null;
  origin:          string | null;
  destination:     string | null;
  status:          ContainerStatus;
  packed_at:       string | null;
  sealed_at:       string | null;
  eta:             string | null;
  actual_arrival:  string | null;
  source:          ContainerSource;
  total_boxes:     number;
  total_weight_kg: number;
  total_cbm:       number;
  /** V-D3: the shipping-line / carrier physical container number from
   *  the B/L (e.g. BLOU2025012). Distinct from `code` (Pacred-issued). */
  carrier_container_no: string | null;
  /** V-C3: forward-looking "ตัดตู้" deadline. Past now() = no new
   *  shipments accepted (enforced server-side in attach/manual-create
   *  actions). NULL = no deadline. */
  close_at:        string | null;
  /** U1-1: source row ID in legacy public.containers when this row was
   *  mirrored via migration 0059. NULL for spine-native rows. */
  legacy_container_id?:  string | null;
  /** U1-1: legacy public.containers.container_no preserved for search
   *  + audit. NULL for spine-native rows. */
  legacy_container_no?:  string | null;
  /** U1-1: legacy ops fields absorbed into the spine row. */
  vessel?:             string | null;
  carrier?:            string | null;
  vendor_container_id?: string | null;
  cost_thb?:           number | null;
  note?:               string | null;
  cleared_at?:         string | null;
  delivered_at?:       string | null;
  cancelled_at?:       string | null;
  created_at:      string;
  updated_at:      string;
};

export type ContainerInsert = Pick<
  Container,
  "transport_mode" | "origin" | "destination" | "source"
> & {
  code?:           string;                   // auto-generated if omitted
  status?:         ContainerStatusSpine;     // defaults to 'packing'
  eta?:            string | null;
  total_boxes?:    number;
  total_weight_kg?: number;
  total_cbm?:      number;
  carrier_container_no?: string | null;      // V-D3
  close_at?:       string | null;            // V-C3
};

// ────────────────────────────────────────────────────────────
// Shipments — one customer's portion of a container
// ────────────────────────────────────────────────────────────

export const SHIPMENT_STATUS_VALUES = [
  "received_cn",
  "packed_cn",
  "sealed_in_container",
  "in_transit",
  "arrived_th",
  "unloaded",
  "out_for_delivery",
  "delivered",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUS_VALUES)[number];

export type Shipment = {
  id:                  string;
  shipment_code:       string;
  cargo_container_id:  string | null;
  profile_id:          string;
  forwarder_f_no:      string | null;
  service_order_h_no:  string | null;
  /** Expected boxes (declared at origin / packed in China). U1-5: compare
   *  against received_box_count to detect partial receipt. */
  box_count:           number;
  /** Actual boxes received at TH warehouse. 0 until staff scans in. May
   *  exceed box_count if extra/unmanifested boxes arrive. */
  received_box_count:  number;
  /** Last time received_box_count changed — for "last partial scan" UI. */
  received_at_partial: string | null;
  weight_kg:           number | null;
  /** Legacy single-source CBM. New code should read the three per-source
   *  columns below + show diff. V-D1. */
  volume_cbm:          number | null;
  /** V-D1: TH warehouse receive-scan measurement (source of truth). */
  received_cbm:        number | null;
  /** V-D1: queue/billed CBM that the customer was charged on. */
  queue_cbm:           number | null;
  /** V-D1: China manifest declaration (legacy volume_cbm backfilled here). */
  manifest_cbm:        number | null;
  /** V-D2: canonical cargo category — drives staff clearance prompts
   *  (มอก. for electrical, อย. for food/drug, brand check, etc.). Legacy
   *  A/M/X/O/Z (PCS API) + G/T/F (manifest) normalise here on import. */
  cargo_type:          CargoType | null;
  status:              ShipmentStatus;
  received_at_cn:      string | null;
  delivered_at_th:     string | null;
  created_at:          string;
  updated_at:          string;
};

export type ShipmentInsert = {
  shipment_code:       string;
  profile_id:          string;
  cargo_container_id?: string | null;
  forwarder_f_no?:     string | null;
  service_order_h_no?: string | null;
  box_count?:          number;
  weight_kg?:          number | null;
  volume_cbm?:         number | null;
  cargo_type?:         CargoType | null;     // V-D2
  status?:             ShipmentStatus;
};

// ────────────────────────────────────────────────────────────
// Tracking events — per-shipment scan timeline
// ────────────────────────────────────────────────────────────

/** Conventional event names (free-text; not constrained by DB). Kept here
 *  so admin/UI/cron all reach for the same vocabulary. */
export const TRACKING_EVENT_KIND = {
  RECEIVE: "scan_receive",   // received at China warehouse
  PACK:    "scan_pack",      // packed into container
  SEAL:    "scan_seal",      // container sealed (departure-side)
  DEPART:  "scan_depart",    // container left origin
  ARRIVE:  "scan_arrive",    // container arrived destination
  UNLOAD:  "scan_unload",    // shipment lifted out of container
  DELIVER: "scan_deliver",   // delivered to customer
} as const;

export type TrackingEventKind = (typeof TRACKING_EVENT_KIND)[keyof typeof TRACKING_EVENT_KIND] | string;

export type TrackingSource = "pacred" | "momo" | "customer_scan";

export type TrackingEvent = {
  id:          string;
  cargo_shipment_id: string;
  box_no:      string | null;
  event:       TrackingEventKind;
  location:    string | null;
  scanned_at:  string;
  scanned_by:  string | null;
  source:      TrackingSource;
  note:        string | null;
  created_at:  string;
};

export type TrackingEventInsert = {
  cargo_shipment_id: string;
  event:       TrackingEventKind;
  box_no?:     string | null;
  location?:   string | null;
  scanned_at?: string;                       // defaults to now()
  scanned_by?: string | null;
  source?:     TrackingSource;               // defaults to 'pacred'
  note?:       string | null;
};

// ────────────────────────────────────────────────────────────
// Container status history
// ────────────────────────────────────────────────────────────

export type ContainerStatusChange = {
  id:                 string;
  cargo_container_id: string;
  from_status:      ContainerStatus | null;
  to_status:        ContainerStatus;
  note:             string | null;
  changed_at:       string;
  changed_by_admin: string | null;
  source:           "pacred" | "momo" | "self";
};

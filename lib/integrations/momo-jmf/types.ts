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

/**
 * MOMO's container status enum (U1-6: verbatim port from PCS DEV chat
 * 2026-05-02 — endpoint `https://api-cn.alilogisticshub.com/?api=container-list`).
 *
 * Confirmed by chat audit `docs/audit/chat-analysis-2026-05-16.md` §
 * "MOMO canonical status enum (port verbatim)". When ก๊อต MOMO-1 lands
 * with the actual MOMO endpoint inventory, re-verify this list against
 * live responses. If MOMO ships additional values, add them here +
 * extend MOMO_STATUS_TO_PACRED below.
 */
export type MomoContainerStatus =
  | "loading_container"          // China warehouse packing into the container
  | "ek_left_china_border"       // truck/road: departed China border (Ek = EK route)
  | "ek_arrived_vietnam_border"  // truck/road: at Vietnam border
  | "in_transit"                 // generic transit (also sea-truck combo)
  | "sea_leaving_china"          // sea: departed Chinese port
  | "sea_arrived_thailand_port"  // sea: at TH port (e.g. Laem Chabang)
  | "ek_arrived_mukdahan"        // truck/road: at Mukdahan border (TH entry)
  | "unloading_in_thailand"      // unloading at TH warehouse
  | "unloaded_completed";        // all shipments out, container retired

/**
 * Map MOMO status → Pacred cargo_containers.status (per migration 0033).
 * Per chat audit §canonical mapping table.
 */
export const MOMO_STATUS_TO_PACRED: Record<MomoContainerStatus, string> = {
  loading_container:         "packing",
  ek_left_china_border:      "in_transit",
  sea_leaving_china:         "in_transit",
  ek_arrived_vietnam_border: "in_transit",   // intermediate; mid-route
  in_transit:                "in_transit",
  sea_arrived_thailand_port: "arrived",
  ek_arrived_mukdahan:       "arrived",
  unloading_in_thailand:     "unloading",
  unloaded_completed:        "closed",
};

/**
 * Thai labels for the 9 MOMO statuses — used by admin UI when displaying
 * raw MOMO status (e.g., on /admin/warehouse/containers/[code] when MOMO
 * sync writes back the source status). Customer-facing pages use the
 * Pacred-side labels (STATUS_LABEL in /shipments) instead.
 */
export const MOMO_STATUS_LABEL_TH: Record<MomoContainerStatus, string> = {
  loading_container:         "กำลังบรรจุที่จีน",
  ek_left_china_border:      "ออกจากด่านจีน (รถ)",
  ek_arrived_vietnam_border: "ถึงด่านเวียดนาม (รถ)",
  in_transit:                "กำลังเดินทาง",
  sea_leaving_china:         "ออกจากท่าเรือจีน",
  sea_arrived_thailand_port: "ถึงท่าเรือไทย",
  ek_arrived_mukdahan:       "ถึงด่านมุกดาหาร (รถ)",
  unloading_in_thailand:     "กำลังลงสินค้าที่ไทย",
  unloaded_completed:        "ลงสินค้าเสร็จสิ้น",
};

/** English labels — same key set; for EN locale toggling. */
export const MOMO_STATUS_LABEL_EN: Record<MomoContainerStatus, string> = {
  loading_container:         "Loading at China warehouse",
  ek_left_china_border:      "Left China border (truck)",
  ek_arrived_vietnam_border: "At Vietnam border (truck)",
  in_transit:                "In transit",
  sea_leaving_china:         "Departed Chinese port (sea)",
  sea_arrived_thailand_port: "At Thai port (sea)",
  ek_arrived_mukdahan:       "At Mukdahan border (truck)",
  unloading_in_thailand:     "Unloading in Thailand",
  unloaded_completed:        "Unloaded — container retired",
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

/**
 * กระสอบรวม (consolidated-sack) SOT — types + pure helpers.
 *
 * MIRROR-ONLY, DERIVED model. Pacred does NOT originate sacks now — the sack data
 * is MIRRORED from the MOMO partner (กวางโจว uses MOMO; อี้อู uses TTW, out of
 * scope). A "กระสอบ" is therefore NOT its own table — it is a GROUP of
 * `momo_import_tracks` rows that share the same `momo_sack_no`. This module is the
 * shared vocabulary for the /admin/warehouse/sacks list + detail (both read-only).
 *
 * PHYSICAL-ONLY — a sack carries qty / volume / weight + a status. There is NO
 * price / cost / profit / baht on momo_import_tracks and none is added here.
 *
 * Plain module (NOT "use server") — types + consts + pure functions only, so it
 * can be imported by server actions AND client components alike.
 */

import { WAREHOUSES, type WarehouseId } from "@/lib/admin/customer-rate-tables";
import {
  transportModeFromCabinetName,
  type TransportMode,
} from "@/lib/forwarder/cabinet-transport";

// ── Derived-sack row types (aggregated from momo_import_tracks) ──

/** One aggregated sack = a group of momo_import_tracks rows sharing momo_sack_no. */
export type DerivedSack = {
  sack_no: string;             // momo_sack_no (the group key)
  container: string | null;    // real ตู้ GZS/GZE when closed, else the MOMO routing batch
  container_is_real: boolean;  // true = real cabinet (GZS/GZE) · false = routing batch (รอปิดตู้)
  transport_type: string | null; // DERIVED from the container name ('1'/'2'/'3')
  parcels: number;             // count(*) of momo_import_tracks rows in the sack
  qty: number;                 // sum(quantity)
  weight: number;              // sum(weight_kg)
  cbm: number;                 // sum(cbm)
  status: string | null;       // a representative shipment_status / current_location
  last_synced_at: string | null; // latest last_synced_at across the group
};

/** One parcel inside a derived sack = a raw momo_import_tracks row (subset). */
export type SackParcel = {
  momo_tracking_no: string | null;
  momo_user_code: string | null;   // the customer member code (PR)
  momo_cg_no: string | null;       // partner piece code
  weight_kg: number;
  cbm: number;
  quantity: number;
  shipment_status: string | null;
  current_location: string | null;
};

// ── Warehouse-city label (REUSE the WAREHOUSES SOT — do not invent a map) ──
/** '1' → กวางโจว · '2' → อี้อู (matches tb_forwarder.fwarehousechina). */
export function warehouseCityLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!c) return "—";
  return WAREHOUSES.find((w) => w.id === c)?.short ?? c;
}

/** The warehouse-city options for a filter/select — from the SOT. */
export const SACK_WAREHOUSE_OPTIONS: { id: WarehouseId; label: string }[] =
  WAREHOUSES.map((w) => ({ id: w.id, label: w.short }));

// ── Transport (DERIVE via cabinet-transport.ts — never hardcode) ──
/**
 * Derive the transport mode ('1'=รถ '2'=เรือ '3'=อากาศ) from the container name(s).
 * Returns null when none of the names carry a recognised GZS/GZE/GZA · SEA/EK/AIR
 * token (caller renders '—').
 */
export function transportTypeOf(
  ...names: (string | null | undefined)[]
): TransportMode | null {
  for (const name of names) {
    const mode = transportModeFromCabinetName(name);
    if (mode) return mode;
  }
  return null;
}

const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚛 ทางรถ",
  "2": "🚢 ทางเรือ",
  "3": "✈️ ทางอากาศ",
};

/** Human label for a transport code ('1'/'2'/'3'). '—' when unknown/empty. */
export function transportTypeLabel(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  return TRANSPORT_LABEL[c] ?? "—";
}

export const SACK_TRANSPORT_OPTIONS: { id: string; label: string }[] = [
  { id: "1", label: "🚛 ทางรถ" },
  { id: "2", label: "🚢 ทางเรือ" },
  { id: "3", label: "✈️ ทางอากาศ" },
];

// ── Status ───────────────────────────────────────────────────
/**
 * Readable Thai label for a MOMO shipment_status / current_location. MOMO sends
 * free-text (either Thai already, or a status token) — we pass it through, mapping
 * a few known English tokens to Thai. '—' when empty.
 */
const STATUS_LABEL: Record<string, string> = {
  pending: "รอดำเนินการ",
  in_transit: "กำลังขนส่ง",
  arrived: "ถึงแล้ว",
  shipped: "ส่งออกแล้ว",
  closed: "ปิดกระสอบ",
};

export function sackStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "—";
  return STATUS_LABEL[s.toLowerCase()] ?? s;
}

// ── Aggregates (pure) ────────────────────────────────────────
export type SackTotals = { qty: number; weight: number; cbm: number; parcels: number };

/** Sum qty / weight / cbm + count parcels across a sack's rows. Pure — no side-effects. */
export function computeSackTotals(
  rows: { quantity?: number | null; weight_kg?: number | null; cbm?: number | null }[],
): SackTotals {
  return rows.reduce<SackTotals>(
    (acc, r) => ({
      qty: acc.qty + (Number(r.quantity) || 0),
      weight: acc.weight + (Number(r.weight_kg) || 0),
      cbm: acc.cbm + (Number(r.cbm) || 0),
      parcels: acc.parcels + 1,
    }),
    { qty: 0, weight: 0, cbm: 0, parcels: 0 },
  );
}

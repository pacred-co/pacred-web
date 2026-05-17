/**
 * U2-5 — Sack ("กระสอบรวม") DB client.
 *
 * Server-only typed wrappers around `cargo_sacks` + the
 * `cargo_shipments.cargo_sack_id` link.
 *
 * Sacks sit BETWEEN cargo_containers and cargo_shipments:
 *
 *   cargo_container ── 1:N ── cargo_sack ── 1:N ── cargo_shipment
 *                     OR
 *   cargo_container ──────── 1:N ──────────────── cargo_shipment
 *                            (cargo_sack_id NULL — direct, no sack)
 *
 * The sack is essential to billing reconciliation (datanew L-3 / L-4):
 *   MOMO reports the OUTSIDE-of-bag CBM (here, `cargo_sacks.cbm`).
 *   PCS warehouse staff measure the INSIDE goods (per-shipment
 *   `cargo_shipments.received_cbm`).
 *   Sum-inside ≠ outside on every container (~31% gap per L-3).
 * Storing both lets U1-3 (billing gate) + future R-7 (margin
 * dashboard) compare them.
 *
 * Used by:
 *   - future `app/api/cron/momo-jmf-sync/route.ts` (U1-7, blocked on
 *     L-0 API doc fix) — sync writes `source='momo'`
 *   - future admin UI under `/admin/warehouse/sacks` if/when needed
 *   - read by container detail page to surface sack-level breakdown
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Sack, SackSource } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ────────────────────────────────────────────────────────────
// READ
// ────────────────────────────────────────────────────────────

export async function getSackById(
  admin: SupabaseClient,
  id: string,
): Promise<Result<Sack | null>> {
  const { data, error } = await admin
    .from("cargo_sacks")
    .select("*")
    .eq("id", id)
    .maybeSingle<Sack>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

export async function getSackByCode(
  admin: SupabaseClient,
  code: string,
): Promise<Result<Sack | null>> {
  const { data, error } = await admin
    .from("cargo_sacks")
    .select("*")
    .eq("code", code)
    .maybeSingle<Sack>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? null };
}

export async function listSacksForContainer(
  admin: SupabaseClient,
  containerId: string,
): Promise<Result<Sack[]>> {
  const { data, error } = await admin
    .from("cargo_sacks")
    .select("*")
    .eq("cargo_container_id", containerId)
    .order("created_at", { ascending: false })
    .returns<Sack[]>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ?? [] };
}

// ────────────────────────────────────────────────────────────
// WRITE — upsert via code (MOMO sync entry point)
// ────────────────────────────────────────────────────────────

export type SackUpsertInput = {
  code:                string;          // CBX<YYMMDD>-EK<NN>
  cargo_container_id?: string | null;
  weight_kg?:          number | null;
  cbm?:                number | null;
  origin?:             string | null;
  destination?:        string | null;
  source?:             SackSource;      // defaults to 'momo'
  packed_at?:          string | null;
  arrived_at?:         string | null;
  note?:               string | null;
};

/**
 * Idempotent upsert keyed on `code`. Returns the resulting row
 * (whether inserted or updated). Mirror of `upsertContainerByCode`
 * for the same "MOMO partner gives us a sack we may or may not have
 * seen" pattern.
 */
export async function upsertSackByCode(
  admin: SupabaseClient,
  input: SackUpsertInput,
): Promise<Result<Sack>> {
  const payload = {
    code:               input.code,
    cargo_container_id: input.cargo_container_id ?? null,
    weight_kg:          input.weight_kg          ?? null,
    cbm:                input.cbm                ?? null,
    origin:             input.origin             ?? null,
    destination:        input.destination        ?? null,
    source:             input.source             ?? ("momo" as SackSource),
    packed_at:          input.packed_at          ?? null,
    arrived_at:         input.arrived_at         ?? null,
    note:               input.note               ?? null,
  };
  const { data, error } = await admin
    .from("cargo_sacks")
    .upsert(payload, { onConflict: "code" })
    .select("*")
    .single<Sack>();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}

// ────────────────────────────────────────────────────────────
// WRITE — attach a shipment to a sack
// ────────────────────────────────────────────────────────────

/**
 * Flip cargo_shipments.cargo_sack_id. Pass null to detach (move the
 * shipment back to "directly in the container, no sack"). Caller is
 * responsible for ensuring the sack + the shipment share the same
 * cargo_container_id (this helper does not enforce, to allow
 * inter-container moves the MOMO sync occasionally needs).
 */
export async function attachShipmentToSack(
  admin: SupabaseClient,
  shipmentId: string,
  sackId: string | null,
): Promise<Result<{ shipment_id: string; sack_id: string | null }>> {
  const { error } = await admin
    .from("cargo_shipments")
    .update({ cargo_sack_id: sackId })
    .eq("id", shipmentId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { shipment_id: shipmentId, sack_id: sackId } };
}

// ────────────────────────────────────────────────────────────
// Reconciliation helper — outside (sack) vs inside (sum of shipments)
// ────────────────────────────────────────────────────────────

export type SackReconcile = {
  sack_id:          string;
  outside_cbm:      number | null;       // cargo_sacks.cbm
  inside_total_cbm: number;              // sum(cargo_shipments.received_cbm) where cargo_sack_id = sack
  shipment_count:   number;
  /** outside_cbm - inside_total_cbm; positive = sack has more than goods sum
   *  (compression / wasted space); negative = goods exceed sack (impossible — likely data error). */
  cbm_gap:          number | null;
  /** abs(cbm_gap) / outside_cbm — useful for "≥ 5% gap" flags on dashboards. */
  cbm_gap_pct:      number | null;
};

/**
 * Computes the outside-vs-inside CBM gap for a sack — the U1-3
 * billing-gate / R-7 margin-dashboard reference. Returns null gaps
 * when either side is null (sack uninitialised OR no shipments
 * received yet).
 */
export async function reconcileSack(
  admin: SupabaseClient,
  sackId: string,
): Promise<Result<SackReconcile>> {
  const sackRes = await getSackById(admin, sackId);
  if (!sackRes.ok)   return sackRes;
  if (!sackRes.data) return { ok: false, error: "sack_not_found" };
  const sack = sackRes.data;

  const { data: ships, error: shipErr } = await admin
    .from("cargo_shipments")
    .select("received_cbm")
    .eq("cargo_sack_id", sackId)
    .returns<Array<{ received_cbm: number | null }>>();
  if (shipErr) return { ok: false, error: shipErr.message };

  const rows = ships ?? [];
  const insideTotal = rows.reduce((sum, r) => sum + (Number(r.received_cbm) || 0), 0);
  const outside     = sack.cbm == null ? null : Number(sack.cbm);
  const gap         = outside == null ? null : outside - insideTotal;
  const gapPct      = outside == null || outside === 0 ? null : Math.abs(gap ?? 0) / outside;

  return {
    ok: true,
    data: {
      sack_id:          sackId,
      outside_cbm:      outside,
      inside_total_cbm: insideTotal,
      shipment_count:   rows.length,
      cbm_gap:          gap,
      cbm_gap_pct:      gapPct,
    },
  };
}

/**
 * MOMO JMF — sync orchestrator (P2.1 wiring).
 *
 * Pulls container + shipment updates from MOMO and writes to the Pacred
 * cargo spine (per `docs/architecture/container-centric-model.md`):
 *   - cargo_containers
 *   - cargo_shipments
 *   - cargo_shipment_tracking
 *   - cargo_container_status_history
 *
 * Called from:
 *   - Vercel cron  /api/cron/momo-sync   (daily, runs Sprint-11 P2.1)
 *   - Server Action adminSyncMomoContainers (manual trigger, future admin UI)
 *
 * Idempotent — re-running is safe; lookups keyed on:
 *   - cargo_containers.code            (unique)
 *   - cargo_shipments.shipment_code    (unique-ish; we resolve via lookup)
 *   - cargo_shipment_tracking          (shipment_id + scanned_at + event)
 *
 * Degrade pattern — when MOMO env is unset (`not_configured`), returns ok
 * with all counters at 0 so the cron quietly no-ops (mirrors cargothai-sync).
 *
 * @see docs/integrations/momo-jmf-api-spec.md  — canonical API surface
 * @see docs/architecture/container-centric-model.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  listContainers,
  getContainerManifest,
  getShipmentTracking,
} from "./client";
import {
  MOMO_STATUS_TO_PACRED,
  type MomoContainerSummary,
  type MomoShipmentSummary,
  type MomoTrackingEvent,
} from "./types";
import { toCanonicalCargoType } from "@/lib/warehouse/cargo-type";

export type SyncResult = {
  ok:       boolean;
  fetched:  number;
  upserted: number;
  skipped:  number;
  /** Shipments upserted across all fetched containers. */
  shipments_upserted: number;
  /** Tracking events appended. */
  tracking_appended:  number;
  /** Status transitions logged (cargo_container_status_history). */
  status_transitions: number;
  /** Reason when the whole sync short-circuited (e.g. not_configured). */
  reason?:  string;
  errors:   Array<{ code: string; reason: string }>;
};

/**
 * Full incremental sync.  Pulls containers updated since `since` from MOMO,
 * upserts into `cargo_containers` keyed on `code`, logs status transitions
 * into `cargo_container_status_history`, then sub-fetches manifest +
 * tracking per container.
 */
export async function syncContainersFromMomo(since?: Date): Promise<SyncResult> {
  const result: SyncResult = {
    ok:                 false,
    fetched:            0,
    upserted:           0,
    skipped:            0,
    shipments_upserted: 0,
    tracking_appended:  0,
    status_transitions: 0,
    errors:             [],
  };

  const list = await listContainers(since);
  if (!list.ok) {
    // not_configured → expected when MOMO env unset; quiet no-op so the
    // cron log isn't poisoned by every fire pre-token-flip.
    if (list.error === "not_configured") {
      result.ok     = true;
      result.reason = "not_configured";
      return result;
    }
    result.errors.push({ code: "_root", reason: list.error });
    result.reason = list.error;
    return result;
  }

  result.fetched = list.data.length;

  const admin = createAdminClient();

  for (const c of list.data) {
    try {
      const counts = await upsertContainerWithManifest(admin, c);
      if (counts.upserted)             result.upserted           += 1;
      if (counts.statusTransitioned)   result.status_transitions += 1;
      result.shipments_upserted += counts.shipmentsUpserted;
      result.tracking_appended  += counts.trackingAppended;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn("momo-sync", "container upsert threw", { code: c.code, msg });
      result.errors.push({ code: c.code, reason: msg });
      result.skipped += 1;
    }
  }

  result.ok = true;
  return result;
}

// ─── per-container worker ─────────────────────────────────────────────

type ContainerCounters = {
  upserted:            boolean;
  statusTransitioned:  boolean;
  shipmentsUpserted:   number;
  trackingAppended:    number;
};

async function upsertContainerWithManifest(
  admin: SupabaseClient,
  c:     MomoContainerSummary,
): Promise<ContainerCounters> {
  const counters: ContainerCounters = {
    upserted:           false,
    statusTransitioned: false,
    shipmentsUpserted:  0,
    trackingAppended:   0,
  };

  if (!c.code) return counters;

  const pacredStatus = MOMO_STATUS_TO_PACRED[c.status] ?? "packing";

  // 1. Look up existing container by code (cargo_containers.code is unique)
  const { data: existing, error: lookupErr } = await admin
    .from("cargo_containers")
    .select("id, status")
    .eq("code", c.code)
    .maybeSingle<{ id: string; status: string }>();
  if (lookupErr) {
    logger.warn("momo-sync", "container lookup failed", { code: c.code, reason: lookupErr.message });
    return counters;
  }

  // 2. Log status transition + upsert
  if (existing) {
    if (existing.status !== pacredStatus) {
      const { error: histErr } = await admin
        .from("cargo_container_status_history")
        .insert({
          cargo_container_id: existing.id,
          from_status:        existing.status,
          to_status:          pacredStatus,
          source:             "momo",
        });
      if (!histErr) counters.statusTransitioned = true;
    }

    const { error: updErr } = await admin
      .from("cargo_containers")
      .update({
        transport_mode:  c.transport_mode,
        origin:          c.origin,
        destination:     c.destination,
        status:          pacredStatus,
        packed_at:       c.packed_at,
        sealed_at:       c.sealed_at,
        eta:             c.eta,
        actual_arrival:  c.actual_arrival,
        total_boxes:     c.total_boxes,
        total_weight_kg: c.total_weight_kg,
        total_cbm:       c.total_cbm,
      })
      .eq("id", existing.id);
    if (!updErr) counters.upserted = true;
  } else {
    const { error: insErr } = await admin
      .from("cargo_containers")
      .insert({
        code:            c.code,
        transport_mode:  c.transport_mode,
        origin:          c.origin,
        destination:     c.destination,
        status:          pacredStatus,
        packed_at:       c.packed_at,
        sealed_at:       c.sealed_at,
        eta:             c.eta,
        actual_arrival:  c.actual_arrival,
        source:          "momo",
        total_boxes:     c.total_boxes,
        total_weight_kg: c.total_weight_kg,
        total_cbm:       c.total_cbm,
      });
    if (!insErr) counters.upserted = true;
  }

  // 3. Fetch container id (after upsert) for the per-shipment loop
  const { data: containerRow, error: containerRowErr } = await admin
    .from("cargo_containers")
    .select("id")
    .eq("code", c.code)
    .maybeSingle<{ id: string }>();
  if (!containerRow) return counters;

  // 4. Manifest → shipments
  const manifest = await getContainerManifest(c.code);
  if (!manifest.ok) {
    // Container row is upserted, but manifest failed — log + return.
    logger.warn("momo-sync", "manifest fetch failed", { code: c.code, reason: manifest.error });
    return counters;
  }

  for (const s of manifest.data) {
    const shipmentRowId = await upsertShipment(admin, s, containerRow.id);
    if (shipmentRowId) {
      counters.shipmentsUpserted += 1;
      // 5. Sub-fetch tracking for this shipment
      const tracking = await getShipmentTracking(s.shipment_code);
      if (tracking.ok) {
        const appended = await appendTrackingIdempotent(admin, shipmentRowId, tracking.data);
        counters.trackingAppended += appended;
      } else if (tracking.error !== "not_found") {
        logger.warn("momo-sync", "tracking fetch failed", {
          shipment_code: s.shipment_code, reason: tracking.error,
        });
      }
    }
  }

  return counters;
}

// ─── per-shipment helpers ─────────────────────────────────────────────

/** Resolve customer_ref → profile_id via member_code lookup. */
async function resolveProfileId(
  admin:        SupabaseClient,
  customerRef:  string,
): Promise<string | null> {
  const code = customerRef.trim().toUpperCase();
  if (!code) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("member_code", code)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/** Upsert a shipment row keyed on shipment_code; returns the row id (or null). */
async function upsertShipment(
  admin:       SupabaseClient,
  s:           MomoShipmentSummary,
  containerId: string,
): Promise<string | null> {
  if (!s.shipment_code) return null;

  const cargoType = toCanonicalCargoType(s.cargo_type);

  // Lookup first (cargo_shipments.shipment_code is unique).
  const { data: existing, error: lookupErr } = await admin
    .from("cargo_shipments")
    .select("id")
    .eq("shipment_code", s.shipment_code)
    .maybeSingle<{ id: string }>();
  if (lookupErr) {
    logger.warn("momo-sync", "shipment lookup failed", {
      shipment_code: s.shipment_code, reason: lookupErr.message,
    });
    return null;
  }

  if (existing) {
    const { error: updErr } = await admin
      .from("cargo_shipments")
      .update({
        cargo_container_id: containerId,
        box_count:          s.box_count,
        weight_kg:          s.weight_kg,
        volume_cbm:         s.volume_cbm,
        cargo_type:         cargoType,
        status:             s.status,
      })
      .eq("id", existing.id);
    if (updErr) return null;
    return existing.id;
  }

  // New shipment: resolve customer_ref → profile_id. Skip if no profile
  // (orphan shipment data — staff resolves via /admin/migration tools).
  const profileId = await resolveProfileId(admin, s.customer_ref);
  if (!profileId) {
    logger.warn("momo-sync", "shipment skipped — no profile for customer_ref", {
      shipment_code: s.shipment_code, customer_ref: s.customer_ref,
    });
    return null;
  }

  const { data: inserted, error: insErr } = await admin
    .from("cargo_shipments")
    .insert({
      shipment_code:      s.shipment_code,
      profile_id:         profileId,
      cargo_container_id: containerId,
      box_count:          s.box_count,
      weight_kg:          s.weight_kg,
      volume_cbm:         s.volume_cbm,
      cargo_type:         cargoType,
      status:             s.status,
    })
    .select("id")
    .single<{ id: string }>();
  if (insErr) {
    logger.warn("momo-sync", "shipment insert failed", {
      shipment_code: s.shipment_code, reason: insErr.message,
    });
    return null;
  }
  return inserted.id;
}

/** Append tracking events that don't already exist (idempotent on
 *  (cargo_shipment_id, scanned_at, event)). Returns count appended. */
async function appendTrackingIdempotent(
  admin:      SupabaseClient,
  shipmentId: string,
  events:     MomoTrackingEvent[],
): Promise<number> {
  if (events.length === 0) return 0;

  // Pull existing events for this shipment to dedupe against in-memory.
  const { data: existingRaw, error: existingRawErr } = await admin
    .from("cargo_shipment_tracking")
    .select("scanned_at, event")
    .eq("cargo_shipment_id", shipmentId);
  type ExRow = { scanned_at: string; event: string };
  const existingKeys = new Set<string>(
    ((existingRaw ?? []) as ExRow[]).map((r) => `${r.scanned_at}|${r.event}`),
  );

  let appended = 0;
  for (const e of events) {
    const key = `${e.scanned_at}|${e.event}`;
    if (existingKeys.has(key)) continue;

    const { error } = await admin
      .from("cargo_shipment_tracking")
      .insert({
        cargo_shipment_id: shipmentId,
        box_no:      e.box_no,
        event:       e.event,
        location:    e.location,
        scanned_at:  e.scanned_at,
        source:      "momo",
        note:        e.note,
      });
    if (!error) {
      appended += 1;
      existingKeys.add(key);
    }
  }
  return appended;
}

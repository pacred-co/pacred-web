"use server";

/**
 * Admin MOMO backfill — populate Phase A's new columns + container_closed_tracks
 * from existing `raw jsonb` data on `momo_import_tracks` + `momo_container_closed`.
 *
 * Brief 2026-05-28 (ปอน) §"Backfill Script":
 *   - read raw from existing tables
 *   - explode container_closed.raw.track_details[] → momo_container_closed_tracks
 *   - fill momo_container_ref / container_batch_no / real_container_no from raw
 *   - idempotent (re-runnable)
 *   - log clearly what was done
 *
 * Triggered manually from /admin/api-forwarder-momo/sync via a button.
 * Service-role only (createAdminClient + super/ops admin guard).
 *
 * ⚠️ Isolation: touches ONLY momo_* tables. Never touches cargo_* / tb_*.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { extractContainerClosedTracks } from "@/lib/integrations/momo-isolated";

export type MomoBackfillReport = {
  ok: boolean;
  importTracksScanned:        number;
  importTracksUpdated:        number;
  containerClosedScanned:     number;
  containerClosedUpdated:     number;
  containerTracksUpserted:    number;
  errors:                     Array<{ scope: string; message: string }>;
};

type RawBag = Record<string, unknown>;

function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return null;
}

function isRawBag(v: unknown): v is RawBag {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Run the backfill end-to-end.
 *
 * Steps:
 *   1. momo_import_tracks: UPDATE momo_container_ref = momo_container_no
 *      WHERE momo_container_ref IS NULL AND momo_container_no IS NOT NULL.
 *      (The existing legacy column already holds the ref value — we're just
 *      copying it to the clearer name.)
 *
 *   2. momo_container_closed: UPDATE momo_container_ref / container_batch_no
 *      / real_container_no from raw.fid / raw.cid / raw.cid_code where any
 *      of those new cols are still NULL. (Loop rows because the values come
 *      from raw jsonb, not a column.)
 *
 *   3. momo_container_closed → momo_container_closed_tracks: for each
 *      container_closed row, extract raw.track_details[] and upsert into
 *      the bridge table. Unique on (container_closed_id, momo_tracking_no)
 *      makes re-runs safe.
 */
export async function runMomoBackfill(): Promise<MomoBackfillReport> {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const admin  = createAdminClient();
  const report: MomoBackfillReport = {
    ok: true,
    importTracksScanned:     0,
    importTracksUpdated:     0,
    containerClosedScanned:  0,
    containerClosedUpdated:  0,
    containerTracksUpserted: 0,
    errors: [],
  };

  // ── Step 1: momo_import_tracks — clone container_no → container_ref ──
  // (The legacy column already holds the ref/round id; we're just adding
  // the clearer alias for new queries to use.)
  {
    const { data: rows, error } = await admin
      .from("momo_import_tracks")
      .select("id, momo_container_no, momo_container_ref")
      .is("momo_container_ref", null)
      .not("momo_container_no", "is", null);

    if (error) {
      report.errors.push({ scope: "import_tracks_scan", message: error.message });
    } else {
      report.importTracksScanned = rows?.length ?? 0;
      // Bulk update in batches of 500 (each row gets the same logic — set
      // ref = legacy container_no value).
      const batch = (rows ?? [])
        .filter((r) => r.momo_container_no != null)
        .map((r) => ({ id: r.id, momo_container_ref: r.momo_container_no as string }));
      for (let i = 0; i < batch.length; i += 500) {
        const chunk = batch.slice(i, i + 500);
        // Upsert with onConflict=id and merging fields (only changes container_ref).
        const { error: upErr } = await admin
          .from("momo_import_tracks")
          .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
        if (upErr) {
          report.errors.push({
            scope: "import_tracks_update",
            message: `chunk ${i}-${i + chunk.length}: ${upErr.message}`,
          });
        } else {
          report.importTracksUpdated += chunk.length;
        }
      }
    }
  }

  // ── Step 2 + 3: momo_container_closed — fill new cols + explode tracks ──
  {
    // Pull ALL container_closed rows. Schema is small (likely <10k rows).
    // If volume grows, swap to keyset pagination.
    const { data: rows, error } = await admin
      .from("momo_container_closed")
      .select("id, momo_container_no, momo_container_ref, container_batch_no, real_container_no, raw");

    if (error) {
      report.errors.push({ scope: "container_closed_scan", message: error.message });
    } else {
      report.containerClosedScanned = rows?.length ?? 0;
      const nowIso = new Date().toISOString();

      // Step 2 — collect parent updates (only changed rows).
      const parentUpdates: Array<{
        id: string;
        momo_container_ref: string | null;
        container_batch_no: string | null;
        real_container_no:  string | null;
      }> = [];

      // Step 3 — collect track explode rows.
      const trackRows: Array<{
        container_closed_id: string;
        momo_container_ref:  string | null;
        container_batch_no:  string | null;
        real_container_no:   string | null;
        momo_tracking_no:    string;
        weight_kg:           number | null;
        cbm:                 number | null;
        width:               number | null;
        height:              number | null;
        length:              number | null;
        quantity:            number | null;
        raw:                 unknown;
        last_synced_at:      string;
        updated_at:          string;
      }> = [];

      for (const row of rows ?? []) {
        if (!isRawBag(row.raw)) continue;
        const raw = row.raw;

        const ref   = asStr(raw.fid);
        const batch = asStr(raw.cid);
        const real  = asStr(raw.cid_code);

        // Only push update if any new col is still null (idempotent).
        const needsUpdate =
          (row.momo_container_ref === null && ref   !== null) ||
          (row.container_batch_no === null && batch !== null) ||
          (row.real_container_no  === null && real  !== null);
        if (needsUpdate) {
          parentUpdates.push({
            id: row.id as string,
            momo_container_ref: row.momo_container_ref ?? ref,
            container_batch_no: row.container_batch_no ?? batch,
            real_container_no:  row.real_container_no  ?? real,
          });
        }

        // Explode track_details[] into track rows.
        const extracted = extractContainerClosedTracks(raw);
        for (const t of extracted) {
          trackRows.push({
            container_closed_id: row.id as string,
            momo_container_ref:  t.momoContainerRef,
            container_batch_no:  t.containerBatchNo,
            real_container_no:   t.realContainerNo,
            momo_tracking_no:    t.trackingNo,
            weight_kg:           t.weightKg,
            cbm:                 t.cbm,
            width:               t.width,
            height:              t.height,
            length:              t.length,
            quantity:            t.quantity,
            raw:                 t.raw,
            last_synced_at:      nowIso,
            updated_at:          nowIso,
          });
        }
      }

      // Apply parent updates in chunks.
      for (let i = 0; i < parentUpdates.length; i += 500) {
        const chunk = parentUpdates.slice(i, i + 500);
        const { error: upErr } = await admin
          .from("momo_container_closed")
          .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });
        if (upErr) {
          report.errors.push({
            scope: "container_closed_update",
            message: `chunk ${i}-${i + chunk.length}: ${upErr.message}`,
          });
        } else {
          report.containerClosedUpdated += chunk.length;
        }
      }

      // Apply track explode in chunks.
      for (let i = 0; i < trackRows.length; i += 500) {
        const chunk = trackRows.slice(i, i + 500);
        const { error: trkErr } = await admin
          .from("momo_container_closed_tracks")
          .upsert(chunk, {
            onConflict: "container_closed_id,momo_tracking_no",
            ignoreDuplicates: false,
          });
        if (trkErr) {
          report.errors.push({
            scope: "container_closed_tracks_upsert",
            message: `chunk ${i}-${i + chunk.length}: ${trkErr.message}`,
          });
        } else {
          report.containerTracksUpserted += chunk.length;
        }
      }
    }
  }

  report.ok = report.errors.length === 0;
  return report;
}

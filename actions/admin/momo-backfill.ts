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
import {
  extractContainerClosedTracks,
  extractContainerDetails,
  extractImportTrackStatusDates,
  extractSackTracks,
  buildRawEventInput,
  refreshSnapshotForTracking,
} from "@/lib/integrations/momo-isolated";
import { randomUUID } from "node:crypto";

export type MomoBackfillReport = {
  ok: boolean;
  // Phase A — container naming + track explode:
  importTracksScanned:        number;
  importTracksUpdated:        number;
  containerClosedScanned:     number;
  containerClosedUpdated:     number;
  containerTracksUpserted:    number;
  // Phase B — detail explosion + retroactive raw audit:
  statusDatesUpserted:        number;
  containerDetailsUpserted:   number;
  sackInfosScanned:           number;
  sackTracksUpserted:         number;
  rawEventsInserted:          number;
  // Phase C — links + snapshots:
  linksUpserted:              number;
  snapshotsRefreshed:         number;
  snapshotsChanged:           number;
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
  const syncRunId = randomUUID();
  const report: MomoBackfillReport = {
    ok: true,
    importTracksScanned:     0,
    importTracksUpdated:     0,
    containerClosedScanned:  0,
    containerClosedUpdated:  0,
    containerTracksUpserted: 0,
    statusDatesUpserted:     0,
    containerDetailsUpserted:0,
    sackInfosScanned:        0,
    sackTracksUpserted:      0,
    rawEventsInserted:       0,
    linksUpserted:           0,
    snapshotsRefreshed:      0,
    snapshotsChanged:        0,
    errors: [],
  };

  // Phase C — collect unique trackings touched + buffer link rows.
  const touchedTrackings = new Set<string>();
  const linkBuffer: Array<Record<string, unknown>> = [];
  const nowIsoGlobal = new Date().toISOString();

  // ── Step 1: momo_import_tracks ──
  // (A) clone momo_container_no → momo_container_ref (Phase A)
  // (B) explode raw.status_date → momo_import_track_status_dates (Phase B)
  // (C) backfill raw_events from raw (Phase B retroactive audit)
  {
    const { data: rows, error } = await admin
      .from("momo_import_tracks")
      .select("id, momo_tracking_no, momo_container_no, momo_container_ref, raw");

    if (error) {
      report.errors.push({ scope: "import_tracks_scan", message: error.message });
    } else {
      report.importTracksScanned = rows?.length ?? 0;
      const nowIso = new Date().toISOString();

      // (A) Container ref clone — only for rows still missing it.
      const refUpdate = (rows ?? [])
        .filter((r) => r.momo_container_ref == null && r.momo_container_no != null)
        .map((r) => ({ id: r.id as string, momo_container_ref: r.momo_container_no as string }));
      for (let i = 0; i < refUpdate.length; i += 500) {
        const chunk = refUpdate.slice(i, i + 500);
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

      // (B) Status-date explosion + (C) raw event audit + (D) link rows.
      const statusDateRows: Array<{
        import_track_id:   string;
        momo_tracking_no:  string;
        status_key:        string;
        status_value_raw:  string;
        status_at:         string | null;
        updated_at:        string;
      }> = [];
      const rawEventRows: Array<Record<string, unknown>> = [];
      for (const row of rows ?? []) {
        const parentId   = row.id as string | undefined;
        const trackingNo = row.momo_tracking_no as string | undefined;
        if (!parentId) continue;
        // (B)
        const extracted = extractImportTrackStatusDates(row.raw);
        for (const sd of extracted) {
          statusDateRows.push({
            import_track_id:  parentId,
            momo_tracking_no: sd.trackingNo,
            status_key:       sd.statusKey,
            status_value_raw: sd.statusValueRaw,
            status_at:        sd.statusAt,
            updated_at:       nowIso,
          });
        }
        // (C)
        const ev = buildRawEventInput("import_track", row.raw, {
          sourceUrl:       null,
          sourceDateRange: null,
          syncRunId,
        });
        rawEventRows.push({
          source_endpoint:    ev.sourceEndpoint,
          source_url:         ev.sourceUrl,
          source_method:      "BACKFILL",
          source_date_range:  ev.sourceDateRange,
          momo_id:            ev.momoId,
          momo_tracking_no:   ev.momoTrackingNo,
          momo_container_ref: ev.momoContainerRef,
          sack_no:            ev.sackNo,
          cg_no:              ev.cgNo,
          raw:                ev.raw as never,
          raw_hash:           ev.rawHash,
          received_at:        ev.receivedAt,
          sync_run_id:        ev.syncRunId,
        });
        // (D) Phase C link row for import_track.
        if (trackingNo) {
          touchedTrackings.add(trackingNo);
          const rawBag = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
            ? (row.raw as Record<string, unknown>)
            : null;
          linkBuffer.push({
            momo_tracking_no:    trackingNo,
            momo_container_ref:  (rawBag?.container_no as string | undefined) ?? row.momo_container_ref ?? null,
            container_batch_no:  null,
            real_container_no:   null,
            sack_no:             (rawBag?.sack_no as string | undefined) ?? null,
            cg_no:               (rawBag?.CG_NO as string | undefined) ?? null,
            source_endpoint:     "import_track",
            source_table:        "momo_import_tracks",
            source_record_id:    parentId,
            matched_by:          "import_track.tracking",
            confidence:          "high",
            updated_at:          nowIsoGlobal,
          });
        }
      }
      // Apply in chunks.
      for (let i = 0; i < statusDateRows.length; i += 500) {
        const chunk = statusDateRows.slice(i, i + 500);
        const { error: sdErr } = await admin
          .from("momo_import_track_status_dates")
          .upsert(chunk, { onConflict: "import_track_id,status_key" });
        if (sdErr) {
          report.errors.push({
            scope: "import_track_status_dates",
            message: `chunk ${i}-${i + chunk.length}: ${sdErr.message}`,
          });
        } else {
          report.statusDatesUpserted += chunk.length;
        }
      }
      for (let i = 0; i < rawEventRows.length; i += 500) {
        const chunk = rawEventRows.slice(i, i + 500);
        const { error: reErr } = await admin
          .from("momo_raw_events")
          .insert(chunk);
        if (reErr) {
          report.errors.push({
            scope: "raw_events_import_track",
            message: `chunk ${i}-${i + chunk.length}: ${reErr.message}`,
          });
        } else {
          report.rawEventsInserted += chunk.length;
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

      // Phase B — collect container_details + raw_events for container_closed.
      const detailRows: Array<{
        container_closed_id:    string;
        momo_container_ref:     string | null;
        container_batch_no:     string | null;
        real_container_no:      string | null;
        bl_no:                  string | null;
        vessel_no:              string | null;
        estimate_date:          string | null;
        etd_cn_kodang:          string | null;
        eta_th_kodang:          string | null;
        etd_immigration:        string | null;
        eta_immigration:        string | null;
        transshipment:          string | null;
        raw_container_details:  unknown;
        updated_at:             string;
      }> = [];
      const ccRawEventRows: Array<Record<string, unknown>> = [];

      for (const row of rows ?? []) {
        if (!isRawBag(row.raw)) continue;
        const raw = row.raw;
        const parentId = row.id as string;

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
            id: parentId,
            momo_container_ref: row.momo_container_ref ?? ref,
            container_batch_no: row.container_batch_no ?? batch,
            real_container_no:  row.real_container_no  ?? real,
          });
        }

        // Explode track_details[] into track rows.
        const extracted = extractContainerClosedTracks(raw);
        for (const t of extracted) {
          trackRows.push({
            container_closed_id: parentId,
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

        // Phase B — explode container_details + raw_event audit.
        const cd = extractContainerDetails(raw);
        if (cd) {
          detailRows.push({
            container_closed_id:    parentId,
            momo_container_ref:     cd.momoContainerRef,
            container_batch_no:     cd.containerBatchNo,
            real_container_no:      cd.realContainerNo,
            bl_no:                  cd.blNo,
            vessel_no:              cd.vesselNo,
            estimate_date:          cd.estimateDate,
            etd_cn_kodang:          cd.etdCnKodang,
            eta_th_kodang:          cd.etaThKodang,
            etd_immigration:        cd.etdImmigration,
            eta_immigration:        cd.etaImmigration,
            transshipment:          cd.transshipment,
            raw_container_details:  cd.rawContainerDetails,
            updated_at:             nowIso,
          });
        }
        const ev = buildRawEventInput("container_closed", raw, {
          sourceUrl:       null,
          sourceDateRange: null,
          syncRunId,
        });
        ccRawEventRows.push({
          source_endpoint:    ev.sourceEndpoint,
          source_url:         ev.sourceUrl,
          source_method:      "BACKFILL",
          source_date_range:  ev.sourceDateRange,
          momo_id:            ev.momoId,
          momo_tracking_no:   ev.momoTrackingNo,
          momo_container_ref: ev.momoContainerRef,
          sack_no:            ev.sackNo,
          cg_no:              ev.cgNo,
          raw:                ev.raw as never,
          raw_hash:           ev.rawHash,
          received_at:        ev.receivedAt,
          sync_run_id:        ev.syncRunId,
        });
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

      // Apply track explode in chunks. Use .select() so we get back the
      // persisted ids → use them as source_record_id in link rows.
      for (let i = 0; i < trackRows.length; i += 500) {
        const chunk = trackRows.slice(i, i + 500);
        const { data: persisted, error: trkErr } = await admin
          .from("momo_container_closed_tracks")
          .upsert(chunk, {
            onConflict: "container_closed_id,momo_tracking_no",
            ignoreDuplicates: false,
          })
          .select("id, momo_tracking_no, momo_container_ref, container_batch_no, real_container_no");
        if (trkErr) {
          report.errors.push({
            scope: "container_closed_tracks_upsert",
            message: `chunk ${i}-${i + chunk.length}: ${trkErr.message}`,
          });
        } else {
          report.containerTracksUpserted += chunk.length;
          // Phase C link rows from persisted track rows.
          for (const row of persisted ?? []) {
            const r = row as {
              id?:                 string;
              momo_tracking_no?:   string;
              momo_container_ref?: string | null;
              container_batch_no?: string | null;
              real_container_no?:  string | null;
            };
            if (!r.id || !r.momo_tracking_no) continue;
            touchedTrackings.add(r.momo_tracking_no);
            linkBuffer.push({
              momo_tracking_no:    r.momo_tracking_no,
              momo_container_ref:  r.momo_container_ref ?? null,
              container_batch_no:  r.container_batch_no ?? null,
              real_container_no:   r.real_container_no ?? null,
              sack_no:             null,
              cg_no:                null,
              source_endpoint:     "container_closed",
              source_table:        "momo_container_closed_tracks",
              source_record_id:    r.id,
              matched_by:          "container_closed.track_details.reTrack",
              confidence:          "high",
              updated_at:          nowIsoGlobal,
            });
          }
        }
      }

      // Phase B — apply container_details in chunks.
      for (let i = 0; i < detailRows.length; i += 500) {
        const chunk = detailRows.slice(i, i + 500);
        const { error: cdErr } = await admin
          .from("momo_container_details")
          .upsert(chunk, { onConflict: "container_closed_id" });
        if (cdErr) {
          report.errors.push({
            scope: "container_details_upsert",
            message: `chunk ${i}-${i + chunk.length}: ${cdErr.message}`,
          });
        } else {
          report.containerDetailsUpserted += chunk.length;
        }
      }

      // Phase B — apply raw events for container_closed (insert-only).
      for (let i = 0; i < ccRawEventRows.length; i += 500) {
        const chunk = ccRawEventRows.slice(i, i + 500);
        const { error: reErr } = await admin
          .from("momo_raw_events")
          .insert(chunk);
        if (reErr) {
          report.errors.push({
            scope: "raw_events_container_closed",
            message: `chunk ${i}-${i + chunk.length}: ${reErr.message}`,
          });
        } else {
          report.rawEventsInserted += chunk.length;
        }
      }
    }
  }

  // ── Step 4 (Phase B) — momo_sack_infos backfill ──
  // For every existing sack row: explode raw.tracks[] + emit raw event.
  {
    const { data: rows, error } = await admin
      .from("momo_sack_infos")
      .select("id, momo_sack_no, raw");

    if (error) {
      report.errors.push({ scope: "sack_infos_scan", message: error.message });
    } else {
      report.sackInfosScanned = rows?.length ?? 0;
      const nowIso = new Date().toISOString();

      const sackTrackRows: Array<{
        sack_info_id:     string;
        sack_no:          string;
        momo_tracking_no: string;
        weight_kg:        number | null;
        cbm:              number | null;
        width:            number | null;
        height:           number | null;
        length:           number | null;
        quantity:         number | null;
        raw:              unknown;
        updated_at:       string;
      }> = [];
      const sackRawEventRows: Array<Record<string, unknown>> = [];

      for (const row of rows ?? []) {
        const parentId = row.id as string | undefined;
        const parentSack = row.momo_sack_no as string | undefined;
        if (!parentId || !parentSack) continue;
        const extracted = extractSackTracks(row.raw);
        for (const t of extracted) {
          sackTrackRows.push({
            sack_info_id:     parentId,
            sack_no:          parentSack,
            momo_tracking_no: t.trackingNo,
            weight_kg:        t.weightKg,
            cbm:              t.cbm,
            width:            t.width,
            height:           t.height,
            length:           t.length,
            quantity:         t.quantity,
            raw:              t.raw,
            updated_at:       nowIso,
          });
        }
        const ev = buildRawEventInput("sack_info", row.raw, {
          sourceUrl:       null,
          sourceDateRange: null,
          syncRunId,
        });
        sackRawEventRows.push({
          source_endpoint:    ev.sourceEndpoint,
          source_url:         ev.sourceUrl,
          source_method:      "BACKFILL",
          source_date_range:  ev.sourceDateRange,
          momo_id:            ev.momoId,
          momo_tracking_no:   ev.momoTrackingNo,
          momo_container_ref: ev.momoContainerRef,
          sack_no:            ev.sackNo,
          cg_no:              ev.cgNo,
          raw:                ev.raw as never,
          raw_hash:           ev.rawHash,
          received_at:        ev.receivedAt,
          sync_run_id:        ev.syncRunId,
        });
      }
      for (let i = 0; i < sackTrackRows.length; i += 500) {
        const chunk = sackTrackRows.slice(i, i + 500);
        const { data: persisted, error: stErr } = await admin
          .from("momo_sack_tracks")
          .upsert(chunk, { onConflict: "sack_info_id,momo_tracking_no" })
          .select("id, sack_no, momo_tracking_no");
        if (stErr) {
          report.errors.push({
            scope: "sack_tracks_upsert",
            message: `chunk ${i}-${i + chunk.length}: ${stErr.message}`,
          });
        } else {
          report.sackTracksUpserted += chunk.length;
          // Phase C link rows from persisted sack track rows.
          for (const row of persisted ?? []) {
            const r = row as {
              id?:               string;
              sack_no?:          string;
              momo_tracking_no?: string;
            };
            if (!r.id || !r.momo_tracking_no) continue;
            touchedTrackings.add(r.momo_tracking_no);
            linkBuffer.push({
              momo_tracking_no:    r.momo_tracking_no,
              momo_container_ref:  null,
              container_batch_no:  null,
              real_container_no:   null,
              sack_no:             r.sack_no ?? null,
              cg_no:               null,
              source_endpoint:     "sack_info",
              source_table:        "momo_sack_tracks",
              source_record_id:    r.id,
              matched_by:          "sack_info.tracks",
              confidence:          "high",
              updated_at:          nowIsoGlobal,
            });
          }
        }
      }
      for (let i = 0; i < sackRawEventRows.length; i += 500) {
        const chunk = sackRawEventRows.slice(i, i + 500);
        const { error: reErr } = await admin
          .from("momo_raw_events")
          .insert(chunk);
        if (reErr) {
          report.errors.push({
            scope: "raw_events_sack_info",
            message: `chunk ${i}-${i + chunk.length}: ${reErr.message}`,
          });
        } else {
          report.rawEventsInserted += chunk.length;
        }
      }
    }
  }

  // ── Phase C — flush link buffer + refresh snapshots ──
  for (let i = 0; i < linkBuffer.length; i += 500) {
    const chunk = linkBuffer.slice(i, i + 500);
    const { error: linkErr } = await admin
      .from("momo_tracking_links")
      .upsert(chunk, {
        onConflict: "momo_tracking_no,source_table,source_record_id",
      });
    if (linkErr) {
      report.errors.push({
        scope:   "tracking_links_upsert",
        message: `chunk ${i}-${i + chunk.length}: ${linkErr.message}`,
      });
    } else {
      report.linksUpserted += chunk.length;
    }
  }
  // Recompute snapshot for every tracking we touched. Best-effort: a
  // single failure pushes to errors but doesn't abort the loop.
  for (const trackingNo of touchedTrackings) {
    try {
      const { changed } = await refreshSnapshotForTracking(admin, trackingNo, syncRunId);
      report.snapshotsRefreshed += 1;
      if (changed) report.snapshotsChanged += 1;
    } catch (e) {
      report.errors.push({
        scope:   "snapshot_refresh",
        message: `tracking ${trackingNo}: ${e instanceof Error ? e.message : "unknown"}`,
      });
    }
  }

  report.ok = report.errors.length === 0;
  return report;
}

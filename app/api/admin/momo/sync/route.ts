/**
 * POST /api/admin/momo/sync
 *
 * Body: { start: "YYYY-MM-DD", end: "YYYY-MM-DD", sackNo?: string }
 *
 * Real sync: fetches MOMO + normalizes + UPSERTS into the new MOMO-
 * isolated tables ONLY (`momo_import_tracks`, `momo_container_closed`,
 * `momo_sack_infos`), plus a row in `momo_sync_logs`.
 *
 * ⚠️ Per brief 2026-05-28 (ปอน):
 *   ✅ writes ONLY to momo_* tables
 *   ❌ NEVER writes to legacy cargo_* / tb_* / any existing table
 *   ❌ NEVER touches existing /api/cron/momo-sync (the cron-driver
 *      that writes to spine cargo_* — separate codepath, isolated)
 *
 * Guard: super/ops/warehouse/accounting.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { getCurrentUser } from "@/lib/auth/get-user";
import {
  getImportTrack,
  getContainerClosed,
  getSackInfo,
  mapImportTrackArray,
  mapContainerClosedArray,
  mapSackInfoSingle,
  extractContainerClosedTracks,
  extractImportTrackStatusDates,
  extractContainerDetails,
  extractSackTracks,
  buildRawEventInput,
  refreshSnapshotForTracking,
  type MomoInternalAdminRecord,
  type MomoSourceEndpoint,
} from "@/lib/integrations/momo-isolated";
import { randomUUID } from "node:crypto";
import { guardAdmin, errorStatus } from "../_shared";

export const dynamic = "force-dynamic";

type Body = { start?: unknown; end?: unknown; sackNo?: unknown };
type SyncError = { scope: string; error: string; message: string };

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const start  = typeof body.start  === "string" ? body.start  : null;
  const end    = typeof body.end    === "string" ? body.end    : null;
  const sackNo = typeof body.sackNo === "string" ? body.sackNo.trim() : "";
  const wantDateRange = !!(start && end);

  if (!wantDateRange && !sackNo) {
    return NextResponse.json(
      { ok: false, error: "MOMO_VALIDATION_ERROR", message: "ต้องส่ง start+end หรือ sackNo" },
      { status: 400 },
    );
  }

  if (wantDateRange) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(start as string) || !re.test(end as string)) {
      return NextResponse.json(
        { ok: false, error: "MOMO_VALIDATION_ERROR", message: "start/end ต้องเป็น YYYY-MM-DD" },
        { status: 400 },
      );
    }
  }
  if (sackNo && !/^[A-Za-z0-9._-]+$/.test(sackNo)) {
    return NextResponse.json(
      { ok: false, error: "MOMO_VALIDATION_ERROR", message: "sackNo รูปแบบไม่ถูกต้อง" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const me = await getCurrentUser();

  // Migration 0120 — one sync_run_id groups all raw_events for this run.
  const syncRunId = randomUUID();
  const dateRangeStr = wantDateRange ? `${start}+${end}` : null;

  // Buffer raw event rows during the run, flush at the end. Cheaper than
  // many small inserts. Also lets us tolerate partial endpoint failures.
  const rawEventBuffer: Array<Record<string, unknown>> = [];
  function bufferRawEvent(endpoint: MomoSourceEndpoint, raw: unknown, sourceUrl: string | null) {
    const ev = buildRawEventInput(endpoint, raw, {
      sourceUrl,
      sourceDateRange: dateRangeStr,
      syncRunId,
    });
    rawEventBuffer.push({
      source_endpoint:    ev.sourceEndpoint,
      source_url:         ev.sourceUrl,
      source_method:      ev.sourceMethod,
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

  // Migration 0121 — collect link rows + the set of trackings touched
  // in this run. After all main upserts succeed, flush links then
  // refresh snapshots for each touched tracking.
  const linkBuffer: Array<Record<string, unknown>> = [];
  const touchedTrackings = new Set<string>();
  function bufferLink(args: {
    trackingNo:        string;
    containerRef:      string | null;
    batchNo:           string | null;
    realNo:            string | null;
    sackNo:            string | null;
    cgNo:              string | null;
    sourceEndpoint:    MomoSourceEndpoint;
    sourceTable:       string;
    sourceRecordId:    string;
    matchedBy:         string;
  }) {
    touchedTrackings.add(args.trackingNo);
    const nowIso = new Date().toISOString();
    linkBuffer.push({
      momo_tracking_no:    args.trackingNo,
      momo_container_ref:  args.containerRef,
      container_batch_no:  args.batchNo,
      real_container_no:   args.realNo,
      sack_no:             args.sackNo,
      cg_no:               args.cgNo,
      source_endpoint:     args.sourceEndpoint,
      source_table:        args.sourceTable,
      source_record_id:    args.sourceRecordId,
      matched_by:          args.matchedBy,
      confidence:          "high",
      updated_at:          nowIso,
    });
  }

  const errors: SyncError[] = [];
  let importTrackCount    = 0;
  let containerClosedCount = 0;
  let sackInfoCount       = 0;
  let upsertedCount       = 0;
  let failedCount         = 0;

  // ── 1. import_track ──
  let importMapped: MomoInternalAdminRecord[] = [];
  if (wantDateRange) {
    const itUrl = `/api/func/get/import/track/${dateRangeStr}`;
    const res = await getImportTrack(start as string, end as string);
    if (res.ok) {
      importMapped = mapImportTrackArray(res.data);
      importTrackCount = importMapped.length;

      // Migration 0120 — buffer raw events for every received item.
      // Unwrap {data:[...]} or array shape.
      const itRawItems = Array.isArray(res.data)
        ? res.data
        : (res.data && typeof res.data === "object" && Array.isArray((res.data as { data?: unknown[] }).data)
            ? (res.data as { data: unknown[] }).data
            : []);
      for (const item of itRawItems) {
        bufferRawEvent("import_track", item, itUrl);
      }

      const upRows = importMapped
        .filter((r) => r.trackingNo) // upsert requires the unique key
        .map((r) => ({
          momo_tracking_no:    r.trackingNo,
          momo_sack_no:        r.sackNo,
          momo_container_no:   r.containerNo,
          // ── 0119 container identity (ref/round id — same value as legacy col, clearer name) ──
          momo_container_ref:  r.momoContainerRef,
          // ── 0118 mirror columns ──
          momo_user_code:      r.momoUserCode,
          momo_user_group:     r.momoUserGroup,
          momo_cg_no:          r.momoCgNo,
          ship_by:             r.shipBy,
          weight_kg:           r.weightKg,
          cbm:                 r.cbm,
          quantity:            r.quantity,
          // ── status + range ──
          date_from:           start,
          date_to:             end,
          phase:               r.phase,
          shipment_status:     r.shipmentStatus,
          billing_status:      r.billingStatus,
          job_status:          r.jobStatus,
          issue_status:        r.issueStatus,
          admin_status_text:   r.adminStatusText,
          current_location:    r.currentLocation,
          etd:                 r.etd,
          eta:                 r.eta,
          momo_updated_at:     r.momoUpdatedAt,
          raw:                 r.raw as never,
          last_synced_at:      new Date().toISOString(),
          updated_at:          new Date().toISOString(),
        }));
      if (upRows.length > 0) {
        const { data: persisted, error: upErr } = await admin
          .from("momo_import_tracks")
          .upsert(upRows, { onConflict: "momo_tracking_no" })
          .select("id, momo_tracking_no, raw");
        if (upErr) {
          failedCount += upRows.length;
          errors.push({
            scope:   "import_track_upsert",
            error:   "MOMO_DB_UPSERT_FAILED",
            message: upErr.message,
          });
        } else {
          upsertedCount += upRows.length;

          // Migration 0120 — explode raw.status_date into 6 rows per import_track.
          const statusDateRows: Array<{
            import_track_id:   string;
            momo_tracking_no:  string;
            status_key:        string;
            status_value_raw:  string;
            status_at:         string | null;
            updated_at:        string;
          }> = [];
          const nowIso = new Date().toISOString();
          for (const row of persisted ?? []) {
            const parentId = (row as { id?: string }).id;
            if (!parentId) continue;
            const extracted = extractImportTrackStatusDates((row as { raw?: unknown }).raw);
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
          }
          if (statusDateRows.length > 0) {
            const { error: sdErr } = await admin
              .from("momo_import_track_status_dates")
              .upsert(statusDateRows, {
                onConflict: "import_track_id,status_key",
              });
            if (sdErr) {
              errors.push({
                scope:   "import_track_status_dates_upsert",
                error:   "MOMO_DB_UPSERT_FAILED",
                message: sdErr.message,
              });
            } else {
              upsertedCount += statusDateRows.length;
            }
          }

          // Migration 0121 — buffer link rows for the persisted import_tracks.
          for (const row of persisted ?? []) {
            const r = row as {
              id?: string;
              momo_tracking_no?: string | null;
              raw?: unknown;
            };
            if (!r.id || !r.momo_tracking_no) continue;
            const rawBag = r.raw && typeof r.raw === "object" && !Array.isArray(r.raw)
              ? (r.raw as Record<string, unknown>)
              : null;
            bufferLink({
              trackingNo:     r.momo_tracking_no,
              containerRef:   (rawBag?.container_no as string | undefined) ?? null,
              batchNo:        null,
              realNo:         null,
              sackNo:         (rawBag?.sack_no as string | undefined) ?? null,
              cgNo:           (rawBag?.CG_NO as string | undefined) ?? null,
              sourceEndpoint: "import_track",
              sourceTable:    "momo_import_tracks",
              sourceRecordId: r.id,
              matchedBy:      "import_track.tracking",
            });
          }
        }
      }
    } else {
      errors.push({ scope: "import_track", error: res.error, message: res.message });
    }

    // ── 2. container_closed ──
    const ccUrl = `/api/func/get/container/closed/${dateRangeStr}`;
    const ccRes = await getContainerClosed(start as string, end as string);
    if (ccRes.ok) {
      const mapped = mapContainerClosedArray(ccRes.data);
      containerClosedCount = mapped.length;

      // Migration 0120 — buffer raw events for every received container item.
      const ccRawItems = Array.isArray(ccRes.data)
        ? ccRes.data
        : (ccRes.data && typeof ccRes.data === "object" && Array.isArray((ccRes.data as { data?: unknown[] }).data)
            ? (ccRes.data as { data: unknown[] }).data
            : []);
      for (const item of ccRawItems) {
        bufferRawEvent("container_closed", item, ccUrl);
      }

      const upRows = mapped
        .filter((r) => r.containerNo)
        .map((r) => ({
          momo_container_no:   r.containerNo,
          momo_sack_no:        r.sackNo,
          // ── 0119 container identity ──
          momo_container_ref:  r.momoContainerRef,
          container_batch_no:  r.containerBatchNo,
          real_container_no:   r.realContainerNo,
          // ── 0118 mirror columns ──
          ship_by:             r.shipBy,
          total_kg:            r.totalKg,
          total_cbm:           r.totalCbm,
          total_parcel:        r.totalParcel,
          // ── status + range ──
          date_from:           start,
          date_to:             end,
          closed_at:           r.momoUpdatedAt,
          phase:               r.phase,
          shipment_status:     r.shipmentStatus,
          admin_status_text:   r.adminStatusText,
          raw:                 r.raw as never,
          last_synced_at:      new Date().toISOString(),
          updated_at:          new Date().toISOString(),
        }));
      if (upRows.length > 0) {
        // Upsert + select() returns the persisted rows (with their id),
        // which we need to populate the track_details[] explosion below.
        const { data: persisted, error: upErr } = await admin
          .from("momo_container_closed")
          .upsert(upRows, { onConflict: "momo_container_no" })
          .select("id, momo_container_no, raw");
        if (upErr) {
          failedCount += upRows.length;
          errors.push({
            scope:   "container_closed_upsert",
            error:   "MOMO_DB_UPSERT_FAILED",
            message: upErr.message,
          });
        } else {
          upsertedCount += upRows.length;

          // ── 0119 — Explode raw.track_details[] into momo_container_closed_tracks.
          // For each persisted container, extract per-tracking rows from its raw
          // and upsert by (container_closed_id, momo_tracking_no). This is the
          // JOIN BRIDGE that lets us link tracking → real container later.
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
          const nowIso = new Date().toISOString();
          for (const row of persisted ?? []) {
            const parentId = (row as { id?: string }).id;
            if (!parentId) continue;
            const extracted = extractContainerClosedTracks((row as { raw?: unknown }).raw);
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
          }
          if (trackRows.length > 0) {
            const { data: persistedTracks, error: trkErr } = await admin
              .from("momo_container_closed_tracks")
              .upsert(trackRows, {
                onConflict: "container_closed_id,momo_tracking_no",
              })
              .select("id, momo_tracking_no, momo_container_ref, container_batch_no, real_container_no");
            if (trkErr) {
              errors.push({
                scope:   "container_closed_tracks_upsert",
                error:   "MOMO_DB_UPSERT_FAILED",
                message: trkErr.message,
              });
            } else {
              upsertedCount += trackRows.length;

              // Migration 0121 — link rows for each persisted container_closed_track.
              for (const row of persistedTracks ?? []) {
                const r = row as {
                  id?:                  string;
                  momo_tracking_no?:    string | null;
                  momo_container_ref?:  string | null;
                  container_batch_no?:  string | null;
                  real_container_no?:   string | null;
                };
                if (!r.id || !r.momo_tracking_no) continue;
                bufferLink({
                  trackingNo:     r.momo_tracking_no,
                  containerRef:   r.momo_container_ref ?? null,
                  batchNo:        r.container_batch_no ?? null,
                  realNo:         r.real_container_no ?? null,
                  sackNo:         null,
                  cgNo:           null,
                  sourceEndpoint: "container_closed",
                  sourceTable:    "momo_container_closed_tracks",
                  sourceRecordId: r.id,
                  matchedBy:      "container_closed.track_details.reTrack",
                });
              }
            }
          }

          // Migration 0120 — explode raw.container_details into momo_container_details.
          // One row per closed container with BL/vessel/ETD/ETA typed.
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
          for (const row of persisted ?? []) {
            const parentId = (row as { id?: string }).id;
            if (!parentId) continue;
            const cd = extractContainerDetails((row as { raw?: unknown }).raw);
            if (!cd) continue;
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
          if (detailRows.length > 0) {
            const { error: cdErr } = await admin
              .from("momo_container_details")
              .upsert(detailRows, { onConflict: "container_closed_id" });
            if (cdErr) {
              errors.push({
                scope:   "container_details_upsert",
                error:   "MOMO_DB_UPSERT_FAILED",
                message: cdErr.message,
              });
            } else {
              upsertedCount += detailRows.length;
            }
          }
        }
      }
    } else {
      errors.push({ scope: "container_closed", error: ccRes.error, message: ccRes.message });
    }
  }

  // ── 3. sack_info ──
  if (sackNo) {
    const siUrl = `/api/sack/get/info/${encodeURIComponent(sackNo)}`;
    const siRes = await getSackInfo(sackNo);
    if (siRes.ok) {
      const mapped = mapSackInfoSingle(siRes.data);
      const r = mapped[0];
      sackInfoCount = mapped.length;

      // Migration 0120 — buffer raw event for the sack item.
      // sack endpoint returns a single object — unwrap {data: {...}} if present.
      const siBag = siRes.data && typeof siRes.data === "object"
        ? (siRes.data as { data?: unknown }).data ?? siRes.data
        : siRes.data;
      bufferRawEvent("sack_info", siBag, siUrl);
      if (!r) {
        errors.push({
          scope:   "sack_info_parse",
          error:   "MOMO_PARSE_ERROR",
          message: "Sack response not parseable",
        });
      } else {

      const row = {
        momo_sack_no:      r.sackNo || sackNo, // fallback to requested key
        momo_tracking_no:  r.trackingNo,
        momo_container_no: r.containerNo,
        // ── 0118 mirror columns ──
        ship_by:           r.shipBy,
        weight_kg:         r.weightKg,
        cbm:               r.cbm,
        total_parcel:      r.totalParcel,
        // ── status ──
        phase:             r.phase,
        shipment_status:   r.shipmentStatus,
        billing_status:    r.billingStatus,
        job_status:        r.jobStatus,
        issue_status:      r.issueStatus,
        admin_status_text: r.adminStatusText,
        current_location:  r.currentLocation,
        etd:               r.etd,
        eta:               r.eta,
        momo_updated_at:   r.momoUpdatedAt,
        raw:               r.raw as never,
        last_synced_at:    new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      };
      const { data: sackPersisted, error: upErr } = await admin
        .from("momo_sack_infos")
        .upsert(row, { onConflict: "momo_sack_no" })
        .select("id, momo_sack_no, raw");
      if (upErr) {
        failedCount += 1;
        errors.push({
          scope:   "sack_info_upsert",
          error:   "MOMO_DB_UPSERT_FAILED",
          message: upErr.message,
        });
      } else {
        upsertedCount += 1;

        // Migration 0120 — explode raw.tracks[] into momo_sack_tracks.
        const sackRow = (sackPersisted ?? [])[0] as
          | { id?: string; momo_sack_no?: string; raw?: unknown }
          | undefined;
        const parentSackId = sackRow?.id;
        const parentSackNo = sackRow?.momo_sack_no ?? row.momo_sack_no;
        if (parentSackId) {
          const extracted = extractSackTracks(sackRow?.raw ?? r.raw);
          if (extracted.length > 0) {
            const nowIso = new Date().toISOString();
            const sackTrackRows = extracted.map((t) => ({
              sack_info_id:     parentSackId,
              sack_no:          parentSackNo,
              momo_tracking_no: t.trackingNo,
              weight_kg:        t.weightKg,
              cbm:              t.cbm,
              width:            t.width,
              height:           t.height,
              length:           t.length,
              quantity:         t.quantity,
              raw:              t.raw as never,
              updated_at:       nowIso,
            }));
            const { data: persistedSackTracks, error: stErr } = await admin
              .from("momo_sack_tracks")
              .upsert(sackTrackRows, {
                onConflict: "sack_info_id,momo_tracking_no",
              })
              .select("id, sack_no, momo_tracking_no");
            if (stErr) {
              errors.push({
                scope:   "sack_tracks_upsert",
                error:   "MOMO_DB_UPSERT_FAILED",
                message: stErr.message,
              });
            } else {
              upsertedCount += sackTrackRows.length;

              // Migration 0121 — link rows for each persisted sack_track.
              for (const row of persistedSackTracks ?? []) {
                const r = row as {
                  id?:               string;
                  sack_no?:          string | null;
                  momo_tracking_no?: string | null;
                };
                if (!r.id || !r.momo_tracking_no) continue;
                bufferLink({
                  trackingNo:     r.momo_tracking_no,
                  containerRef:   null,
                  batchNo:        null,
                  realNo:         null,
                  sackNo:         r.sack_no ?? null,
                  cgNo:           null,
                  sourceEndpoint: "sack_info",
                  sourceTable:    "momo_sack_tracks",
                  sourceRecordId: r.id,
                  matchedBy:      "sack_info.tracks",
                });
              }
            }
          }
        }
      }
      } // close `} else { ... ` opened earlier (if (!r) {...} else {...})
    } else {
      errors.push({ scope: "sack_info", error: siRes.error, message: siRes.message });
    }
  }

  // ── Flush buffered raw events (Migration 0120) ──
  // Insert-only audit log. Best-effort: failure here doesn't fail the
  // whole sync (raw is also still in the main tables' `raw jsonb` cols).
  if (rawEventBuffer.length > 0) {
    const { error: rawErr } = await admin
      .from("momo_raw_events")
      .insert(rawEventBuffer);
    if (rawErr) {
      errors.push({
        scope:   "raw_events_insert",
        error:   "MOMO_DB_UPSERT_FAILED",
        message: rawErr.message,
      });
    }
  }

  // ── Flush links + refresh snapshots (Migration 0121) ──
  let linksUpsertedCount = 0;
  let snapshotsRefreshedCount = 0;
  let snapshotsChangedCount = 0;
  if (linkBuffer.length > 0) {
    const { error: linkErr } = await admin
      .from("momo_tracking_links")
      .upsert(linkBuffer, {
        onConflict: "momo_tracking_no,source_table,source_record_id",
      });
    if (linkErr) {
      errors.push({
        scope:   "tracking_links_upsert",
        error:   "MOMO_DB_UPSERT_FAILED",
        message: linkErr.message,
      });
    } else {
      linksUpsertedCount = linkBuffer.length;
    }
  }
  // Refresh snapshot per unique tracking. Best-effort: per-tracking
  // errors push but don't abort.
  for (const trackingNo of touchedTrackings) {
    try {
      const { changed } = await refreshSnapshotForTracking(admin, trackingNo, syncRunId);
      snapshotsRefreshedCount += 1;
      if (changed) snapshotsChangedCount += 1;
    } catch (e) {
      errors.push({
        scope:   "snapshot_refresh",
        error:   "MOMO_DB_UPSERT_FAILED",
        message: `tracking ${trackingNo}: ${e instanceof Error ? e.message : "unknown error"}`,
      });
    }
  }

  // ── 4. log this sync ──
  const totalScanned = importTrackCount + containerClosedCount + sackInfoCount;
  const mappedCount  = importMapped.filter((r) => r.shipmentStatus != null).length;
  const unmappedCount = importTrackCount - mappedCount;

  const status =
    errors.length === 0 ? "success" :
    upsertedCount > 0   ? "partial" :
                          "failed";

  await admin.from("momo_sync_logs").insert({
    sync_type:              "sync",
    date_from:              start,
    date_to:                end,
    sack_no:                sackNo || null,
    status,
    import_track_count:     importTrackCount,
    container_closed_count: containerClosedCount,
    sack_info_count:        sackInfoCount,
    mapped_count:           mappedCount,
    unmapped_count:         unmappedCount,
    upserted_count:         upsertedCount,
    failed_count:           failedCount,
    errors:                 errors as never,
    created_by:             me?.id ?? null,
  });

  // If MOMO returned no data AT ALL (every call errored) → 502
  if (errors.length > 0 && totalScanned === 0) {
    const primary = errors[0];
    return NextResponse.json(
      {
        ok: false,
        dryRun: false,
        error: primary.error,
        message: primary.message,
        errors,
      },
      { status: errorStatus(primary.error as never) },
    );
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    start:  start ?? null,
    end:    end ?? null,
    sackNo: sackNo || null,
    syncRunId,
    importTrackCount,
    containerClosedCount,
    sackInfoCount,
    mappedCount,
    unmappedCount,
    upsertedCount,
    failedCount,
    // Migration 0121 — Phase C counters:
    linksUpsertedCount,
    snapshotsRefreshedCount,
    snapshotsChangedCount,
    rawEventsBufferedCount: rawEventBuffer.length,
    touchedTrackings:       Array.from(touchedTrackings),
    errors,
  });
}

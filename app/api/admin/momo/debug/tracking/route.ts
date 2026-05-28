/**
 * GET /api/admin/momo/debug/tracking?n=<tracking_no>
 *
 * Phase D debug helper — returns ALL data we have for one tracking,
 * across all momo_* tables. Used by the "🔍 Debug · Tracking Lookup"
 * widget on /admin/api-forwarder-momo/sync.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     trackingNo,
 *     snapshot,            // current derived status (or null)
 *     history,             // array — append-only audit
 *     links,               // array — every (source, source_record) edge
 *     importTrack,         // object or null
 *     containerClosedTracks, // array — every container_closed row that owns this tracking
 *     containerClosedParents, // array — distinct parent containers
 *     containerDetails,    // array — container_details for each parent
 *     sackTracks,          // array — every sack that contains this tracking
 *     sackInfos,           // array — parent sacks
 *     rawEvents,           // array — every raw event for this tracking
 *   }
 *
 * Service-role read-only — guarded by guardAdmin.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guardAdmin } from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const url = new URL(request.url);
  const trackingNo = (url.searchParams.get("n") ?? "").trim();
  if (!trackingNo) {
    return NextResponse.json(
      { ok: false, error: "MOMO_VALIDATION_ERROR", message: "missing tracking number ?n=..." },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trackingNo)) {
    return NextResponse.json(
      { ok: false, error: "MOMO_VALIDATION_ERROR", message: "tracking format invalid (alnum + _-. only)" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // ── Snapshot ──
  const snapshotQ = await admin
    .from("momo_tracking_status_snapshots")
    .select("*")
    .eq("momo_tracking_no", trackingNo)
    .maybeSingle();

  // ── History (newest first) ──
  const historyQ = await admin
    .from("momo_tracking_status_history")
    .select("*")
    .eq("momo_tracking_no", trackingNo)
    .order("changed_at", { ascending: false })
    .limit(50);

  // ── Links ──
  const linksQ = await admin
    .from("momo_tracking_links")
    .select("*")
    .eq("momo_tracking_no", trackingNo)
    .order("updated_at", { ascending: false });

  // ── Import track ──
  const importTrackQ = await admin
    .from("momo_import_tracks")
    .select("*")
    .eq("momo_tracking_no", trackingNo)
    .maybeSingle();

  // ── Import track status_dates ──
  const statusDatesQ = await admin
    .from("momo_import_track_status_dates")
    .select("status_key, status_value_raw, status_at, updated_at")
    .eq("momo_tracking_no", trackingNo);

  // ── Container closed tracks ──
  const ccTracksQ = await admin
    .from("momo_container_closed_tracks")
    .select("*")
    .eq("momo_tracking_no", trackingNo);

  // ── Container closed parents (distinct) ──
  const parentIds = Array.from(
    new Set(
      (ccTracksQ.data ?? [])
        .map((r) => (r as { container_closed_id?: string }).container_closed_id)
        .filter((v): v is string => !!v),
    ),
  );
  const containerClosedParentsQ = parentIds.length > 0
    ? await admin
        .from("momo_container_closed")
        .select("*")
        .in("id", parentIds)
    : { data: [] as never[], error: null };

  const containerDetailsQ = parentIds.length > 0
    ? await admin
        .from("momo_container_details")
        .select("*")
        .in("container_closed_id", parentIds)
    : { data: [] as never[], error: null };

  // ── Sack tracks + parents ──
  const sackTracksQ = await admin
    .from("momo_sack_tracks")
    .select("*")
    .eq("momo_tracking_no", trackingNo);

  const sackIds = Array.from(
    new Set(
      (sackTracksQ.data ?? [])
        .map((r) => (r as { sack_info_id?: string }).sack_info_id)
        .filter((v): v is string => !!v),
    ),
  );
  const sackInfosQ = sackIds.length > 0
    ? await admin
        .from("momo_sack_infos")
        .select("*")
        .in("id", sackIds)
    : { data: [] as never[], error: null };

  // ── Raw events (latest 50) ──
  const rawEventsQ = await admin
    .from("momo_raw_events")
    .select("*")
    .eq("momo_tracking_no", trackingNo)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    ok: true,
    trackingNo,
    snapshot:                snapshotQ.data ?? null,
    history:                 historyQ.data ?? [],
    links:                   linksQ.data ?? [],
    importTrack:             importTrackQ.data ?? null,
    statusDates:             statusDatesQ.data ?? [],
    containerClosedTracks:   ccTracksQ.data ?? [],
    containerClosedParents:  containerClosedParentsQ.data ?? [],
    containerDetails:        containerDetailsQ.data ?? [],
    sackTracks:              sackTracksQ.data ?? [],
    sackInfos:               sackInfosQ.data ?? [],
    rawEvents:               rawEventsQ.data ?? [],
  });
}

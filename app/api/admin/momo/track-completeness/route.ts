/**
 * POST /admin/api-forwarder-momo/sync/track-completeness
 *
 * 2026-06-29 (ภูม) — the MOMO sync page verification helper. Given a list of
 * MOMO tracking numbers (the `reTrack`s from a Container-Closed `track_details`),
 * return which ones ALREADY exist in our `tb_forwarder` (= committed into the
 * import flow) vs which are MISSING.
 *
 * WHY: MOMO's `import/track` API only returns parcels in the FIRST status; a
 * parcel that advances (ถึงโกดังจีน → กำลังส่งมาไทย) drops out of that feed, so if
 * our sync didn't catch it in time it never reaches `tb_forwarder` — even though
 * the closed-container manifest still lists it (with weight, no member code).
 * This endpoint lets the sync page show, per container, "MOMO N พัสดุ · เข้าระบบ M
 * · ขาด K" so the เดฟ-on-duty (ภูม) sees exactly what's missing + chases it on the
 * MOMO web (where the member code IS visible).
 *
 * Read-only — never writes. Admin-gated like the rest of the MOMO surfaces.
 * Matches by the BASE tracking (strip the "-i/n" split suffix) because
 * tb_forwarder.ftrackingchn holds the base (e.g. "KY982669997", not
 * "KY982669997-1/2").
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type TrackCompletenessHit = {
  inFwd: boolean;
  fid: number;
  fweight: number;
  fstatus: string | null;
};

/** Escape PostgREST `like` wildcards in a literal base so it can't widen the match. */
function escapeLike(base: string): string {
  return base.replace(/[%_,\\]/g, "\\$&");
}

export async function POST(request: Request) {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const raw = (body as { trackings?: unknown })?.trackings;
  const trackings = Array.isArray(raw)
    ? raw.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    : [];
  if (trackings.length === 0) return NextResponse.json({ map: {} });

  // Dedup to base trackings; cap to keep the query list sane.
  const bases = [...new Set(trackings.map(baseTrackingOf))].slice(0, 3000);
  const baseSet = new Set(bases);

  const admin = createAdminClient();

  // Key the result by the BASE tracking — the same key the caller filters on.
  // A base appears here iff it's "already in the system" (= a tb_forwarder row
  // exists for it OR a momo_import_tracks row for it is committed). First write
  // wins (a base shouldn't map to >1 forwarder; if it does the verdict is what
  // matters, not which row).
  const map: Record<string, TrackCompletenessHit> = {};

  // ── tb_forwarder: match the BASE on BOTH sides ──────────────────────────
  // tb_forwarder.ftrackingchn stores the SUFFIXED form for split trackings
  // (e.g. "302098539663-1/7"), so a bare `IN(base)` never matches → committed/
  // shipped parcels falsely read as "missing". Match each base as either the
  // exact bare base OR `base-%` (the split children), then re-verify in JS via
  // baseTrackingOf so a prefix can't false-positive ("123" vs "1234-1/2").
  const orClauses: string[] = [];
  for (const base of bases) {
    const esc = escapeLike(base);
    orClauses.push(`ftrackingchn.eq.${base}`);
    orClauses.push(`ftrackingchn.like.${esc}-%`);
  }
  // PostgREST .or() takes one comma-joined clause string. Chunk to keep the URL
  // length bounded (each base → 2 clauses).
  const CHUNK = 200; // ~400 clauses per request
  for (let i = 0; i < orClauses.length; i += CHUNK) {
    const slice = orClauses.slice(i, i + CHUNK).join(",");
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fweight, fstatus")
      .or(slice);
    if (error) {
      console.error("[track-completeness] tb_forwarder lookup failed", {
        code: error.code,
        message: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const r of (data ?? []) as Array<{
      id: number;
      ftrackingchn: string | null;
      fweight: number | null;
      fstatus: string | null;
    }>) {
      const rowBase = baseTrackingOf(r.ftrackingchn ?? "");
      if (!rowBase || !baseSet.has(rowBase)) continue; // prefix false-positive → drop
      if (map[rowBase]) continue;
      map[rowBase] = {
        inFwd: true,
        fid: r.id,
        fweight: Number(r.fweight ?? 0),
        fstatus: r.fstatus,
      };
    }
  }

  // ── momo_import_tracks: a COMMITTED row = already in the system ──────────
  // Defense in depth + the cleanest signal: any momo_import_tracks row with
  // committed_at set is, by definition, not missing — even if its tb_forwarder
  // row couldn't be matched above. momo_tracking_no may itself be suffixed, so
  // match by base on both sides (same eq/like posture) and re-verify in JS.
  const commitClauses: string[] = [];
  for (const base of bases) {
    const esc = escapeLike(base);
    commitClauses.push(`momo_tracking_no.eq.${base}`);
    commitClauses.push(`momo_tracking_no.like.${esc}-%`);
  }
  for (let i = 0; i < commitClauses.length; i += CHUNK) {
    const slice = commitClauses.slice(i, i + CHUNK).join(",");
    const { data, error } = await admin
      .from("momo_import_tracks")
      .select("momo_tracking_no, committed_at, committed_forwarder_id")
      .not("committed_at", "is", null)
      .or(slice);
    if (error) {
      console.error("[track-completeness] momo_import_tracks lookup failed", {
        code: error.code,
        message: error.message,
      });
      // Non-fatal: the tb_forwarder pass above already covers the common case.
      // Skip this defensive layer rather than failing the whole verdict.
      break;
    }
    for (const r of (data ?? []) as Array<{
      momo_tracking_no: string | null;
      committed_at: string | null;
      committed_forwarder_id: number | null;
    }>) {
      const rowBase = baseTrackingOf(r.momo_tracking_no ?? "");
      if (!rowBase || !baseSet.has(rowBase)) continue; // prefix false-positive → drop
      if (map[rowBase]) continue;
      map[rowBase] = {
        inFwd: true,
        fid: r.committed_forwarder_id ?? 0,
        fweight: 0,
        fstatus: null,
      };
    }
  }

  return NextResponse.json({ map });
}

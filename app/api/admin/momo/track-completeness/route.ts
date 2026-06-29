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
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Strip a MOMO "-i/n" (or "-i") split suffix → the base tracking. */
function baseTracking(re: string): string {
  return re.trim().replace(/-\d+(\/\d+)?$/, "");
}

export type TrackCompletenessHit = {
  inFwd: boolean;
  fid: number;
  fweight: number;
  fstatus: string | null;
};

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

  // Dedup to base trackings; cap to keep the IN() list sane.
  const bases = [...new Set(trackings.map(baseTracking))].slice(0, 3000);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, fweight, fstatus")
    .in("ftrackingchn", bases);
  if (error) {
    console.error("[track-completeness] tb_forwarder lookup failed", {
      code: error.code,
      message: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Key the result by the base tracking. First-row-wins (a base shouldn't
  // map to more than one forwarder; if it does the count is what matters).
  const map: Record<string, TrackCompletenessHit> = {};
  for (const r of (data ?? []) as Array<{
    id: number;
    ftrackingchn: string | null;
    fweight: number | null;
    fstatus: string | null;
  }>) {
    const key = (r.ftrackingchn ?? "").trim();
    if (key && !map[key]) {
      map[key] = {
        inFwd: true,
        fid: r.id,
        fweight: Number(r.fweight ?? 0),
        fstatus: r.fstatus,
      };
    }
  }

  return NextResponse.json({ map });
}

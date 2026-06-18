/**
 * GET /api/admin/forwarders/check-tracking?t=<tracking_no>
 *
 * 2026-06-04 (ภูม flag) — smart tracking check used by
 * `/admin/forwarders/new` when admin types the tracking number.
 *
 * Replaces the dumb "MO prefix → 8, CC prefix → 7" heuristic with a
 * real DB lookup. The endpoint returns 3 signals at once:
 *
 *   1. `duplicate`     — does this tracking already exist in tb_forwarder?
 *                        (legacy `scriptfTrackingCHN.php` behavior — staff
 *                         should see a red warning before saving so they
 *                         don't open a second order for the same parcel)
 *   2. `warehouse`     — best-guess warehouse code ('1'..'8') OR null:
 *                          a) lookup in `momo_import_tracks` → warehouse=8
 *                          b) lookup in cargothai container_details — TBD
 *                          c) fallback: MO* prefix → 8 · CC* prefix → 7
 *                          d) otherwise: null (admin fixes in /edit later)
 *   3. `source`        — where the warehouse hint came from
 *                          ("momo-sync" · "cc-prefix" · "mo-prefix" · null)
 *
 * Why a server route instead of client-side regex:
 *   - MOMO admin/partner trackings DON'T all start with "MO" — they look
 *     like "9822290862949", "SF1562783666170", "1779529270" etc. The only
 *     reliable way to know a tracking belongs to MOMO is to check whether
 *     MOMO's API has already reported it (= row in momo_import_tracks).
 *   - Duplicate-check needs DB.
 *
 * Service-role read-only · admin-gated.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles, isGodRole } from "@/lib/auth/require-admin";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set([
  "super", "ops", "warehouse", "accounting", "sales",
]);

type CheckResult = {
  ok: true;
  tracking: string;
  duplicate: { id: number; userid: string | null } | null;
  warehouse: string | null;          // '1'..'8' OR null
  source: "momo-sync" | "mo-prefix" | "cc-prefix" | null;
  note?: string;                     // human-readable hint
};

export async function GET(req: Request) {
  const roles = await getAdminRoles();
  if (!roles || (!isGodRole(roles) && !roles.some((r) => ALLOWED_ROLES.has(r)))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const raw = (url.searchParams.get("t") ?? "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "missing-tracking" }, { status: 400 });
  }
  if (raw.length > 100) {
    return NextResponse.json({ ok: false, error: "tracking-too-long" }, { status: 400 });
  }

  const tracking = raw;
  const admin = createAdminClient();

  // ─── 1. duplicate check (legacy scriptfTrackingCHN.php behavior) ──
  // Look up an existing tb_forwarder row with the same ftrackingchn.
  // Note: the legacy script ONLY checks ftrackingchn (not ftrackingchn2 or
  // ftrackingth) so we match that scope.
  const { data: dupRow, error: dupErr } = await admin
    .from("tb_forwarder")
    .select("id, userid")
    .eq("ftrackingchn", tracking)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dupErr) {
    // §0c: surface to caller — never swallow
    console.error("[check-tracking] tb_forwarder dup lookup failed:", dupErr);
    return NextResponse.json({ ok: false, error: "db-error" }, { status: 500 });
  }

  // ─── 2. MOMO sync lookup ──────────────────────────────────────────
  // If this tracking has ever been reported by MOMO's API, it belongs to
  // MOMO's warehouse (= 8). This is the AUTHORITATIVE source — beats prefix
  // heuristics every time.
  let warehouse: string | null = null;
  let source: CheckResult["source"] = null;

  const { data: momoRow, error: momoErr } = await admin
    .from("momo_import_tracks")
    .select("momo_tracking_no")
    .eq("momo_tracking_no", tracking)
    .limit(1)
    .maybeSingle();
  if (momoErr) {
    // not fatal — fall through to prefix heuristic
    console.warn("[check-tracking] momo_import_tracks lookup failed:", momoErr);
  } else if (momoRow) {
    warehouse = "8";
    source = "momo-sync";
  }

  // ─── 3. fallback: prefix heuristic (MO → 8 / CC → 7) ──────────────
  if (warehouse === null) {
    const t = tracking.toUpperCase();
    if (t.startsWith("MO")) {
      warehouse = "8";
      source = "mo-prefix";
    } else if (t.startsWith("CC")) {
      warehouse = "7";
      source = "cc-prefix";
    }
  }

  const result: CheckResult = {
    ok: true,
    tracking,
    duplicate: dupRow
      ? { id: Number(dupRow.id), userid: dupRow.userid ?? null }
      : null,
    warehouse,
    source,
  };

  // human-readable hint (used by the form chip)
  if (source === "momo-sync") {
    result.note = "พบในระบบ MOMO sync · โกดัง MOMO (8)";
  } else if (source === "mo-prefix") {
    result.note = "เลขขึ้นต้นด้วย MO · เดาว่าเป็น MOMO (8)";
  } else if (source === "cc-prefix") {
    result.note = "เลขขึ้นต้นด้วย CC · เดาว่าเป็น Cargo Center (7)";
  }

  return NextResponse.json(result);
}

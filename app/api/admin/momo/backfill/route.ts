/**
 * POST /api/admin/momo/backfill
 *
 * Triggers the Phase A backfill: fills momo_container_ref + container_batch_no
 * + real_container_no on existing rows, and explodes container_closed.raw.track_details[]
 * into the new momo_container_closed_tracks table.
 *
 * Idempotent — safe to re-run. Service-role only via guardAdmin.
 *
 * Brief 2026-05-28 §"Backfill Script".
 */

import { NextResponse } from "next/server";
import { runMomoBackfill } from "@/actions/admin/momo-backfill";
import { guardAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const report = await runMomoBackfill();
  return NextResponse.json(report, { status: report.ok ? 200 : 207 /* multi-status */ });
}

/**
 * GET /api/admin/momo/import-track?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Admin-only MOMO API proxy. Returns the RAW MOMO Import Track payload
 * for the given date range. No DB write — pure proxy.
 *
 * Brief 2026-05-28 §4.1 (ปอน). Guard: super/ops/warehouse/accounting.
 */

import { NextResponse } from "next/server";
import { getImportTrack } from "@/lib/integrations/momo-isolated";
import { guardAdmin, validateDateRange, errorStatus } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const range = validateDateRange(
    searchParams.get("start"),
    searchParams.get("end"),
  );
  if (!range.ok) return range.response;

  const res = await getImportTrack(range.start, range.end);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, message: res.message },
      { status: errorStatus(res.error) },
    );
  }

  return NextResponse.json({
    ok: true,
    start: range.start,
    end: range.end,
    data: res.data,
  });
}

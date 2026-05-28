/**
 * GET /api/admin/momo/container-closed?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Admin-only MOMO API proxy — returns RAW MOMO Container Closed payload.
 * Brief 2026-05-28 §4.2 (ปอน).
 */

import { NextResponse } from "next/server";
import { getContainerClosed } from "@/lib/integrations/momo-isolated";
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

  const res = await getContainerClosed(range.start, range.end);
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

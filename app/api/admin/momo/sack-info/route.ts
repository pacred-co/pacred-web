/**
 * GET /api/admin/momo/sack-info?sackNo=CBX251111-EK04
 *
 * Admin-only MOMO API proxy — returns RAW MOMO Sack Info payload.
 * Brief 2026-05-28 §4.3 (ปอน).
 */

import { NextResponse } from "next/server";
import { getSackInfo } from "@/lib/integrations/momo-isolated";
import { guardAdmin, errorStatus } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const sackNo = searchParams.get("sackNo");
  if (!sackNo || !/^[A-Za-z0-9._-]+$/.test(sackNo)) {
    return NextResponse.json(
      {
        ok: false,
        error: "MOMO_VALIDATION_ERROR",
        message: "ต้องส่ง ?sackNo=... (alnum + _-. only)",
      },
      { status: 400 },
    );
  }

  const res = await getSackInfo(sackNo);
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, message: res.message },
      { status: errorStatus(res.error) },
    );
  }

  return NextResponse.json({
    ok: true,
    sackNo,
    data: res.data,
  });
}

/**
 * POST /api/admin/momo/sync-preview
 *
 * Body: { start: "YYYY-MM-DD", end: "YYYY-MM-DD", sackNo?: string }
 *
 * Preview-only: fetches MOMO + normalizes + returns shape that would
 * be written. **Does NOT write to DB.** Use this before clicking the
 * real Sync button to verify mapping looks right.
 *
 * Brief 2026-05-28 §14 (ปอน). Guard: super/ops/warehouse/accounting.
 */

import { NextResponse } from "next/server";
import {
  getImportTrack,
  getContainerClosed,
  getSackInfo,
  mapImportTrackArray,
  mapContainerClosedArray,
  mapSackInfoSingle,
} from "@/lib/integrations/momo-isolated";
import { guardAdmin, errorStatus } from "../_shared";

export const dynamic = "force-dynamic";

type Body = {
  start?: unknown;
  end?:   unknown;
  sackNo?: unknown;
};

export async function POST(request: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const start = typeof body.start === "string" ? body.start : null;
  const end   = typeof body.end   === "string" ? body.end   : null;
  const sackNo = typeof body.sackNo === "string" ? body.sackNo.trim() : "";

  const wantDateRange = start && end;
  if (!wantDateRange && !sackNo) {
    return NextResponse.json(
      {
        ok: false,
        error: "MOMO_VALIDATION_ERROR",
        message: "ต้องส่ง start+end หรือ sackNo",
      },
      { status: 400 },
    );
  }

  const errors: Array<{ scope: string; error: string; message: string }> = [];
  let importTrackCount    = 0;
  let containerClosedCount = 0;
  let sackInfoCount       = 0;
  let importTrackPreview:    ReturnType<typeof mapImportTrackArray> = [];
  let containerClosedPreview: ReturnType<typeof mapContainerClosedArray> = [];
  let sackInfoPreview:       ReturnType<typeof mapSackInfoSingle> = [];

  if (wantDateRange) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(start as string) || !re.test(end as string)) {
      return NextResponse.json(
        {
          ok: false,
          error: "MOMO_VALIDATION_ERROR",
          message: "start/end ต้องเป็น YYYY-MM-DD",
        },
        { status: 400 },
      );
    }

    const itRes = await getImportTrack(start as string, end as string);
    if (itRes.ok) {
      importTrackPreview = mapImportTrackArray(itRes.data);
      importTrackCount   = importTrackPreview.length;
    } else {
      errors.push({ scope: "import_track", error: itRes.error, message: itRes.message });
    }

    const ccRes = await getContainerClosed(start as string, end as string);
    if (ccRes.ok) {
      containerClosedPreview = mapContainerClosedArray(ccRes.data);
      containerClosedCount   = containerClosedPreview.length;
    } else {
      errors.push({ scope: "container_closed", error: ccRes.error, message: ccRes.message });
    }
  }

  if (sackNo) {
    if (!/^[A-Za-z0-9._-]+$/.test(sackNo)) {
      return NextResponse.json(
        {
          ok: false,
          error: "MOMO_VALIDATION_ERROR",
          message: "sackNo รูปแบบไม่ถูกต้อง (alnum + _-. only)",
        },
        { status: 400 },
      );
    }
    const siRes = await getSackInfo(sackNo);
    if (siRes.ok) {
      sackInfoPreview = mapSackInfoSingle(siRes.data);
      sackInfoCount = sackInfoPreview.length;
    } else {
      errors.push({ scope: "sack_info", error: siRes.error, message: siRes.message });
    }
  }

  // mapped = at least one identifier or status came through
  const allRecords = [...importTrackPreview, ...containerClosedPreview, ...sackInfoPreview];
  const mappedCount = allRecords.filter(
    (r) => r.shipmentStatus != null || r.trackingNo != null || r.containerNo != null || r.sackNo != null,
  ).length;
  const unmappedCount = allRecords.length - mappedCount;

  // If every MOMO call failed → return non-OK so UI can show banner.
  if (errors.length > 0 && importTrackCount === 0 && containerClosedCount === 0 && sackInfoCount === 0) {
    const primary = errors[0];
    return NextResponse.json(
      {
        ok: false,
        dryRun: true,
        error: primary.error,
        message: primary.message,
        errors,
      },
      { status: errorStatus(primary.error as never) },
    );
  }

  return NextResponse.json({
    ok: true,
    dryRun: true,
    start: start ?? null,
    end:   end ?? null,
    sackNo: sackNo || null,
    importTrackCount,
    containerClosedCount,
    sackInfoCount,
    mappedCount,
    unmappedCount,
    upsertedCount: 0,
    failedCount:   errors.length,
    errors,
    preview: {
      importTrack:     importTrackPreview,
      containerClosed: containerClosedPreview,
      sackInfo:        sackInfoPreview,
    },
  });
}

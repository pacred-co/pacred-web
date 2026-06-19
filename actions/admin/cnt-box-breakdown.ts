"use server";

/**
 * Lazy box-dimension breakdown for an expanded container row in
 * /admin/report-cnt. Read-only · same RBAC gate as the report-cnt page
 * (super / ops / accounting / warehouse). Fetched on row-expand — NOT eagerly
 * for all ~33 visible containers (most are never opened · perf §0f).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getContainerBoxBreakdown,
  type BoxDimGroup,
} from "@/lib/warehouse/container-box-breakdown";
import type { AdminActionResult } from "./common";

export async function fetchContainerBoxBreakdown(
  fcabinetnumber: unknown,
): Promise<AdminActionResult<BoxDimGroup[]>> {
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);

  if (typeof fcabinetnumber !== "string" || fcabinetnumber.trim() === "") {
    return { ok: false, error: "ไม่พบหมายเลขตู้" };
  }

  const admin = createAdminClient();
  const groups = await getContainerBoxBreakdown(admin, fcabinetnumber.trim());
  return { ok: true, data: groups };
}

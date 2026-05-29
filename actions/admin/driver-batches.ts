"use server";

/**
 * actions/admin/driver-batches.ts — Driver batch admin actions
 * (legacy `tb_forwarder_driver` + `tb_forwarder_driver_item` tables).
 *
 * Created 2026-05-30 as part of the ภูม #3 fidelity port — the workflow
 * port of `pcs-admin/forwarder-driver.php` that Agent D's schema-swap
 * pass did not cover. See `docs/audit/driver-assignment-gap-2026-05-30.md`
 * for the full element-by-element gap table.
 *
 * Why a NEW action file (vs extending `actions/admin/forwarder-drivers.ts`):
 *   - `forwarder-drivers.ts` operates on the REBUILT `forwarder_driver`
 *     UUID table (1 row per forwarder · empty on prod).
 *   - This file operates on the LEGACY `tb_forwarder_driver` batch model
 *     (1 row = 1 driver run with N stops, each stop in tb_forwarder_driver_item).
 *   They coexist during the D1 transition.
 *
 * Legacy reference: `pcs-admin/forwarder-driver.php` lines 22-112
 *   - POST `add` → INSERT batch + items, then LINE notify driver + ops
 *
 * Notes on legacy data shapes (verified via 0081_pcs_legacy_schema.sql):
 *   - `tb_forwarder_driver.fdadminid`     = legacy admin/driver text id
 *     (string like "PCS123" — pre-migration · NOT a UUID)
 *   - `tb_forwarder_driver.fdadmincreator`= the ops user who created the batch
 *   - `tb_forwarder_driver.fdstatus`      = '1' กำลังดำเนินการ / '2' สำเร็จ / '3' ไม่สำเร็จ
 *   - `tb_forwarder_driver.endtime`       = deadline timestamp (used by the
 *     auto-expiry sweep at top of legacy page)
 *   - `tb_forwarder_driver_item.fdistatus`= '' ยังไม่ขึ้นรถ / '1' กำลังส่ง
 *                                             / '2' ส่งสำเร็จ / '3' ส่งไม่ได้
 *
 * Mapping admin user → fdadminid:
 *   Drivers in Pacred are identified by `admins.role='driver'` joined to
 *   `profiles.member_code` (PR-format). The legacy fdadminid column accepts
 *   the same text — we write `member_code` into it.
 *
 * AGENTS.md §0c: every Supabase query destructures `error`.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// CREATE batch
// ────────────────────────────────────────────────────────────

const createBatchSchema = z.object({
  // The list of tb_forwarder.id rows the ops staff ticked on /admin/drivers/new
  forwarderIds: z.array(z.number().int().positive()).min(1, "เลือกอย่างน้อย 1 รายการ").max(500),
  // Driver's member_code (PR-format) — required.
  driverMemberCode: z.string().trim().regex(/^PR\d{3,}$/i, "ระบุรหัสคนขับ (PR-format)"),
  // Deadline duration in hours — legacy preset: 17, 24, 30.
  endTimeHours: z.union([z.literal(17), z.literal(24), z.literal(30)]).default(17),
  // Number of distinct delivery stops — legacy `fdamount`. The UI knows
  // this from the GROUP BY count on the selection page; passed explicitly
  // so we don't re-derive it here.
  stopCount: z.number().int().positive(),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

/**
 * Create a new driver assignment batch (`tb_forwarder_driver` + N items).
 *
 * Legacy semantics (forwarder-driver.php lines 22-112):
 *   1. INSERT tb_forwarder_driver with fdname = "YYYY-MM-DD-HH-{driverId}"
 *   2. SELECT the inserted batch id
 *   3. Bulk-INSERT N rows into tb_forwarder_driver_item
 *   4. LINE notify driver + ops (we skip in this surgical pass — P1)
 */
export async function createDriverBatch(
  input: CreateBatchInput,
): Promise<AdminActionResult<{ batchId: number }>> {
  const parsed = createBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { forwarderIds, driverMemberCode, endTimeHours, stopCount } = parsed.data;

  return withAdmin<{ batchId: number }>(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Resolve the ops staff's own member_code for fdadmincreator (legacy
    // column is text). Falls back to profiles.id (UUID) if no member_code.
    const { data: creatorProfile, error: creatorErr } = await admin
      .from("profiles")
      .select("member_code")
      .eq("id", adminId)
      .maybeSingle<{ member_code: string | null }>();
    if (creatorErr) {
      console.error("createDriverBatch: creator profile read failed", creatorErr, { adminId });
      return { ok: false, error: creatorErr.message };
    }
    const fdAdminCreator = creatorProfile?.member_code ?? adminId;

    // Verify the driver exists + is active. We check the `admins` table
    // (role='driver') joined to profiles.member_code.
    const { data: driverCheck, error: driverErr } = await admin
      .from("admins")
      .select("profile_id, role, is_active, profile:profiles!profile_id(member_code, first_name, last_name)")
      .eq("role", "driver")
      .eq("is_active", true);
    if (driverErr) {
      console.error("createDriverBatch: driver lookup failed", driverErr);
      return { ok: false, error: driverErr.message };
    }
    type DriverRow = {
      profile_id: string;
      role: string;
      is_active: boolean;
      profile: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null;
    };
    const driverList = (driverCheck ?? []) as DriverRow[];
    const driverLower = driverMemberCode.toLowerCase();
    const driverFound = driverList.some((d) => {
      const prof = Array.isArray(d.profile) ? d.profile[0] : d.profile;
      return prof?.member_code?.toLowerCase() === driverLower;
    });
    if (!driverFound) {
      return { ok: false, error: `ไม่พบคนขับรหัส ${driverMemberCode}` };
    }

    // Verify forwarders are still eligible (fstatus='6' AND not already
    // in an open assignment). Prevents race conditions where two ops
    // create overlapping batches.
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, paydeposit")
      .in("id", forwarderIds);
    if (fwdErr) {
      console.error("createDriverBatch: forwarder verify failed", fwdErr);
      return { ok: false, error: fwdErr.message };
    }
    const ineligible = (fwdRows ?? []).filter((r) => {
      const row = r as { fstatus: string | null; paydeposit: string | null };
      return row.fstatus !== "6" || row.paydeposit === "1";
    });
    if (ineligible.length > 0) {
      return { ok: false, error: `${ineligible.length} รายการไม่อยู่สถานะเตรียมส่ง — ลองรีเฟรช` };
    }

    // Check none of these forwarders are already in an open batch.
    const { data: existingItems, error: itemErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .in("fid", forwarderIds)
      .or("fdistatus.eq.,fdistatus.eq.1,fdistatus.is.null");
    if (itemErr) {
      console.error("createDriverBatch: existing item check failed", itemErr);
      return { ok: false, error: itemErr.message };
    }
    if ((existingItems ?? []).length > 0) {
      const dup = (existingItems ?? []).length;
      return { ok: false, error: `${dup} รายการอยู่ในรอบจัดส่งอื่นแล้ว` };
    }

    // Build the batch row.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    // fdname format from legacy: "YYYY-MM-DD-HH-{driverId}"
    const fdName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${driverMemberCode}`;
    const fdDate = now.toISOString().replace("T", " ").substring(0, 19);
    const endTime = new Date(now.getTime() + endTimeHours * 3_600_000)
      .toISOString().replace("T", " ").substring(0, 19);

    const { data: batchInsert, error: batchErr } = await admin
      .from("tb_forwarder_driver")
      .insert({
        fddate:          fdDate,
        fdname:          fdName,
        fdadminid:       driverMemberCode,
        fdadmincreator:  fdAdminCreator,
        fdstatus:        "1",
        fdamount:        stopCount,
        endtime:         endTime,
      })
      .select("id")
      .single<{ id: number }>();
    if (batchErr || !batchInsert) {
      console.error("createDriverBatch: batch insert failed", batchErr);
      return { ok: false, error: batchErr?.message ?? "ไม่สามารถสร้างรอบจัดส่ง" };
    }
    const batchId = batchInsert.id;

    // Bulk insert items.
    const itemRows = forwarderIds.map((fid) => ({
      fdid:           batchId,
      fid,
      fdistatus:      "",
      fdipictureon:   "",
      fdipictureoff:  "",
    }));
    const { error: itemInsertErr } = await admin
      .from("tb_forwarder_driver_item")
      .insert(itemRows);
    if (itemInsertErr) {
      console.error("createDriverBatch: item insert failed", itemInsertErr, { batchId });
      // Best-effort cleanup of the orphan batch.
      await admin.from("tb_forwarder_driver").delete().eq("id", batchId);
      return { ok: false, error: itemInsertErr.message };
    }

    await logAdminAction(
      adminId,
      "tb_forwarder_driver.create",
      "tb_forwarder_driver",
      String(batchId),
      {
        driver:         driverMemberCode,
        creator:        fdAdminCreator,
        item_count:     forwarderIds.length,
        stop_count:     stopCount,
        end_time_hours: endTimeHours,
      },
    );

    revalidatePath("/admin/drivers");
    revalidatePath("/admin/drivers/new");
    revalidatePath("/admin/drivers/work");
    return { ok: true, data: { batchId } };
  });
}

// ────────────────────────────────────────────────────────────
// DELETE batch (operator cancels a whole run)
// ────────────────────────────────────────────────────────────

const deleteBatchSchema = z.object({
  batchId: z.number().int().positive(),
});
export type DeleteBatchInput = z.infer<typeof deleteBatchSchema>;

/**
 * Delete a whole batch (cascade to items). Mirrors legacy
 * `include/pages/forwarder-driver/deleteFD.php`.
 *
 * Allowed for ops/super only. Items already with fdistatus='2' (delivered)
 * are blocked from deletion to preserve the delivery audit.
 */
export async function deleteDriverBatch(
  input: DeleteBatchInput,
): Promise<AdminActionResult> {
  const parsed = deleteBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { batchId } = parsed.data;

  return withAdmin(["ops", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: deliveredItems, error: chkErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("id", { count: "exact" })
      .eq("fdid", batchId)
      .eq("fdistatus", "2");
    if (chkErr) {
      console.error("deleteDriverBatch: delivered check failed", chkErr, { batchId });
      return { ok: false, error: chkErr.message };
    }
    if ((deliveredItems ?? []).length > 0) {
      return { ok: false, error: "รอบนี้มีรายการส่งสำเร็จแล้ว — ยกเลิกไม่ได้" };
    }

    const { error: delItemsErr } = await admin
      .from("tb_forwarder_driver_item")
      .delete()
      .eq("fdid", batchId);
    if (delItemsErr) {
      console.error("deleteDriverBatch: item delete failed", delItemsErr, { batchId });
      return { ok: false, error: delItemsErr.message };
    }

    const { error: delBatchErr } = await admin
      .from("tb_forwarder_driver")
      .delete()
      .eq("id", batchId);
    if (delBatchErr) {
      console.error("deleteDriverBatch: batch delete failed", delBatchErr, { batchId });
      return { ok: false, error: delBatchErr.message };
    }

    await logAdminAction(
      adminId,
      "tb_forwarder_driver.delete",
      "tb_forwarder_driver",
      String(batchId),
    );

    revalidatePath("/admin/drivers");
    return { ok: true };
  });
}

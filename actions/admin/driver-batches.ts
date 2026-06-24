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
import { sendNotification } from "@/lib/notifications";
import { notifyStaffGroup } from "@/lib/notifications/staff-group";
import { maybeAutoCompleteDriverBatch } from "@/lib/admin/driver-batch-complete";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// CREATE batch
// ────────────────────────────────────────────────────────────

const createBatchSchema = z.object({
  // The list of tb_forwarder.id rows the ops staff ticked on /admin/drivers/new
  forwarderIds: z.array(z.number().int().positive()).min(1, "เลือกอย่างน้อย 1 รายการ").max(500),
  // Driver's member_code — required. Accept PR (customer pool) OR AD (admin pool):
  // Pacred drivers are admins (role='driver') and may carry an AD-format code
  // (e.g. AD020 admin Ben) — the legacy PR-only regex blocked every assignment.
  driverMemberCode: z.string().trim().regex(/^(PR|AD)\d{3,}$/i, "ระบุรหัสคนขับ (PR หรือ AD)"),
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

  // warehouse included — warehouse staff create the delivery run on-site
  // (ภูม 2026-06-17 · owner confirmed · writes only tb_forwarder_driver* — no money).
  return withAdmin<{ batchId: number }>(["ops", "super", "warehouse"], async ({ adminId }) => {
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
    const driverList = (driverCheck ?? []) as unknown as DriverRow[];
    const driverLower = driverMemberCode.toLowerCase();
    // Capture the matched driver's profile_id + display name so we can LINE-push
    // them after the batch is created (legacy `getTokenLineDriver` equivalent).
    let driverProfileId: string | null = null;
    let driverDisplayName = driverMemberCode;
    const driverFound = driverList.some((d) => {
      const prof = Array.isArray(d.profile) ? d.profile[0] : d.profile;
      if (prof?.member_code?.toLowerCase() === driverLower) {
        driverProfileId = d.profile_id;
        const full = `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim();
        if (full) driverDisplayName = full;
        return true;
      }
      return false;
    });
    if (!driverFound) {
      return { ok: false, error: `ไม่พบคนขับรหัส ${driverMemberCode}` };
    }

    // Verify forwarders are still eligible (fstatus='6' AND not already
    // in an open assignment). Prevents race conditions where two ops
    // create overlapping batches.
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fstatus, paydeposit, famount")
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

    // ── LINE dispatch notify (legacy `forwarder-driver.php` L93-105).
    //
    // The legacy handler pinged TWO LINE targets the moment a batch was
    // created: (1) a hardcoded ops/warehouse staff token, and (2) the
    // assigned driver's personal token via `getTokenLineDriver($driverId)`.
    // Both went through `sendLine2()` → the now-EOL LINE Notify API.
    //
    // Pacred equivalents on the live LINE Messaging API:
    //   - DRIVER push → `sendNotification(driverProfileId, …)` which resolves
    //     the driver's `profiles.line_user_id` (linked via /liff/link) and
    //     pushes via `api.line.me/v2/bot/message/push` (falls back to email).
    //     This is the modern stand-in for the per-driver `getTokenLineDriver`
    //     token map — drivers link their own LINE once instead of us holding
    //     a hardcoded token per driver.
    //   - OPS/STAFF ping → `notifyStaffGroup(…)` (the staff LINE-OA group;
    //     no-op until LINE_STAFF_GROUP_ID is set — same pluggable pattern as
    //     every other staff ping in the system).
    //
    // BEST-EFFORT: this runs AFTER the batch + items are committed and the
    // audit row is written, and is fire-and-forget (`void` + internal
    // try/catch in both helpers) so a LINE outage can NEVER fail or roll
    // back the dispatch the ops staff just created. Errors are logged inside
    // the helpers; we additionally guard here against a synchronous throw.
    try {
      const boxTotal = (fwdRows ?? []).reduce((sum, r) => {
        const n = Number((r as { famount: string | number | null }).famount);
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      const deepLink = `/admin/drivers/${batchId}`;
      const driverMsg =
        `คุณ${driverDisplayName} มีรายการส่งของใหม่\n` +
        `เลขที่รอบ ${batchId} (${fdName})\n` +
        `จุดที่ต้องส่ง ${stopCount}\n` +
        `จำนวนแทรคกิ้ง ${forwarderIds.length}\n` +
        `จำนวนกล่อง ${boxTotal}\n` +
        `ส่งก่อนเวลา ${endTime}`;

      // Driver personal push (in-app + LINE OA + email fallback).
      if (driverProfileId) {
        void sendNotification(driverProfileId, {
          category:       "forwarder",
          severity:       "info",
          title:          "รายการส่งของใหม่",
          body:           driverMsg,
          link_href:      deepLink,
          reference_type: "forwarder",
          reference_id:   String(batchId),
        });
      } else {
        // Driver verified above but has no profile_id → cannot push.
        // (Shouldn't happen — driverFound implies a matched admins row.)
        console.error("createDriverBatch: no driverProfileId for LINE push", {
          batchId,
          driver: driverMemberCode,
        });
      }

      // Ops/warehouse staff group ping (replaces the hardcoded staff token).
      void notifyStaffGroup(
        `🚚 มอบงานคนขับใหม่ — รอบ ${batchId}\n` +
          `คนขับ : คุณ${driverDisplayName} (${driverMemberCode})\n` +
          `ผู้สร้างรายการ : ${fdAdminCreator}\n` +
          `จุดที่ต้องส่ง ${stopCount} · แทรคกิ้ง ${forwarderIds.length} · กล่อง ${boxTotal}\n` +
          `ส่งก่อนเวลา ${endTime}`,
        {
          title:    `🚚 มอบงานคนขับ — รอบ ${batchId}`,
          url:      deepLink,
          urlLabel: "เปิดดูรอบจัดส่ง",
        },
      );
    } catch (notifyErr) {
      // Never let a notify failure break the (already-committed) batch create.
      console.error("createDriverBatch: dispatch LINE notify threw", {
        batchId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

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

  return withAdmin(["ops", "super", "warehouse"], async ({ adminId }) => {
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

// ────────────────────────────────────────────────────────────
// SET external-courier tracking URL (Lalamove / Grab / 3rd-party)
// ────────────────────────────────────────────────────────────
//
// 2026-06-08 gap analysis #2 — AIR-import external-courier dispatch.
// Ops pastes the courier's own tracking URL onto a forwarder row; the
// customer then sees a "ติดตามพัสดุ (ขนส่งภายนอก)" link on the
// /service-import/[fNo] detail page. Writes tb_forwarder.courier_tracking_url
// (migration 0156). Empty/whitespace input clears the link.

const setCourierUrlSchema = z.object({
  // The tb_forwarder.id whose last-mile link we're setting.
  forwarderId: z.number().int().positive(),
  // The courier tracking URL — must be http(s) when present; "" clears it.
  url: z
    .string()
    .trim()
    .max(2000, "ลิงก์ยาวเกินไป")
    .refine(
      (v) => v === "" || /^https?:\/\/.+/i.test(v),
      "ต้องเป็นลิงก์ http(s) ที่ถูกต้อง",
    ),
});
export type SetCourierUrlInput = z.infer<typeof setCourierUrlSchema>;

/**
 * Set (or clear) a forwarder row's external-courier tracking URL.
 * Allowed for ops/super only (same gate as the dispatch flow).
 */
export async function setForwarderCourierUrl(
  input: SetCourierUrlInput,
): Promise<AdminActionResult> {
  const parsed = setCourierUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { forwarderId, url } = parsed.data;
  const value = url === "" ? null : url;

  return withAdmin(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Verify the forwarder exists (clear error vs a silent no-op update).
    const { data: fwd, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id")
      .eq("id", forwarderId)
      .maybeSingle<{ id: number }>();
    if (fwdErr) {
      console.error("setForwarderCourierUrl: forwarder lookup failed", fwdErr, { forwarderId });
      return { ok: false, error: fwdErr.message };
    }
    if (!fwd) return { ok: false, error: "ไม่พบรายการฝากนำเข้านี้" };

    const { error: updErr } = await admin
      .from("tb_forwarder")
      .update({ courier_tracking_url: value })
      .eq("id", forwarderId);
    if (updErr) {
      console.error("setForwarderCourierUrl: update failed", updErr, { forwarderId });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(
      adminId,
      "tb_forwarder.set_courier_url",
      "tb_forwarder",
      String(forwarderId),
      { url: value },
    );

    // The customer detail page reads this row.
    revalidatePath(`/service-import/${forwarderId}`);
    revalidatePath("/admin/drivers");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// UPDATE batch deadline (ขยายเวลา / แก้เวลาส่ง)
// ────────────────────────────────────────────────────────────
//
// 2026-06-19 owner sweep — "แก้ไขอัพเดท หรือ เริ่มใหม่ ยังไง แก้ไขได้ทุกจุด".
// Ops can re-set the delivery deadline on an OPEN run (fdstatus='1') —
// recomputed from now + the chosen preset (legacy presets 17/24/30 h).

const updateEndtimeSchema = z.object({
  batchId: z.number().int().positive(),
  endTimeHours: z.union([z.literal(17), z.literal(24), z.literal(30)]),
});
export type UpdateEndtimeInput = z.infer<typeof updateEndtimeSchema>;

export async function updateBatchEndtime(
  input: UpdateEndtimeInput,
): Promise<AdminActionResult> {
  const parsed = updateEndtimeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { batchId, endTimeHours } = parsed.data;

  return withAdmin(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: batch, error: batchErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdstatus")
      .eq("id", batchId)
      .maybeSingle<{ id: number; fdstatus: string | null }>();
    if (batchErr) {
      console.error("updateBatchEndtime: batch read failed", batchErr, { batchId });
      return { ok: false, error: batchErr.message };
    }
    if (!batch) return { ok: false, error: "ไม่พบรอบจัดส่งนี้" };
    if (batch.fdstatus !== "1") {
      return { ok: false, error: "แก้เวลาได้เฉพาะรอบที่กำลังดำเนินการ" };
    }

    const endTime = new Date(Date.now() + endTimeHours * 3_600_000)
      .toISOString().replace("T", " ").substring(0, 19);

    const { error: updErr } = await admin
      .from("tb_forwarder_driver")
      .update({ endtime: endTime })
      .eq("id", batchId)
      .eq("fdstatus", "1"); // re-assert the open-state in the WHERE (TOCTOU)
    if (updErr) {
      console.error("updateBatchEndtime: update failed", updErr, { batchId });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "tb_forwarder_driver.update_endtime", "tb_forwarder_driver", String(batchId), {
      end_time_hours: endTimeHours, end_time: endTime,
    });
    revalidatePath(`/admin/drivers/${batchId}`);
    revalidatePath("/admin/drivers");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// REASSIGN driver (เปลี่ยนคนขับ)
// ────────────────────────────────────────────────────────────
//
// 2026-06-19 owner sweep. Move an OPEN run to a different active driver.
// Only allowed before anything is delivered (no fdistatus='2') so we don't
// orphan a partly-completed run. Best-effort LINE push to the new driver.

const reassignSchema = z.object({
  batchId: z.number().int().positive(),
  driverMemberCode: z.string().trim().regex(/^(PR|AD)\d{3,}$/i, "ระบุรหัสคนขับ (PR หรือ AD)"),
});
export type ReassignInput = z.infer<typeof reassignSchema>;

export async function reassignBatchDriver(
  input: ReassignInput,
): Promise<AdminActionResult> {
  const parsed = reassignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { batchId, driverMemberCode } = parsed.data;

  return withAdmin(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: batch, error: batchErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdstatus, fdadminid, fdname")
      .eq("id", batchId)
      .maybeSingle<{ id: number; fdstatus: string | null; fdadminid: string | null; fdname: string | null }>();
    if (batchErr) {
      console.error("reassignBatchDriver: batch read failed", batchErr, { batchId });
      return { ok: false, error: batchErr.message };
    }
    if (!batch) return { ok: false, error: "ไม่พบรอบจัดส่งนี้" };
    if (batch.fdstatus !== "1") {
      return { ok: false, error: "เปลี่ยนคนขับได้เฉพาะรอบที่กำลังดำเนินการ" };
    }
    if (batch.fdadminid?.toLowerCase() === driverMemberCode.toLowerCase()) {
      return { ok: false, error: "เป็นคนขับคนเดิมอยู่แล้ว" };
    }

    // Block if anything is already delivered (preserve the audit trail).
    const { data: deliveredItems, error: chkErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("id")
      .eq("fdid", batchId)
      .eq("fdistatus", "2");
    if (chkErr) {
      console.error("reassignBatchDriver: delivered check failed", chkErr, { batchId });
      return { ok: false, error: chkErr.message };
    }
    if ((deliveredItems ?? []).length > 0) {
      return { ok: false, error: "รอบนี้มีรายการส่งสำเร็จแล้ว — เปลี่ยนคนขับไม่ได้" };
    }

    // Verify the target driver exists + is active.
    const { data: driverRows, error: driverErr } = await admin
      .from("admins")
      .select("profile_id, profile:profiles!profile_id(member_code, first_name, last_name)")
      .eq("role", "driver")
      .eq("is_active", true);
    if (driverErr) {
      console.error("reassignBatchDriver: driver lookup failed", driverErr);
      return { ok: false, error: driverErr.message };
    }
    type DRow = { profile_id: string; profile: { member_code: string | null; first_name: string | null; last_name: string | null } | { member_code: string | null; first_name: string | null; last_name: string | null }[] | null };
    const driverLower = driverMemberCode.toLowerCase();
    let driverProfileId: string | null = null;
    let driverDisplayName = driverMemberCode;
    const found = ((driverRows ?? []) as unknown as DRow[]).some((d) => {
      const prof = Array.isArray(d.profile) ? d.profile[0] : d.profile;
      if (prof?.member_code?.toLowerCase() === driverLower) {
        driverProfileId = d.profile_id;
        const full = `${prof.first_name ?? ""} ${prof.last_name ?? ""}`.trim();
        if (full) driverDisplayName = full;
        return true;
      }
      return false;
    });
    if (!found) return { ok: false, error: `ไม่พบคนขับรหัส ${driverMemberCode}` };

    const { error: updErr } = await admin
      .from("tb_forwarder_driver")
      .update({ fdadminid: driverMemberCode })
      .eq("id", batchId)
      .eq("fdstatus", "1");
    if (updErr) {
      console.error("reassignBatchDriver: update failed", updErr, { batchId });
      return { ok: false, error: updErr.message };
    }

    await logAdminAction(adminId, "tb_forwarder_driver.reassign_driver", "tb_forwarder_driver", String(batchId), {
      from: batch.fdadminid, to: driverMemberCode,
    });

    // Best-effort push to the new driver (never fails the reassign).
    try {
      if (driverProfileId) {
        void sendNotification(driverProfileId, {
          category:       "forwarder",
          severity:       "info",
          title:          "ได้รับมอบหมายรอบจัดส่ง",
          body:           `คุณ${driverDisplayName} ได้รับมอบหมายรอบ #${batchId}${batch.fdname ? ` (${batch.fdname})` : ""}`,
          link_href:      `/admin/drivers/${batchId}`,
          reference_type: "forwarder",
          reference_id:   String(batchId),
        });
      }
    } catch (notifyErr) {
      console.error("reassignBatchDriver: notify threw", {
        batchId, error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    revalidatePath(`/admin/drivers/${batchId}`);
    revalidatePath("/admin/drivers");
    revalidatePath("/admin/drivers/work");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// REOPEN a closed run (เริ่มรอบใหม่ / เปิดอีกครั้ง)
// ────────────────────────────────────────────────────────────
//
// 2026-06-19 owner sweep — "เริ่มใหม่ ยังไง". A run that was closed
// สำเร็จ('2')/ไม่สำเร็จ('3') can be re-opened: fdstatus → '1', a fresh
// deadline, and any failed stops ('3') reset to ยังไม่ขึ้นรถ('') so the
// driver can retry them. Delivered stops ('2') are LEFT as-is (audit).

const reopenSchema = z.object({
  batchId: z.number().int().positive(),
  endTimeHours: z.union([z.literal(17), z.literal(24), z.literal(30)]).default(17),
});
export type ReopenInput = z.infer<typeof reopenSchema>;

export async function reopenDriverBatch(
  input: ReopenInput,
): Promise<AdminActionResult> {
  const parsed = reopenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { batchId, endTimeHours } = parsed.data;

  return withAdmin(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: batch, error: batchErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdstatus")
      .eq("id", batchId)
      .maybeSingle<{ id: number; fdstatus: string | null }>();
    if (batchErr) {
      console.error("reopenDriverBatch: batch read failed", batchErr, { batchId });
      return { ok: false, error: batchErr.message };
    }
    if (!batch) return { ok: false, error: "ไม่พบรอบจัดส่งนี้" };
    if (batch.fdstatus !== "2" && batch.fdstatus !== "3") {
      return { ok: false, error: "เปิดใหม่ได้เฉพาะรอบที่ปิดแล้ว (สำเร็จ/ไม่สำเร็จ)" };
    }

    const endTime = new Date(Date.now() + endTimeHours * 3_600_000)
      .toISOString().replace("T", " ").substring(0, 19);

    const { error: updErr } = await admin
      .from("tb_forwarder_driver")
      .update({ fdstatus: "1", endtime: endTime })
      .eq("id", batchId)
      .in("fdstatus", ["2", "3"]); // TOCTOU: only flip a still-closed run
    if (updErr) {
      console.error("reopenDriverBatch: batch update failed", updErr, { batchId });
      return { ok: false, error: updErr.message };
    }

    // Reset only the failed stops so they re-enter the driver's work-list.
    const { error: resetErr } = await admin
      .from("tb_forwarder_driver_item")
      .update({ fdistatus: "" })
      .eq("fdid", batchId)
      .eq("fdistatus", "3");
    if (resetErr) {
      console.error("reopenDriverBatch: item reset failed", resetErr, { batchId });
      // Batch already re-opened — don't hard-fail; surface a soft warning.
      return { ok: false, error: `เปิดรอบแล้วแต่รีเซ็ตรายการไม่สำเร็จ: ${resetErr.message}` };
    }

    await logAdminAction(adminId, "tb_forwarder_driver.reopen", "tb_forwarder_driver", String(batchId), {
      from_status: batch.fdstatus, end_time_hours: endTimeHours,
    });
    revalidatePath(`/admin/drivers/${batchId}`);
    revalidatePath("/admin/drivers");
    revalidatePath("/admin/drivers/work");
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// REMOVE one stop/item from a batch (ลบรายการออกจากรอบ)
// ────────────────────────────────────────────────────────────
//
// 2026-06-19 owner sweep — "แก้ได้ทุกจุด". Drop a single forwarder row from
// an open run (e.g. the customer cancelled, or it was added by mistake).
// Blocked once that stop is delivered ('2'). The forwarder row itself is
// untouched — it just leaves this run and becomes re-assignable.

const removeItemSchema = z.object({
  itemId: z.number().int().positive(),
});
export type RemoveItemInput = z.infer<typeof removeItemSchema>;

export async function removeItemFromBatch(
  input: RemoveItemInput,
): Promise<AdminActionResult<{ batchId: number }>> {
  const parsed = removeItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { itemId } = parsed.data;

  return withAdmin<{ batchId: number }>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: item, error: itemErr } = await admin
      .from("tb_forwarder_driver_item")
      .select("id, fdid, fid, fdistatus")
      .eq("id", itemId)
      .maybeSingle<{ id: number; fdid: number; fid: number; fdistatus: string | null }>();
    if (itemErr) {
      console.error("removeItemFromBatch: item read failed", itemErr, { itemId });
      return { ok: false, error: itemErr.message };
    }
    if (!item) return { ok: false, error: "ไม่พบรายการนี้ในรอบ" };
    if (item.fdistatus === "2") {
      return { ok: false, error: "รายการนี้ส่งสำเร็จแล้ว — ลบออกไม่ได้" };
    }

    const { error: delErr } = await admin
      .from("tb_forwarder_driver_item")
      .delete()
      .eq("id", itemId)
      .neq("fdistatus", "2"); // TOCTOU: never delete a delivered stop
    if (delErr) {
      console.error("removeItemFromBatch: delete failed", delErr, { itemId });
      return { ok: false, error: delErr.message };
    }

    // Removing the last still-open stop can leave the run all-delivered →
    // auto-complete it (so it doesn't sit "กำลังดำเนินการ" with nothing pending).
    await maybeAutoCompleteDriverBatch(admin, item.fdid);

    await logAdminAction(adminId, "tb_forwarder_driver_item.remove", "tb_forwarder_driver_item", String(itemId), {
      batch_id: item.fdid, forwarder_id: item.fid,
    });
    revalidatePath(`/admin/drivers/${item.fdid}`);
    revalidatePath("/admin/drivers");
    return { ok: true, data: { batchId: item.fdid } };
  });
}

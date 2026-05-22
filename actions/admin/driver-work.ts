"use server";

/**
 * actions/admin/driver-work.ts — Wave 10
 *
 * Mobile driver work-list status transitions. Backs the action buttons
 * on /admin/drivers/work — the page drivers open on their phone to
 * mark "ขึ้นรถ" / "ส่งสำเร็จ" / "ส่งไม่ได้" against the legacy
 * `tb_forwarder_driver_item` rows their batch assignment contains.
 *
 * Why a NEW action file (vs extending actions/admin/forwarder-drivers.ts):
 *   - forwarder-drivers.ts works on the REBUILT `forwarder_driver` table
 *     (EMPTY on prod — empty per Wave-3 P0 audit).
 *   - This file works on the LEGACY `tb_forwarder_driver_item` table
 *     (live · ~real driver runs · 117-table port from `pcsc_main`).
 *   They will coexist during the D1 transition; this is the path drivers
 *   actually use today.
 *
 * Legacy reference: `pcs-admin/forwarder-driver-w.php` lines 957-961
 * (`UPDATE tb_forwarder_driver_item SET fdiStatus='2' WHERE fID IN ...`)
 * + the related `UPDATE ... fdiStatus='3'` on the expiry path.
 *
 * Photo upload (`fdipictureon` / `fdipictureoff`) is intentionally
 * deferred to Wave 11 — Wave 10 ships the status-only transitions so
 * drivers stop being completely blocked from the platform today.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// fdistatus values are CHAR(1) strings per the legacy schema
// (`tb_forwarder_driver_item.fdistatus character varying(1) NOT NULL`).
//   ''  = ยังไม่ขึ้นรถ (default — empty string)
//   '1' = ขึ้นรถแล้ว (loaded onto truck)
//   '2' = ส่งสำเร็จ (delivered)
//   '3' = ส่งไม่ได้ / หมดเวลา (failed / expired by cron)
type DriverItemStatus = "" | "1" | "2" | "3";

const idSchema = z.object({
  itemId: z.number().int().positive(),
});
type IdInput = z.infer<typeof idSchema>;

const failSchema = z.object({
  itemId: z.number().int().positive(),
  reason: z.string().trim().min(1, "ระบุเหตุผล").max(500),
});
export type MarkFailedInput = z.infer<typeof failSchema>;

const ROLES = ["driver", "ops", "super"] as const;

/**
 * Look up the caller's tb_users.userid (the legacy text key like "PR10691")
 * from the auth user id via profiles.member_code. Used to enforce the
 * self-row check for `driver` role callers — they can only mutate items
 * whose batch (tb_forwarder_driver.fdadminid) matches their member_code.
 *
 * Returns null if the auth user has no profile or the member_code is missing.
 */
async function getCallerLegacyUserid(adminId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", adminId)
    .maybeSingle<{ member_code: string | null }>();
  return data?.member_code ?? null;
}

/**
 * Verify the caller is allowed to touch this driver-item.
 *
 *   - ops / super  → unrestricted (admin overrides).
 *   - driver       → must own the batch (tb_forwarder_driver.fdadminid
 *                    matches caller's profiles.member_code).
 *
 * Returns the item row + batch's fdadminid on success, or an error string.
 */
async function loadItemAndAuthorise(
  itemId: number,
  callerProfileId: string,
  callerRoles: readonly string[],
): Promise<
  | { ok: true; row: { id: number; fdid: number; fid: number; fdistatus: string }; batchOwner: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const { data: itemRow } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fid, fdistatus")
    .eq("id", itemId)
    .maybeSingle<{ id: number; fdid: number; fid: number; fdistatus: string }>();
  if (!itemRow) return { ok: false, error: "ไม่พบรายการ" };

  const { data: batchRow } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdadminid, fdstatus")
    .eq("id", itemRow.fdid)
    .maybeSingle<{ id: number; fdadminid: string; fdstatus: string }>();
  if (!batchRow) return { ok: false, error: "ไม่พบรอบจัดส่ง" };

  const isAdminOverride = callerRoles.includes("super") || callerRoles.includes("ops");
  if (!isAdminOverride) {
    // Driver role — must own this batch.
    const legacyUserid = await getCallerLegacyUserid(callerProfileId);
    if (!legacyUserid) {
      return { ok: false, error: "ไม่พบ member_code ของคุณ — ติดต่อ admin" };
    }
    if (batchRow.fdadminid !== legacyUserid) {
      return { ok: false, error: "งานนี้ไม่ใช่ของคุณ" };
    }
  }

  return { ok: true, row: itemRow, batchOwner: batchRow.fdadminid };
}

async function transitionItemStatus(
  input: IdInput,
  nextStatus: Exclude<DriverItemStatus, "">,
  action: "load" | "deliver",
): Promise<AdminActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { itemId } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    // Re-read caller roles for the self-row gate (the withAdmin wrapper
    // already asserted at-least-one of ROLES, but we need to know which).
    const admin = createAdminClient();
    const { data: rolesRows } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", adminId)
      .eq("is_active", true);
    const callerRoles = (rolesRows ?? []).map((r) => (r as { role: string }).role);

    const authz = await loadItemAndAuthorise(itemId, adminId, callerRoles);
    if (!authz.ok) return { ok: false, error: authz.error };

    // Allowed transitions (legacy logic mirrors PHP):
    //   load    : '' → '1'         (driver picks up at warehouse)
    //   deliver : '1' → '2'         (driver hands off to customer)
    // Re-marking is a no-op; going backward is rejected.
    if (authz.row.fdistatus === nextStatus) return { ok: true };
    if (action === "load" && authz.row.fdistatus !== "") {
      return { ok: false, error: "รายการนี้ขึ้นรถไปแล้ว / จบงานแล้ว" };
    }
    if (action === "deliver" && authz.row.fdistatus !== "1") {
      return { ok: false, error: "ต้องกดขึ้นรถก่อน จึงจะส่งสำเร็จได้" };
    }

    const { error } = await admin
      .from("tb_forwarder_driver_item")
      .update({ fdistatus: nextStatus })
      .eq("id", itemId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      adminId,
      `tb_forwarder_driver_item.${action}`,
      "tb_forwarder_driver_item",
      String(itemId),
      {
        fdid:          authz.row.fdid,
        fid:           authz.row.fid,
        batch_owner:   authz.batchOwner,
        before_status: authz.row.fdistatus,
        after_status:  nextStatus,
      },
    );

    revalidatePath("/admin/drivers/work");
    return { ok: true };
  });
}

/**
 * Mark a driver item as loaded onto the truck (fdistatus '' → '1').
 *
 * Wave 11 backlog: accept a `pictureon` file → upload to storage → write
 * the URL to `tb_forwarder_driver_item.fdipictureon`. For now the column
 * stays empty; legacy data has it populated for old rows.
 */
export async function markDriverItemLoaded(itemId: number): Promise<AdminActionResult> {
  return transitionItemStatus({ itemId }, "1", "load");
}

/**
 * Mark a driver item as delivered (fdistatus '1' → '2').
 *
 * Wave 11 backlog: same photo-upload deferral as markDriverItemLoaded
 * (this one writes to `fdipictureoff` = "ลงรถ" picture).
 */
export async function markDriverItemDelivered(itemId: number): Promise<AdminActionResult> {
  return transitionItemStatus({ itemId }, "2", "deliver");
}

/**
 * Mark a driver item as failed (fdistatus '1' → '3').
 *
 * Legacy `tb_forwarder_driver_item` has NO column for the failure reason.
 * Wave 10 logs the reason to the admin audit log payload (queryable via
 * `admin_audit_log.payload.reason`); Wave 11 should extend the schema with
 * a `fdinote` text column so the reason is visible inline on the row.
 */
export async function markDriverItemFailed(input: MarkFailedInput): Promise<AdminActionResult> {
  const parsed = failSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { itemId, reason } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: rolesRows } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", adminId)
      .eq("is_active", true);
    const callerRoles = (rolesRows ?? []).map((r) => (r as { role: string }).role);

    const authz = await loadItemAndAuthorise(itemId, adminId, callerRoles);
    if (!authz.ok) return { ok: false, error: authz.error };

    if (authz.row.fdistatus === "3") return { ok: true };
    // Per legacy logic, failing requires the row to have been loaded ('1')
    // OR still pending ('') — covers "lost in transit" AND "couldn't pick
    // up at warehouse". Reject only if already delivered.
    if (authz.row.fdistatus === "2") {
      return { ok: false, error: "รายการนี้ส่งสำเร็จไปแล้ว ไม่สามารถ mark fail ได้" };
    }

    const { error } = await admin
      .from("tb_forwarder_driver_item")
      .update({ fdistatus: "3" })
      .eq("id", itemId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(
      adminId,
      "tb_forwarder_driver_item.fail",
      "tb_forwarder_driver_item",
      String(itemId),
      {
        fdid:          authz.row.fdid,
        fid:           authz.row.fid,
        batch_owner:   authz.batchOwner,
        before_status: authz.row.fdistatus,
        after_status:  "3",
        reason,            // Wave 11: move into a fdinote column on the row.
      },
    );

    revalidatePath("/admin/drivers/work");
    return { ok: true };
  });
}

"use server";

/**
 * actions/admin/driver-work.ts — Wave 10 + Wave 12-B (photo upload)
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
 * Legacy reference: `pcs-admin/forwarder-driver-w.php`
 *   - status flip: lines 957-961 (`UPDATE tb_forwarder_driver_item
 *     SET fdiStatus='2' WHERE fID IN ...`)
 *   - photo upload: legacy lets the driver snap a photo on each transition
 *     — the file lands in storage and the filename is written into
 *     `fdipictureon` (loaded) or `fdipictureoff` (delivered).
 *
 * Wave 12-B (2026-05-23):
 *   - The load + deliver Server Actions now accept an optional photo
 *     (FormData submission so the File survives the client→server hop).
 *   - Photos land in `forwarder-covers/driver/<itemId>-on-<ts>-<safeName>`
 *     (and `-off-` on delivery). The bucket is private; the page reads
 *     them back via signed URLs.
 *   - Status transition + photo column write happen in the SAME UPDATE
 *     so a successful upload that fails to record is not possible (if
 *     the UPDATE errors, we leave the storage object orphaned — Wave 13
 *     can sweep those).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { fireUserSalesEarnTriggerOnDelivery } from "./earn-trigger-tb-user-sales";
import { maybeAutoCompleteDriverBatch } from "@/lib/admin/driver-batch-complete";
import type { AdminRole } from "@/lib/auth/require-admin";
import { isGodRole } from "@/lib/admin/god-role";

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
  const { data, error } = await admin
    .from("profiles")
    .select("member_code")
    .eq("id", adminId)
    .maybeSingle<{ member_code: string | null }>();
  if (error) {
    console.error(`[profiles list] failed`, { code: error.code, message: error.message });
  }
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
  | { ok: true; row: { id: number; fdid: number; fid: number; fdistatus: string; fdipictureon: string | null; fdipictureoff: string | null }; batchOwner: string }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const { data: itemRow, error: itemRowErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fid, fdistatus, fdipictureon, fdipictureoff")
    .eq("id", itemId)
    .maybeSingle<{ id: number; fdid: number; fid: number; fdistatus: string; fdipictureon: string | null; fdipictureoff: string | null }>();
  if (itemRowErr) {
    console.error(`[tb_forwarder_driver_item mutation lookup] failed`, { code: itemRowErr.code, message: itemRowErr.message });
    return { ok: false, error: `db_error:${itemRowErr.code ?? "unknown"}` };
  }
  if (!itemRow) return { ok: false, error: "ไม่พบรายการ" };

  const { data: batchRow, error: batchRowErr } = await admin
    .from("tb_forwarder_driver")
    .select("id, fdadminid, fdstatus")
    .eq("id", itemRow.fdid)
    .maybeSingle<{ id: number; fdadminid: string; fdstatus: string }>();
  if (batchRowErr) {
    console.error(`[tb_forwarder_driver mutation lookup] failed`, { code: batchRowErr.code, message: batchRowErr.message });
    return { ok: false, error: `db_error:${batchRowErr.code ?? "unknown"}` };
  }
  if (!batchRow) return { ok: false, error: "ไม่พบรอบจัดส่ง" };

  const isAdminOverride =
    isGodRole(callerRoles as AdminRole[]) || callerRoles.includes("ops");
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

/**
 * Shared transition body — used by both the JSON entrypoint
 * (`markDriverItemLoaded` / `markDriverItemDelivered` when called without
 * a photo) and the FormData entrypoint (`markDriverItemLoadedFromForm`).
 *
 * `photoColumn` controls which column receives the uploaded filename:
 *   - "fdipictureon"  for "ขึ้นรถ" (load)
 *   - "fdipictureoff" for "ส่งสำเร็จ" (deliver)
 */
async function transitionItemStatus(
  input: IdInput,
  nextStatus: Exclude<DriverItemStatus, "">,
  action: "load" | "deliver",
  photoFile?: File | null,
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
    const { data: rolesRows, error: rolesRowsErr } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", adminId)
      .eq("is_active", true);
    if (rolesRowsErr) {
      console.error(`[admins list] failed`, { code: rolesRowsErr.code, message: rolesRowsErr.message });
    }
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

    // ── (a) If a photo came along, upload it FIRST. The uploaded
    //         filename lives in the same UPDATE as the status flip
    //         so a successful upload that fails to record is not possible.
    //         If the upload itself fails, abort before mutating status.
    //
    //   Path: forwarder-covers/driver/<itemId>-<on|off>/<unix-ms>-<safe-name>
    //   (Group A's helper auto-appends `${Date.now()}-${safeName}` to the
    //   prefix; we just give it the per-item / per-action folder.)
    let uploadedFilename: string | null = null;
    if (photoFile && photoFile.size > 0) {
      const suffix = action === "load" ? "on" : "off";
      const prefix = `driver/${itemId}-${suffix}`;
      const up = await uploadToBucket(photoFile, "forwarder-covers", prefix);
      if (!up.ok) {
        return { ok: false, error: `อัปโหลดรูปไม่สำเร็จ: ${up.error}` };
      }
      uploadedFilename = up.filename;
    }

    // ── (b) Status flip + (optional) photo write + (deliver-only) per-item
    //         delivered-at timestamp in one UPDATE.
    //
    //   fdicompletedat (migration 0158 · 2026-06-09): the legacy schema
    //   has NO per-item completed-at column · /admin/driver-runs had to
    //   proxy "delivered last 7 days" via batch.fddate (= batch creation
    //   date), which misses items delivered today on an old batch. Now
    //   the deliver flip captures the precise instant in the SAME UPDATE
    //   so the disbursement filter is exact.
    //
    //   Only the "deliver" action writes it. The "load" path (→ '1') and
    //   the "fail" path (→ '3' · separate function below) intentionally
    //   do NOT touch this column. `new Date().toISOString()` is fine in
    //   a server action — Next 16's purity rule only blocks `new Date()`
    //   / `Date.now()` in render-body, not in async server actions
    //   (cf. CLAUDE_TECHNICAL.md notes on this).
    const updatePayload: Record<string, string> = { fdistatus: nextStatus };
    if (uploadedFilename) {
      updatePayload[action === "load" ? "fdipictureon" : "fdipictureoff"] = uploadedFilename;
    }
    if (action === "deliver") {
      updatePayload.fdicompletedat = new Date().toISOString();
    }
    const { error } = await admin
      .from("tb_forwarder_driver_item")
      .update(updatePayload)
      .eq("id", itemId);
    if (error) return { ok: false, error: error.message };

    // ── (c) AUTO-FLIP tb_forwarder.fstatus → '7' on DELIVER (Wave 26 · 2026-05-28).
    //
    // Legacy `pcs-admin/forwarder-driver.php:1328-1331` updates BOTH tables
    // in the same handler when the driver uploads a delivery photo:
    //
    //   UPDATE tb_forwarder SET fPhotoEnd='...', fStatus='7', fDateStatus7=NOW()
    //     WHERE ID IN ('$ids');
    //   UPDATE tb_forwarder_driver_item SET fdiStatus='2'
    //     WHERE fID IN ('$ids') AND fdID='$ID2';
    //
    // Without this 2nd UPDATE the order looks "เตรียมส่ง (6)" in /admin/forwarders
    // forever even after the driver delivered — exactly the "feel not
    // automatic" gap from `docs/research/legacy-deep-dive/_SYNTHESIS.md` §2 #5
    // ("Driver photo upload → fStatus 7"). Filling that gap here.
    //
    // Idempotent: skip if the row is already at fstatus 7 (legacy `IN ('$ids')`
    // doesn't filter on prior state either, but we add the WHERE to avoid
    // bumping the date if the driver re-uploads).
    //
    // The fphotoend column gets the SAME filename the driver-item row got
    // (so /admin/forwarders detail-page "รูปส่ง" matches the driver mobile
    // photo). On the "load" action we DO NOT touch tb_forwarder — the legacy
    // flow only flips fstatus=7 at the deliver step.
    if (action === "deliver") {
      // Wave 26 G5 (2026-05-28 ดึก) — status-transition role gate.
      // Matrix: 6→7 = driver / warehouse (with super / manager override).
      // The page-level union already filters to ["driver","ops","super"]
      // before reaching here; the helper additionally rejects `ops` (which
      // is the IT/admin slot — legacy doesn't grant it driver-delivery
      // rights) UNLESS the caller also holds driver / warehouse / super /
      // manager. `callerRoles` was loaded at the top of this function
      // for the existing batch-owner check — reuse it.
      if (!canAnyRoleFlipFstatus(callerRoles as readonly AdminRole[], "6", "7")) {
        // Soft-fail: the item flip in step (b) already succeeded (driver
        // legitimately marked the parcel delivered on the per-item table),
        // but the global fstatus auto-flip would let an `ops` caller bump
        // a forwarder row through the matrix gate. Logging + skipping
        // keeps per-item UX intact while honouring G5.
        console.error(`[tb_forwarder fstatus=7 auto-flip] forbidden_transition`, {
          fid:    authz.row.fid,
          roles:  callerRoles,
        });
      } else {
        const fwdUpdate: Record<string, string> = {
          fstatus:          "7",
          fdatestatus7:     new Date().toISOString(),
          // varchar(10) constraint on adminidupdate (per Wave 23 fix 5254f8d)
          adminidupdate:    String(adminId).slice(0, 10),
        };
        if (uploadedFilename) {
          fwdUpdate.fphotoend = uploadedFilename;
        }
        const { error: fwdErr } = await admin
          .from("tb_forwarder")
          .update(fwdUpdate)
          .eq("id", authz.row.fid)
          .neq("fstatus", "7");        // idempotent — don't stomp on a prior delivery
        if (fwdErr) {
          // Soft-fail: the item flip already succeeded; log + carry on so the
          // driver UI doesn't show an error for a 2nd-tier mutation. A Wave 27
          // cron can backfill any orphaned fdistatus=2 rows whose tb_forwarder
          // didn't flip.
          console.error(`[tb_forwarder fstatus=7 auto-flip] failed`, {
            fid: authz.row.fid,
            code: fwdErr.code,
            message: fwdErr.message,
          });
        } else {
          // Wave 26 G8 residual gap (Agent A3 flagged): append the canonical
          // status-flip log row so /admin/forwarders timeline + audit reports
          // reflect the driver-delivered transition 6→7 the same as every
          // other fstatus flip in the system.
          //
          // Best-effort: log insert failure does NOT block the driver UI.
          const { appendStatusLog } = await import("@/lib/notifications/status-flip-helper");
          await appendStatusLog(
            admin,
            authz.row.fid,
            "6",
            "7",
            String(adminId).slice(0, 50),
          );

          // P1-5 earn-trigger (2026-05-30 night · ภูม · ADR-0019 D-B · master gap
          // P1-5 · cust-07 P0-2). On a driver-delivered fstatus 6→7 transition,
          // INSERT a tb_user_sales row when the customer's tb_users.coid is in
          // the 4 VIP teams (THADA.VIP / SIN.VIP / OOAEOM.VIP / SWAN).
          // Idempotent — the helper checks for an existing row by `idf`.
          // Best-effort — failure does NOT roll back the delivery flip.
          try {
            const earnResult = await fireUserSalesEarnTriggerOnDelivery(
              admin,
              [authz.row.fid],
            );
            if (earnResult.errors.length > 0 || earnResult.inserted > 0) {
              console.info(`[driver-work tb_user_sales earn-trigger] inserted=${earnResult.inserted} skipped=${earnResult.skipped}`, {
                fid:      authz.row.fid,
                errors:   earnResult.errors,
              });
            }
          } catch (err) {
            console.error(`[driver-work tb_user_sales earn-trigger threw]`, {
              fid:   authz.row.fid,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    // ── (d) AUTO-COMPLETE THE BATCH when this delivery was the last open stop
    //         (legacy forwarder-driver-w.php:959-968 / forwarder-driver.php:1416-1424
    //         recount the run on every delivery + flip tb_forwarder_driver.fdstatus
    //         1→2 when all stops are delivered). WITHOUT this the batch header
    //         stays "กำลังดำเนินการ" forever even at 2/2 delivered, forcing staff
    //         to flip it by hand (ภูม 2026-06-23). Best-effort — never rolls back
    //         the (already-committed) item/forwarder delivery.
    let batchCompleted = false;
    if (action === "deliver") {
      batchCompleted = await maybeAutoCompleteDriverBatch(admin, authz.row.fdid);
    }

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
        photo_uploaded: uploadedFilename ?? null,
        // Wave 26: surface the tb_forwarder auto-flip in the audit payload so
        // ops can correlate driver-item deliveries with tb_forwarder status
        // changes when investigating "why is this order still showing เตรียมส่ง"
        forwarder_fstatus_flipped_to_7: action === "deliver",
        batch_completed:               batchCompleted,
      },
    );

    revalidatePath("/admin/drivers/work");
    // Wave 26: the listing /admin/forwarders + the detail /admin/forwarders/[fNo]
    // both read tb_forwarder.fstatus — revalidate them too so admin
    // ops see the status flip immediately (without it the cached page
    // would keep showing เตรียมส่ง until the next cache TTL).
    if (action === "deliver") {
      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/drivers");
      revalidatePath(`/admin/drivers/${authz.row.fdid}`);
    }
    return { ok: true };
  });
}

/**
 * Extract `(itemId, photoFile?)` from a FormData payload. Returns an
 * error if `itemId` is missing or not a positive integer.
 *
 * Used by the FormData entrypoints below — FormData is the only way to
 * smuggle a `File` through a "use server" Server Action invocation from
 * the client.
 */
function parseLoadOrDeliverForm(
  formData: FormData,
): { ok: true; itemId: number; photo: File | null } | { ok: false; error: string } {
  const idRaw = formData.get("itemId");
  const itemId = typeof idRaw === "string" ? Number.parseInt(idRaw, 10) : NaN;
  if (!Number.isFinite(itemId) || itemId <= 0) {
    return { ok: false, error: "invalid_item_id" };
  }
  const fileVal = formData.get("photo");
  // The browser submits an empty File when the <input> wasn't touched —
  // treat zero-size as "no photo".
  const photo = fileVal instanceof File && fileVal.size > 0 ? fileVal : null;
  return { ok: true, itemId, photo };
}

/**
 * Mark a driver item as loaded onto the truck (fdistatus '' → '1').
 *
 * Two call signatures supported:
 *   - markDriverItemLoaded(itemId)               — JSON (no photo) — legacy callers
 *   - markDriverItemLoaded(formData)             — FormData (with `itemId` + optional `photo`)
 *
 * The FormData variant is what the mobile camera flow uses (Wave 12-B).
 */
export async function markDriverItemLoaded(
  input: number | FormData,
): Promise<AdminActionResult> {
  if (input instanceof FormData) {
    const parsed = parseLoadOrDeliverForm(input);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return transitionItemStatus({ itemId: parsed.itemId }, "1", "load", parsed.photo);
  }
  return transitionItemStatus({ itemId: input }, "1", "load");
}

/**
 * Mark a driver item as delivered (fdistatus '1' → '2').
 *
 * Same dual-signature pattern as `markDriverItemLoaded`.
 */
export async function markDriverItemDelivered(
  input: number | FormData,
): Promise<AdminActionResult> {
  if (input instanceof FormData) {
    const parsed = parseLoadOrDeliverForm(input);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return transitionItemStatus({ itemId: parsed.itemId }, "2", "deliver", parsed.photo);
  }
  return transitionItemStatus({ itemId: input }, "2", "deliver");
}

/**
 * Mark a driver item as failed (fdistatus '1' → '3').
 *
 * Legacy `tb_forwarder_driver_item` has NO column for the failure reason.
 * Wave 10 logs the reason to the admin audit log payload (queryable via
 * `admin_audit_log.payload.reason`); Wave 13+ should extend the schema with
 * a `fdinote` text column so the reason is visible inline on the row.
 *
 * No photo for the failure path — legacy doesn't capture one here.
 */
export async function markDriverItemFailed(input: MarkFailedInput): Promise<AdminActionResult> {
  const parsed = failSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { itemId, reason } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: rolesRows, error: rolesRowsErr } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", adminId)
      .eq("is_active", true);
    if (rolesRowsErr) {
      console.error(`[admins list] failed`, { code: rolesRowsErr.code, message: rolesRowsErr.message });
    }
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
        reason,            // Wave 13+: move into a fdinote column on the row.
      },
    );

    revalidatePath("/admin/drivers/work");
    return { ok: true };
  });
}

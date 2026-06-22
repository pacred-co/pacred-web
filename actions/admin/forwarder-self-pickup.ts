"use server";

/**
 * actions/admin/forwarder-self-pickup.ts — "รับเองหน้าโกดัง" mark-done
 *
 * The self-pickup / hand-off close for the legacy
 * `forwarder-driver.php?page=add&q=pcs` tab — the parcels that do NOT get a
 * Pacred driver assigned:
 *   - fShipBy='PCS' → ลูกค้ามารับเองที่โกดัง
 *   - fShipBy='2'   → ไปรษณีย์ (Thai Post)
 *   - fShipBy='4'   → J&T
 *
 * Legacy mark-done (forwarder-driver.php:166 / :580 / :1328 — same SQL in all
 * three photo-upload handlers):
 *
 *   UPDATE `tb_forwarder`
 *      SET `fPhotoEnd`='$new_image_name', adminIDUpdate='$adminID',
 *          fStatus='7', fDateStatus7=NOW()
 *    WHERE ID IN ('$ids');
 *
 * i.e. mark the parcel ส่งแล้ว (fstatus 6→7) + stamp the hand-off photo. NO
 * driver / batch row is created (that is the OTHER tab, มอบงานคนขับ →
 * `actions/admin/driver-batches.ts`).
 *
 * Why a NEW action file (vs reusing driver-work.ts):
 *   - driver-work.ts flips the per-item `tb_forwarder_driver_item` table (a
 *     driver's mobile work-list). Self-pickup has NO driver-item row — the
 *     ONLY mutation is the tb_forwarder fstatus flip. Sharing the function
 *     would force a fake driver-item; a separate, smaller action is cleaner.
 *
 * Security parity (IMPORTANT): the 6→7 flip + its VIP earn-trigger are a money
 * side-effect, so this path MUST enforce the SAME `canAnyRoleFlipFstatus`
 * matrix the driver-delivery path does (lib/auth/check-fstatus-transition.ts
 * "6->7" = driver/warehouse + super/manager/god). Otherwise a pure-`ops`
 * caller blocked on the driver path could close the same transition here =
 * a matrix bypass. So warehouse + super close self-pickups (the real users);
 * pure-ops is refused with a clear message.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { canAnyRoleFlipFstatus } from "@/lib/auth/check-fstatus-transition";
import { fireUserSalesEarnTriggerOnDelivery } from "./earn-trigger-tb-user-sales";
import type { AdminRole } from "@/lib/auth/require-admin";

// Same page-level union as /admin/drivers/new (warehouse staff close at the
// counter on-site; super/ops oversee). The per-row matrix gate below narrows
// the ACTUAL closers to warehouse/super (pure-ops is refused — parity with
// the driver-delivery path).
const ROLES: AdminRole[] = ["ops", "super", "warehouse"];

// The carriers that go through the รับเองหน้าโกดัง tab (legacy filter
// forwarder-driver.php:729 / :793 — `fShipBy IN ('PCS','2','4')`).
const SELF_PICKUP_SHIPBY = new Set(["PCS", "2", "4"]);

type ParsedInput =
  | { ok: true; forwarderIds: number[]; photo: File | null }
  | { ok: false; error: string };

/**
 * Accept BOTH a FormData payload (the only way to smuggle a File through a
 * "use server" call from the client) and a plain `{ forwarderIds }` object
 * (no-photo callers / tests). FormData `forwarderIds` is a comma-joined list.
 */
function parseInput(input: FormData | { forwarderIds: number[] }): ParsedInput {
  if (input instanceof FormData) {
    const idsRaw = input.get("forwarderIds");
    const ids =
      typeof idsRaw === "string" && idsRaw.trim()
        ? idsRaw
            .split(",")
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0)
        : [];
    const fileVal = input.get("photo");
    const photo = fileVal instanceof File && fileVal.size > 0 ? fileVal : null;
    if (ids.length === 0) return { ok: false, error: "ไม่พบรายการที่เลือก" };
    return { ok: true, forwarderIds: [...new Set(ids)], photo };
  }
  const ids = (input.forwarderIds ?? []).filter(
    (n) => Number.isFinite(n) && n > 0,
  );
  if (ids.length === 0) return { ok: false, error: "ไม่พบรายการที่เลือก" };
  return { ok: true, forwarderIds: [...new Set(ids)], photo: null };
}

/**
 * Mark one or more self-pickup parcels delivered (fstatus 6 → 7).
 *
 * @param input  FormData (with `forwarderIds` comma-list + optional `photo`)
 *               OR `{ forwarderIds }`.
 */
export async function markForwarderSelfPickupDelivered(
  input: FormData | { forwarderIds: number[] },
): Promise<AdminActionResult<{ closed: number }>> {
  const parsed = parseInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const { forwarderIds, photo } = parsed;

  return withAdmin(ROLES, async ({ adminId, roles }) => {
    // ── (0) Matrix gate — parity with the driver-delivery 6→7 path.
    if (!canAnyRoleFlipFstatus(roles, "6", "7")) {
      return {
        ok: false,
        error: "บทบาทของคุณไม่มีสิทธิ์ปิดงานส่ง (6→7) — ต้องเป็นคลังสินค้า/ผู้ดูแลระบบ",
      };
    }
    const admin = createAdminClient();

    // ── (1) Re-read the rows + assert they are genuinely self-pickup AND
    //        still at fstatus=6 (TOCTOU-safe — never close a row that drifted
    //        out of 6, or a non-PCS/2/4 carrier that belongs to the driver tab).
    const { data: rows, error: rowsErr } = await admin
      .from("tb_forwarder")
      .select("id, fshipby, fstatus")
      .in("id", forwarderIds);
    if (rowsErr) {
      console.error("[self-pickup mark-done] read failed", {
        code: rowsErr.code,
        message: rowsErr.message,
      });
      return { ok: false, error: `db_error:${rowsErr.code ?? "unknown"}` };
    }
    const eligibleIds = ((rows ?? []) as { id: number; fshipby: string | null; fstatus: string | null }[])
      .filter(
        (r) => r.fstatus === "6" && SELF_PICKUP_SHIPBY.has(String(r.fshipby ?? "")),
      )
      .map((r) => r.id);
    if (eligibleIds.length === 0) {
      return {
        ok: false,
        error: "ไม่มีรายการที่ปิดงานได้ — ต้องเป็นรับเอง/ไปรษณีย์/J&T ที่สถานะ \"เตรียมส่ง\" (6)",
      };
    }

    // ── (2) Optional hand-off photo — upload FIRST so a failed upload aborts
    //        BEFORE any status mutation. Path mirrors the driver photo folder
    //        convention (forwarder-covers bucket).
    let uploadedFilename: string | null = null;
    if (photo) {
      const prefix = `self-pickup/${eligibleIds[0]}`;
      const up = await uploadToBucket(photo, "forwarder-covers", prefix);
      if (!up.ok) return { ok: false, error: `อัปโหลดรูปไม่สำเร็จ: ${up.error}` };
      uploadedFilename = up.filename;
    }

    // ── (3) The flip — fstatus 6→7 + hand-off stamps (legacy :1328). The
    //        `.eq("fstatus","6")` in the UPDATE WHERE makes it idempotent +
    //        keeps the per-row claim atomic (a row that flipped to 7 between
    //        the read and here is simply not re-touched).
    const updatePayload: Record<string, string> = {
      fstatus:       "7",
      fdatestatus7:  new Date().toISOString(),
      // varchar(10) on adminidupdate (mirror driver-work.ts:291).
      adminidupdate: String(adminId).slice(0, 10),
    };
    if (uploadedFilename) updatePayload.fphotoend = uploadedFilename;

    const { data: updated, error: updErr } = await admin
      .from("tb_forwarder")
      .update(updatePayload)
      .in("id", eligibleIds)
      .eq("fstatus", "6")
      .select("id");
    if (updErr) return { ok: false, error: updErr.message };
    const closedIds = ((updated ?? []) as { id: number }[]).map((r) => r.id);

    if (closedIds.length > 0) {
      // ── (4) Append the canonical status-flip log row per parcel (so the
      //        forwarder timeline + audit reports reflect the 6→7 the same
      //        as every other flip). Best-effort.
      try {
        const { appendStatusLog } = await import("@/lib/notifications/status-flip-helper");
        for (const fid of closedIds) {
          await appendStatusLog(admin, fid, "6", "7", String(adminId).slice(0, 50));
        }
      } catch (e) {
        console.error("[self-pickup status log] failed", e);
      }

      // ── (5) VIP earn-trigger — same as the driver-delivery 6→7 (ADR-0019).
      //        Idempotent + best-effort; failure NEVER rolls back the close.
      try {
        const earn = await fireUserSalesEarnTriggerOnDelivery(admin, closedIds);
        if (earn.errors.length > 0 || earn.inserted > 0) {
          console.info(
            `[self-pickup earn-trigger] inserted=${earn.inserted} skipped=${earn.skipped}`,
            { closedIds, errors: earn.errors },
          );
        }
      } catch (e) {
        console.error("[self-pickup earn-trigger] threw", e);
      }
    }

    await logAdminAction(
      adminId,
      "tb_forwarder.self_pickup_delivered",
      "tb_forwarder",
      closedIds.join(","),
      { requested: forwarderIds, closed: closedIds, photo: uploadedFilename ?? null },
    );

    revalidatePath("/admin/drivers/new");
    revalidatePath("/admin/forwarders");
    revalidatePath("/admin/drivers");
    return { ok: true, data: { closed: closedIds.length } };
  });
}

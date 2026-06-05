"use server";

/**
 * /admin/cnt-hs server actions — Wave 10 (2026-05-23) + Wave 12-A (2026-05-23)
 *
 * Per-cnt approval mutation + slip upload. Legacy: cnt-hs.php?page=detail with
 * the cntImagesSlip upload form (L535+ · cntStatus=2 when slip uploaded).
 *
 * Wave 10: status mutation only — admin clicks approve/reject to lock the cnt
 *          as paid (or refuse).
 * Wave 12-A: slip upload (`adminUploadCntSlip`) — admin picks the bank-transfer
 *          slip image → uploads to the `slips` bucket → updates
 *          cntimagesslip + cntstatus='2' in ONE atomic step (matching legacy
 *          cnt-hs.php L572 which does upload-and-auto-approve).
 *
 * Side effects:
 *   - UPDATE tb_cnt SET cntstatus='2' · cntimagesslip=<filename> ·
 *     adminidupdate · dateupdate=now()
 *   - DOES NOT touch tb_forwarder · the cnt is just the supplier-payment
 *     header · forwarder rows reference the cabinet number via
 *     tb_cnt_item but the forwarder lifecycle is independent.
 */

import { withAdmin } from "@/actions/admin/common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToBucket } from "@/lib/storage/upload";
import { revalidatePath } from "next/cache";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";

type Result = { ok: true } | { ok: false; error: string };
type UploadResult = { ok: true; filename: string } | { ok: false; error: string };

async function setCntStatus(cntId: number, newStatus: "2" | "3"): Promise<Result> {
  return withAdmin(["ops", "accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Guard: only pending (cntstatus='1') rows can be mutated. Mutating an
    // already-paid row from this surface would let an admin re-approve
    // (no-op) or re-reject (data corruption). Require manual undo via DB
    // or legacy PHP for those edge cases.
    const { data: cur, error: readErr } = await admin
      .from("tb_cnt")
      .select("ID,cntStatus")
      .eq("ID", cntId)
      .maybeSingle<{ ID: number; cntStatus: string | null }>();
    if (readErr) return { ok: false, error: `Read failed: ${readErr.message}` };
    if (!cur) return { ok: false, error: `cnt #${cntId} not found` };
    if (cur.cntStatus !== "1") {
      return {
        ok: false,
        error: `cnt #${cntId} อยู่ในสถานะ ${cur.cntStatus} ไม่สามารถเปลี่ยนผ่านหน้านี้ได้ (รอเฉพาะ cntStatus='1' = รอตรวจ)`,
      };
    }

    const { error: updErr } = await admin
      .from("tb_cnt")
      .update({
        cntStatus: newStatus,
        adminIDUpdate: safeLegacyAdminId(adminId, 30),
        dateUpdate: new Date().toISOString(),
      })
      .eq("ID", cntId);
    if (updErr) return { ok: false, error: `Update failed: ${updErr.message}` };

    revalidatePath(`/admin/cnt-hs/${cntId}`);
    revalidatePath("/admin/cnt-hs");
    // cntStatus moved out of '1' → the "ค่าตู้รออนุมัติ" (cntUnpaid) sidebar
    // badge shrank; refresh the admin chrome.
    bustAdminChrome();
    return { ok: true };
  });
}

export async function adminApproveCntHs(cntId: number): Promise<Result> {
  return setCntStatus(cntId, "2");
}

export async function adminRejectCntHs(cntId: number): Promise<Result> {
  return setCntStatus(cntId, "3");
}

/**
 * Wave 12-A — Upload slip + auto-approve.
 *
 * Mirrors legacy cnt-hs.php L535-572:
 *   1. Verify the cnt row exists + is in status='1' (รอตรวจ)
 *   2. Upload the slip image to slips/admin/cnt-slip/<ts>-<name>
 *   3. UPDATE tb_cnt SET cntimagesslip=<filename>, cntstatus='2',
 *      adminidupdate, dateupdate=NOW()
 *
 * Returns the new filename so the caller can refresh the detail view.
 * On upload-then-DB failure we leave the upload in place — accounting can
 * still reference the file path via the error message.
 */
export async function adminUploadCntSlip(
  cntId: number,
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get("slip");
  if (!(file instanceof File)) {
    return { ok: false, error: "ไม่พบไฟล์สลิป" };
  }

  const result = await withAdmin<{ filename: string }>(
    ["ops", "accounting", "super"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Guard: only status='1' can be approved-via-slip-upload.
      const { data: cur, error: readErr } = await admin
        .from("tb_cnt")
        .select("ID,cntStatus")
        .eq("ID", cntId)
        .maybeSingle<{ ID: number; cntStatus: string | null }>();
      if (readErr) return { ok: false, error: `Read failed: ${readErr.message}` };
      if (!cur) return { ok: false, error: `cnt #${cntId} not found` };
      if (cur.cntStatus !== "1") {
        return {
          ok: false,
          error: `cnt #${cntId} อยู่ในสถานะ ${cur.cntStatus} ไม่สามารถอัปโหลดสลิปได้ (รอเฉพาะ cntStatus='1')`,
        };
      }

      // Upload to slips bucket — admin/cnt-slip/<id>/<ts>-<name>
      const up = await uploadToBucket(file, "slips", `admin/cnt-slip/${cntId}`);
      if (!up.ok) return { ok: false, error: up.error };

      // UPDATE the cnt row — slip filename + auto-approve.
      const { error: updErr } = await admin
        .from("tb_cnt")
        .update({
          cntImagesSlip: up.filename,
          cntStatus:     "2",
          adminIDUpdate: safeLegacyAdminId(adminId, 30),
          dateUpdate:    new Date().toISOString(),
        })
        .eq("ID", cntId);
      if (updErr) {
        return {
          ok: false,
          error: `อัปโหลดสำเร็จที่ ${up.filename} แต่ UPDATE tb_cnt ล้มเหลว: ${updErr.message}`,
        };
      }

      revalidatePath(`/admin/cnt-hs/${cntId}`);
      revalidatePath("/admin/cnt-hs");
      // Slip upload auto-approved the cnt (cntStatus 1→2) → the "ค่าตู้รออนุมัติ"
      // (cntUnpaid) sidebar badge shrank; refresh the admin chrome.
      bustAdminChrome();
      return { ok: true, data: { filename: up.filename } };
    },
  );

  if (result.ok && result.data) return { ok: true, filename: result.data.filename };
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: false, error: "missing_filename" };
}

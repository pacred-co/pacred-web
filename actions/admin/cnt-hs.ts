"use server";

/**
 * /admin/cnt-hs server actions — Wave 10 (2026-05-23)
 *
 * Per-cnt approval mutation. Legacy: cnt-hs.php?page=detail with the
 * cntImagesSlip upload form (L535+ · cntStatus=2 when slip uploaded).
 *
 * Wave 10 (this commit): status mutation only — admin clicks approve/reject
 *   to lock the cnt as paid (or refuse). Slip upload + cntFile (PDF
 *   invoice attachment) → Wave 11.
 *
 * Side effects:
 *   - UPDATE tb_cnt SET cntstatus=NEW · adminidupdate · dateupdate=now()
 *   - DOES NOT touch tb_forwarder · the cnt is just the supplier-payment
 *     header · forwarder rows reference the cabinet number via
 *     tb_cnt_item but the forwarder lifecycle is independent.
 */

import { withAdmin } from "@/actions/admin/common";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { ok: false; error: string };

async function setCntStatus(cntId: number, newStatus: "2" | "3"): Promise<Result> {
  return withAdmin(["ops", "accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Guard: only pending (cntstatus='1') rows can be mutated. Mutating an
    // already-paid row from this surface would let an admin re-approve
    // (no-op) or re-reject (data corruption). Require manual undo via DB
    // or legacy PHP for those edge cases.
    const { data: cur, error: readErr } = await admin
      .from("tb_cnt")
      .select("id,cntstatus")
      .eq("id", cntId)
      .maybeSingle<{ id: number; cntstatus: string | null }>();
    if (readErr) return { ok: false, error: `Read failed: ${readErr.message}` };
    if (!cur) return { ok: false, error: `cnt #${cntId} not found` };
    if (cur.cntstatus !== "1") {
      return {
        ok: false,
        error: `cnt #${cntId} อยู่ในสถานะ ${cur.cntstatus} ไม่สามารถเปลี่ยนผ่านหน้านี้ได้ (รอเฉพาะ cntstatus='1' = รอตรวจ)`,
      };
    }

    const { error: updErr } = await admin
      .from("tb_cnt")
      .update({
        cntstatus: newStatus,
        adminidupdate: adminId,
        dateupdate: new Date().toISOString(),
      })
      .eq("id", cntId);
    if (updErr) return { ok: false, error: `Update failed: ${updErr.message}` };

    revalidatePath(`/admin/cnt-hs/${cntId}`);
    revalidatePath("/admin/cnt-hs");
    return { ok: true };
  });
}

export async function adminApproveCntHs(cntId: number): Promise<Result> {
  return setCntStatus(cntId, "2");
}

export async function adminRejectCntHs(cntId: number): Promise<Result> {
  return setCntStatus(cntId, "3");
}

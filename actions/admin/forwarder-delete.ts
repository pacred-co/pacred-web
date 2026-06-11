"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

/**
 * adminDeleteForwarder — the legacy `pcs-admin/forwarder/update` "ลบการสั่งซื้อถาวร"
 * button (include/pages/forwarder/deleteForwarder.php), as Pacred.
 *
 * 2026-06-10 (ปอน · owner "ลอกอันนี้มาเลย ข้อมูลตามจริง" — pasted the full legacy
 * update page incl. this button). Legacy contract (from the page JS):
 *   return 1 → deleted (redirect to the list)
 *   return 3 → "รายการดังกล่าวสำเร็จแล้ว ไม่สามารถยกเลิกออเดอร์ได้" (already shipping/done)
 *   else     → generic error
 *
 * GUARDS (destructive · permanent · prod money data):
 *   · roles: super / accounting / ops only (warehouse/driver CANNOT delete).
 *   · refuse when fstatus ≥ 6 (เตรียมส่ง · กำลังจัดส่ง · ส่งแล้ว) — the legacy "3"
 *     path: once an order is being shipped or is done it must not be wiped.
 *   · delete tb_forwarder_item children first (no orphans), then the header.
 *   · every delete is written to the admin action log (who · which order · status).
 */
const deleteForwarderSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type DeleteForwarderInput = z.infer<typeof deleteForwarderSchema>;

export async function adminDeleteForwarder(
  input: DeleteForwarderInput,
): Promise<AdminActionResult<{ id: number }>> {
  const parsed = deleteForwarderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { id } = parsed.data;

  return withAdmin<{ id: number }>(
    ["super", "accounting", "ops"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // Load the row — confirm it exists + read the status guard fields.
      const { data: row, error: rowErr } = await admin
        .from("tb_forwarder")
        .select("id, fstatus, userid, fidorco, reforder")
        .eq("id", id)
        .maybeSingle<{
          id: number; fstatus: string | null;
          userid: string | null; fidorco: string | null; reforder: string | null;
        }>();
      if (rowErr) return { ok: false, error: rowErr.message };
      if (!row) return { ok: false, error: "ไม่พบรายการนี้" };

      // Legacy "return 3": an order already in shipping/done cannot be deleted.
      const statusInt = parseInt(row.fstatus ?? "0", 10);
      if (Number.isFinite(statusInt) && statusInt >= 6) {
        return {
          ok: false,
          error: "รายการนี้อยู่ระหว่างจัดส่ง/สำเร็จแล้ว ไม่สามารถลบออเดอร์ได้",
        };
      }

      // Delete per-item children first (avoid FK orphans), then the header.
      const { error: itemErr } = await admin
        .from("tb_forwarder_item")
        .delete()
        .eq("fid", id);
      if (itemErr) return { ok: false, error: itemErr.message };

      const { error: delErr } = await admin
        .from("tb_forwarder")
        .delete()
        .eq("id", id);
      if (delErr) return { ok: false, error: delErr.message };

      await logAdminAction(adminId, "forwarder.delete", "tb_forwarder", String(id), {
        fstatus:  row.fstatus,
        userid:   row.userid,
        fidorco:  row.fidorco,
        reforder: row.reforder,
      });

      // Refresh the list + sidebar badge counts.
      bustAdminChrome();
      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${id}`);

      return { ok: true, data: { id } };
    },
  );
}

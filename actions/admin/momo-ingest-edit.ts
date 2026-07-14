"use server";

/**
 * MOMO ingest workspace — inline edit of a STAGING row (ภูม 2026-07-14 · เฟส A-2).
 *
 * owner/ภูม: MOMO บางทีส่งข้อมูลผิด (น้ำหนัก/คิว/จำนวน) → เจ้าหน้าที่ต้องแก้ให้ถูก
 * "ก่อนนำเข้าระบบ". This edits ONLY the momo_import_tracks staging columns
 * (weight_kg / cbm / quantity) — the SAME columns commitMomoRowCore values the
 * bill from — so the corrected value flows into tb_forwarder when the row is
 * later imported.
 *
 * 🔒 MONEY-SAFETY:
 *  - PENDING ONLY: the UPDATE folds `.is("committed_at", null)` into the WHERE.
 *    A committed row is already a billable tb_forwarder row (money frozen) — editing
 *    its staging twin would silently do nothing OR mislead. 0-row result → refuse.
 *  - bounded (zod) so a fat-finger can't write an absurd weight/cbm.
 *  - audit-logged (money-relevant edit). Gated ops/super/warehouse.
 *  - Writes ONLY the 3 measurement columns (never status / userid / any price /
 *    committed_* ). No re-price here — the price is derived at import time by the
 *    audited commit engine.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const schema = z.object({
  rowId: z.string().uuid("rowId ต้องเป็น uuid"),
  weightKg: z.number().min(0, "น้ำหนักต้อง ≥ 0").max(100_000, "น้ำหนักเกินพิสัย").optional(),
  cbm: z.number().min(0, "คิวต้อง ≥ 0").max(10_000, "คิวเกินพิสัย").optional(),
  quantity: z.number().int("จำนวนต้องเป็นจำนวนเต็ม").min(0).max(100_000, "จำนวนเกินพิสัย").optional(),
});

export async function updateMomoImportTrackFields(input: unknown): Promise<AdminActionResult<{ updated: boolean }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ updated: boolean }>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const patch: Record<string, number> = {};
    if (d.weightKg !== undefined) patch.weight_kg = d.weightKg;
    if (d.cbm !== undefined) patch.cbm = d.cbm;
    if (d.quantity !== undefined) patch.quantity = d.quantity;
    if (Object.keys(patch).length === 0) return { ok: true, data: { updated: false } };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("momo_import_tracks")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", d.rowId)
      .is("committed_at", null) // 🔒 pending only — never touch a committed (billed) row
      .select("id")
      .maybeSingle<{ id: string }>();
    if (error) {
      console.error("[updateMomoImportTrackFields] failed", { code: error.code, message: error.message });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    if (!data) return { ok: false, error: "แก้ไขไม่ได้ — แถวนี้เข้าระบบไปแล้ว หรือไม่พบรายการ" };

    await logAdminAction(adminId, "momo_ingest.edit_staging", "momo_import_tracks", d.rowId, patch);
    return { ok: true, data: { updated: true } };
  });
}

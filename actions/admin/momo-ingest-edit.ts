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
 *  - Writes ONLY measurement columns + tracking_override (never status / userid /
 *    any price / committed_* / momo_tracking_no). No re-price here — the price is
 *    derived at import time by the audited commit engine.
 *  - 2026-07-25 (owner เคส 733): + `tracking` → tracking_override (mig 0281) —
 *    เลขที่ถูกต้องจากรูปป้าย · momo_tracking_no ไม่ถูกแตะ (กุญแจ sync).
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { momoTrackingAnomaly } from "@/lib/admin/momo-live-discovery-plan";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

const schema = z.object({
  rowId: z.string().uuid("rowId ต้องเป็น uuid"),
  weightKg: z.number().min(0, "น้ำหนักต้อง ≥ 0").max(100_000, "น้ำหนักเกินพิสัย").optional(),
  cbm: z.number().min(0, "คิวต้อง ≥ 0").max(10_000, "คิวเกินพิสัย").optional(),
  quantity: z.number().int("จำนวนต้องเป็นจำนวนเต็ม").min(0).max(100_000, "จำนวนเกินพิสัย").optional(),
  // dims (ก×ย×ส) + PR live in the raw JSON (no dedicated columns) → patched into raw.
  width: z.number().min(0, "ขนาดต้อง ≥ 0").max(10_000, "ขนาดเกินพิสัย").optional(),
  length: z.number().min(0, "ขนาดต้อง ≥ 0").max(10_000, "ขนาดเกินพิสัย").optional(),
  height: z.number().min(0, "ขนาดต้อง ≥ 0").max(10_000, "ขนาดเกินพิสัย").optional(),
  memberCode: z.string().trim().max(20, "รหัสยาวเกินไป").optional(), // "" = เคลียร์ PR
  // เลขแทรคที่ถูกต้อง (owner เคส 733: MOMO คีย์ตกหล่น · รูปป้ายมีเลขเต็ม) — เขียนลง
  // tracking_override (mig 0281) เท่านั้น ห้ามแตะ momo_tracking_no (กุญแจ sync ของ MOMO
  // — rename แล้วรอบถัดไป sync จะปั๊มแถวเลขเก่ากลับมาเป็น dup). "" = เคลียร์กลับเลขเดิม
  tracking: z.string().trim().max(40, "เลขแทรคยาวเกินไป").optional(),
  // ── owner 2026-07-25 "ด่านนำเข้า แก้ได้ทุกคอลัมน์ — docs มีข้อมูลเพิ่ม เดี๋ยวกรอกเอง" ──
  // เก็บลง raw คีย์เดียวกับที่ MOMO ใช้/ที่ commit อ่าน → ของที่กรอกไหลเข้าแถวจริง ไม่ใช่แค่จอ
  smDate: z.string().trim().regex(/^\d{4}[-/]\d{2}[-/]\d{2}$/, "วันที่ต้องเป็น ปปปป-ดด-วว").or(z.literal("")).optional(),
  branch: z.string().trim().max(60, "ยาวเกินไป").optional(),
  productName: z.string().trim().max(300, "ยาวเกินไป").optional(),   // → fdetail ตอนนำเข้า
  remark: z.string().trim().max(500, "ยาวเกินไป").optional(),        // → fnote ตอนนำเข้า
  noteText: z.string().trim().max(500, "ยาวเกินไป").optional(),      // Note. (อ้างอิงบน staging)
  dum: z.string().trim().max(120, "ยาวเกินไป").optional(),
  cgNo: z.string().trim().max(40, "ยาวเกินไป").optional(),
  // ค่าตีลังไม้/ค่าใช้จ่ายเพิ่ม (extra_cost) — ไหลเข้า pricecrate ตอนนำเข้า (เงิน · bound + log)
  serviceFee: z.number().min(0, "ต้อง ≥ 0").max(1_000_000, "เกินพิสัย").optional(),
  // ประเภทสินค้า = เรทที่ใช้คิดเงิน — ตัวเลือกตายตัว 4 ค่า (กัน user error)
  productType: z.enum(["1", "2", "3", "4"]).optional(),
});

/** ประเภทสินค้าเรา → momo type string (ตัวแทน deterministic ของ map ขาไป). */
const PRODUCT_TYPE_TO_MOMO: Record<"1" | "2" | "3" | "4", string> = {
  "1": "general", "2": "tis", "3": "fda", "4": "special",
};

export async function updateMomoImportTrackFields(input: unknown): Promise<AdminActionResult<{ updated: boolean }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin<{ updated: boolean }>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = {};
    if (d.weightKg !== undefined) patch.weight_kg = d.weightKg;
    if (d.cbm !== undefined) patch.cbm = d.cbm;
    if (d.quantity !== undefined) patch.quantity = d.quantity;

    // ── แก้เลขแทรค (tracking_override · mig 0281) ──────────────────────────
    // ทำไมไม่แก้ momo_tracking_no: มันคือ conflict key ของ sync — MOMO ยังจำเลขเดิม
    // → rename แล้ว sync รอบถัดไปจะ insert เลขเดิมกลับมาเป็นแถวใหม่ (ปั๊ม dup).
    // เก็บเลขที่ถูกเป็น override → commit ใช้เลขนี้ · sync ยังไหลเข้าแถวเดิม ·
    // ตัวจับคู่บิล MOMO ตามหางานได้ทั้งเลขเก่า (ผ่าน pointer) และเลขใหม่.
    if (d.tracking !== undefined) {
      const next = d.tracking.trim().toUpperCase();
      if (next === "") {
        patch.tracking_override = null; // เคลียร์ — กลับไปใช้เลขเดิมจาก MOMO
      } else {
        if (!/^[A-Z0-9][A-Z0-9/-]*$/.test(next))
          return { ok: false, error: "เลขแทรคมีอักขระแปลก — ใช้ได้แค่ ตัวอักษร/ตัวเลข/ขีด" };
        const shape = momoTrackingAnomaly(next); // SOT เดียวกับป้ายเตือนบนตาราง
        if (shape) return { ok: false, error: `เลขที่แก้ยังผิดรูปอยู่ (${shape.label}) — เช็ครูปป้ายอีกครั้ง` };
        // เลขนี้เป็นแถวเก็บเงินในระบบแล้ว → ห้ามตั้งซ้ำ (จะกลายเป็นนำเข้าเบิ้ล)
        const { data: liveDup, error: dupErr } = await admin
          .from("tb_forwarder")
          .select("id, userid")
          .or(`ftrackingchn.eq.${next},ftrackingchn.like.${next.replace(/[%_]/g, "\\$&")}-%`)
          .limit(1)
          .maybeSingle<{ id: number; userid: string | null }>();
        if (dupErr) {
          console.error("[updateMomoImportTrackFields] dup check failed", { code: dupErr.code, message: dupErr.message });
          return { ok: false, error: `db_error:${dupErr.code ?? "unknown"}` };
        }
        if (liveDup)
          return {
            ok: false,
            error: `เลข ${next} มีในระบบแล้ว (#${liveDup.id} · ${liveDup.userid ?? "?"}) — ถ้าเป็นพัสดุเดียวกัน ไม่ต้องนำเข้าแถวนี้ซ้ำ`,
          };
        patch.tracking_override = next;
      }
    }

    // ── dims (ก×ย×ส) + PR (member_code) live in the raw JSON, not dedicated columns.
    //    Patching raw flows to the bill: commitMomoRowCore reads dims via
    //    extractMetricsFromMomoRaw(raw) → fwidth/flength/fheight, and the grid + bulk-import
    //    re-derive the PR from raw.user_group+user_code. Read-merge-write; the WRITE stays
    //    pending-only guarded (committed_at IS NULL · TOCTOU-safe). ───────────────────────
    const logDetail: Record<string, unknown> = { ...patch };
    const touchesRaw =
      d.width !== undefined || d.length !== undefined || d.height !== undefined || d.memberCode !== undefined ||
      d.smDate !== undefined || d.branch !== undefined || d.productName !== undefined ||
      d.remark !== undefined || d.noteText !== undefined || d.dum !== undefined ||
      d.cgNo !== undefined || d.serviceFee !== undefined || d.productType !== undefined;
    if (touchesRaw) {
      const { data: cur, error: selErr } = await admin
        .from("momo_import_tracks")
        .select("raw")
        .eq("id", d.rowId)
        .is("committed_at", null)
        .maybeSingle<{ raw: Record<string, unknown> | null }>();
      if (selErr) {
        console.error("[updateMomoImportTrackFields] raw read failed", { code: selErr.code, message: selErr.message });
        return { ok: false, error: `db_error:${selErr.code ?? "unknown"}` };
      }
      if (!cur) return { ok: false, error: "แก้ไขไม่ได้ — แถวนี้เข้าระบบไปแล้ว หรือไม่พบรายการ" };
      const raw = cur.raw && typeof cur.raw === "object" ? { ...(cur.raw as Record<string, unknown>) } : {};
      if (d.width !== undefined) { raw.width = d.width; logDetail.width = d.width; }
      if (d.length !== undefined) { raw.length = d.length; logDetail.length = d.length; }
      if (d.height !== undefined) { raw.height = d.height; logDetail.height = d.height; }
      // ── ช่องข้อมูลเพิ่มจาก docs (owner 2026-07-25) — คีย์เดียวกับที่ commit/จออ่าน ──
      if (d.smDate !== undefined) { raw.created_date = d.smDate; logDetail.smDate = d.smDate; }
      if (d.branch !== undefined) { raw.branch = d.branch; logDetail.branch = d.branch; }
      if (d.productName !== undefined) { raw.product_name = d.productName; logDetail.productName = d.productName; }
      if (d.remark !== undefined) { raw.remark = d.remark; logDetail.remark = d.remark; }
      if (d.noteText !== undefined) { raw.note = d.noteText; logDetail.noteText = d.noteText; }
      if (d.dum !== undefined) { raw.dum = d.dum; logDetail.dum = d.dum; }
      if (d.cgNo !== undefined) {
        raw.CG_NO = d.cgNo;
        patch.momo_cg_no = d.cgNo || null; // คอลัมน์จริงมีอยู่แล้ว — เขียนคู่กัน
        logDetail.cgNo = d.cgNo;
      }
      if (d.serviceFee !== undefined) { raw.extra_cost = d.serviceFee; logDetail.serviceFee = d.serviceFee; }
      if (d.productType !== undefined) {
        raw.type = PRODUCT_TYPE_TO_MOMO[d.productType]; // ผ่าน map เดิมกลับมาเป็น tier เดิมเป๊ะ
        logDetail.productType = d.productType;
      }
      if (d.memberCode !== undefined) {
        const mc = d.memberCode.trim().toUpperCase();
        if (mc === "") {
          raw.user_group = ""; raw.user_code = "";
          patch.momo_user_group = ""; patch.momo_user_code = "";
        } else {
          // deriveMomoMemberCode = prefix(letters) + code(digits) → parse the typed PR back.
          const m = mc.match(/^([A-Z]+)(\d+)$/);
          if (!m) return { ok: false, error: "รูปแบบ PR ต้องเป็นตัวอักษรตามด้วยตัวเลข เช่น PR545" };
          raw.user_group = m[1]; raw.user_code = m[2];
          patch.momo_user_group = m[1]; patch.momo_user_code = m[2];
        }
        logDetail.memberCode = mc;
      }
      patch.raw = raw;
    }

    if (Object.keys(patch).length === 0) return { ok: true, data: { updated: false } };

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

    await logAdminAction(adminId, "momo_ingest.edit_staging", "momo_import_tracks", d.rowId, logDetail);
    return { ok: true, data: { updated: true } };
  });
}

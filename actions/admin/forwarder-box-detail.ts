"use server";

/**
 * Admin > ฝากนำเข้า > แก้ขนาดกล่องรายกล่อง — server action for a SINGLE
 * tb_forwarder row whose tracking MOMO split into N different-size boxes
 * (momo_box_detail). (owner/ภูม 2026-07-02: "MOMO ส่งขนาดรายกล่องมามั่ว —
 * ให้พนักงานแก้เองได้ ไม่ต้องรอ packing list แต้ม")
 *
 * WHAT IT DOES
 * ────────────
 * A base tracking = 1 tb_forwarder row = 1 bill, but it can hold MANY boxes. The
 * per-box ก×ย×ส/น้ำหนัก live in momo_box_detail. Staff fix a box's size on the
 * forwarder detail; this action:
 *   1. UPSERTs each edited box into momo_box_detail (recompute each box's คิว from
 *      its own dims · box-detail.ts::upsertEditedBoxDetails).
 *   2. Recomputes the ONE tb_forwarder row's price BASIS from the Σ of the REAL
 *      boxes — fweight = Σ box weight (r2) · fvolume = Σ box คิว (r6) — EXCLUDING
 *      any MOMO หัวบิล (bare, no dims/weight/คิว) so the total never double-counts.
 *   3. Updates ONLY that ONE row's fweight/fvolume (numeric(14,6) since mig 0192).
 *
 * 💰 MONEY-SAFETY (critical — this changes the price basis):
 *   - ONE tb_forwarder row = ONE bill. It NEVER splits rows, creates siblings, or
 *     changes famount semantics. It writes ONLY momo_box_detail (upsert) + this
 *     row's fweight/fvolume. It NEVER touches billing/receipt/commission/rate/
 *     status/frefrate/ftotalprice.
 *   - The recompute equals Σ over the COUNTABLE boxes exactly (หัวบิล excluded).
 *   - It does NOT re-run the rate engine (frefrate/ftotalprice stay put) — the
 *     pricer sets the rate/price via the per-tracking editor's "บันทึก" flow; this
 *     is purely the physical measurement correction the price basis feeds off.
 *
 * @see lib/integrations/momo-web/box-detail.ts           — upsertEditedBoxDetails
 * @see lib/integrations/momo-web/box-detail-recompute.ts — rollupBoxes (pure Σ)
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { upsertEditedBoxDetails, type MomoBoxDetailEdit } from "@/lib/integrations/momo-web/box-detail";
import { rollupBoxes, type BoxDims } from "@/lib/integrations/momo-web/box-detail-recompute";
import { baseTracking } from "@/lib/admin/momo-bill-header";

// One edited box (as staff typed it). cm / kg / คิว / ชิ้น.
const boxSchema = z.object({
  boxTracking: z.string().trim().min(1).max(80),
  width: z.number().min(0).max(9999.99),
  length: z.number().min(0).max(9999.99),
  height: z.number().min(0).max(9999.99),
  weightKg: z.number().min(0).max(99999.99),
  /** per-piece คิว — used only when all dims are 0 (weight-only box). */
  cbm: z.number().min(0).max(9999.999999),
  quantity: z.number().int().min(1).max(99999),
});

const editBoxDetailsSchema = z.object({
  /** The base tracking these boxes belong to (the momo_box_detail JOIN key). */
  baseTracking: z.string().trim().min(1).max(80),
  /** The ONE tb_forwarder row id to recompute (numeric id — NOT a slug). */
  forwarderId: z.number().int().positive(),
  /** The edited boxes (at least one). */
  boxes: z.array(boxSchema).min(1).max(500),
});
export type AdminUpdateMomoBoxDetailsInput = z.infer<typeof editBoxDetailsSchema>;

export type AdminUpdateMomoBoxDetailsData = {
  /** boxes upserted into momo_box_detail. */
  boxesSaved: number;
  /** boxes that fed the Σ (หัวบิล excluded). */
  countableCount: number;
  /** the ONE row's recomputed น้ำหนักรวม (kg · r2). */
  fweight: number;
  /** the ONE row's recomputed คิวรวม (r6). */
  fvolume: number;
};

// Resolve the current admin's legacy id for the tb_forwarder.adminidupdate marker.
// tb_forwarder.adminidupdate is varchar(10) — HARD cap at 10 chars (learned the
// hard way: a longer marker → "error 21 · advanced 0" on prod).
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error(`[forwarder-box-detail: auth.getUser] failed`, { code: error.code, message: error.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) {
    console.error(`[forwarder-box-detail: tb_admin] failed`, { code: aErr.code, message: aErr.message });
  }
  if (data?.adminID) return data.adminID.slice(0, 10);
  return (email.split("@")[0] || "system").slice(0, 10);
}

/**
 * UPSERT staff-edited per-box dims + recompute the ONE tb_forwarder row's
 * fweight/fvolume from the Σ of the real boxes. Roles: super/ops/warehouse.
 */
export async function adminUpdateMomoBoxDetails(
  rawInput: AdminUpdateMomoBoxDetailsInput,
): Promise<AdminActionResult<AdminUpdateMomoBoxDetailsData>> {
  const parsed = editBoxDetailsSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<AdminUpdateMomoBoxDetailsData>(
    // Same role set as the dims editor (adminUpdateForwarderDimensions): the
    // warehouse/ops staff who key the physical measurements, + super.
    ["super", "ops", "warehouse"],
    async ({ adminId }) => {
      const admin = createAdminClient();

      // ── Resolve + verify the ONE tb_forwarder row (numeric id) ──
      // Confirm the row exists AND its base tracking matches the boxes' base — a
      // safety belt so a crafted id can't recompute an unrelated row.
      const { data: rowData, error: rowErr } = await admin
        .from("tb_forwarder")
        .select("id, ftrackingchn, fweight, fvolume, userid")
        .eq("id", d.forwarderId)
        .maybeSingle<{ id: number; ftrackingchn: string | null; fweight: number | string | null; fvolume: number | string | null; userid: string | null }>();
      if (rowErr) {
        console.error(`[adminUpdateMomoBoxDetails: tb_forwarder read] failed`, {
          code: rowErr.code, message: rowErr.message, id: d.forwarderId,
        });
        return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${rowErr.message}` };
      }
      if (!rowData) {
        return { ok: false, error: "ไม่พบรายการ (forwarderId ไม่ตรงกับ tb_forwarder)" };
      }
      const rowBase = baseTracking(rowData.ftrackingchn);
      const editBase = d.baseTracking.trim();
      if (rowBase && rowBase !== editBase) {
        return {
          ok: false,
          error: `เลขแทรคกิงไม่ตรงกับรายการ (row=${rowBase} · edit=${editBase})`,
        };
      }

      // ── 1) UPSERT the edited boxes into momo_box_detail ──
      const edits: MomoBoxDetailEdit[] = d.boxes.map((b) => ({
        boxTracking: b.boxTracking,
        width: b.width,
        length: b.length,
        height: b.height,
        weightKg: b.weightKg,
        cbm: b.cbm,
        quantity: b.quantity,
      }));
      const upsertRes = await upsertEditedBoxDetails(admin, editBase, edits);
      if (upsertRes.upserted === 0 && upsertRes.errors.length > 0) {
        return {
          ok: false,
          error: `บันทึกขนาดกล่องไม่สำเร็จ — ${upsertRes.errors[0].message}`,
        };
      }

      // ── 2) Recompute the ONE row's price basis from the Σ of the REAL boxes ──
      // fweight = Σ box weight · fvolume = Σ box คิว — หัวบิล excluded (rollupBoxes).
      const boxDims: BoxDims[] = d.boxes.map((b) => ({
        boxTracking: b.boxTracking,
        width: b.width,
        length: b.length,
        height: b.height,
        weightKg: b.weightKg,
        cbm: b.cbm,
        quantity: b.quantity,
      }));
      const rollup = rollupBoxes(boxDims);

      // ── 3) UPDATE ONLY this ONE row's fweight/fvolume (+ audit marker) ──
      const legacyAdminId = await resolveLegacyAdminId(); // ≤10 chars
      const nowIso = new Date().toISOString();
      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({
          fweight: rollup.fweight,
          fvolume: rollup.fvolume,
          adminidupdate: legacyAdminId,
          fdateadminstatus: nowIso,
        })
        .eq("id", d.forwarderId);
      if (updErr) {
        console.error(`[adminUpdateMomoBoxDetails: tb_forwarder update] failed`, {
          code: updErr.code, message: updErr.message, id: d.forwarderId,
        });
        return { ok: false, error: `อัปเดตน้ำหนัก/คิวรวมไม่สำเร็จ: ${updErr.message}` };
      }

      // ── Audit ──
      await logAdminAction(
        adminId,
        "tb_forwarder.update_momo_box_details",
        "tb_forwarder",
        String(d.forwarderId),
        {
          baseTracking: editBase,
          boxes_upserted: upsertRes.upserted,
          upsert_errors: upsertRes.errors.length > 0 ? upsertRes.errors : undefined,
          before: {
            fweight: Number(rowData.fweight ?? 0),
            fvolume: Number(rowData.fvolume ?? 0),
          },
          after: {
            fweight: rollup.fweight,
            fvolume: rollup.fvolume,
            countable_boxes: rollup.countableCount,
          },
        },
      );

      // ── Revalidate the detail surfaces (the editor lives on both slugs) ──
      revalidatePath(`/admin/forwarders/${d.forwarderId}`);
      if (rowData.ftrackingchn) {
        revalidatePath(`/admin/forwarders/${rowData.ftrackingchn}`);
      }
      revalidatePath("/admin/forwarders");

      return {
        ok: true,
        data: {
          boxesSaved: upsertRes.upserted,
          countableCount: rollup.countableCount,
          fweight: rollup.fweight,
          fvolume: rollup.fvolume,
        },
      };
    },
  );
}

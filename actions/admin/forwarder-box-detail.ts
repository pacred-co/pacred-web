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
 *   3. Writes fweight/fvolume + latches famountcount='1' (numeric(14,6) since mig
 *      0192) — because rollup.fvolume is a TOTAL (Σ over boxes), so the consumers'
 *      canonical rule (famountcount=='1' ? fvolume : fvolume×famount) MUST read it
 *      directly, never re-multiply by famount.
 *   4. Re-derives frefrate/frefprice/ftotalprice from the corrected basis.
 *
 * 💰 MONEY-SAFETY (critical — this changes the price basis):
 *   - ONE tb_forwarder row = ONE bill. It NEVER splits rows or creates siblings. It
 *     writes ONLY momo_box_detail (upsert) + this row's fweight/fvolume/famountcount
 *     + (via the rate engine) frefrate/frefprice/ftotalprice. NEVER billing/receipt/
 *     commission/status/wallet/userid.
 *   - The recompute equals Σ over the COUNTABLE boxes exactly (หัวบิล excluded).
 *   - ⚠️ THE DOUBLE-COUNT FIX: fvolume is stored as a TOTAL, so famountcount is
 *     forced to '1'. Without this latch, a row whose famountcount was NULL/≠'1'
 *     (mis-committed MOMO/drift rows) has every consumer apply fvolume×famount =
 *     an inflated basis (perbox×famount²) → a 189-million-baht bill.
 *   - 🔒 BILLED-ROW GUARD: a billed row (fstatus 5/6/7) has a frozen basis — the
 *     write is refused (fast-fail on load + re-asserted in the UPDATE WHERE to
 *     close the load→write TOCTOU).
 *   - The reprice never persists a silent ฿0 (leaves the rate columns untouched on
 *     a missing rate card) and is best-effort (a miss never fails the basis save).
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
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";

// A billed row's price basis is frozen — never re-measure fstatus 5/6/7
// (รอชำระ/เตรียมส่ง/ส่งแล้ว). Same set the แต้ม reconcile + MOMO propagate use.
const BILLED_FSTATUS = new Set(["5", "6", "7"]);

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
        .select("id, ftrackingchn, fweight, fvolume, userid, fstatus")
        .eq("id", d.forwarderId)
        .maybeSingle<{ id: number; ftrackingchn: string | null; fweight: number | string | null; fvolume: number | string | null; userid: string | null; fstatus: string | null }>();
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

      // 💰 Billed-row guard (fast-fail): a billed row (fstatus 5/6/7) has a frozen
      // price basis — never touch its fweight/fvolume/famountcount. Re-asserted
      // atomically in the UPDATE WHERE below to close the load→write TOCTOU.
      if (BILLED_FSTATUS.has(String(rowData.fstatus ?? "").trim())) {
        return {
          ok: false,
          error: "รายการนี้ออกบิลแล้ว (สถานะ 5/6/7) — ห้ามแก้น้ำหนัก/คิวรวม",
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
      // 💰 rollup.fvolume is the AGGREGATE คิว over the real boxes (a TOTAL), so we
      // MUST latch famountcount='1' alongside it — else every consumer applies the
      // canonical CBMProduct rule (famountcount=='1' ? fvolume : fvolume×famount)
      // and re-multiplies the already-total fvolume by famount = the double-count
      // bug (fvolume × 70 → a 189-million-baht bill). A row whose famountcount was
      // NULL/≠'1' with a total fvolume is exactly the mis-committed MOMO/drift case.
      // Same rule the แต้ม reconcile applies (actions/admin/taem-reconcile.ts:447-449).
      const legacyAdminId = await resolveLegacyAdminId(); // ≤10 chars
      const nowIso = new Date().toISOString();
      // TOCTOU + billed-safety: re-assert non-billed (fstatus ∉ {5,6,7}) in the
      // WHERE so a row that got billed between load and this UPDATE is NEVER
      // overwritten — the price basis of a billed row is frozen. (rowData was
      // verified non-billed above, but re-assert atomically here.)
      const { data: updated, error: updErr } = await admin
        .from("tb_forwarder")
        .update({
          fweight: rollup.fweight,
          fvolume: rollup.fvolume,
          // fvolume is now the TOTAL → force famountcount='1' (no re-multiply).
          famountcount: "1",
          adminidupdate: legacyAdminId,
          fdateadminstatus: nowIso,
        })
        .eq("id", d.forwarderId)
        .not("fstatus", "in", "(5,6,7)")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (updErr) {
        console.error(`[adminUpdateMomoBoxDetails: tb_forwarder update] failed`, {
          code: updErr.code, message: updErr.message, id: d.forwarderId,
        });
        return { ok: false, error: `อัปเดตน้ำหนัก/คิวรวมไม่สำเร็จ: ${updErr.message}` };
      }
      if (!updated) {
        // The row became billed (fstatus 5/6/7) between load and write — the guard
        // skipped it. The boxes were still saved to momo_box_detail, but a billed
        // row's price basis is frozen and must not change.
        return {
          ok: false,
          error: "รายการนี้ออกบิลแล้ว (สถานะ 5/6/7) — ห้ามแก้น้ำหนัก/คิวรวม",
        };
      }

      // ── 4) Re-derive the SELL price from the CORRECTED basis ──
      // The basis (fweight/fvolume/famountcount) just changed, so frefrate/
      // frefprice/ftotalprice — computed off the OLD (possibly double-counted)
      // basis — are now stale. Re-run the SAME rate engine the pricer + แต้ม
      // reconcile use so the row is money-consistent. Money-isolation: this writes
      // ONLY frefrate/frefprice/ftotalprice and NEVER persists a silent ฿0 (on a
      // missing rate card it leaves those columns untouched). Best-effort: a
      // reprice miss never fails the (already-committed) basis save.
      let repriced: { ok: boolean; wrote: boolean; reason: string; rate?: number; total?: number } | null = null;
      try {
        repriced = await computeAndFillForwarderImportRate(admin, d.forwarderId);
      } catch (e) {
        console.error(`[adminUpdateMomoBoxDetails: reprice] threw`, {
          id: d.forwarderId, message: e instanceof Error ? e.message : String(e),
        });
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
            famountcount: "1",
            countable_boxes: rollup.countableCount,
          },
          reprice: repriced
            ? { wrote: repriced.wrote, reason: repriced.reason, rate: repriced.rate, total: repriced.total }
            : { wrote: false, reason: "threw" },
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

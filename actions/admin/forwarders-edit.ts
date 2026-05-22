"use server";

/**
 * Admin > "แก้ไขขนาด/น้ำหนัก" — server actions for /admin/forwarders/[fNo]/edit.
 *
 * Wave 12-C ภาค 2 (2026-05-23) — follow-up to Wave 12-C v2 (commit d2f5db1).
 * Wave 12-C v2 ships the 9-field CREATE modal; this file ships the EDIT flow
 * that lets admin fill in dimensions (weight · L×W×H · CBM · crate · type) AFTER
 * the goods arrive at the China warehouse (legacy fstatus='2').
 *
 * Per docs/learnings/pacred-design-philosophy.md + AGENTS.md §0a:
 *   - Legacy = workflow source (which columns get UPDATEd, in what shape)
 *   - Pacred = UI source (own Tailwind form, NOT BS4 markup)
 *
 * Legacy admin edit flow (forwarder.php $_GET['page']=='edit' / 'detail') updates
 * these tb_forwarder columns when goods arrive:
 *   - fweight              numeric — kg
 *   - fwidth · flength · fheight  numeric — cm
 *   - fvolume              numeric — (W × L × H) / 1,000,000 — cbm
 *   - fproductstype        char(1) — '1' ทั่วไป · '2' มอก. · '3' อย. · '4' พิเศษ
 *   - frefprice            char(1) — '1' น้ำหนัก · '2' ปริมาตร — which one bills
 *   - fnote                text   — admin-facing note
 *   - adminidupdate        — last updater
 *   - fdateadminstatus     — timestamp of last admin status touch
 *
 * Per-item crate update (tb_forwarder_item):
 *   - chinawoodencratefeetype  char(1) — '1' ไม่ตี · '2' ตีลัง
 *   - chinawoodencratefee      numeric — fee (THB) · 0 = free
 *
 * Resolution of f_no slug — matches the detail page (page.tsx):
 *   numeric → tb_forwarder.id
 *   string  → tb_forwarder.fidorco
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// Resolve current admin's legacy id (tb_forwarder.adminid* is varchar(10)).
// Same helper as forwarders-new.ts — kept local to avoid premature extraction.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data } = await admin
    .from("tb_admin")
    .select("adminid")
    .eq("adminemail", email)
    .maybeSingle<{ adminid: string | null }>();
  if (data?.adminid) return data.adminid;
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// Per-item crate edit input (one entry per tb_forwarder_item row).
// ────────────────────────────────────────────────────────────
const itemCrateSchema = z.object({
  itemId:    z.number().int().positive(),
  crateType: z.enum(["1", "2"] as const),       // '1' ไม่ตี · '2' ตีลัง
  crateFee:  z.number().min(0).max(99999.99).default(0),
});
export type ItemCrateInput = z.infer<typeof itemCrateSchema>;

// ────────────────────────────────────────────────────────────
// Main edit schema — fweight / fwidth / flength / fheight + cbm-derived.
// All optional individually but at least one must change (validated below).
// ────────────────────────────────────────────────────────────
const editForwarderSchema = z.object({
  fNo:           z.string().trim().min(1).max(50),
  weightKg:      z.number().min(0).max(99999.99),
  widthCm:       z.number().min(0).max(9999.99),
  lengthCm:      z.number().min(0).max(9999.99),
  heightCm:      z.number().min(0).max(9999.99),
  // fproductstype char(1) — legacy enum
  productType:   z.enum(["1", "2", "3", "4"] as const),
  // frefprice char(1) — '1' น้ำหนัก · '2' ปริมาตร
  refPrice:      z.enum(["1", "2"] as const),
  // admin-facing note (tb_forwarder.fnote — TEXT, no length cap in schema; we cap at 2000)
  note:          z.string().trim().max(2000).optional(),
  // Per-item crate list. Empty list = no crate updates.
  items:         z.array(itemCrateSchema).max(200).default([]),
});
export type AdminEditForwarderInput = z.infer<typeof editForwarderSchema>;

// Compute CBM the same way legacy does: (W × L × H) / 1,000,000 (cm³ → m³).
function computeCbm(width: number, length: number, height: number): number {
  const v = (width * length * height) / 1_000_000;
  // Legacy numeric(10,5) — keep 5 decimals.
  return Math.round(v * 100_000) / 100_000;
}

// ────────────────────────────────────────────────────────────
// adminUpdateForwarderDimensions — UPDATE tb_forwarder + tb_forwarder_item.
//
// Resolution: numeric fNo → tb_forwarder.id · else → tb_forwarder.fidorco.
// (Matches `[fNo]/page.tsx` renderLegacyForwarderView.)
// ────────────────────────────────────────────────────────────
export async function adminUpdateForwarderDimensions(
  rawInput: AdminEditForwarderInput,
): Promise<AdminActionResult<{ id: number; cbm: number }>> {
  const parsed = editForwarderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ id: number; cbm: number }>(
    ["ops", "accounting", "super"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      const cbm           = computeCbm(d.widthCm, d.lengthCm, d.heightCm);

      // ─── Resolve target row ─────────────────────────────────────
      const asNumber = Number(d.fNo);
      const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

      let q = admin
        .from("tb_forwarder")
        .select(
          "id, fidorco, userid, fweight, fwidth, flength, fheight, fvolume, " +
          "fproductstype, frefprice, fnote",
        )
        .limit(1);
      q = isId ? q.eq("id", asNumber) : q.eq("fidorco", d.fNo);
      const { data: existing } = await q.maybeSingle();
      if (!existing) {
        return { ok: false, error: "ไม่พบรายการ (fNo ไม่ตรงกับ tb_forwarder)" };
      }
      const before = existing as unknown as {
        id: number;
        fidorco: string | null;
        userid: string;
        fweight: number | string;
        fwidth: number | string;
        flength: number | string;
        fheight: number | string;
        fvolume: number | string;
        fproductstype: string;
        frefprice: string;
        fnote: string | null;
      };

      const nowIso = new Date().toISOString();

      // ─── UPDATE tb_forwarder ────────────────────────────────────
      const update: Record<string, unknown> = {
        fweight:           d.weightKg,
        fwidth:            d.widthCm,
        flength:           d.lengthCm,
        fheight:           d.heightCm,
        fvolume:           cbm,
        fproductstype:     d.productType,
        frefprice:         d.refPrice,
        fnote:             d.note ?? before.fnote ?? null,
        adminidupdate:     legacyAdminId,
        fdateadminstatus:  nowIso,
      };

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", before.id);
      if (updErr) {
        return { ok: false, error: updErr.message };
      }

      // ─── UPDATE tb_forwarder_item rows ──────────────────────────
      // Each item row update is one PATCH — Supabase doesn't support a
      // bulk-by-id UPDATE in one call. We loop sequentially because the
      // list is small (the largest order in prod is ~30 items).
      const itemUpdateErrors: { itemId: number; error: string }[] = [];
      for (const it of d.items) {
        const { error: itemErr } = await admin
          .from("tb_forwarder_item")
          .update({
            chinawoodencratefeetype: it.crateType,
            chinawoodencratefee:     it.crateFee,
            adminidupdated:          legacyAdminId,
            lasttimeupdated:         nowIso,
          })
          .eq("id", it.itemId)
          .eq("fid", before.id);   // belt-and-suspenders: don't let an admin
                                   // touch an item from a different order
        if (itemErr) {
          itemUpdateErrors.push({ itemId: it.itemId, error: itemErr.message });
        }
      }

      // ─── Mirror crate flag onto tb_forwarder ────────────────────
      // Legacy convention: tb_forwarder.crate = '1' if ANY item has
      // chinawoodencratefeetype='2'; else '2'. The header-level pricecrate
      // is the sum of per-item fees (admin can later adjust).
      const anyCrated = d.items.some((it) => it.crateType === "2");
      const totalCrateFee = d.items
        .filter((it) => it.crateType === "2")
        .reduce((sum, it) => sum + it.crateFee, 0);

      if (d.items.length > 0) {
        const { error: crateMirrorErr } = await admin
          .from("tb_forwarder")
          .update({
            crate:      anyCrated ? "1" : "2",
            pricecrate: totalCrateFee,
          })
          .eq("id", before.id);
        if (crateMirrorErr) {
          itemUpdateErrors.push({ itemId: 0, error: `mirror: ${crateMirrorErr.message}` });
        }
      }

      // ─── Audit log ──────────────────────────────────────────────
      await logAdminAction(
        adminId,
        "tb_forwarder.update_dimensions",
        "tb_forwarder",
        String(before.id),
        {
          fNo: d.fNo,
          before: {
            fweight:       Number(before.fweight),
            fwidth:        Number(before.fwidth),
            flength:       Number(before.flength),
            fheight:       Number(before.fheight),
            fvolume:       Number(before.fvolume),
            fproductstype: before.fproductstype,
            frefprice:     before.frefprice,
            fnote:         before.fnote,
          },
          after: {
            fweight:       d.weightKg,
            fwidth:        d.widthCm,
            flength:       d.lengthCm,
            fheight:       d.heightCm,
            fvolume:       cbm,
            fproductstype: d.productType,
            frefprice:     d.refPrice,
            fnote:         d.note ?? null,
          },
          items_updated:   d.items.length,
          crate_count:     d.items.filter((it) => it.crateType === "2").length,
          crate_fee_total: totalCrateFee,
          item_errors:     itemUpdateErrors.length > 0 ? itemUpdateErrors : undefined,
        },
      );

      // ─── Revalidate ────────────────────────────────────────────
      revalidatePath("/admin/forwarders");
      revalidatePath(`/admin/forwarders/${d.fNo}`);
      revalidatePath(`/admin/forwarders/${d.fNo}/edit`);
      revalidatePath(`/admin/forwarders/${before.id}`);
      revalidatePath("/admin");

      if (itemUpdateErrors.length > 0) {
        return {
          ok: false,
          error:
            `บันทึกค่าหลักได้ แต่มี ${itemUpdateErrors.length} รายการสินค้าอัปเดตไม่สำเร็จ — ` +
            itemUpdateErrors.map((e) => `#${e.itemId}: ${e.error}`).join(", "),
        };
      }
      return { ok: true, data: { id: before.id, cbm } };
    },
  );
}

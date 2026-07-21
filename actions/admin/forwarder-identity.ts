"use server";

/**
 * Forwarder IDENTITY edits + family reset-from-source (owner 2026-07-21).
 *
 * Owner: "ทำให้ ช่อง เลขเทรคกิ้ง เลขชิปเม้น จำนวนกล่อง สามารถแก้ไขและบันทึกได้ ...
 * มีปุ่ม reset ค่าเริ่มต้น เผื่อพนักงานลั่น แก้จนพัง ... ดึงจาก momo live มาเลย
 * แต่ถ้ามีแพคกิ้งลิสก็ให้เชื่อแพคกิ้งลิส".
 *
 * Two actions:
 *   • adminRenameForwarderTracking — rename ONE row's ftrackingchn (the per-row
 *     tracking / the shipment base rename is composed client-side as N per-row
 *     renames so base + suffix semantics stay in ONE place). Guards: unbilled
 *     only (fstatus ≤ 5) · global dup-check (another live row already holding
 *     the tracking refuses — the same identity the MOMO commit dedups on).
 *   • adminResetForwarderFamilyFromSource — re-pull the family's quantities
 *     (กล่อง/น้ำหนัก/คิว/ขนาด) from the SOURCE data. Packing list wins when the
 *     container has an uploaded packing snapshot carrying this base; otherwise
 *     MOMO Live (momo_box_detail via the audited pass-6 reconcile brain +
 *     staging exact rows for single-box families). Writes are UNBILLED-only
 *     (fstatus ∈ 1-4 folded into the UPDATE WHERE — TOCTOU-safe) and re-price
 *     through the proven engine (computeAndFillForwarderImportRate — never a
 *     silent ฿0, never clobbers a manual rate).
 *
 * จำนวนกล่อง (famount) is NOT here — it rides the main dims save
 * (adminUpdateForwarderDimensions.boxCount) so the re-price runs on the
 * corrected count in the same transaction-shaped save.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import type { AdminRole } from "@/lib/auth/require-admin";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import { reconcileMomoBoxDetailRows } from "@/lib/integrations/momo-web/box-detail-reconcile";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";

const IDENTITY_ROLES: AdminRole[] = ["ops", "accounting", "super", "warehouse"];

/** fstatus codes an identity/reset write MAY touch — everything before billing.
 *  (5 = รอชำระเงิน is allowed for the RENAME only — fixing a wrong tracking on a
 *  yet-unpaid bill is exactly when staff need it; value RESETS stop at 4.) */
const RENAME_FSTATUS = ["1", "2", "3", "4", "5"];
const RESET_FSTATUS = ["1", "2", "3", "4"];

function num(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) console.error(`[forwarder-identity auth]`, { code: error.code, message: error.message });
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error: aErr } = await admin
    .from("tb_admin").select("adminID").eq("adminEmail", email).limit(1)
    .maybeSingle<{ adminID: string | null }>();
  if (aErr) console.error(`[forwarder-identity tb_admin]`, { code: aErr.code, message: aErr.message });
  if (data?.adminID) return data.adminID.slice(0, 10);
  return (email.split("@")[0] || "system").slice(0, 10);
}

// ────────────────────────────────────────────────────────────
// adminRenameForwarderTracking
// ────────────────────────────────────────────────────────────
const renameSchema = z.object({
  fid: z.number().int().positive(),
  newTracking: z
    .string()
    .trim()
    .min(3, "เลขแทรคกิ้งสั้นเกินไป")
    .max(50, "เลขแทรคกิ้งยาวเกิน 50 ตัวอักษร")
    .regex(/^[A-Za-z0-9\-\/._]+$/, "เลขแทรคกิ้งมีอักขระไม่ถูกต้อง (ใช้ตัวอักษร/ตัวเลข/-/. เท่านั้น)"),
});
export type AdminRenameForwarderTrackingInput = z.infer<typeof renameSchema>;

export async function adminRenameForwarderTracking(
  rawInput: unknown,
): Promise<AdminActionResult<{ fid: number; from: string; to: string }>> {
  const parsed = renameSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(IDENTITY_ROLES, async ({ adminId }) => {
    const admin = createAdminClient();
    const { data: row, error: rowErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, userid")
      .eq("id", d.fid)
      .maybeSingle<{ id: number; ftrackingchn: string | null; fstatus: string | null; userid: string | null }>();
    if (rowErr) {
      console.error(`[adminRenameForwarderTracking read]`, { code: rowErr.code, message: rowErr.message, fid: d.fid });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${rowErr.message}` };
    }
    if (!row) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };

    const from = (row.ftrackingchn ?? "").trim();
    const to = d.newTracking;
    if (from === to) return { ok: false, error: "เลขแทรคกิ้งเดิมอยู่แล้ว — ไม่มีการเปลี่ยนแปลง" };
    if (!RENAME_FSTATUS.includes(String(row.fstatus ?? "").trim())) {
      return {
        ok: false,
        error: `แถวนี้อยู่สถานะ ${row.fstatus} (เก็บเงิน/จัดส่งแล้ว) — เปลี่ยนเลขแทรคกิ้งไม่ได้ ให้บัญชีดำเนินการ`,
      };
    }

    // ── Global dup-guard — the same identity the MOMO commit dedups on. A live
    // (non-cancelled) row already holding this tracking = a different shipment;
    // renaming onto it would merge two customers' parcels. Refuse loudly.
    const { data: dup, error: dupErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fstatus")
      .eq("ftrackingchn", to)
      .neq("id", d.fid)
      .neq("fstatus", "99")
      .limit(1)
      .maybeSingle<{ id: number; userid: string | null; fstatus: string | null }>();
    if (dupErr) {
      console.error(`[adminRenameForwarderTracking dup]`, { code: dupErr.code, message: dupErr.message, to });
      return { ok: false, error: `ตรวจซ้ำไม่สำเร็จ: ${dupErr.message}` };
    }
    if (dup) {
      return {
        ok: false,
        error: `เลขแทรคกิ้ง ${to} มีอยู่แล้วในระบบ (#${dup.id} · ${dup.userid ?? "?"}) — ห้ามซ้ำ`,
      };
    }

    const legacyAdminId = await resolveLegacyAdminId();
    // TOCTOU-safe: the fstatus gate is folded into the WHERE — a race into
    // billing makes this update 0 rows instead of renaming a billed row.
    const { data: updated, error: updErr } = await admin
      .from("tb_forwarder")
      .update({ ftrackingchn: to, adminidupdate: legacyAdminId })
      .eq("id", d.fid)
      .in("fstatus", RENAME_FSTATUS)
      .select("id");
    if (updErr) {
      console.error(`[adminRenameForwarderTracking update]`, { code: updErr.code, message: updErr.message, fid: d.fid });
      return { ok: false, error: `บันทึกไม่สำเร็จ: ${updErr.message}` };
    }
    if (!updated || updated.length === 0) {
      return { ok: false, error: "แถวเปลี่ยนสถานะไปแล้วระหว่างแก้ไข — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
    }

    await logAdminAction(adminId, "tb_forwarder.rename_tracking", "tb_forwarder", String(d.fid), {
      before: { ftrackingchn: from },
      after: { ftrackingchn: to },
      userid: row.userid,
    });
    revalidatePath(`/admin/forwarders/${d.fid}`);
    revalidatePath("/admin/forwarders");
    return { ok: true, data: { fid: d.fid, from, to } };
  });
}

// ────────────────────────────────────────────────────────────
// adminResetForwarderFamilyFromSource
// ────────────────────────────────────────────────────────────
export type ResetFamilyResult = {
  source: "packing" | "momo_live" | "none";
  base: string;
  /** rows whose quantities were written back to the source values */
  updated: number;
  /** rows re-priced after the value write (via the proven engine) */
  repriced: number;
  /** rows skipped because they're at/past billing (fstatus ≥ 5) */
  skippedBilled: number;
  warnings: string[];
};

const resetSchema = z.object({ fid: z.number().int().positive() });

type FamRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  famount: number | string | null;
  famountcount: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fcabinetnumber: string | null;
};

export async function adminResetForwarderFamilyFromSource(
  rawInput: unknown,
): Promise<AdminActionResult<ResetFamilyResult>> {
  const parsed = resetSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;

  return withAdmin(IDENTITY_ROLES, async ({ adminId }) => {
    const admin = createAdminClient();
    const warnings: string[] = [];

    // ── 1. Anchor row → family (exact base + userid, mirrors the editor fetch) ──
    const { data: anchor, error: anchorErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, userid")
      .eq("id", d.fid)
      .maybeSingle<{ id: number; ftrackingchn: string | null; userid: string | null }>();
    if (anchorErr) {
      console.error(`[resetFamilyFromSource anchor]`, { code: anchorErr.code, message: anchorErr.message, fid: d.fid });
      return { ok: false, error: `อ่านรายการไม่สำเร็จ: ${anchorErr.message}` };
    }
    if (!anchor) return { ok: false, error: "ไม่พบรายการฝากนำเข้า" };
    const base = baseTracking(anchor.ftrackingchn);
    if (!base || !anchor.userid) return { ok: false, error: "แถวนี้ไม่มีเลขแทรคกิ้ง/ลูกค้า — reset ไม่ได้" };

    const { data: famData, error: famErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, famount, famountcount, fweight, fvolume, fcabinetnumber")
      .eq("userid", anchor.userid)
      .ilike("ftrackingchn", `${base}%`)
      .limit(200);
    if (famErr) {
      console.error(`[resetFamilyFromSource family]`, { code: famErr.code, message: famErr.message, base });
      return { ok: false, error: `อ่านครอบครัวชิปเม้นไม่สำเร็จ: ${famErr.message}` };
    }
    const family = ((famData ?? []) as unknown as FamRow[]).filter(
      (r) => baseTracking(r.ftrackingchn) === base,
    );
    if (family.length === 0) return { ok: false, error: "ไม่พบแถวของชิปเม้นนี้" };

    const resettable = family.filter((r) => RESET_FSTATUS.includes(String(r.fstatus ?? "").trim()));
    const skippedBilled = family.length - resettable.length;
    if (resettable.length === 0) {
      return { ok: false, error: "ทุกแถวของชิปเม้นนี้อยู่คิวเก็บเงิน/บิลแล้ว — reset ไม่ได้ (ให้บัญชีดำเนินการ)" };
    }

    const legacyAdminId = await resolveLegacyAdminId();
    let updated = 0;
    let repriced = 0;
    let source: ResetFamilyResult["source"] = "none";

    // ── 2. PACKING LIST first (owner: "ถ้ามีแพคกิ้งลิสก็ให้เชื่อแพคกิ้งลิส") ──
    // The uploaded snapshot stores ONE aggregated row per base — authoritative for
    // a single-row family. A multi-row (split) family can't be distributed from an
    // aggregate → fall to MOMO Live per-box truth and Σ-verify against packing.
    type SnapRow = {
      baseTracking?: string; boxes?: number | null; weight?: number | null; cbm?: number | null;
      width?: number | null; length?: number | null; height?: number | null;
    };
    let packRow: SnapRow | null = null;
    const cabs = Array.from(
      new Set(family.map((r) => (r.fcabinetnumber ?? "").trim()).filter((s) => s !== "")),
    );
    if (cabs.length > 0) {
      const { data: ups, error: upErr } = await admin
        .from("momo_packing_upload")
        .select("id, container_no, parsed_snapshot, uploaded_at")
        .in("container_no", cabs)
        .order("uploaded_at", { ascending: false })
        .limit(5);
      if (upErr) {
        console.error(`[resetFamilyFromSource packing lookup]`, { code: upErr.code, message: upErr.message, cabs });
        warnings.push("อ่านประวัติแพคกิ้งลิสไม่สำเร็จ — ใช้ MOMO Live แทน");
      } else {
        for (const up of (ups ?? []) as { parsed_snapshot: { rows?: SnapRow[] } | null }[]) {
          const hit = (up.parsed_snapshot?.rows ?? []).find((r) => (r.baseTracking ?? "") === base);
          if (hit) { packRow = hit; break; }
        }
      }
    }

    if (packRow && resettable.length === 1 && family.length === 1) {
      // Single-row family + packing row → packing is the truth, write it verbatim.
      const target = resettable[0];
      const upd: Record<string, unknown> = {
        famount: Math.max(Math.round(packRow.boxes ?? 1), 1),
        famountcount: "1", // packing values are ROW TOTALS (quantities.ts convention)
        fweight: num(packRow.weight),
        fvolume: num(packRow.cbm),
        adminidupdate: legacyAdminId,
      };
      if (num(packRow.width) > 0) upd.fwidth = num(packRow.width);
      if (num(packRow.length) > 0) upd.flength = num(packRow.length);
      if (num(packRow.height) > 0) upd.fheight = num(packRow.height);
      const { data: w, error: wErr } = await admin
        .from("tb_forwarder")
        .update(upd)
        .eq("id", target.id)
        .in("fstatus", RESET_FSTATUS)
        .select("id");
      if (wErr) {
        console.error(`[resetFamilyFromSource packing write]`, { code: wErr.code, message: wErr.message, id: target.id });
        return { ok: false, error: `เขียนค่าแพคกิ้งลิสไม่สำเร็จ: ${wErr.message}` };
      }
      if (w && w.length > 0) {
        updated += 1;
        source = "packing";
        const rp = await computeAndFillForwarderImportRate(admin, target.id);
        if (rp.wrote) repriced += 1;
        else if (rp.reason === "rate_missing") {
          warnings.push("re-price ไม่ได้ — ไม่มีเรทลูกค้า (ตั้งเรทที่โปรไฟล์ลูกค้า แล้วกดบันทึกในฟอร์ม)");
        }
      }
    } else {
      // ── 3. MOMO Live — the audited pass-6 reconcile brain converges every
      // multi-box family to momo_box_detail (unbilled-only · corroborated ·
      // never zeroes a priced anchor · re-prices through the engine itself). ──
      const rec = await reconcileMomoBoxDetailRows(admin, [base]);
      updated += rec.detailFixed + rec.baresZeroed + rec.countFixed;
      repriced += rec.repriced;
      if (rec.detailFixed + rec.baresZeroed + rec.countFixed > 0) source = "momo_live";
      for (const e of rec.errors) warnings.push(`${e.scope}: ${e.message}`);
      for (const [kind, n] of Object.entries(rec.reviews)) {
        if ((n ?? 0) > 0) warnings.push(`ต้องตรวจมือ ${n} จุด (${kind}) — MOMO Live กับข้อมูลจริงไม่ corroborate`);
      }

      // Single-box / rows the reconcile didn't cover → direct fill from the MOMO
      // staging exact row (weight_kg/cbm/quantity are ROW TOTALS) + dims from
      // momo_box_detail. Fill only when the source actually carries a value.
      const exactTrackings = resettable.map((r) => (r.ftrackingchn ?? "").trim()).filter(Boolean);
      const { data: stg, error: stgErr } = await admin
        .from("momo_import_tracks")
        .select("momo_tracking_no, quantity, weight_kg, cbm")
        .in("momo_tracking_no", exactTrackings);
      if (stgErr) {
        console.error(`[resetFamilyFromSource staging]`, { code: stgErr.code, message: stgErr.message, base });
      }
      const { data: boxes, error: boxErr } = await admin
        .from("momo_box_detail")
        .select("box_tracking, width, length, height")
        .eq("base_tracking", base);
      if (boxErr) {
        console.error(`[resetFamilyFromSource box dims]`, { code: boxErr.code, message: boxErr.message, base });
      }
      const stgByTrack = new Map(
        ((stg ?? []) as { momo_tracking_no: string | null; quantity: number | null; weight_kg: number | string | null; cbm: number | string | null }[])
          .map((s) => [(s.momo_tracking_no ?? "").trim(), s] as const),
      );
      const dimsByTrack = new Map(
        ((boxes ?? []) as { box_tracking: string | null; width: number | string | null; length: number | string | null; height: number | string | null }[])
          .map((b) => [(b.box_tracking ?? "").trim(), b] as const),
      );
      if (rec.detailFixed + rec.baresZeroed === 0) {
        for (const r of resettable) {
          const track = (r.ftrackingchn ?? "").trim();
          const s = stgByTrack.get(track);
          if (!s) continue;
          const sw = num(s.weight_kg);
          const sv = num(s.cbm);
          if (sw <= 0 && sv <= 0) continue; // source carries nothing — never zero a row
          const same =
            Math.abs(num(r.fweight) - sw) < 0.005 &&
            Math.abs(num(r.fvolume) - sv) < 0.000005 &&
            num(r.famount) === (s.quantity ?? num(r.famount)) &&
            String(r.famountcount ?? "").trim() === "1";
          if (same) continue; // already at source values — no-op
          const upd: Record<string, unknown> = {
            fweight: sw,
            fvolume: sv,
            famountcount: "1",
            adminidupdate: legacyAdminId,
          };
          if ((s.quantity ?? 0) > 0) upd.famount = s.quantity;
          const dims = dimsByTrack.get(track);
          if (dims) {
            if (num(dims.width) > 0) upd.fwidth = num(dims.width);
            if (num(dims.length) > 0) upd.flength = num(dims.length);
            if (num(dims.height) > 0) upd.fheight = num(dims.height);
          }
          const { data: w, error: wErr } = await admin
            .from("tb_forwarder")
            .update(upd)
            .eq("id", r.id)
            .in("fstatus", RESET_FSTATUS)
            .select("id");
          if (wErr) {
            console.error(`[resetFamilyFromSource direct write]`, { code: wErr.code, message: wErr.message, id: r.id });
            warnings.push(`#${r.id}: เขียนไม่สำเร็จ (${wErr.message})`);
            continue;
          }
          if (w && w.length > 0) {
            updated += 1;
            source = "momo_live";
            const rp = await computeAndFillForwarderImportRate(admin, r.id);
            if (rp.wrote) repriced += 1;
          }
        }
      }

      // Packing existed but couldn't be applied per-row (split family) — Σ-verify
      // so a MOMO-vs-packing drift is loud, not silent.
      if (packRow) {
        const { data: after, error: afterErr } = await admin
          .from("tb_forwarder")
          .select("ftrackingchn, fweight, userid")
          .eq("userid", anchor.userid)
          .ilike("ftrackingchn", `${base}%`)
          .limit(200);
        // §0c — a silent read failure here would make the Σ-verify compare against
        // an empty set and emit a FALSE "ไม่ตรงแพคกิ้งลิส" warning. Surface it as an
        // explicit "ตรวจ Σ ไม่ได้" note instead of fabricating a drift.
        if (afterErr) {
          console.error(`[resetFamilyFromSource Σ-verify]`, {
            code: afterErr.code, message: afterErr.message, base,
          });
          warnings.push("ตรวจ Σ น้ำหนักเทียบแพคกิ้งลิสไม่สำเร็จ — อ่านข้อมูลหลัง reset ไม่ได้");
        }
        const sumW = ((after ?? []) as { ftrackingchn: string | null; fweight: number | string | null }[])
          .filter((r) => baseTracking(r.ftrackingchn) === base)
          .reduce((s, r) => s + num(r.fweight), 0);
        const packW = num(packRow.weight);
        // afterErr → sumW is 0 from an EMPTY read, not from a real drift; don't
        // fabricate a mismatch warning on top of the read-failure note above.
        if (!afterErr && packW > 0 && Math.abs(sumW - packW) > Math.max(0.5, packW * 0.02)) {
          warnings.push(
            `Σ น้ำหนักหลัง reset (${sumW.toFixed(2)} kg) ไม่ตรงแพคกิ้งลิส (${packW.toFixed(2)} kg) — ตรวจมือ/อัพแพคกิ้งลิสซ้ำ`,
          );
        }
      }
    }

    if (updated === 0 && source === "none") {
      return {
        ok: false,
        error:
          "ไม่มีข้อมูลต้นทางให้ดึง (ไม่พบในแพคกิ้งลิส/MOMO Live) หรือค่าตรงต้นทางอยู่แล้ว — ไม่มีการเปลี่ยนแปลง" +
          (warnings.length > 0 ? ` · ${warnings[0]}` : ""),
      };
    }

    await logAdminAction(adminId, "tb_forwarder.reset_family_from_source", "tb_forwarder", String(d.fid), {
      base, source, updated, repriced, skippedBilled, warnings,
    });
    revalidatePath(`/admin/forwarders/${d.fid}`);
    revalidatePath("/admin/forwarders");
    return { ok: true, data: { source, base, updated, repriced, skippedBilled, warnings } };
  });
}

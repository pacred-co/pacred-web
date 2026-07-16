"use server";

/**
 * Admin > อี้อู > "packing list" (upload-2) — MONEY-FREE reconcile (2026-07-16 · ภูม · Phase 3).
 *
 * After the ใบส่งของ (upload-1) created the box-split arrival rows at "ถึงโกดังจีน", staff
 * upload the packing list our own warehouse produced. It carries the real GZS container +
 * the 单号 list. This reconcile matches each base 单号 to the upload-1 siblings and ONLY:
 *   - assigns the container to rows whose cabinet is EMPTY (never overwrites), and
 *   - advances fstatus 1/2 → 3 ("กำลังส่งมาไทย"), never a billed row, never a demote.
 *
 * It writes NO basis (fweight/fvolume) and does NO reprice — the price/weight came from
 * upload-1. That is the whole safety story (see lib/admin/yiwu-packing-match.ts): a stray
 * or cross-customer match can at worst touch a guarded cabinet/status, never mis-compute
 * money, because no money is computed. The pure planner (+ its unit test) carries the
 * exact-base filter + the userid-consistency guard; this action just does the guarded DB
 * writes + re-guards each WHERE (TOCTOU).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseYiwuPackingXlsx } from "@/lib/admin/yiwu-packing-xlsx-parser";
import { planYiwuReconcile, type YiwuSibling } from "@/lib/admin/yiwu-packing-match";
import { bustAdminChrome } from "@/lib/cache/revalidate-chrome";

const YIWU_ROLES = ["super", "ops", "warehouse", "accounting"] as const;

function escapeLike(base: string): string {
  return base.replace(/[%_,\\]/g, "\\$&");
}
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type YiwuBaseResult = {
  base: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  userid?: string;
  matched?: number;
  cabinetAssigned: number;
  advanced: number;
};
export type YiwuReconcileSummary = {
  container: string | null;
  results: YiwuBaseResult[];
  basesTotal: number;
  assigned: number; // rows that got the container
  advanced: number; // rows advanced 1/2 → 3
  skipped: number;  // bases not written (unmatched / cross-customer / read error)
  applied: boolean; // false = preview
};

/**
 * Parse the packing xlsx + plan/optionally-apply the money-free writes. Does NOT open its
 * own auth — the caller (withAdmin) gates it + supplies adminId.
 */
async function reconcileYiwuImpl(
  fileBuf: Buffer,
  apply: boolean,
  adminId: string,
): Promise<AdminActionResult<YiwuReconcileSummary>> {
  const parse = parseYiwuPackingXlsx(fileBuf);
  if (!parse.aggregated.length) {
    return { ok: false, error: parse.warnings[0] ?? "อ่านไฟล์ packing list (อี้อู) ไม่สำเร็จ — ตรวจรูปแบบไฟล์" };
  }
  const container = (parse.container ?? "").trim();
  const admin = createAdminClient();
  const today = todayIsoDate();

  const results: YiwuBaseResult[] = [];
  let assigned = 0, advanced = 0, skipped = 0;

  for (const agg of parse.aggregated) {
    const base = (agg.baseTracking ?? "").trim();
    if (!base) continue;

    const escBase = escapeLike(base);
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fcabinetnumber, userid")
      .or(`ftrackingchn.eq.${base},ftrackingchn.like.${escBase}-%`)
      .limit(200);
    if (error) {
      console.error("[yiwu-reconcile read] failed", { base, code: error.code, message: error.message });
      results.push({ base, ok: false, skipped: true, reason: `อ่านไม่สำเร็จ: ${error.message}`, cabinetAssigned: 0, advanced: 0 });
      skipped++;
      continue;
    }

    const plan = planYiwuReconcile(base, container, (data ?? []) as YiwuSibling[]);
    if (!plan.ok) {
      results.push({ base, ok: false, skipped: true, reason: plan.reason, cabinetAssigned: 0, advanced: 0 });
      skipped++;
      continue;
    }

    if (apply) {
      // (a) assign container — re-guard EMPTY cabinet (create writes ""); never overwrite.
      if (plan.assignCabinetFids.length > 0 && container) {
        const { error: e1 } = await admin
          .from("tb_forwarder")
          .update({ fcabinetnumber: container, fdatecontainerclose: today })
          .in("id", plan.assignCabinetFids)
          .eq("fcabinetnumber", "");
        if (e1) console.error("[yiwu-reconcile cabinet] failed", { base, message: e1.message });
      }
      // (b) advance 1/2 → 3 — re-guard early fstatus; never demote a billed/advanced row.
      if (plan.advanceFids.length > 0) {
        const { error: e2 } = await admin
          .from("tb_forwarder")
          .update({ fstatus: "3", fdatestatus3: today })
          .in("id", plan.advanceFids)
          .in("fstatus", ["1", "2"]);
        if (e2) console.error("[yiwu-reconcile advance] failed", { base, message: e2.message });
      }
    }

    assigned += plan.assignCabinetFids.length;
    advanced += plan.advanceFids.length;
    results.push({
      base, ok: true, userid: plan.userid, matched: plan.matched,
      cabinetAssigned: plan.assignCabinetFids.length, advanced: plan.advanceFids.length,
    });
  }

  if (apply) {
    await logAdminAction(adminId, "forwarder.yiwu_packing.reconcile", "tb_forwarder", container || "-", {
      container, bases: results.length, assigned, advanced, skipped, warehouse: "yiwu",
    });
    try { bustAdminChrome(); } catch (e) { console.error("[yiwu-reconcile bustAdminChrome] best-effort", e); }
  }

  return {
    ok: true,
    data: { container: parse.container, results, basesTotal: results.length, assigned, advanced, skipped, applied: apply },
  };
}

async function fileBufOf(formData: FormData): Promise<{ ok: true; buf: Buffer } | { ok: false; error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "กรุณาเลือกไฟล์ packing list (.xlsx)" };
  return { ok: true, buf: Buffer.from(await file.arrayBuffer()) };
}

/** PREVIEW — parse + plan, write NOTHING. Shows exactly what apply would do. */
export async function previewYiwuPacking(formData: FormData): Promise<AdminActionResult<YiwuReconcileSummary>> {
  return withAdmin<YiwuReconcileSummary>([...YIWU_ROLES], async ({ adminId }) => {
    const chk = await fileBufOf(formData);
    if (!chk.ok) return { ok: false, error: chk.error };
    return reconcileYiwuImpl(chk.buf, false, adminId);
  });
}

/** APPLY — assign container + advance status (money-free · guarded). */
export async function applyYiwuPacking(formData: FormData): Promise<AdminActionResult<YiwuReconcileSummary>> {
  return withAdmin<YiwuReconcileSummary>([...YIWU_ROLES], async ({ adminId }) => {
    const chk = await fileBufOf(formData);
    if (!chk.ok) return { ok: false, error: chk.error };
    return reconcileYiwuImpl(chk.buf, true, adminId);
  });
}

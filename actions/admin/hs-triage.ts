"use server";

// ════════════════════════════════════════════════════════════════════
// GAP 5 (+owner 2026-06-12 enhancement) — CS HS-triage queue.
//
// The ground-truth cargo flow: CS asks the China warehouse → enters the พิกัด
// (HS-8 + รหัสสถิติ-3) → THEN Pricing costs the order. This surface lets CS/sales
// assign the พิกัด FIRST, over the per-line items (tb_forwarder_item import +
// tb_order shop · นำเข้า & ส่งออก). The Pricing cost editor + cargo ใบขน already
// read tb_*.hs_code, so the value flows straight through.
//
// Owner enhancement: (a) show ALL lines (not only the missing ones) so CS can see
// duplicates and give them the SAME พิกัด; (b) BULK-assign — multi-select N lines
// → one พิกัด at once ("สินค้ารายการ 1,2,3,5… → พิกัด 3926.90.99"); (c) capture the
// 3-digit รหัสสถิติ (stat) too (mig 0181 · "ส่วนใหญ่ 000/001/090").
//
// ⚠️ ISOLATION (§0e/§0f): writes ONLY hs_code + hs_stat_code (mig 0158/0181).
// NEVER the selling price, cost, declared value, status, comms. CS-gated
// (super/sales/sales_admin/ops). The คลัง HS duty/stat lookup is reference-only.
// ════════════════════════════════════════════════════════════════════

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import type { AdminRole } from "@/lib/auth/require-admin";

// CS / sales lane — mirrors cargo-taxdoc-workspace ROLES_CS.
const ROLES_CS: AdminRole[] = ["super", "sales", "sales_admin", "ops"];

export type HsTriageForwarderLine = {
  id: number;
  fid: number | null;
  fNo: string | null;        // tb_forwarder.fidorco (the order ref CS knows)
  productname: string | null;
  customer: string | null;   // tb_forwarder.userid
  hsCode: string | null;
  statCode: string | null;
};
export type HsTriageShopLine = {
  id: number;
  hno: string | null;
  ctitle: string | null;
  hsCode: string | null;
  statCode: string | null;
};

// Lines with NO พิกัด yet (hs_code null OR empty).
const EMPTY_HS = "hs_code.is.null,hs_code.eq.";
// Escape PostgREST ilike wildcards/commas so a search term stays literal.
const escLike = (s: string) => s.replace(/[%_,()]/g, (m) => `\\${m}`);

/**
 * The triage queue. Shows ALL lines by default (owner: "โชว์หมดทุกบรรทัด" — so CS
 * can spot duplicates and bulk-assign the same พิกัด); `missingOnly` narrows to
 * lines still lacking a พิกัด; `search` filters by product name. Bounded
 * (newest-first) so it stays workable.
 */
export async function listHsTriage(opts?: {
  search?: string;
  missingOnly?: boolean;
  limit?: number;
}): Promise<AdminActionResult<{ forwarderLines: HsTriageForwarderLine[]; shopLines: HsTriageShopLine[] }>> {
  const search = (opts?.search ?? "").trim();
  const missingOnly = opts?.missingOnly ?? false;
  const cap = Math.min(Math.max(1, opts?.limit ?? 150), 400);

  return withAdmin([...ROLES_CS], async () => {
    const admin = createAdminClient();

    let fwdQ = admin
      .from("tb_forwarder_item")
      .select("id, fid, productname, hs_code, hs_stat_code")
      .order("id", { ascending: false })
      .limit(cap);
    if (missingOnly) fwdQ = fwdQ.or(EMPTY_HS);
    if (search) fwdQ = fwdQ.ilike("productname", `%${escLike(search)}%`);
    const { data: fwdRaw, error: fwdErr } = await fwdQ;
    if (fwdErr) {
      console.error("[listHsTriage tb_forwarder_item]", { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    const fwdItems = (fwdRaw ?? []) as {
      id: number; fid: number | null; productname: string | null;
      hs_code: string | null; hs_stat_code: string | null;
    }[];

    // Resolve the parent forwarders (fidorco + customer) for context, one round-trip.
    const fids = [...new Set(fwdItems.map((i) => i.fid).filter((v): v is number => v != null))];
    const fwdMap = new Map<number, { fidorco: string | null; userid: string | null }>();
    if (fids.length > 0) {
      const { data: fwdRows, error: fErr } = await admin
        .from("tb_forwarder")
        .select("id, fidorco, userid")
        .in("id", fids);
      if (fErr) console.error("[listHsTriage tb_forwarder]", { code: fErr.code, message: fErr.message });
      for (const r of (fwdRows ?? []) as { id: number; fidorco: string | null; userid: string | null }[]) {
        fwdMap.set(r.id, { fidorco: r.fidorco, userid: r.userid });
      }
    }
    const forwarderLines: HsTriageForwarderLine[] = fwdItems.map((i) => ({
      id: i.id,
      fid: i.fid,
      fNo: i.fid != null ? (fwdMap.get(i.fid)?.fidorco ?? String(i.fid)) : null,
      productname: i.productname,
      customer: i.fid != null ? (fwdMap.get(i.fid)?.userid ?? null) : null,
      hsCode: i.hs_code,
      statCode: i.hs_stat_code,
    }));

    let shopQ = admin
      .from("tb_order")
      .select("id, hno, ctitle, hs_code, hs_stat_code")
      .order("id", { ascending: false })
      .limit(cap);
    if (missingOnly) shopQ = shopQ.or(EMPTY_HS);
    if (search) shopQ = shopQ.ilike("ctitle", `%${escLike(search)}%`);
    const { data: shopRaw, error: shopErr } = await shopQ;
    if (shopErr) {
      console.error("[listHsTriage tb_order]", { code: shopErr.code, message: shopErr.message });
      return { ok: false, error: `db_error:${shopErr.code ?? "unknown"}` };
    }
    const shopLines = ((shopRaw ?? []) as {
      id: number; hno: string | null; ctitle: string | null;
      hs_code: string | null; hs_stat_code: string | null;
    }[]).map((r) => ({
      id: r.id, hno: r.hno, ctitle: r.ctitle, hsCode: r.hs_code, statCode: r.hs_stat_code,
    }));

    return { ok: true, data: { forwarderLines, shopLines } };
  });
}

// HS code (or "" to clear) + optional 3-digit รหัสสถิติ. Reference-only strings.
const hsCodeField = z.preprocess(
  (v) => (v === undefined || v === null ? "" : v),
  z.string().trim().max(40),
);
const statField = z.preprocess(
  (v) => (v === undefined || v === null ? "" : v),
  z.string().trim().max(10),
);

const setHsSchema = z.object({
  kind: z.enum(["forwarder", "shop"]),
  id: z.coerce.number().int().positive(),
  hsCode: hsCodeField,
  statCode: statField.optional(),
});

function tableFor(kind: "forwarder" | "shop") {
  return kind === "forwarder" ? "tb_forwarder_item" : "tb_order";
}

/**
 * CS sets the พิกัด (HS + รหัสสถิติ) on a single line. Writes ONLY hs_code +
 * hs_stat_code (§0e). The Pricing cost editor + cargo ใบขน read these downstream.
 */
export async function setLineHsCode(
  input: { kind: "forwarder" | "shop"; id: number | string; hsCode: string; statCode?: string },
): Promise<AdminActionResult<void>> {
  const parsed = setHsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const hs = d.hsCode === "" ? null : d.hsCode;
  const stat = (d.statCode ?? "") === "" ? null : d.statCode;

  return withAdmin([...ROLES_CS], async ({ adminId }) => {
    const admin = createAdminClient();
    const table = tableFor(d.kind);
    const { error } = await admin.from(table).update({ hs_code: hs, hs_stat_code: stat }).eq("id", d.id);
    if (error) {
      console.error(`[setLineHsCode ${table}]`, { code: error.code, message: error.message, id: d.id });
      return { ok: false, error: `บันทึก พิกัด ไม่สำเร็จ: ${error.message}` };
    }
    await logAdminAction(adminId, `${table}.set_hs_code`, table, String(d.id), { hs_code: hs, hs_stat_code: stat });
    revalidatePath("/admin/accounting/hs-triage");
    revalidatePath("/admin/forwarders");
    revalidatePath("/admin/service-orders");
    return { ok: true, data: undefined };
  });
}

const bulkSchema = z.object({
  // Up to 400 selected lines, each {kind,id}. Mixed forwarder+shop allowed.
  items: z
    .array(z.object({ kind: z.enum(["forwarder", "shop"]), id: z.coerce.number().int().positive() }))
    .min(1)
    .max(400),
  hsCode: hsCodeField,
  statCode: statField.optional(),
});

/**
 * BULK-assign one พิกัด (HS + รหัสสถิติ) to many selected lines at once (owner:
 * "ทำระบบตัวเลือก แล้วเพิ่มเข้าพิกัดนี้ได้เลย"). Groups by table, ≤2 UPDATEs.
 * Writes ONLY hs_code + hs_stat_code (§0e). hsCode "" clears all selected.
 */
export async function setBulkHsCode(
  input: { items: { kind: "forwarder" | "shop"; id: number | string }[]; hsCode: string; statCode?: string },
): Promise<AdminActionResult<{ updated: number }>> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const hs = d.hsCode === "" ? null : d.hsCode;
  const stat = (d.statCode ?? "") === "" ? null : d.statCode;

  const fwdIds = d.items.filter((i) => i.kind === "forwarder").map((i) => i.id);
  const shopIds = d.items.filter((i) => i.kind === "shop").map((i) => i.id);

  return withAdmin([...ROLES_CS], async ({ adminId }) => {
    const admin = createAdminClient();
    let updated = 0;

    for (const [table, ids] of [["tb_forwarder_item", fwdIds], ["tb_order", shopIds]] as const) {
      if (ids.length === 0) continue;
      const { error, count } = await admin
        .from(table)
        .update({ hs_code: hs, hs_stat_code: stat }, { count: "exact" })
        .in("id", ids);
      if (error) {
        console.error(`[setBulkHsCode ${table}]`, { code: error.code, message: error.message, n: ids.length });
        return { ok: false, error: `บันทึกพิกัดแบบกลุ่มไม่สำเร็จ (${table}): ${error.message}` };
      }
      updated += count ?? ids.length;
      await logAdminAction(adminId, `${table}.bulk_set_hs_code`, table, ids.join(","), {
        hs_code: hs, hs_stat_code: stat, n: ids.length,
      });
    }

    revalidatePath("/admin/accounting/hs-triage");
    revalidatePath("/admin/forwarders");
    revalidatePath("/admin/service-orders");
    return { ok: true, data: { updated } };
  });
}

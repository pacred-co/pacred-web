"use server";

// ════════════════════════════════════════════════════════════════════
// GAP 5 — CS HS-triage queue (owner 2026-06-12: a dedicated CS คิวงานรวม).
//
// The ground-truth cargo flow: CS asks the China warehouse → enters the HS code
// → THEN Pricing costs the order. Today HS lived only in the Pricing-gated cost
// editor. This surface lets CS/sales enter the HS code FIRST, on a queue of the
// per-line items (tb_forwarder_item + tb_order) that have no HS yet. The Pricing
// cost editor already reads tb_*.hs_code, so the CS-entered value flows straight
// through (no extra wiring).
//
// ⚠️ ISOLATION (§0e/§0f): writes ONLY the per-line hs_code column (mig 0158).
// NEVER the selling price, cost, declared value, status, comms. CS-gated
// (super/sales/sales_admin/ops) — a different gate from the cost editor's
// super/accounting/pricing. The คลัง HS duty lookup is reference-only.
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
};
export type HsTriageShopLine = {
  id: number;
  hno: string | null;
  ctitle: string | null;
};

const EMPTY_HS = "hs_code.is.null,hs_code.eq.";

/**
 * The triage queue: per-line items with NO HS code yet. Forwarder lines join
 * their parent forwarder for the order ref + customer; shop lines carry hno
 * directly. Bounded (most-recent first) so the queue stays workable.
 */
export async function listHsTriage(
  limit = 100,
): Promise<AdminActionResult<{ forwarderLines: HsTriageForwarderLine[]; shopLines: HsTriageShopLine[] }>> {
  return withAdmin([...ROLES_CS], async () => {
    const admin = createAdminClient();
    const cap = Math.min(Math.max(1, limit), 300);

    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder_item")
      .select("id, fid, productname")
      .or(EMPTY_HS)
      .order("id", { ascending: false })
      .limit(cap);
    if (fwdErr) {
      console.error("[listHsTriage tb_forwarder_item]", { code: fwdErr.code, message: fwdErr.message });
      return { ok: false, error: `db_error:${fwdErr.code ?? "unknown"}` };
    }
    const fwdItems = (fwdRaw ?? []) as { id: number; fid: number | null; productname: string | null }[];

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
    }));

    const { data: shopRaw, error: shopErr } = await admin
      .from("tb_order")
      .select("id, hno, ctitle")
      .or(EMPTY_HS)
      .order("id", { ascending: false })
      .limit(cap);
    if (shopErr) {
      console.error("[listHsTriage tb_order]", { code: shopErr.code, message: shopErr.message });
      return { ok: false, error: `db_error:${shopErr.code ?? "unknown"}` };
    }
    const shopLines = ((shopRaw ?? []) as HsTriageShopLine[]);

    return { ok: true, data: { forwarderLines, shopLines } };
  });
}

const setHsSchema = z.object({
  kind: z.enum(["forwarder", "shop"]),
  id: z.coerce.number().int().positive(),
  // HS code (or "" to clear). Reference-only string — Docs/Pricing acts on it later.
  hsCode: z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z.string().trim().max(40),
  ),
});

/**
 * CS sets the HS code on a single line. Writes ONLY hs_code (§0e). The Pricing
 * cost editor + the cargo declaration read this column downstream.
 */
export async function setLineHsCode(
  input: { kind: "forwarder" | "shop"; id: number | string; hsCode: string },
): Promise<AdminActionResult<void>> {
  const parsed = setHsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const d = parsed.data;
  const hs = d.hsCode === "" ? null : d.hsCode;

  return withAdmin([...ROLES_CS], async ({ adminId }) => {
    const admin = createAdminClient();
    const table = d.kind === "forwarder" ? "tb_forwarder_item" : "tb_order";
    const { error } = await admin.from(table).update({ hs_code: hs }).eq("id", d.id);
    if (error) {
      console.error(`[setLineHsCode ${table}]`, { code: error.code, message: error.message, id: d.id });
      return { ok: false, error: `บันทึก HS ไม่สำเร็จ: ${error.message}` };
    }
    await logAdminAction(adminId, `${table}.set_hs_code`, table, String(d.id), { hs_code: hs });
    revalidatePath("/admin/accounting/hs-triage");
    revalidatePath("/admin/forwarders");
    revalidatePath("/admin/service-orders");
    return { ok: true, data: undefined };
  });
}

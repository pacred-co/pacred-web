"use server";

/**
 * MOMO supplier-invoice → cost ingestion.
 *
 * Sets tb_forwarder.fcosttotalprice from the ACTUAL MOMO (ฮุย ไท่ต๋า) bill: paste
 * the invoice text → match each line's tracking to a forwarder row → PREVIEW the
 * cost deltas → apply. The invoice's per-line "รวม (Total)" is the real cost (more
 * exact than the 2,500/CBM default — some lines are 4,700 or 0.00/149.00).
 *
 * Money-safety: gated to cost-roles (ultra/accounting/pricing · canViewCostProfit,
 * NOT super), preview-before-apply, apply RE-DERIVES from the same text server-side
 * (never trusts a client-passed cost), writes ONLY fcosttotalprice (+fprofittotal=0
 * so reports re-derive), skips PAID containers (their cost is locked — use the
 * paid-container cost editor), idempotent, and logged.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRoles } from "@/lib/auth/require-admin";
import { canViewCostProfit, COST_PROFIT_ROLES } from "@/lib/admin/money-visibility";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseMomoInvoiceText } from "@/lib/admin/momo-invoice-parser";

const ingestSchema = z.object({ text: z.string().min(10).max(200_000) });

async function assertCanEditCost(): Promise<string | null> {
  const roles = await getAdminRoles();
  if (!canViewCostProfit(roles)) return "ไม่มีสิทธิ์แก้ไขต้นทุน (เฉพาะ ultra / accounting / pricing)";
  return null;
}

export type MomoIngestPreviewRow = {
  tracking: string;
  invoiceCost: number;
  unitPrice: number;
  cbm: number;
  qty: number;
  totalMismatch: boolean;
  matched: boolean;
  fid: number | null;
  fcabinetnumber: string | null;
  userid: string | null;
  currentCost: number | null;
  cabinetPaid: boolean;
  willApply: boolean;
};

export type MomoIngestPreview = {
  invoiceNo: string | null;
  grandTotal: number | null;
  rows: MomoIngestPreviewRow[];
  summary: { total: number; matched: number; willApply: number; unmatched: number; paidSkipped: number };
};

async function buildPreview(text: string): Promise<MomoIngestPreview> {
  const parsed = parseMomoInvoiceText(text);
  const admin = createAdminClient();
  const trackings = Array.from(new Set(parsed.lines.map((l) => l.tracking)));

  // Match forwarder rows by exact tracking.
  const fByTracking = new Map<string, { id: number; fcabinetnumber: string | null; userid: string | null; fcosttotalprice: number }>();
  if (trackings.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fcabinetnumber, userid, fcosttotalprice")
      .in("ftrackingchn", trackings);
    if (error) console.error(`[momo-ingest match] failed`, { code: error.code, message: error.message });
    for (const r of (data ?? []) as Array<{ id: number; ftrackingchn: string | null; fcabinetnumber: string | null; userid: string | null; fcosttotalprice: number | string | null }>) {
      // first match per tracking wins (invoice trackings are 1:1 incl -N splits)
      if (r.ftrackingchn && !fByTracking.has(r.ftrackingchn)) {
        fByTracking.set(r.ftrackingchn, { id: r.id, fcabinetnumber: r.fcabinetnumber, userid: r.userid, fcosttotalprice: Number(r.fcosttotalprice ?? 0) });
      }
    }
  }

  // Which matched cabinets are PAID (tb_cnt_item present) → skip those.
  const cabs = Array.from(new Set(Array.from(fByTracking.values()).map((v) => v.fcabinetnumber).filter((c): c is string => !!c)));
  const paidCabs = new Set<string>();
  if (cabs.length > 0) {
    const { data: paid, error } = await admin.from("tb_cnt_item").select("fCabinetNumber").in("fCabinetNumber", cabs);
    if (error) console.error(`[momo-ingest paid] failed`, { code: error.code, message: error.message });
    for (const r of (paid ?? []) as Array<{ fCabinetNumber: string | null }>) if (r.fCabinetNumber) paidCabs.add(r.fCabinetNumber);
  }

  const rows: MomoIngestPreviewRow[] = parsed.lines.map((l) => {
    const f = fByTracking.get(l.tracking) ?? null;
    const cabinetPaid = f?.fcabinetnumber ? paidCabs.has(f.fcabinetnumber) : false;
    const currentCost = f ? f.fcosttotalprice : null;
    const willApply = !!f && !cabinetPaid && Math.abs((currentCost ?? 0) - l.lineTotal) > 0.005;
    return {
      tracking: l.tracking,
      invoiceCost: l.lineTotal,
      unitPrice: l.unitPrice,
      cbm: l.cbm,
      qty: l.qty,
      totalMismatch: l.totalMismatch,
      matched: !!f,
      fid: f?.id ?? null,
      fcabinetnumber: f?.fcabinetnumber ?? null,
      userid: f?.userid ?? null,
      currentCost,
      cabinetPaid,
      willApply,
    };
  });

  return {
    invoiceNo: parsed.invoiceNo,
    grandTotal: parsed.grandTotal,
    rows,
    summary: {
      total: rows.length,
      matched: rows.filter((r) => r.matched).length,
      willApply: rows.filter((r) => r.willApply).length,
      unmatched: rows.filter((r) => !r.matched).length,
      paidSkipped: rows.filter((r) => r.matched && r.cabinetPaid).length,
    },
  };
}

/** Read-only preview — parse + match + compute deltas. No writes. */
export async function previewMomoInvoiceCost(input: unknown): Promise<AdminActionResult<MomoIngestPreview>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin([...COST_PROFIT_ROLES], async () => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };
    return { ok: true, data: await buildPreview(parsed.data.text) };
  });
}

/** Apply — re-derives from the SAME text server-side, writes fcosttotalprice on the
 *  willApply rows (matched · unpaid · cost differs). Idempotent + logged. */
export async function applyMomoInvoiceCost(input: unknown): Promise<AdminActionResult<{ applied: number; skipped: number; invoiceNo: string | null }>> {
  const parsed = ingestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin([...COST_PROFIT_ROLES], async ({ adminId }) => {
    const denied = await assertCanEditCost();
    if (denied) return { ok: false, error: denied };

    const preview = await buildPreview(parsed.data.text);
    const admin = createAdminClient();
    let applied = 0;
    for (const r of preview.rows) {
      if (!r.willApply || r.fid == null) continue;
      const { error } = await admin
        .from("tb_forwarder")
        .update({ fcosttotalprice: r.invoiceCost, fprofittotal: 0 })
        .eq("id", r.fid)
        .neq("fcosttotalprice", r.invoiceCost); // optimistic — skip if already set
      if (error) {
        console.error(`[momo-ingest apply] fid ${r.fid}`, { code: error.code, message: error.message });
        continue;
      }
      applied += 1;
    }
    await logAdminAction(adminId, "momo_invoice.ingest_cost", "tb_forwarder", preview.invoiceNo ?? "", {
      invoiceNo: preview.invoiceNo,
      applied,
      candidates: preview.summary.willApply,
      unmatched: preview.summary.unmatched,
    });
    return { ok: true, data: { applied, skipped: preview.summary.total - applied, invoiceNo: preview.invoiceNo } };
  });
}

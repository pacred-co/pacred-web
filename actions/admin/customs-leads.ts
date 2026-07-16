"use server";

/**
 * Customs-declaration importer LEADS — the sales call queue (owner 2026-07-16).
 *
 * ลูกค้าที่ใช้ใบขน (จาก NetBay export · customs_importer_lead) — เซลโทรตามมาเปิด
 * ใบขนกับเรา. เจ้าที่มีในระบบแล้ว (is_existing · matched by นิติ tax id) มีเบอร์+เซล
 * ให้เลย; เจ้าใหม่ เซลหาเบอร์ต่อ. This file = list + the call-workflow mutation.
 *
 * RBAC: super/sales/ops (the sales team works the queue). Reads/writes go through
 * the service-role client (the tables are RLS-locked · migration 0256).
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { z } from "zod";

const ROLES = ["super", "sales", "sales_admin", "ops"] as const;

const LEAD_STATUSES = ["new", "called", "interested", "converted", "not_interested", "our_own"] as const;
export type CustomsLeadStatus = (typeof LEAD_STATUSES)[number];

const updateSchema = z.object({
  taxId: z.string().trim().min(1),
  status: z.enum(LEAD_STATUSES).optional(),
  callNote: z.string().trim().max(2000).optional(),
  assignedSale: z.string().trim().max(64).optional(),
});
export type UpdateCustomsLeadInput = z.infer<typeof updateSchema>;

/**
 * Update a customs importer lead's sales-workflow fields (status / note / assignee).
 * Stamps called_at when the status first moves off 'new'. Preserves the ใบขน data.
 */
export async function updateCustomsImporterLead(
  input: UpdateCustomsLeadInput,
): Promise<AdminActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  const { taxId, status, callNote, assignedSale } = parsed.data;

  return withAdmin([...ROLES], async ({ adminId }) => {
    const admin = createAdminClient();

    const patch: Record<string, unknown> = { updated_by: adminId, updated_at: new Date().toISOString() };
    if (status !== undefined) {
      patch.lead_status = status;
      // stamp the first call time when it leaves 'new'
      if (status !== "new") patch.called_at = new Date().toISOString();
    }
    if (callNote !== undefined) patch.call_note = callNote || null;
    if (assignedSale !== undefined) patch.assigned_sale = assignedSale || null;

    const { data, error } = await admin
      .from("customs_importer_lead")
      .update(patch)
      .eq("tax_id", taxId)
      .select("tax_id")
      .maybeSingle<{ tax_id: string }>();
    if (error) {
      console.error("[updateCustomsImporterLead] failed", { code: error.code, message: error.message, taxId });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    if (!data) return { ok: false, error: "not_found" };

    await logAdminAction(adminId, "customs_lead.update", "customs_importer_lead", taxId, {
      status: status ?? null, assignedSale: assignedSale ?? null,
    });
    revalidatePath("/admin/customs-leads");
    return { ok: true };
  });
}

export type CustomsDeclarationRow = {
  ref_no: string;
  transport: string;
  recv_date: string | null;
  cif_total_baht: number | string | null;
  total_tax: number | string | null;
  vessel_name: string | null;
  release_port: string | null;
  discharge_port: string | null;
  supplier_name: string | null;
  supplier_country: string | null;
  agent_name_th: string | null;
  lines: Array<{ tariff_hs?: string; desc_en?: string; desc_th?: string; duty_rate?: string; duty_amt?: string; vat_amt?: string; cif_thb_line?: string }>;
};

/** All ใบขน for one importer (the drill-down) — newest first. */
export async function getCustomsImporterDeclarations(
  taxId: string,
): Promise<AdminActionResult<CustomsDeclarationRow[]>> {
  const tax = (taxId ?? "").trim();
  if (!tax) return { ok: false, error: "invalid_input" };
  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();
    const digits = tax.replace(/\D/g, "");
    const { data, error } = await admin
      .from("customs_declaration")
      .select("ref_no, transport, recv_date, cif_total_baht, total_tax, vessel_name, release_port, discharge_port, supplier_name, supplier_country, agent_name_th, lines")
      .or(`importer_tax_id.eq.${tax},importer_tax_id.eq.${digits}`)
      .order("recv_date", { ascending: false })
      .limit(500);
    if (error) {
      console.error("[getCustomsImporterDeclarations] failed", { code: error.code, message: error.message, taxId });
      return { ok: false, error: `db_error:${error.code ?? "unknown"}` };
    }
    return { ok: true, data: (data ?? []) as CustomsDeclarationRow[] };
  });
}

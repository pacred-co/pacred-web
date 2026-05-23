"use server";

/**
 * Admin > "แก้ไขราคาต้นทุน" — server actions for the inline cost-edit modal.
 *
 * Wave 16 P0-3 (2026-05-25) — faithful port of
 * `pcs-admin/include/pages/report-cnt/editForm.php` (the AJAX cost-edit modal)
 * + the `update_fCostTotalPrice` handler block in `pcs-admin/report-cnt.php`
 * (L811-833).
 *
 * Per docs/learnings/pacred-design-philosophy.md + AGENTS.md §0a:
 *   - Legacy = workflow source (which columns get UPDATEd, what fProductsType2
 *     semantically means — the SECONDARY product-type used for cost calculation,
 *     NOT for customer billing)
 *   - Pacred = UI source (Tailwind modal, NOT bootstrap modal markup)
 *
 * Legacy cost-edit flow exposes 3 variants from the same modal:
 *   - editCost(ID)                       → admin types both fields manually
 *   - editCost2(ID, fCostTotalPriceSheet) → pre-fills cost from S-sheet
 *   - editCostSheet(ID)                  → mutates fCostTotalPriceSheet column
 *
 * Variants 1 + 2 both POST update_fCostTotalPrice → UPDATE tb_forwarder SET
 * fProductsType2, fCostTotalPrice. Variant 3 mutates a different column
 * (fCostTotalPriceSheet — the "ต้นทุนจาก Sheet" column, used by the
 * sang-sheet cost-check page). We expose 2 server actions:
 *   - adminUpdateForwarderCost      → mode 1 + 2 path
 *   - adminUpdateForwarderCostSheet → mode 3 path
 *
 * fProductsType2 enum (same as fproductstype — see legacy
 * function.php::nameProductsType L645-655):
 *   "1" = ทั่วไป  · "2" = มอก. · "3" = อย. · "4" = พิเศษ
 *
 * Role gate: super | ops | accounting — money-tier roles only (cost = what
 * PCS paid the warehouse, drives all profit-margin reporting). Matches
 * `forwarders-edit.ts` (Wave 12-C ภาค 2) which gates dimension edits the
 * same way (those drive the customer-facing total_price calculation; cost
 * drives the back-office profit calculation — both deserve the same gate).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ────────────────────────────────────────────────────────────
// Resolve current admin's legacy id (tb_forwarder.adminidupdate is
// varchar(10)). Same helper as forwarders-edit.ts — kept local to avoid
// premature extraction (3rd duplicate would be the right time).
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
// adminUpdateForwarderCost — UPDATE tb_forwarder.fCostTotalPrice +
// fProductsType2. Faithful port of `report-cnt.php::update_fCostTotalPrice`
// handler (L811-833) — both fields land in ONE UPDATE statement.
//
// Notes on the legacy quirks:
//   - Legacy accepts empty fCostTotalPrice and only updates fProductsType2
//     in that case (L824-825). We DON'T — the modal in our UI always
//     requires a cost value (the "save" button is disabled if blank), so
//     making the schema reject blanks is the safer contract.
//   - Legacy accepts empty fProductsType2 and converts to NULL (L813-814).
//     We DO support that — passing `null` clears the column.
// ────────────────────────────────────────────────────────────

const updateCostSchema = z.object({
  fid:              z.number().int().positive(),
  fCostTotalPrice:  z.number().min(0).max(99999999.99),
  // "1"=ทั่วไป · "2"=มอก. · "3"=อย. · "4"=พิเศษ · null = clear column
  fProductsType2:   z.enum(["1", "2", "3", "4"] as const).nullable(),
});
export type AdminUpdateForwarderCostInput = z.infer<typeof updateCostSchema>;

export async function adminUpdateForwarderCost(
  input: AdminUpdateForwarderCostInput,
): Promise<AdminActionResult<{ fid: number }>> {
  const parsed = updateCostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ fid: number }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

      // ─── Read existing for audit before/after ──────────────────
      const { data: existing, error: readErr } = await admin
        .from("tb_forwarder")
        .select("id, fidorco, fcosttotalprice, fproductstype2")
        .eq("id", d.fid)
        .maybeSingle<{
          id: number;
          fidorco: string | null;
          fcosttotalprice: number | string;
          fproductstype2: string | null;
        }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!existing) {
        return { ok: false, error: "ไม่พบรายการ (fid ไม่ตรงกับ tb_forwarder)" };
      }

      const nowIso = new Date().toISOString();

      // ─── UPDATE tb_forwarder ───────────────────────────────────
      const update: Record<string, unknown> = {
        fcosttotalprice:  d.fCostTotalPrice,
        fproductstype2:   d.fProductsType2,
        adminidupdate:    legacyAdminId,
        fdateadminstatus: nowIso,
      };

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update(update)
        .eq("id", d.fid);
      if (updErr) return { ok: false, error: updErr.message };

      // ─── Audit log ─────────────────────────────────────────────
      // Use admin_audit_log (the canonical audit table) — `tb_log_forwarder_status`
      // is a STATUS-only log (fstatusold/fstatusnew columns), not a general
      // field-update log, so it's the wrong table for cost changes.
      await logAdminAction(
        adminId,
        "tb_forwarder.update_cost",
        "tb_forwarder",
        String(d.fid),
        {
          fidorco: existing.fidorco,
          before: {
            fcosttotalprice: Number(existing.fcosttotalprice),
            fproductstype2:  existing.fproductstype2,
          },
          after: {
            fcosttotalprice: d.fCostTotalPrice,
            fproductstype2:  d.fProductsType2,
          },
        },
      );

      // ─── Revalidate consumers ──────────────────────────────────
      // The cost column drives profit reporting + the report-cnt summary
      // numbers. Revalidate the report pages + any forwarder detail view.
      revalidatePath("/admin/report-cnt");
      revalidatePath("/admin/forwarders");
      if (existing.fidorco) {
        revalidatePath(`/admin/forwarders/${existing.fidorco}`);
      }
      revalidatePath(`/admin/forwarders/${d.fid}`);
      revalidatePath("/admin/accounting/forwarder");

      return { ok: true, data: { fid: d.fid } };
    },
  );
}

// ────────────────────────────────────────────────────────────
// adminUpdateForwarderCostSheet — UPDATE tb_forwarder.fCostTotalPriceSheet
// only. This column holds "the cost as it appears in the warehouse-partner
// (แสง) Google Sheet" — used by the sang-sheet cost-check page to flag
// rows where PCS and the warehouse partner disagree.
//
// The legacy modal exposes this as variant "editCostSheet(ID)" but never
// defines that JS function — it's referenced in the table row (L1880) yet
// dead in the legacy JS. We implement the server side anyway so the Pacred
// UI can offer the edit; this is the "polish > legacy" rule from §0a.
// ────────────────────────────────────────────────────────────

const updateCostSheetSchema = z.object({
  fid:                   z.number().int().positive(),
  fCostTotalPriceSheet:  z.number().min(0).max(99999999.99),
});
export type AdminUpdateForwarderCostSheetInput = z.infer<typeof updateCostSheetSchema>;

export async function adminUpdateForwarderCostSheet(
  input: AdminUpdateForwarderCostSheetInput,
): Promise<AdminActionResult<{ fid: number }>> {
  const parsed = updateCostSheetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin<{ fid: number }>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);

      const { data: existing, error: readErr } = await admin
        .from("tb_forwarder")
        .select("id, fidorco, fcosttotalpricesheet")
        .eq("id", d.fid)
        .maybeSingle<{
          id: number;
          fidorco: string | null;
          fcosttotalpricesheet: number | string;
        }>();
      if (readErr) return { ok: false, error: readErr.message };
      if (!existing) {
        return { ok: false, error: "ไม่พบรายการ (fid ไม่ตรงกับ tb_forwarder)" };
      }

      const nowIso = new Date().toISOString();

      const { error: updErr } = await admin
        .from("tb_forwarder")
        .update({
          fcosttotalpricesheet: d.fCostTotalPriceSheet,
          adminidupdate:        legacyAdminId,
          fdateadminstatus:     nowIso,
        })
        .eq("id", d.fid);
      if (updErr) return { ok: false, error: updErr.message };

      await logAdminAction(
        adminId,
        "tb_forwarder.update_cost_sheet",
        "tb_forwarder",
        String(d.fid),
        {
          fidorco: existing.fidorco,
          before: { fcosttotalpricesheet: Number(existing.fcosttotalpricesheet) },
          after:  { fcosttotalpricesheet: d.fCostTotalPriceSheet },
        },
      );

      revalidatePath("/admin/report-cnt");
      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/forwarders/container-cost-check");
      if (existing.fidorco) {
        revalidatePath(`/admin/forwarders/${existing.fidorco}`);
      }
      revalidatePath(`/admin/forwarders/${d.fid}`);
      revalidatePath("/admin/accounting/forwarder");

      return { ok: true, data: { fid: d.fid } };
    },
  );
}

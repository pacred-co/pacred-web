"use server";

/**
 * Admin > "ปรับต้นทุนตู้ใหม่" — bulk cost-sheet update server action.
 *
 * Wave 16 follow-up B (2026-05-23) — Pacred-native replacement for the
 * legacy `report-cnt.php?action=cost-update` view that read from Google
 * Sheets via `check-sang-cost.php` (Google Sheets API + service-account
 * JSON `cryptic-album-325611-f8d67b670cf9.json`).
 *
 * ภูม decision: build the cost-update workflow inside Pacred directly
 * — no external Sheets dependency. Admin types/uploads the carrier cost
 * sheet values, our UI diffs them against current `fCostTotalPriceSheet`,
 * bulk-saves the changes.
 *
 * Legacy `upCostSheet` POST handler at report-cnt.php L1065-1078 loops
 * the form's `fID[]` + `fCostSheet[]` arrays and UPDATEs `fCostTotalPrice`
 * (writes Sheet value INTO the live cost). Our flow is cleaner: we UPDATE
 * `fCostTotalPriceSheet` instead — keeping the live cost (`fCostTotalPrice`)
 * separate as the authoritative PCS-internal cost, and the Sheet column
 * as the carrier-stated reference. The existing P0-3 `editCostSheet`
 * single-row modal already follows this pattern (see
 * `adminUpdateForwarderCostSheet` in `forwarder-cost.ts`); this is its
 * bulk variant.
 *
 * Auth — super | ops | accounting. Same gate as the P0-3 single-row
 * cost-edit modal in `forwarder-cost.ts`. Warehouse role is excluded
 * (warehouse sees the detail page but cost edits are money-tier).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";

// ─────────────────────────────────────────────────────────────────────
// Resolve current admin's legacy id (tb_forwarder.adminidupdate is
// varchar(10)). Same helper as `forwarder-cost.ts` + `forwarders-edit.ts`
// — kept local because this is now the 3rd duplicate and extracting a
// shared util would be the right next step (TODO when a 4th appears).
// ─────────────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[tb_admin list] failed`, { code: error.code, message: error.message });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 20); // 2026-06-05 varchar(20)
}

// ─────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────

const updateRow = z.object({
  fid:           z.number().int().positive(),
  newCostSheet:  z.number().min(0).max(99999999.99),
});

// INTERNAL — Next 16 `"use server"` files may only export async functions,
// so a Zod-object export crashes the route at request time. Type-only
// exports (BulkUpdateCostSheetInput below) are runtime-erased and safe.
const bulkUpdateCostSheetSchema = z.object({
  updates: z.array(updateRow).min(1, { message: "ไม่มีรายการให้บันทึก" }).max(5000),
});

export type BulkUpdateCostSheetInput = z.infer<typeof bulkUpdateCostSheetSchema>;

export type BulkUpdateCostSheetResult = {
  updated: number;
  failed:  number;
  errors:  Array<{ fid: number; error: string }>;
};

// ─────────────────────────────────────────────────────────────────────
// adminBulkUpdateForwarderCostSheet — UPDATE tb_forwarder.fCostTotalPriceSheet
// for every row in the `updates` payload.
//
// Supabase JS doesn't support a multi-row `UPDATE ... WHERE id IN (...)
// SET column = CASE id ...` in a single call, so we loop one UPDATE per
// row. For typical container sizes (~50-200 rows) this is ~1-2s on prod
// Supabase — acceptable. If we hit a 1000+ row container regularly, the
// next iteration should batch via an RPC.
//
// Audit pattern: ONE summary audit row per bulk-action (containing all
// fids + counts), instead of N per-row audit rows. Per-row UPDATE failure
// is collected in the `errors` array and returned to the caller; the
// successful rows still commit (best-effort partial success — matches
// the legacy loop which never rolls back on UPDATE error).
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// LANE A — adminApplyContainerCostFromSheet
//
// Apply แสง's Google Sheet cost into the LIVE cost column
// (`tb_forwarder.fcosttotalprice`) per parcel. Owner decision (locked
// 2026-06-05): write `fcosttotalprice` directly — the live cost the
// price/profit engine reads — exactly like legacy `upCostSheet`
// (report-cnt.php L1065-1078: `UPDATE tb_forwarder SET fCostTotalPrice
// = <sheetCost> WHERE ID = fID`). NOT the safe-separation
// `fcosttotalpricesheet` column.
//
// Guardrails on top of legacy:
//   - LOCK if the container is already paid (a tb_cnt_item row exists for
//     the cabinet) — legacy lets you edit a paid container's cost from the
//     bill page; here we refuse and point staff there (matches the
//     existing report-cnt page lock).
//   - Confirm-before-mutate is enforced in the UI (§0f); this action
//     trusts the caller already confirmed.
//   - logAdminAction with before/after per row.
// ─────────────────────────────────────────────────────────────────────

const applyRow = z.object({
  fid:       z.number().int().positive(),
  sheetCost: z.number().min(0).max(99999999.99),
});

const applyFromSheetSchema = z.object({
  fCabinetNumber: z.string().trim().min(1).max(190),
  updates:        z.array(applyRow).min(1, { message: "ไม่มีรายการให้บันทึก" }).max(5000),
});

export type ApplyContainerCostFromSheetInput = z.infer<typeof applyFromSheetSchema>;

export type ApplyContainerCostFromSheetResult = {
  updated: number;
  failed:  number;
  errors:  Array<{ fid: number; error: string }>;
};

export async function adminApplyContainerCostFromSheet(
  input: ApplyContainerCostFromSheetInput,
): Promise<AdminActionResult<ApplyContainerCostFromSheetResult>> {
  const parsed = applyFromSheetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { fCabinetNumber, updates } = parsed.data;

  return withAdmin<ApplyContainerCostFromSheetResult>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      const nowIso        = new Date().toISOString();

      // ─── Lock if the container is already paid ─────────────────────
      const { data: cntItem, error: cntItemErr } = await admin
        .from("tb_cnt_item")
        .select("ID, cntID")
        .eq("fCabinetNumber", fCabinetNumber)
        .maybeSingle<{ ID: number; cntID: number | null }>();
      if (cntItemErr) {
        return { ok: false, error: cntItemErr.message };
      }
      if (cntItem) {
        return {
          ok: false,
          error:
            "ตู้นี้จ่ายค่าตู้แล้ว — แก้ไขต้นทุนจากบิลจ่ายเงินตู้แทน" +
            (cntItem.cntID ? ` (รายการจ่ายเงินตู้ #${cntItem.cntID})` : ""),
        };
      }

      // ─── Read existing rows for before/after audit + cabinet guard ──
      const fids = updates.map((u) => u.fid);
      const { data: existing, error: readErr } = await admin
        .from("tb_forwarder")
        .select("id, fidorco, ftrackingchn, fcosttotalprice, fcabinetnumber")
        .in("id", fids);
      if (readErr) return { ok: false, error: readErr.message };

      const existingMap = new Map<number, {
        fidorco:        string | null;
        ftrackingchn:   string | null;
        fcosttotalprice: number;
        fcabinetnumber: string | null;
      }>();
      for (const r of (existing ?? []) as Array<{
        id: number; fidorco: string | null; ftrackingchn: string | null;
        fcosttotalprice: number | string; fcabinetnumber: string | null;
      }>) {
        existingMap.set(Number(r.id), {
          fidorco:         r.fidorco,
          ftrackingchn:    r.ftrackingchn,
          fcosttotalprice: Number(r.fcosttotalprice ?? 0),
          fcabinetnumber:  r.fcabinetnumber,
        });
      }

      // ─── Per-row UPDATE loop (writes the LIVE cost) ────────────────
      const errors: Array<{ fid: number; error: string }> = [];
      let updated = 0;
      const changes: Array<{
        fid: number; tracking: string | null; before: number; after: number;
      }> = [];

      for (const u of updates) {
        const prior = existingMap.get(u.fid);
        if (!prior) {
          errors.push({ fid: u.fid, error: "ไม่พบรายการ (fid ไม่ตรงกับ tb_forwarder)" });
          continue;
        }
        // Guard: the fid must actually belong to this cabinet (prevents a
        // crafted payload writing into another container's rows).
        if (prior.fcabinetnumber !== fCabinetNumber) {
          errors.push({ fid: u.fid, error: "รายการไม่อยู่ในตู้นี้" });
          continue;
        }
        const { error: updErr } = await admin
          .from("tb_forwarder")
          .update({
            fcosttotalprice:  u.sheetCost,
            adminidupdate:    legacyAdminId,
            fdateadminstatus: nowIso,
          })
          .eq("id", u.fid);
        if (updErr) {
          errors.push({ fid: u.fid, error: updErr.message });
          continue;
        }
        updated += 1;
        changes.push({
          fid: u.fid,
          tracking: prior.ftrackingchn,
          before: prior.fcosttotalprice,
          after: u.sheetCost,
        });
      }

      // ─── Audit log — single summary row ───────────────────────────
      await logAdminAction(
        adminId,
        "tb_forwarder.apply_cost_from_sheet",
        "tb_forwarder",
        fCabinetNumber,
        {
          bulk_action:   "report_cnt.cost.apply_from_sheet",
          cabinet:       fCabinetNumber,
          target_column: "fcosttotalprice", // owner-locked: live cost
          updated_count: updated,
          failed_count:  errors.length,
          changes,
          errors,
        },
      );

      // ─── Revalidate consumers ─────────────────────────────────────
      revalidatePath(`/admin/report-cnt/${fCabinetNumber}`);
      revalidatePath("/admin/report-cnt");
      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/forwarders/container-cost-check");
      revalidatePath("/admin/accounting/forwarder");

      return { ok: true, data: { updated, failed: errors.length, errors } };
    },
  );
}

export async function adminBulkUpdateForwarderCostSheet(
  input: BulkUpdateCostSheetInput,
): Promise<AdminActionResult<BulkUpdateCostSheetResult>> {
  const parsed = bulkUpdateCostSheetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { updates } = parsed.data;

  return withAdmin<BulkUpdateCostSheetResult>(
    ["super", "ops", "accounting"],
    async ({ adminId }) => {
      const admin         = createAdminClient();
      const legacyAdminId = (await resolveLegacyAdminId()).slice(0, 10);
      const nowIso        = new Date().toISOString();

      // ─── Read existing rows for before/after audit + fidorco list ──
      const fids = updates.map((u) => u.fid);
      const { data: existing, error: readErr } = await admin
        .from("tb_forwarder")
        .select("id, fidorco, fcosttotalpricesheet, fcabinetnumber")
        .in("id", fids);
      if (readErr) return { ok: false, error: readErr.message };

      const existingMap = new Map<number, {
        fidorco:              string | null;
        fcosttotalpricesheet: number;
        fcabinetnumber:       string | null;
      }>();
      for (const r of (existing ?? []) as Array<{
        id: number; fidorco: string | null;
        fcosttotalpricesheet: number | string;
        fcabinetnumber: string | null;
      }>) {
        existingMap.set(Number(r.id), {
          fidorco:              r.fidorco,
          fcosttotalpricesheet: Number(r.fcosttotalpricesheet ?? 0),
          fcabinetnumber:       r.fcabinetnumber,
        });
      }

      // ─── Per-row UPDATE loop ──────────────────────────────────────
      const errors: Array<{ fid: number; error: string }> = [];
      let updated = 0;
      const cabinetSet = new Set<string>();
      const fidorcoSet = new Set<string>();

      for (const u of updates) {
        const prior = existingMap.get(u.fid);
        if (!prior) {
          errors.push({ fid: u.fid, error: "ไม่พบรายการ (fid ไม่ตรงกับ tb_forwarder)" });
          continue;
        }
        const { error: updErr } = await admin
          .from("tb_forwarder")
          .update({
            fcosttotalpricesheet: u.newCostSheet,
            adminidupdate:        legacyAdminId,
            fdateadminstatus:     nowIso,
          })
          .eq("id", u.fid);
        if (updErr) {
          errors.push({ fid: u.fid, error: updErr.message });
          continue;
        }
        updated += 1;
        if (prior.fcabinetnumber) cabinetSet.add(prior.fcabinetnumber);
        if (prior.fidorco)        fidorcoSet.add(prior.fidorco);
      }

      // ─── Audit log — single summary row ───────────────────────────
      // payload includes per-row before/after for the rows that did update,
      // so an admin can reverse-engineer "what did I change?" from the log.
      const auditPayload = {
        bulk_action:    "report_cnt.cost_sheet.bulk_update",
        updated_count:  updated,
        failed_count:   errors.length,
        cabinets:       Array.from(cabinetSet),
        changes:        updates
          .filter((u) => existingMap.has(u.fid))
          .map((u) => ({
            fid: u.fid,
            fidorco: existingMap.get(u.fid)?.fidorco ?? null,
            before:  existingMap.get(u.fid)?.fcosttotalpricesheet ?? 0,
            after:   u.newCostSheet,
          })),
        errors,
      };

      await logAdminAction(
        adminId,
        "tb_forwarder.bulk_update_cost_sheet",
        "tb_forwarder",
        Array.from(cabinetSet).join(",") || updates[0].fid.toString(),
        auditPayload,
      );

      // ─── Revalidate consumers ─────────────────────────────────────
      revalidatePath("/admin/report-cnt");
      revalidatePath("/admin/forwarders");
      revalidatePath("/admin/forwarders/container-cost-check");
      revalidatePath("/admin/accounting/forwarder");
      for (const cab of cabinetSet) {
        revalidatePath(`/admin/report-cnt/${cab}`);
      }
      for (const fid of fidorcoSet) {
        revalidatePath(`/admin/forwarders/${fid}`);
      }

      return {
        ok:   true,
        data: { updated, failed: errors.length, errors },
      };
    },
  );
}

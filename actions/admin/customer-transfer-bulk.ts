"use server";

// ────────────────────────────────────────────────────────────
// V-G2 — Bulk transfer customers to sales rep
// ────────────────────────────────────────────────────────────
// Faithful port of legacy `pcs-admin/transferSalesCustomers.php` — staff
// pick N customers + one target rep + a reason → all get moved in one
// submit. Differs from the existing single-UPDATE bulk path
// (`adminBulkTransferSalesRep` in admins.ts) in three ways the spec
// (docs/port-specs/admin-polish-bundle.md §V-G2) requires:
//
//   • per-customer audit row (`customer.transfer_rep`) — not one summary
//     row — so the activity log on each customer profile reflects the
//     move. This is the "50 audit rows for 50 customers" acceptance.
//   • per-customer notification fan-out (old rep / new rep / customer)
//     via the existing `adminTransferSalesRep` action. The summary path
//     skipped these to keep the single UPDATE tight; faithful port wants
//     the fan-out.
//   • partial-success result shape ({ succeeded[], failed[] }) so the
//     UI can show a per-row error summary if one customer fails (e.g.
//     "same_rep_no_change" when one of the selected customers is already
//     under the target rep).
//
// Implementation strategy: loop the per-customer action so every
// guarantee it carries (validation · audit · notification) applies to
// each row automatically. Slower than a single UPDATE, but bulk transfer
// is rare + the per-action overhead is acceptable for ≤200 customers.
//
// RBAC: super OR sales_admin. A sales_admin can only bulk-transfer their
// OWN customers (filter at action layer) — prevents one rep from
// reassigning another rep's portfolio.
// ────────────────────────────────────────────────────────────

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "./common";
import { adminTransferSalesRep } from "./admins";

const bulkSchema = z.object({
  customer_ids:          z.array(z.string().uuid()).min(1, "เลือกอย่างน้อย 1 ลูกค้า").max(200, "ครั้งละไม่เกิน 200 ราย"),
  new_sales_admin_id:    z.string().uuid().nullable(),                // null = unassign
  note:                  z.string().trim().min(3, "กรุณาระบุเหตุผล").max(500),
});

export type BulkTransferInput  = z.infer<typeof bulkSchema>;
export type BulkTransferResult = {
  succeeded: string[];
  failed:    Array<{ id: string; error: string }>;
};

export async function bulkTransferCustomersToSalesRep(
  input: BulkTransferInput,
): Promise<AdminActionResult<BulkTransferResult>> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // De-dupe to keep the audit + notification counts honest if the caller
  // accidentally submits the same id twice.
  const uniqueIds = Array.from(new Set(d.customer_ids));

  return withAdmin<BulkTransferResult>(["sales_admin"], async ({ adminId }) => {
    const admin = createAdminClient();

    // Validate target rep up-front (single check, not per row) — same guard
    // as the existing bulk path. Saves N round-trips when the target is wrong.
    if (d.new_sales_admin_id) {
      const { data: target, error: targetErr } = await admin
        .from("admins")
        .select("profile_id, role, is_active")
        .eq("profile_id", d.new_sales_admin_id)
        .in("role", ["sales_admin", "super"])
        .eq("is_active", true)
        .maybeSingle();
      if (targetErr) {
        console.error(`[customer-transfer-bulk target lookup] failed`, { code: targetErr.code, message: targetErr.message });
        return { ok: false, error: targetErr.message };
      }
      if (!target) return { ok: false, error: "target_not_active_sales_admin" };
    }

    // Ownership gate: if the caller is sales_admin (not super), restrict
    // the operation to customers whose CURRENT sales_admin_id is the
    // caller. A super-admin bypasses this. We resolve the caller's
    // super-status by re-checking the admins table — `withAdmin` already
    // gated entry but didn't surface the role set into the action body.
    const { data: callerRoles, error: callerRolesErr } = await admin
      .from("admins")
      .select("role")
      .eq("profile_id", adminId)
      .eq("is_active", true);
    if (callerRolesErr) {
      console.error(`[customer-transfer-bulk caller roles lookup] failed`, { code: callerRolesErr.code, message: callerRolesErr.message });
      return { ok: false, error: callerRolesErr.message };
    }
    const isSuper = (callerRoles ?? []).some((r) => r.role === "super");

    // Pull current sales_admin_id for the selected customers up-front —
    // gives us the ownership filter for non-super callers AND the
    // "already same rep" pre-check (the per-customer action will reject
    // these with "same_rep_no_change", but counting them on the failed
    // list before calling makes the summary cleaner).
    const { data: currentRows, error: currentRowsErr } = await admin
      .from("profiles")
      .select("id, sales_admin_id")
      .in("id", uniqueIds);
    if (currentRowsErr) {
      console.error(`[customer-transfer-bulk current rows lookup] failed`, { code: currentRowsErr.code, message: currentRowsErr.message });
      return { ok: false, error: currentRowsErr.message };
    }
    const currentRepById = new Map<string, string | null>(
      ((currentRows ?? []) as Array<{ id: string; sales_admin_id: string | null }>)
        .map((r) => [r.id, r.sales_admin_id]),
    );

    const succeeded: string[] = [];
    const failed:    Array<{ id: string; error: string }> = [];

    for (const id of uniqueIds) {
      // Customer disappeared between list-load + submit (rare).
      if (!currentRepById.has(id)) {
        failed.push({ id, error: "customer_not_found" });
        continue;
      }

      // Ownership: non-super callers can only move their own customers.
      if (!isSuper) {
        const currentRep = currentRepById.get(id) ?? null;
        if (currentRep !== adminId) {
          failed.push({ id, error: "not_your_customer" });
          continue;
        }
      }

      const res = await adminTransferSalesRep({
        customer_id:        id,
        new_sales_admin_id: d.new_sales_admin_id,
        reason:             d.note,
      });
      if (res.ok) {
        succeeded.push(id);
      } else {
        failed.push({ id, error: res.error });
      }
    }

    // Revalidate once at the end — adminTransferSalesRep already
    // revalidates /admin/customers + the per-customer transfer page on
    // each call, but the bulk index isn't on its list.
    revalidatePath("/admin/customers");
    revalidatePath("/admin/customers/transfer-rep");
    revalidatePath("/admin/customers/transfer-bulk");

    return { ok: true, data: { succeeded, failed } };
  });
}

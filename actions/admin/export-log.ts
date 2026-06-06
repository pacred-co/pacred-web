"use server";

/**
 * Audit trail for admin FULL-filtered CSV exports (owner directive 2026-06-07).
 *
 * The admin list pages can export the entire filtered result set (not just the
 * 50-row page) — most sensitively /admin/leads (6,936 cold-lead phones) + the
 * customer contact lists handed to external VAs. Every "export all" writes one
 * row to admin_export_log (migration 0147): who, which dataset, which filters,
 * how many rows, when. Paginated per-page exports are NOT logged.
 *
 * Best-effort: a logging failure NEVER blocks or rolls back the export. The
 * per-dataset export action calls this right before returning the rows.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function logAdminExport(input: {
  dataset: string;
  filters?: Record<string, unknown>;
  rowCount: number;
  truncated?: boolean;
}): Promise<void> {
  try {
    // Any admin role — the calling page already gates to the right roles; this
    // is just to resolve the acting admin's identity for the audit row.
    const { user } = await requireAdmin();
    const admin = createAdminClient();

    // Resolve the admin's member/employee code (best-effort, for readability).
    let adminCode: string | null = null;
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("member_code, employee_code")
      .eq("id", user.id)
      .maybeSingle();
    if (profErr) {
      console.error("[logAdminExport] profile lookup failed (non-fatal):", profErr.message);
    }
    if (prof) adminCode = prof.employee_code || prof.member_code || null;

    const { error } = await admin.from("admin_export_log").insert({
      admin_id: user.id,
      admin_code: adminCode,
      dataset: input.dataset,
      filters: input.filters ?? {},
      row_count: input.rowCount,
      truncated: input.truncated ?? false,
    });
    if (error) {
      console.error("[logAdminExport] insert failed (non-fatal):", error.message, {
        dataset: input.dataset,
      });
    }
  } catch (e) {
    // Never let an audit-log failure break the export itself.
    console.error("[logAdminExport] unexpected (non-fatal):", e);
  }
}

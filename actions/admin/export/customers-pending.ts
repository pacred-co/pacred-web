"use server";

/**
 * Export-all (CSV) for /admin/customers/pending — the APPROVAL QUEUE of
 * customers who registered but are not yet approved (legacy useractive
 * pending signal).
 *
 * The page (app/[locale]/(admin)/admin/customers/pending/page.tsx) lists every
 * tb_users row with userActive IN ('', '0') — the transitional pending filter
 * (P1-17 / ADR-0019 D-C: legacy migrated pending = '', native pending = '0') —
 * ordered by userRegistered DESC, then DB-paginated 50/page for display. The
 * on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered queue (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row (PII: customer name +
 * phone + email — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .in("userActive", ["", "0"])
 *   .order("userRegistered", { ascending: false })
 * with the same selected columns, just UNPAGINATED (the page DB-paginates via
 * .range(from, to); here we .range(0, EXPORT_CAP)). The CSV columns mirror the
 * page's <thead> 1:1.
 *
 * RBAC matches the page: ops / sales_admin / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

type Row = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userCompany: string | null;
  userRegistered: string | null;
  userActive: string | null;
};

/**
 * Export the entire pending-approval customer queue (capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filter
 * (userActive IN ('','0'), ordered by userRegistered DESC), unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportCustomersPendingAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // SAME gate as the page (pending-customer queue lists customer PII).
  await requireAdmin(["ops", "sales_admin", "accounting"]);

  const admin = createAdminClient();

  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data, error } = await admin
    .from("tb_users")
    .select(
      "userID,userName,userLastName,userTel,userEmail,userCompany,userRegistered,userActive",
    )
    .in("userActive", ["", "0"])
    .order("userRegistered", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportCustomersPendingAll tb_users] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as Row[];
  const truncated = all.length > EXPORT_CAP;
  const queue = truncated ? all.slice(0, EXPORT_CAP) : all;

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = queue.map((c) => {
    const personalName =
      `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim() || "—";
    return {
      userID: c.userID,
      name: personalName,
      tel: c.userTel ?? "—",
      email: c.userEmail || "—",
      type: c.userCompany === "1" ? "นิติบุคคล" : "บุคคล",
      registered: c.userRegistered ? c.userRegistered.slice(0, 10) : "—",
    };
  });

  await logAdminExport({
    dataset: "customers-pending",
    filters: { userActive: ["", "0"] },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

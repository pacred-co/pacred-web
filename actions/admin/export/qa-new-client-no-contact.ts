"use server";

/**
 * Export-all (CSV) for /admin/qa/new-client-no-contact — the QA SLA-breach queue
 * "ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน" (Wave 10 Group B).
 *
 * The page (app/[locale]/(admin)/admin/qa/new-client-no-contact/page.tsx) lists
 * tb_users rows where:
 *   useractive = '1'
 *   userRegistered > NOW() - 30 days
 *   (userLastLogin IS NULL OR userLastLogin < NOW() - 2 days)
 *   ordered by userRegistered ASC
 * and DB-paginates 50/page for display. The on-screen "⬇ CSV หน้านี้" downloads
 * only the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด" button — the
 * ENTIRE filtered set (capped at EXPORT_CAP) — then writes an admin_export_log
 * audit row (PII: customer name + phone + email — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("userActive","1")
 *   .gt("userRegistered", cutoffIsoDaysAgo(30))
 *   .or(`userLastLogin.is.null,userLastLogin.lt.${cutoffIsoDaysAgo(2)}`)
 *   .order("userRegistered",{ascending:true})
 * The cutoffs are relative-to-now (the page's own behaviour — it has no URL date
 * filters; its only searchParam is `page`, which is paging not filtering). The
 * CSV columns mirror the page's <thead> 1:1. The page DB-paginates this query,
 * so the only difference here is .range(0, EXPORT_CAP) + the audit log.
 *
 * RBAC matches the page: ops / accounting / super.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { cutoffIsoDaysAgo } from "@/lib/datetime-helpers";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors the other surfaces).
const EXPORT_CAP = 10000;

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userRegistered: string | null;
  userLastLogin: string | null;
  userActive: string | null;
  adminIDSale: string | null;
  userCompany: string | null;
};

/**
 * Export the entire filtered SLA-breach queue (new clients with no recent
 * contact, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact filtered query, unpaginated. Writes an admin_export_log
 * audit row.
 */
export async function exportQaNewClientNoContactAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page.
  await requireAdmin(["ops", "accounting", "super"]);

  const admin = createAdminClient();

  // SAME filter as the page (relative-to-now cutoffs, identical .or syntax),
  // capped (fetch one extra to detect truncation).
  const registerCutoff = cutoffIsoDaysAgo(30);
  const loginCutoff = cutoffIsoDaysAgo(2);

  const { data: rowsRaw, error } = await admin
    .from("tb_users")
    .select(
      "userID,userName,userLastName,userTel,userEmail,userRegistered," +
        "userLastLogin,userActive,adminIDSale,userCompany",
    )
    .eq("userActive", "1")
    .gt("userRegistered", registerCutoff)
    .or(`userLastLogin.is.null,userLastLogin.lt.${loginCutoff}`)
    .order("userRegistered", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaNewClientNoContactAll tb_users] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as URow[];
  const truncated = all.length > EXPORT_CAP;
  const userRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  const now = Date.now();

  // SAME row mapping + column keys as the page's <thead>.
  const rows: CsvRow[] = userRows.map((u) => {
    const fullName = `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || "—";
    const daysSinceReg = u.userRegistered
      ? Math.floor(
          (now - new Date(u.userRegistered).getTime()) / (24 * 60 * 60 * 1000),
        )
      : 0;
    const lastLoginLabel = u.userLastLogin
      ? String(u.userLastLogin).slice(0, 10)
      : "ไม่เคย login";
    const customerType = u.userCompany === "1" ? "นิติบุคคล" : "บุคคล";
    const row: CsvRow = {
      userID: u.userID,
      userRegistered: u.userRegistered
        ? String(u.userRegistered).slice(0, 10)
        : "—",
      daysSinceReg: `${daysSinceReg} วัน`,
      fullName,
      userTel: u.userTel || "—",
      userEmail: u.userEmail || "—",
      customerType,
      lastLogin: lastLoginLabel,
      adminIDSale: u.adminIDSale || "—",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-new-client-no-contact",
    filters: {
      userActive: "1",
      registerCutoffDays: 30,
      loginCutoffDays: 2,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

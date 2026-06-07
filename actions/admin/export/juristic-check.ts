"use server";

/**
 * Export-all (CSV) for /admin/juristic-check — the juristic-customer
 * verification queue (legacy pcs-admin/users.php?page=corporation →
 * user-corporation.php).
 *
 * The page (app/[locale]/(admin)/admin/juristic-check/page.tsx) lists every
 * tb_corporate row whose corporatestatus matches the active chip
 * (default = '1' pending; chips switch to '2' verified / '3' rejected),
 * ordered by cpdatecreate DESC, joined to tb_users for the customer identity
 * (name + tel + email). It paginates 50/page (parsePage/pageRange). The
 * on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action backs
 * the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered status set (capped at
 * EXPORT_CAP) — then writes an admin_export_log audit row (PII: customer name
 * + tax id — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("corporatestatus", statusFilter)   // when a status is active
 *   .order("cpdatecreate", { ascending: false })
 * plus the same tb_users identity join. The CSV columns mirror the page's
 * CsvButton cols 1:1. The only difference vs the page is the EXPORT_CAP guard
 * (vs the page's 50/page slice) + the audit log.
 *
 * RBAC matches the page: super / manager / accounting / qa / ops / sales_admin.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * statusFilter.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// Legacy corporatestatus codes (function.php statusComp) — mirrors the page.
const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ไม่ผ่าน",
};

function statusName(s: string | null): string {
  return STATUS_LABEL[s ?? ""] ?? (s ?? "");
}

type CorpRow = {
  id: number;
  userid: string;
  corporatenumber: string | null;
  corporatename: string | null;
  corporateaddress: string | null;
  corporatestatus: string | null;
  cpdatecreate: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

/** Active filter the page passes through (the resolved corporatestatus value). */
export type JuristicCheckExportFilter = {
  /** corporatestatus code: "1" pending · "2" verified · "3" rejected. */
  statusFilter: string;
};

/**
 * Export the entire filtered juristic-verification queue (the active status,
 * capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the
 * page's exact filtered query (corporatestatus + cpdatecreate DESC + the
 * tb_users identity join), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportJuristicCheckAll(
  filter: JuristicCheckExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same RBAC as the page.
  await requireAdmin(["super", "manager", "accounting", "qa", "ops", "sales_admin"]);

  const { statusFilter } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull the corporate rows ─────────────────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  let q = admin
    .from("tb_corporate")
    .select("id, userid, corporatenumber, corporatename, corporateaddress, corporatestatus, cpdatecreate")
    .order("cpdatecreate", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (statusFilter) q = q.eq("corporatestatus", statusFilter);

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error(`[exportJuristicCheckAll tb_corporate] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as CorpRow[];
  const truncated = all.length > EXPORT_CAP;
  const corps = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer identity display ───────────
  // SAME join the page does.
  const userIds = Array.from(
    new Set(corps.map((c) => c.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userEmail")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportJuristicCheckAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = corps.map((c) => {
    const u = userMap.get(c.userid);
    const customerName = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
      : "";
    const row: CsvRow = {
      userid: c.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      email: u?.userEmail ?? "",
      corporatenumber: c.corporatenumber ?? "",
      corporatename: c.corporatename ?? "",
      corporateaddress: c.corporateaddress ?? "",
      status: statusName(c.corporatestatus),
      cpdatecreate: c.cpdatecreate ? c.cpdatecreate.slice(0, 10) : "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "juristic-check",
    filters: { corporatestatus: statusFilter },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

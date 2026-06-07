"use server";

/**
 * Export-all (CSV) for /admin/forwarders/notes — the "หมายเหตุนำเข้า" list
 * (legacy pcs-admin/forwarder-action.php?action=Note).
 *
 * The page (app/[locale]/(admin)/admin/forwarders/notes/page.tsx) selects every
 * tb_forwarder row with at least one non-empty note column
 *   .or("fnote.neq.,fnoteuser.neq.")
 * optionally narrowed to one numeric fstatus (resolved from ?status=<key> via
 * toLegacyForwarderCode), ordered by fdateadminstatus DESC then fdate DESC,
 * then post-filters out rows where BOTH note columns are blank (the .or
 * neq.'' false-negatives), then joins tb_users for the customer panel, and
 * finally client-slices 50/page for display. The on-screen "⬇ CSV หน้านี้"
 * downloads only the visible page; this action backs "⬇ CSV ทั้งหมด" — the
 * ENTIRE filtered set (capped at EXPORT_CAP) — and writes an admin_export_log
 * audit row (PII: customer name + phone — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the page's EXACT filter
 *   .or("fnote.neq.,fnoteuser.neq.")  [+ .eq("fstatus", legacyStatusCode)]
 *   .order("fdateadminstatus",{ascending:false,nullsFirst:false})
 *   .order("fdate",{ascending:false})
 *   then the same both-empty post-filter + the same tb_users join.
 * The CSV columns mirror the page's CsvButton cols (= the <thead>) 1:1.
 *
 * RBAC matches the page: ops / sales_admin (super implicit).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * legacyStatusCode + the raw status key (for the audit filters).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { legacyForwarderStatusThai } from "@/lib/legacy-status-map";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors page intent).
const EXPORT_CAP = 10000;

type RawForwarder = {
  id: number;
  fidorco: string | null;
  fstatus: string;
  fnote: string | null;
  fnoteuser: string | null;
  fdate: string;
  fdateadminstatus: string | null;
  ftotalprice: number | null;
  ftrackingchn: string | null;
  ftrackingth: string | null;
  userid: string;
};

type UserLite = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

/** Active filters the page passes through. */
export type ForwarderNotesExportFilter = {
  /** Resolved numeric legacy fstatus ('1'..'7') or undefined for "ทั้งหมด". */
  legacyStatusCode?: string;
  /** The raw ?status=<key> the page received (for the audit log only). */
  statusKey?: string;
};

/**
 * Export the entire filtered forwarder-notes list (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (note-non-empty + optional fstatus + the both-empty post-filter + the
 * tb_users name join), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportForwarderNotesAll(
  filter: ForwarderNotesExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["ops", "sales_admin"]);

  const { legacyStatusCode, statusKey } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull forwarder headers with at least one non-empty note ──
  // SAME filter + ordering as the page; capped (fetch one extra to detect trunc).
  let q = admin
    .from("tb_forwarder")
    .select("id, fidorco, fstatus, fnote, fnoteuser, fdate, fdateadminstatus, ftotalprice, ftrackingchn, ftrackingth, userid")
    .or("fnote.neq.,fnoteuser.neq.")
    .order("fdateadminstatus", { ascending: false, nullsFirst: false })
    .order("fdate", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  if (legacyStatusCode) q = q.eq("fstatus", legacyStatusCode);

  const { data: rowsRaw, error } = await q;
  if (error) {
    console.error(`[exportForwarderNotesAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  // SAME both-empty post-filter the page applies.
  const filtered = ((rowsRaw ?? []) as RawForwarder[]).filter(
    (r) => (r.fnote && r.fnote.trim()) || (r.fnoteuser && r.fnoteuser.trim()),
  );
  const truncated = filtered.length > EXPORT_CAP;
  const fwdRows = truncated ? filtered.slice(0, EXPORT_CAP) : filtered;

  // ── Pass 2: tb_users for the customer-name display ──────────────
  const useridList = Array.from(
    new Set(fwdRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, UserLite>();
  if (useridList.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel")
      .in("userID", useridList);
    if (usersErr) {
      console.error(`[exportForwarderNotesAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as UserLite[]) {
      userMap.set(u.userID, u);
    }
  }

  // SAME row mapping + column keys as the page's CsvButton (= the <thead>).
  const rows: CsvRow[] = fwdRows.map((r) => {
    const u = userMap.get(r.userid);
    const customerName = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
      : "";
    const updated = r.fdateadminstatus ?? r.fdate;
    return {
      updated: updated ? String(updated).slice(0, 10) : "",
      fno: r.fidorco ?? `#${r.id}`,
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      status: legacyForwarderStatusThai(r.fstatus),
      total:
        r.ftotalprice != null
          ? Number(r.ftotalprice).toLocaleString("th-TH", { minimumFractionDigits: 2 })
          : "",
      tracking_chn: r.ftrackingchn ?? "",
      tracking_th: r.ftrackingth ?? "",
      note_admin: (r.fnote ?? "").trim(),
      note_user: (r.fnoteuser ?? "").trim(),
    };
  });

  await logAdminExport({
    dataset: "forwarder-notes",
    filters: { status: statusKey ?? null, fstatus: legacyStatusCode ?? null },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

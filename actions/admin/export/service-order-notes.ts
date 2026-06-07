"use server";

/**
 * Export-all (CSV) for /admin/service-orders/notes — the standalone
 * "หมายเหตุฝากสั่ง" notes list (legacy pcs-admin/forwarder-action.php?action=NoteShop).
 *
 * The page (app/[locale]/(admin)/admin/service-orders/notes/page.tsx) lists every
 * tb_header_order row that has a non-empty staff note (hnote) OR customer note
 * (hnoteuser), with an OPTIONAL legacy single-char hstatus filter ('1'..'6'),
 * ordered hdateupdate DESC then id DESC, then resolves the customer name/phone via
 * a 2nd tb_users query. The page paginates server-side via .range(). The on-screen
 * "⬇ CSV หน้านี้" downloads only the visible page; this action backs the 2nd
 * "⬇ CSV ทั้งหมด" button — the ENTIRE filtered result set (capped at EXPORT_CAP) —
 * then writes an admin_export_log audit row (PII: customer name + phone).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .or("hnote.neq.,hnoteuser.neq.")
 *   [+ optional .eq("hstatus", code)]
 *   .order("hdateupdate",{ascending:false,nullsFirst:false}).order("id",{ascending:false})
 * plus the same defensive whitespace-only client filter AND the same tb_users
 * name/phone join. The CSV columns mirror the page's CsvButton cols (= the <thead>) 1:1.
 * The ONLY difference here is unpaginated .range(0, EXPORT_CAP) + the audit log.
 *
 * RBAC matches the page: ops / sales_admin.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file; the
 * page wires it via an inline "use server" closure capturing the resolved status filter.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { LEGACY_ORDER_STATUS, legacyOrderStatusThai, type LegacyOrderCode } from "@/lib/legacy-status-map";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors the 10000 convention).
const EXPORT_CAP = 10000;

type RawOrderRow = {
  id: number;
  hno: string;
  hstatus: string | null;
  hnote: string | null;
  hnoteuser: string | null;
  hnotedate: string | null;
  hdateupdate: string | null;
  hdate: string | null;
  htotalpriceuser: number | string | null;
  userid: string;
};

type RawUserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
};

/** Active filter the page passes through (the resolved legacy hstatus code, if any). */
export type ServiceOrderNotesExportFilter = {
  /** Legacy single-char order-status code '1'..'6', or null for "ทั้งหมด". */
  status: LegacyOrderCode | null;
};

/**
 * Export the entire filtered service-order-notes list (capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (note-present + optional hstatus + the tb_users name/phone join), unpaginated.
 * Writes an admin_export_log audit row.
 */
export async function exportServiceOrderNotesAll(
  filter: ServiceOrderNotesExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // SAME gate as the page (notes view sits inside the purchasing module).
  await requireAdmin(["ops", "sales_admin"]);

  const admin = createAdminClient();

  // ── Pass 1: pull the note rows (SAME filter as the page) ────────
  let q = admin
    .from("tb_header_order")
    .select(
      "id,hno,hstatus,hnote,hnoteuser,hnotedate,hdateupdate,hdate,htotalpriceuser,userid",
    )
    .or("hnote.neq.,hnoteuser.neq.")
    .order("hdateupdate", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  const statusFilter =
    filter.status && (filter.status as LegacyOrderCode) in LEGACY_ORDER_STATUS
      ? (filter.status as LegacyOrderCode)
      : null;
  if (statusFilter) q = q.eq("hstatus", statusFilter);

  const { data, error } = await q;
  if (error) {
    console.error(`[exportServiceOrderNotesAll tb_header_order] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const raw = (data ?? []) as unknown as RawOrderRow[];

  // SAME defensive whitespace-only client filter as the page.
  const filtered = raw.filter(
    (r) => (r.hnote ?? "").trim() !== "" || (r.hnoteuser ?? "").trim() !== "",
  );

  const truncated = filtered.length > EXPORT_CAP;
  const noteRows = truncated ? filtered.slice(0, EXPORT_CAP) : filtered;

  // ── Pass 2: tb_users for the customer name + phone (SAME join) ───
  const userIds = Array.from(
    new Set(noteRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, RawUserRow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportServiceOrderNotesAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as RawUserRow[]) {
      userMap.set(u.userID, u);
    }
  }

  // SAME row mapping + column keys as the page's CsvButton (= the <thead>).
  const rows: CsvRow[] = noteRows.map((r) => {
    const updated = r.hdateupdate ?? r.hnotedate ?? r.hdate;
    const u = userMap.get(r.userid);
    const customerName = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
      : "";
    return {
      updated: updated ? String(updated).slice(0, 10) : "",
      hno: r.hno,
      userid: r.userid || "",
      customer: customerName,
      tel: u?.userTel ?? "",
      status: legacyOrderStatusThai(r.hstatus) || "",
      total:
        r.htotalpriceuser != null
          ? Number(r.htotalpriceuser).toLocaleString("th-TH", {
              minimumFractionDigits: 2,
            })
          : "",
      staff_note: (r.hnote ?? "").trim(),
      user_note: (r.hnoteuser ?? "").trim(),
    };
  });

  await logAdminExport({
    dataset: "service-order-notes",
    filters: { status: statusFilter ?? "all" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

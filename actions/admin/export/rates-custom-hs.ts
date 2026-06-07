"use server";

/**
 * Export-all (CSV) for /admin/rates/custom-hs — the per-customer rate-override
 * UPDATE HISTORY list (legacy pcs-admin/include/pages/hs-customrate/home.php).
 *
 * The page (app/[locale]/(admin)/admin/rates/custom-hs/page.tsx) lists every
 * tb_customrate_hs row (one entry per "admin updated this customer's rates"
 * moment), ordered by date DESC, optionally filtered by ?q= (exact userid), and
 * joins tb_users for the customer name / phone / VIP group (coID). It paginates
 * 50/page. The on-screen "⬇ CSV หน้านี้" downloads only the visible page; this
 * action backs the "⬇ CSV ทั้งหมด" button — the ENTIRE filtered history (capped
 * at EXPORT_CAP) — then writes an admin_export_log audit row (PII: customer
 * name + phone).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .order("date",{ascending:false})
 *   (+ .eq("userid", q.trim().toUpperCase()) when q present)
 * plus the same tb_users name join (userName/userLastName/userTel/coID). The CSV
 * columns mirror the page's <thead> / CsvButton cols 1:1. The page paginates
 * 50/page; the only difference here is unpaginated + EXPORT_CAP + the audit log.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing { q }.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

type HistoryRaw = {
  id: number;
  userid: string;
  date: string | null;
  adminid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  coID: string | null;
};

/** Active filters the page passes through (the optional userid search). */
export type RatesCustomHsExportFilter = {
  /** ?q= exact-userid filter (already-trimmed/uppercased upstream OK; we re-normalize). */
  q?: string;
};

/**
 * Export the entire filtered rate-override history (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * (date DESC + optional userid eq + the tb_users join), unpaginated. Writes an
 * admin_export_log audit row.
 */
export async function exportRatesCustomHsAll(
  filter: RatesCustomHsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();
  const q = filter.q?.trim().toUpperCase() || undefined;

  // ── Pass 1: the history rows ────────────────────────────────────
  // SAME filter/order as the page; capped (fetch one extra to detect truncation).
  let historyQ = admin
    .from("tb_customrate_hs")
    .select("id,userid,date,adminid")
    .order("date", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (q) historyQ = historyQ.eq("userid", q);
  const { data: histRaw, error } = await historyQ;
  if (error) {
    console.error(`[exportRatesCustomHsAll tb_customrate_hs] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (histRaw ?? []) as unknown as HistoryRaw[];
  const truncated = all.length > EXPORT_CAP;
  const history = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer name / phone / VIP group ───
  // SAME join the page does (LEFT JOIN tb_users ON userID = h.userid).
  const userIds = Array.from(
    new Set(history.map((h) => h.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userTel,coID")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportRatesCustomHsAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = history.map((h) => {
    const u = userMap.get(h.userid);
    const name = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim()
      : "";
    const row: CsvRow = {
      userid: h.userid ?? "",
      name: name || "—",
      tel: u?.userTel ?? "—",
      coID: u?.coID ?? "—",
      date: h.date ? new Date(h.date).toLocaleString("th-TH") : "—",
      adminid: h.adminid ?? "—",
    };
    return row;
  });

  await logAdminExport({
    dataset: "rates-custom-hs",
    filters: { q: q ?? null },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

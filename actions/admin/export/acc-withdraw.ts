"use server";

/**
 * Export-all (CSV) for /admin/accounting/withdraw — the ACCOUNTING view of
 * direct-transfer wallet withdrawals (legacy pcs-admin/acc-withdraw.php).
 *
 * The page (app/[locale]/(admin)/admin/accounting/withdraw/page.tsx) lists every
 * tb_wallet_hs row with type='3' (withdrawal) AND status='2' (succeeded) inside
 * the resolved date range (default = current month), joined to tb_users for the
 * customer name, ordered by wh.date ASC. It then client-slices that full result
 * set 50/page for display. The on-screen "⬇ CSV หน้านี้" downloads only the
 * visible page; this action backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE
 * filtered date range (capped at EXPORT_CAP) — then writes an admin_export_log
 * audit row (PII: customer name · MONEY — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("type","3").eq("status","2")
 *   .gte("date", startDate T00:00:00).lte("date", endDate T23:59:59)
 *   .order("date",{ascending:true})
 * plus the same tb_users name join. The CSV columns mirror the page's CsvButton
 * cols 1:1. The page has no DB-level pagination on this query (it client-slices),
 * so the ONLY difference here is the EXPORT_CAP guard + the audit log.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { startDate, endDate } range.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors withdrawals EXPORT_CAP).
const EXPORT_CAP = 10000;

// Status-label decoder (acc-withdraw.php L80-85 CASE). The filter pre-narrows to
// '2' = สำเร็จ, but the decode mirrors the legacy CASE for parity.
const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "สำเร็จ",
  "3": "ไม่สำเร็จ",
};

function statusName(s: string | null): string {
  return STATUS_LABEL[s ?? ""] ?? "ไม่ระบุ";
}

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped (matches page). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type WalletRaw = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number | string;
  status: string | null;
  userid: string;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
};

/** Active filters the page passes through (the resolved date range). */
export type AccWithdrawExportFilter = {
  /** Range start (YYYY-MM-DD) — the page's resolved startDate. */
  startDate: string;
  /** Range end (YYYY-MM-DD) — the page's resolved endDate. */
  endDate: string;
};

/**
 * Export the entire filtered accounting-withdrawal ledger (the resolved date
 * range, capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact filtered query (type='3' + status='2' + date range +
 * the tb_users name join), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportAccWithdrawAll(
  filter: AccWithdrawExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Legacy gate (acc-withdraw.php L46): CEO / Manager / QAAndQC / Accounting /
  // ITDT → closest V3 RBAC = super + accounting (same as the page).
  await requireAdmin(["super", "accounting"]);

  const { startDate, endDate } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull the withdrawal wallet rows ─────────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_wallet_hs")
    .select("id, date, dateslip, amount, status, userid")
    .eq("type", "3")
    .eq("status", "2")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportAccWithdrawAll tb_wallet_hs] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as WalletRaw[];
  const truncated = all.length > EXPORT_CAP;
  const walletRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer-name display ──────────────
  // SAME join the page does (LEFT JOIN tb_users ON userID = wh.userID).
  const userIds = Array.from(
    new Set(walletRows.map((w) => w.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportAccWithdrawAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

  // Juristic → company-name map (batched, N+1-free).
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = walletRows.map((w) => {
    const u = userMap.get(w.userid);
    // Juristic (นิติบุคคล) customers show the COMPANY name, not the person.
    const customerName = resolveBillingIdentity({
      userCompany: u?.userCompany ?? null,
      userName: u?.userName ?? null,
      userLastName: u?.userLastName ?? null,
      corp: corpRowFromName(corpNames.get(w.userid)),
    }).name;
    const amount = Number(w.amount);
    const row: CsvRow = {
      date: w.date ?? "",
      dateslip: w.dateslip ?? "",
      id: w.id,
      status: statusName(w.status),
      amount: numberFormat2(amount),
      // "เงินที่โอนคืน" = same value as "ยอดเงินที่ถอน" (direct-transfer waives fees).
      amount_refunded: numberFormat2(amount),
      // "ค่าบริการ" is hardcoded 0.00 in legacy (direct-transfer is fee-free).
      service_fee: numberFormat2(0),
      userid: w.userid ?? "",
      customer: customerName,
    };
    return row;
  });

  await logAdminExport({
    dataset: "acc-withdraw",
    filters: { startDate, endDate, type: "3", status: "2" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

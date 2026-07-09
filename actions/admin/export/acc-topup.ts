"use server";

/**
 * Export-all (CSV) for /admin/accounting/topup — the ACCOUNTING view of
 * approved wallet top-ups (legacy pcs-admin/acc-topup.php).
 *
 * The page (app/[locale]/(admin)/admin/accounting/topup/page.tsx) lists every
 * tb_wallet_hs row with status='2' (succeeded) AND imagesSlip<>'' (a slip was
 * attached) inside the resolved date range (default = current month), filtered
 * on wh.dateSlip (the date printed ON the slip — NOT wh.date, the system-create
 * timestamp), joined to tb_users for the customer name, ordered by wh.dateSlip
 * ASC (the legacy DataTables col-0 default sort). It then client-slices that
 * full result set 50/page for display. The on-screen "⬇ CSV หน้านี้" downloads
 * only the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด" button — the
 * ENTIRE filtered date range (capped at EXPORT_CAP) — then writes an
 * admin_export_log audit row (PII: customer name · MONEY — owner directive
 * 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("status","2")
 *   .not("imagesslip","is",null).neq("imagesslip","")
 *   .gte("dateslip", startDate T00:00:00).lte("dateslip", endDate T23:59:59)
 *   .order("dateslip",{ascending:true})
 * plus the same tb_users name join. The CSV columns mirror the page's CsvButton
 * cols 1:1 (7 cols). The page has no DB-level pagination on this query (it
 * client-slices), so the ONLY difference here is the EXPORT_CAP guard + audit.
 *
 * Legacy WHERE (acc-topup.php L83): `wh.status='2' AND imagesSlip<>''` — the
 * accounting cut of "รายการเติมเงิน" (approved, slip-backed top-ups). NOTE the
 * legacy has NO type filter (unlike acc-withdraw.php's type=3) — a top-up row
 * is identified by having a slip + being approved, across whatever wallet-hs
 * types carry a customer top-up.
 *
 * RBAC matches the page: super / accounting (legacy acc-topup.php L46 =
 * CEO / Manager / QAAndQC / Accounting / ITDT).
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

// Safety cap for the "export all filtered" path (mirrors acc-withdraw EXPORT_CAP).
const EXPORT_CAP = 10000;

// Status-label decoder (acc-topup.php statusWalletShopBadge — 1/2/3). The filter
// pre-narrows to '2' = สำเร็จ, but the decode mirrors the legacy for parity.
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
export type AccTopupExportFilter = {
  /** Range start (YYYY-MM-DD) — the page's resolved startDate. */
  startDate: string;
  /** Range end (YYYY-MM-DD) — the page's resolved endDate. */
  endDate: string;
};

/**
 * Export the entire filtered top-up ledger (the resolved date range, capped at
 * EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact
 * filtered query (status='2' + imagesSlip<>'' + dateslip range + the tb_users
 * name join), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportAccTopupAll(
  filter: AccTopupExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Legacy gate (acc-topup.php L46): CEO / Manager / QAAndQC / Accounting /
  // ITDT → closest V3 RBAC = super + accounting (same as the page).
  await requireAdmin(["super", "accounting"]);

  const { startDate, endDate } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull the top-up wallet rows ─────────────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_wallet_hs")
    .select("id, date, dateslip, amount, status, userid")
    .eq("status", "2")
    .not("imagesslip", "is", null)
    .neq("imagesslip", "")
    .gte("dateslip", `${startDate}T00:00:00`)
    .lte("dateslip", `${endDate}T23:59:59`)
    .order("dateslip", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportAccTopupAll tb_wallet_hs] failed`, {
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
      console.error(`[exportAccTopupAll tb_users] failed`, {
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

  // SAME row mapping + column keys as the page's CsvButton (7 cols).
  const rows: CsvRow[] = walletRows.map((w) => {
    const u = userMap.get(w.userid);
    // Juristic (นิติบุคคล) customers show the COMPANY name, not the person.
    const customerName = resolveBillingIdentity({
      userCompany: u?.userCompany ?? null,
      userName: u?.userName ?? null,
      userLastName: u?.userLastName ?? null,
      corp: corpRowFromName(corpNames.get(w.userid)),
    }).name;
    const row: CsvRow = {
      dateslip: w.dateslip ?? "",
      date: w.date ?? "",
      id: w.id,
      status: statusName(w.status),
      amount: numberFormat2(Number(w.amount)),
      userid: w.userid ?? "",
      customer: customerName,
    };
    return row;
  });

  await logAdminExport({
    dataset: "acc-topup",
    filters: { startDate, endDate, status: "2", hasSlip: true },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

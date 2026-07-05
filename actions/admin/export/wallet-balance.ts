"use server";

/**
 * "Export all filtered" CSV for /admin/wallet?view=balance (owner directive
 * 2026-06-07). Mirrors the golden /admin/leads pattern.
 *
 * DRIFT-FREE: this action replicates the EXACT query the balance view renders
 * for its on-screen rows (app/[locale]/(admin)/admin/wallet/balance-view.tsx) —
 * same tb_wallet select + same sort whitelist + same `q` (eq userid uppercase)
 * filter + same tb_users / tb_cash_back batch-joins. The ONLY difference is no
 * pagination: one capped page of up to EXPORT_CAP rows instead of the 50-row
 * window. The CSV columns + value-mapping match the page's CsvButton exactly.
 *
 * COLUMN-IDENTICAL columns (= page CsvButton):
 *   memberCode · coID · fullName · walletTotal · cashBack · status
 *
 * AUDIT: writes one admin_export_log row (dataset "wallet-balance") with the
 * active filters. PII/money surface — RBAC matches the page (ops/accounting).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "../export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the unpaginated "ทั้งหมด" pull. tb_wallet has ~9k rows, so
// 10,000 comfortably covers the full base in one file while bounding memory.
// If a slice ever exceeds this the export flags `truncated`.
const EXPORT_CAP = 10000;

// Page-level role gate — both wallet views read every customer's wallet PII via
// the service-role client, so the page gates ops/accounting (super implicit).
const ROLES = ["ops", "accounting"] as const;

// MUST match BALANCE_SORT_FIELDS in balance-view.tsx byte-for-byte.
const BALANCE_SORT_FIELDS: Record<string, string> = {
  wallettotal: "wallettotal",
  userid: "userid",
};

type WalletRow = { userid: string; wallettotal: number | null };
type CashBackRow = { userid: string; cbtotal: number | null };
type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  coID: string | null;
  userStatus: string | null;
};

export type WalletBalanceFilter = {
  q?: string;
  sort?: string;
  dir?: string;
};

/**
 * Export the ENTIRE filtered wallet-balance list (all pages, capped at
 * EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's
 * exact filter/sort so the export can never drift from the table.
 */
export async function exportWalletBalanceAll(
  filter: WalletBalanceFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Resolve + gate identity (same roles as the page). On a gate failure
  // requireAdmin redirects, so we never leak rows to an unauthorized caller.
  await requireAdmin([...ROLES]);
  const admin = createAdminClient();

  const q = filter.q?.trim();
  // Same sort whitelist + default (wallettotal desc · legacy parity).
  const sortKey = filter.sort && BALANCE_SORT_FIELDS[filter.sort] ? filter.sort : "wallettotal";
  const sortDir: "asc" | "desc" = filter.dir === "asc" ? "asc" : "desc";
  const sortColumn = BALANCE_SORT_FIELDS[sortKey];

  // ── tb_wallet (unpaginated · capped) — IDENTICAL to balance-view.tsx but
  // with .range(0, EXPORT_CAP-1) instead of the 50-row page window.
  let wq = admin
    .from("tb_wallet")
    .select("userid,wallettotal")
    .order(sortColumn, { ascending: sortDir === "asc" })
    .range(0, EXPORT_CAP - 1);
  if (q) wq = wq.eq("userid", q.toUpperCase());

  const { data: walletRowsRaw, error: walletErr } = await wq;
  if (walletErr) {
    console.error("[exportWalletBalanceAll] tb_wallet failed:", walletErr.message);
    return { rows: [], truncated: false };
  }
  const walletRows = (walletRowsRaw ?? []) as unknown as WalletRow[];

  // ── Batch-join tb_users + tb_cash_back (same shape as the page).
  const userIds = walletRows.map((r) => r.userid);
  const [userMap, cbMap] = await Promise.all([
    userIds.length === 0
      ? Promise.resolve(new Map<string, UserRow>())
      : admin
          .from("tb_users")
          .select("userID,userName,userLastName,userCompany,coID,userStatus")
          .in("userID", userIds)
          .then(({ data, error }) => {
            if (error) console.error("[exportWalletBalanceAll] tb_users failed:", error.message);
            return new Map(((data ?? []) as unknown as UserRow[]).map((u) => [u.userID, u]));
          }),
    userIds.length === 0
      ? Promise.resolve(new Map<string, number>())
      : admin
          .from("tb_cash_back")
          .select("userid,cbtotal")
          .in("userid", userIds)
          .then(({ data, error }) => {
            if (error) console.error("[exportWalletBalanceAll] tb_cash_back failed:", error.message);
            const m = new Map<string, number>();
            for (const r of (data ?? []) as unknown as CashBackRow[]) {
              m.set(r.userid, Number(r.cbtotal ?? 0));
            }
            return m;
          }),
  ]);

  // ── Juristic → company-name map (batched, N+1-free) ───────────────
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Map to CSV rows — SAME keys/value-mapping as the page CsvButton.
  const rows: CsvRow[] = walletRows.map((r) => {
    const u = userMap.get(r.userid);
    const fullName = u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(corpNames.get(r.userid)),
        }).name
      : "";
    const cb = cbMap.get(r.userid) ?? 0;
    const wt = Number(r.wallettotal ?? 0);
    const isSuspended = u?.userStatus === "0";
    return {
      memberCode: r.userid,
      coID: u?.coID ?? "",
      fullName,
      walletTotal: wt.toFixed(2),
      cashBack: cb.toFixed(2),
      status: isSuspended ? "ระงับ" : "ใช้งาน",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "wallet-balance",
    filters: { q: q ?? "", sort: sortKey, dir: sortDir },
    rowCount: rows.length,
    truncated,
  });
  return { rows, truncated };
}

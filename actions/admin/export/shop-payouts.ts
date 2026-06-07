"use server";

/**
 * Export-all (CSV) for /admin/shop-payouts — the admin shop-wallet payout queue.
 *
 * The page (app/[locale]/(admin)/admin/shop-payouts/page.tsx) lists every
 * tb_shop_transactions row whose kind IN ('withdraw','transfer_out'), optionally
 * narrowed by ?status=, ordered by created_at DESC, joined to profiles for the
 * customer identity. The page DB-paginates 50/page; the on-screen "⬇ CSV หน้านี้"
 * downloads only the visible page. This action backs the 2nd "⬇ CSV ทั้งหมด"
 * button — the ENTIRE filtered result set (capped at EXPORT_CAP) — and writes an
 * admin_export_log audit row (PII: customer name/phone · MONEY).
 *
 * DRIFT-FREE: re-runs the page's EXACT filter, unpaginated:
 *   .in("kind", ["withdraw","transfer_out"])
 *   .eq("status", status)            // only when a status filter is active
 *   .order("created_at", { ascending: false })
 * plus the same profiles!profile_id join. CSV columns mirror the page's CsvButton
 * cols 1:1. The only difference is .range(0, EXPORT_CAP) + the audit log.
 *
 * RBAC matches the page: accounting / ops.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file; the
 * page wires it via an inline "use server" closure capturing the active status.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

const EXPORT_CAP = 10000;

const STATUS_LABEL: Record<string, string> = {
  pending:   "รอตรวจ",
  completed: "โอนแล้ว",
  cancelled: "ปฏิเสธ",
  failed:    "ล้มเหลว",
};

type Profile = {
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
};

type Raw = {
  id: number;
  amount: number | string;
  kind: string | null;
  status: string;
  note: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  rejected_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  profile: Profile | Profile[] | null;
};

/** Active filter the page passes through (the status pill, optional). */
export type ShopPayoutsExportFilter = {
  /** Status filter — undefined = ทั้งหมด. */
  status?: string;
};

/** Money formatter mirroring the page (฿ + 2dp, abs). */
function money(n: number | string): string {
  return (
    "฿" +
    Math.abs(Number(n)).toLocaleString("th-TH", { minimumFractionDigits: 2 })
  );
}

/**
 * Export the entire filtered shop-wallet payout queue (capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact filtered query
 * unpaginated. Writes an admin_export_log audit row.
 */
export async function exportShopPayoutsAll(
  filter: ShopPayoutsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["accounting", "ops"]);

  const { status } = filter;
  const admin = createAdminClient();

  let q = admin
    .from("tb_shop_transactions")
    .select(`
      id, amount, kind, status, note,
      bank_name, account_name, account_number,
      rejected_reason, reviewed_at, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone )
    `)
    .in("kind", ["withdraw", "transfer_out"])
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    console.error(`[exportShopPayoutsAll tb_shop_transactions] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (data ?? []) as unknown as Raw[];
  const truncated = all.length > EXPORT_CAP;
  const payoutRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  const rows: CsvRow[] = payoutRows.map((r) => {
    const profile = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    const isWithdraw = r.kind === "withdraw";
    return {
      created_at: r.created_at ? r.created_at.slice(0, 10) : "",
      member_code: profile?.member_code ?? "",
      customer: `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim(),
      phone: profile?.phone ?? "",
      amount: money(r.amount),
      bank_name: isWithdraw ? (r.bank_name ?? "") : "— (transfer)",
      account_name: isWithdraw ? (r.account_name ?? "") : "",
      account_number: isWithdraw ? (r.account_number ?? "") : "",
      note: r.note ?? "",
      status: STATUS_LABEL[r.status] ?? r.status,
      rejected_reason: r.rejected_reason ?? "",
      reviewed_at: r.reviewed_at ? r.reviewed_at.slice(0, 10) : "",
    };
  });

  await logAdminExport({
    dataset: "shop-payouts",
    filters: { status: status ?? null },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

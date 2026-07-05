"use server";

/**
 * Export-all (CSV) for /admin/wallet/withdrawals — the customer-WITHDRAW queue.
 *
 * The page (app/[locale]/(admin)/admin/wallet/withdrawals/page.tsx) lists
 * tb_wallet_hs type='3' (customer withdraw) rows for ONE status tab
 * (status ∈ {'1' รออนุมัติ · '2' จ่ายแล้ว · '3' ปฏิเสธ}, default '1'),
 * 50/page, joined to tb_users for name/tel. The on-screen "⬇ CSV หน้านี้"
 * downloads only the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด"
 * button — the ENTIRE filtered status tab (capped at EXPORT_CAP), then writes
 * an admin_export_log audit row (PII: bank account name + note are
 * user-controlled · MONEY — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("type","3").eq("status",status).order("date",{ascending:false})
 * — the ONLY difference is no .range() pagination (one capped page instead of
 * the 50-row window). The CSV columns mirror the page's CsvButton cols 1:1.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing `statusFilter`.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path (mirrors leads EXPORT_CAP).
const EXPORT_CAP = 10000;

// Same status labels the page uses for the human-readable "สถานะ" column.
const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "จ่ายแล้ว",
  "3": "ปฏิเสธ (คืนเงินแล้ว)",
};

type WhsRow = {
  id: number;
  date: string | null;
  amount: number | null;
  status: string | null;
  depositnamebank: string | null;
  nameuserbank: string | null;
  nouserbank: string | null;
  note: string | null;
  userid: string | null;
  adminidupdate: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

/**
 * Export the entire filtered withdrawal queue (one status tab) as CSV rows.
 * `status` is the page's resolved `statusFilter` ('1' | '2' | '3').
 */
export async function exportWithdrawalsAll(
  status: string,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Money page → accounting + ops (super implicit) — same gate as the page.
  await requireAdmin(["ops", "accounting"]);

  // Defensively normalise the status (mirror the page: anything else → '1').
  const statusFilter = status === "2" || status === "3" ? status : "1";

  const admin = createAdminClient();

  // SAME filter as the page, minus pagination — capped (fetch one extra to
  // detect truncation honestly).
  const { data: rowsRaw, error } = await admin
    .from("tb_wallet_hs")
    .select(
      "id,date,amount,status,depositnamebank,nameuserbank,nouserbank,note,userid,adminidupdate",
    )
    .eq("type", "3")
    .eq("status", statusFilter)
    .order("date", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportWithdrawalsAll tb_wallet_hs] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as WhsRow[];
  const truncated = all.length > EXPORT_CAP;
  const whs = truncated ? all.slice(0, EXPORT_CAP) : all;

  // Merge customer names — same join the page does.
  const userIds = Array.from(
    new Set(whs.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  let userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportWithdrawalsAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    userMap = new Map(
      ((usersRaw ?? []) as unknown as URow[]).map((u) => [u.userID, u]),
    );
  }

  // ── Juristic → company-name map (batched, N+1-free) ───────────────
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // Same row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = whs.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(r.userid ? corpNames.get(r.userid) : undefined),
        }).name
      : "";
    const row: CsvRow = {
      id: r.id,
      date: r.date ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      amount: Number(r.amount ?? 0).toFixed(2),
      bank: r.depositnamebank ?? "",
      bank_account_name: r.nameuserbank ?? "",
      bank_account_no: r.nouserbank ?? "",
      status: STATUS_LABEL[r.status ?? ""] ?? r.status ?? "",
      admin_action_by: r.adminidupdate ?? "",
      note: r.note ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "withdrawals",
    filters: { status: statusFilter, type: "3" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

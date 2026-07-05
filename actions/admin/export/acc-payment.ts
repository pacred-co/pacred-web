"use server";

/**
 * "Export all filtered" CSV for /admin/accounting/payment (owner directive
 * 2026-06-07 — accounting wants the yuan-transfer reconciliation ledger in a
 * spreadsheet).
 *
 * The /admin/accounting/payment list page resolves a date range (3 modes:
 * dateGroup year+month / custom date range / default current month), then runs
 * the legacy acc-payment.php 3-pass join (tb_wallet_hs type=6 ← tb_payment
 * payStatus=2 ← tb_users) and renders a date-ASC ledger, paginated 50/page in
 * the <tbody>. This action re-runs that EXACT same 3-pass query for the SAME
 * resolved date range, UNPAGINATED (one capped page up to EXPORT_CAP), and maps
 * to the same CsvRow columns as the page CsvButton — so the export can never
 * drift from the on-screen table.
 *
 * The ledger exposes per-customer transaction amounts + the customer name → the
 * full export is audited via admin_export_log (logAdminExport).
 *
 * RBAC matches the page: super / accounting.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path. A single month of yuan
// transfers is far below this; 10,000 bounds the in-memory build while
// comfortably covering any sane date filter. If a slice exceeds it the export
// flags `truncated` so the operator narrows the date range.
const EXPORT_CAP = 10000;

/** One CSV row for the acc-payment export (matches the on-screen columns). */
export type AccPaymentExportRow = Record<string, string | number | null | undefined>;

/** The page's resolved filter — the date range it already computed from its
 *  three URL modes. Passed through so this action filters identically. */
export type AccPaymentExportFilter = {
  /** Resolved start date "YYYY-MM-DD". */
  startDate: string;
  /** Resolved end date "YYYY-MM-DD". */
  endDate: string;
};

/** Legacy PHP `number_format($n, 2)` — produces "1,234.56". Mirrors the page's
 *  numberFormat2 so the exported money strings match the table verbatim. */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function payStatusName(s: string | null): string {
  switch (s) {
    case "1": return "รอดำเนินการ";
    case "2": return "สำเร็จ";
    case "3": return "ไม่สำเร็จ";
    default:  return "ไม่ระบุ";
  }
}

type WalletRow = { date: string | null; reforder: string };
type PaymentRaw = {
  id: number;
  paydate: string | null;
  paystatus: string | null;
  payyuan: number | string;
  payrate: number | string;
  payratecost: number | string;
  userid: string;
};

/**
 * Export the ENTIRE filtered yuan-transfer ledger (all pages, capped at
 * EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button on
 * /admin/accounting/payment. Reuses the page's exact 3-pass query for the same
 * resolved date range, unpaginated. Writes an admin_export_log audit row.
 */
export async function exportAccPaymentAll(
  filter: AccPaymentExportFilter,
): Promise<{ rows: AccPaymentExportRow[]; truncated: boolean }> {
  // RBAC — same roles the page gates on.
  const { roles } = await requireAdmin(["super", "accounting"]);
  // Money-internal: omit เรทต้นทุน (rate_cost), ต้นทุน PCS (cost_pcs), and the
  // derived ค่าบริการ (service_fee = charge - cost) unless the exporter may see
  // money internals (ultra/accounting/pricing — NOT super). DERIVED-VALUE TRAP:
  // service_fee reveals cost, hidden together.
  const showCost = canViewCostProfit(roles);

  const admin = createAdminClient();
  const { startDate, endDate } = filter;

  // ── Pass 1: type=6 wallet events in the date range (date ASC) ─────
  const { data: walletData, error: walletErr } = await admin
    .from("tb_wallet_hs")
    .select("date, reforder")
    .eq("type", "6")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true })
    .range(0, EXPORT_CAP - 1);
  if (walletErr) {
    console.error(`[exportAccPaymentAll] tb_wallet_hs query failed`, {
      code: walletErr.code,
      message: walletErr.message,
    });
    return { rows: [], truncated: false };
  }
  const walletRows = (walletData ?? []) as WalletRow[];

  // Parent-payment id list (refOrder stores the bigint ID as a string).
  const paymentIds = Array.from(
    new Set(
      walletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );

  // ── Pass 2: tb_payment rows (payStatus=2 สำเร็จ) ──────────────────
  const payRowsById = new Map<number, PaymentRaw>();
  if (paymentIds.length > 0) {
    const { data: payData, error: payErr } = await admin
      .from("tb_payment")
      .select("id, paydate, paystatus, payyuan, payrate, payratecost, userid")
      .eq("paystatus", "2")
      .in("id", paymentIds);
    if (payErr) {
      console.error(`[exportAccPaymentAll] tb_payment query failed`, {
        code: payErr.code,
        message: payErr.message,
      });
      return { rows: [], truncated: false };
    }
    for (const r of (payData ?? []) as unknown as PaymentRaw[]) {
      payRowsById.set(r.id, r);
    }
  }

  // ── Pass 3: tb_users for the customer name display ────────────────
  const userIds = Array.from(
    new Set(
      Array.from(payRowsById.values())
        .map((p) => p.userid)
        .filter(Boolean),
    ),
  );
  const userById = new Map<
    string,
    { username: string; userlastname: string; usercompany: string | null }
  >();
  if (userIds.length > 0) {
    const { data: usersData, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportAccPaymentAll] tb_users query failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
      return { rows: [], truncated: false };
    }
    for (const u of (usersData ?? []) as Array<{
      userID: string;
      userName: string;
      userLastName: string;
      userCompany: string | null;
    }>) {
      userById.set(u.userID, {
        username: u.userName,
        userlastname: u.userLastName,
        usercompany: u.userCompany,
      });
    }
  }

  // ── Juristic → company-name map (batched, N+1-free) ───────────────
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Assemble in legacy order (wh.date ASC); drop unmatched events ─
  const rows: AccPaymentExportRow[] = [];
  for (const w of walletRows) {
    const pid = Number(w.reforder);
    const p = payRowsById.get(pid);
    if (!p) continue;
    const u =
      userById.get(p.userid) ??
      { username: "", userlastname: "", usercompany: null };
    const identity = resolveBillingIdentity({
      userCompany: u.usercompany,
      userName: u.username,
      userLastName: u.userlastname,
      corp: corpRowFromName(corpNames.get(p.userid)),
    });
    const payyuan = Number(p.payyuan);
    const payrate = Number(p.payrate);
    const payratecost = Number(p.payratecost);
    const sumUser = payyuan * payrate;
    const sumCost = payyuan * payratecost;
    const profit = sumUser - sumCost;
    rows.push({
      paid_date: w.date ?? "",
      created_date: p.paydate ?? "",
      order_no: w.reforder,
      status: payStatusName(p.paystatus),
      yuan: numberFormat2(payyuan),
      // Money-internal cost / derived ค่าบริการ — omitted entirely unless allowed.
      ...(showCost ? { rate_cost: numberFormat2(payratecost) } : {}),
      rate_customer: numberFormat2(payrate),
      charge_customer: numberFormat2(sumUser),
      ...(showCost
        ? {
            cost_pcs: numberFormat2(sumCost),
            service_fee: numberFormat2(profit),
          }
        : {}),
      member_code: p.userid,
      customer_name: identity.name,
    });
  }

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "acc-payment",
    filters: { startDate, endDate },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

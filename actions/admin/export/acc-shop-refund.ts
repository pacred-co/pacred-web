"use server";

/**
 * Export-all (CSV) for /admin/accounting/shop-refund — the บัญชี (accounting)
 * view of ฝากสั่งซื้อ (shop-order) refunds back into the customer's PCS Wallet
 * (legacy pcs-admin/acc-shop-refund.php).
 *
 * The page (app/[locale]/(admin)/admin/accounting/shop-refund/page.tsx) is a
 * faithful 1:1 transcription of `acc-shop-refund.php` — every wallet-refund
 * event (`tb_wallet_hs.type=5` AND `status=2`) inside the resolved date range,
 * joined through the order (`o.ID=wh.refOrder`) up to the shop-order header
 * (`oh.hNo=o.hNo`) for the order-no + สถานะสินค้า, and to `tb_users` for the
 * customer name, GROUPed by `wh.ID` (the wallet PK → no collapse) + ORDER BY
 * wh.date ASC. It then client-slices that full result set 50/page for display.
 *
 * The on-screen "⬇ CSV หน้านี้" downloads only the visible page; this action
 * backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE filtered date range (capped
 * at EXPORT_CAP) — then writes an admin_export_log audit row (PII: customer
 * name · MONEY: refund amount — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   tb_wallet_hs .eq("type","5").eq("status","2")
 *     .gte("date", startDate T00:00:00).lte("date", endDate T23:59:59)
 *     .order("date",{ascending:true})
 *   + the reforder→tb_order→hno→tb_header_order.hstatus join + the tb_users name
 *   join. The CSV columns mirror the page's <CsvButton> cols 1:1. The page has
 *   no DB-level pagination on this query (it client-slices), so the ONLY
 *   difference here is the EXPORT_CAP guard + the audit log.
 *
 * FAITHFUL NOTE — the legacy renders 4 of the money columns as the literal
 * string "ยังระบุไม่ได้" (acc-shop-refund.php L222-225: ลูกค้าจ่ายมา /
 * จ่ายเงินร้านค้า / ร้านคืนให้ PCS หยวน / เรทตอนที่คืนเงินมา are NOT yet
 * derivable in legacy) — replicated verbatim. Only two real values: the refund
 * into Wallet (= wh.amount, L226) and ค่าบริการ (hardcoded 0.00, L227).
 *
 * RBAC matches the page: super / accounting (acc-shop-refund.php L46 →
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

// Safety cap for the "export all filtered" path (mirrors the other exports).
const EXPORT_CAP = 10000;

// Legacy placeholder for the 4 not-yet-derivable money columns
// (acc-shop-refund.php L222-225).
const NOT_YET = "ยังระบุไม่ได้";

/**
 * hStatus → label decoder (acc-shop-refund.php L206-213 CASE). "40" (ถึงโกดังจีน)
 * is the owner-added 2026-06-16 MOMO-arrival status that legacy predates — kept
 * in sync with the sibling acc-shop.ts so a "40" header order doesn't fall
 * through to "ไม่พบข้อมูล".
 */
function hStatusLabel(s: string | null): string {
  switch (s) {
    case "1":
      return "รอดำเนินการ";
    case "2":
      return "รอชำระเงิน";
    case "3":
      return "สั่งสินค้า";
    case "4":
      return "รอร้านจีนจัดส่ง";
    case "40":
      return "ถึงโกดังจีน"; // owner 2026-06-16 · MOMO arrival
    case "5":
      return "สำเร็จ";
    case "6":
      return "ยกเลิกออเดอร์";
    default:
      return "ไม่พบข้อมูล";
  }
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

type WalletRefundRaw = {
  id: number;
  date: string | null;
  amount: number | string;
  reforder: string;
  userid: string;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
};

/** The resolved date range the page computed from its filter searchParams. */
export type AccShopRefundExportFilter = {
  /** "YYYY-MM-DD" inclusive start (page's `startDate`). */
  startDate: string;
  /** "YYYY-MM-DD" inclusive end (page's `endDate`). */
  endDate: string;
};

/**
 * Export the entire filtered shop-refund ledger (the resolved date range, capped
 * at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's
 * exact filtered query (type='5' + status='2' + date range + the order→header
 * hStatus join + the tb_users name join), unpaginated. Writes an
 * admin_export_log audit row.
 */
export async function exportAccShopRefundAll(
  filter: AccShopRefundExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Legacy gate (acc-shop-refund.php L46): CEO / Manager / QAAndQC / Accounting /
  // ITDT → closest V3 RBAC = super + accounting (same as the page).
  await requireAdmin(["super", "accounting"]);

  const { startDate, endDate } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull the refund wallet rows ─────────────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_wallet_hs")
    .select("id, date, amount, reforder, userid")
    .eq("type", "5")
    .eq("status", "2")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportAccShopRefundAll tb_wallet_hs] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as WalletRefundRaw[];
  const truncated = all.length > EXPORT_CAP;
  const walletRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: reforder → tb_order.id → hNo map ────────────────────
  // Legacy `LEFT JOIN tb_order AS o ON o.ID=wh.refOrder`.
  const orderIds = Array.from(
    new Set(
      walletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  const hnoByOrderId = new Map<number, string>();
  if (orderIds.length > 0) {
    const { data: ordersRaw, error: ordersErr } = await admin
      .from("tb_order")
      .select("id, hno")
      .in("id", orderIds);
    if (ordersErr) {
      console.error(`[exportAccShopRefundAll tb_order] failed`, {
        code: ordersErr.code,
        message: ordersErr.message,
      });
    }
    for (const o of (ordersRaw ?? []) as Array<{ id: number; hno: string }>) {
      if (o.hno) hnoByOrderId.set(o.id, o.hno);
    }
  }

  // ── Pass 3: hNo → tb_header_order.hStatus map ───────────────────
  // Legacy `LEFT JOIN tb_header_order AS oh ON oh.hNo=o.hNo`.
  const hnos = Array.from(new Set(Array.from(hnoByOrderId.values())));
  const hstatusByHno = new Map<string, string | null>();
  if (hnos.length > 0) {
    const { data: headersRaw, error: headersErr } = await admin
      .from("tb_header_order")
      .select("hno, hstatus")
      .in("hno", hnos);
    if (headersErr) {
      console.error(`[exportAccShopRefundAll tb_header_order] failed`, {
        code: headersErr.code,
        message: headersErr.message,
      });
    }
    for (const h of (headersRaw ?? []) as Array<{
      hno: string;
      hstatus: string | null;
    }>) {
      if (!hstatusByHno.has(h.hno)) hstatusByHno.set(h.hno, h.hstatus);
    }
  }

  // ── Pass 4: tb_users for the customer-name display ──────────────
  // Legacy `LEFT JOIN tb_users AS u ON u.userID=wh.userID`.
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
      console.error(`[exportAccShopRefundAll tb_users] failed`, {
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

  // ── Assemble in legacy order (GROUP BY wh.ID + ORDER BY wh.date ASC) ──
  const rows: CsvRow[] = walletRows.map((w) => {
    const orderId = Number(w.reforder);
    const hno = Number.isFinite(orderId) ? hnoByOrderId.get(orderId) ?? "" : "";
    const hstatus = hno ? hstatusByHno.get(hno) ?? null : null;
    const u = userMap.get(w.userid);
    // Juristic (นิติบุคคล) customers show the COMPANY name, not the person.
    const customerName = resolveBillingIdentity({
      userCompany: u?.userCompany ?? null,
      userName: u?.userName ?? null,
      userLastName: u?.userLastName ?? null,
      corp: corpRowFromName(corpNames.get(w.userid)),
    }).name;
    return {
      // 1 — วันที่ทำรายการ (wh.date)
      date: w.date ?? "",
      // 2 — ประเภท (literal "ฝากสั่งซื้อ")
      type: "ฝากสั่งซื้อ",
      // 3 — รายการอ้างอิง (o.hNo)
      order_no: hno,
      // 4 — สถานะสินค้า (oh.hStatus decoded)
      status: hStatusLabel(hstatus),
      // 5 — เลขที่คืนเงิน (wh.ID)
      refund_id: w.id,
      // 6-9 — legacy literal placeholders (acc-shop-refund.php L222-225)
      pay_user: NOT_YET,
      pay_shop: NOT_YET,
      shop_refund_yuan: NOT_YET,
      refund_rate: NOT_YET,
      // 10 — เงินที่คืนลูกค้าเข้า PCS Wallet (wh.amount)
      refund_wallet: numberFormat2(w.amount),
      // 11 — ค่าบริการ (hardcoded 0.00 in legacy)
      service_fee: numberFormat2(0),
      // 12 — รหัสสมาชิก (wh.userID)
      member_code: w.userid ?? "",
      // 13 — ชื่อ-นามสกุล / ชื่อบริษัท (juristic → company name)
      customer_name: customerName,
    };
  });

  await logAdminExport({
    dataset: "acc-shop-refund",
    filters: { startDate, endDate, type: "5", status: "2" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

"use server";

/**
 * Export-all (CSV) for /admin/accounting/shop — the บัญชี (accounting)
 * shop-order revenue / AR reconciliation ledger (owner directive 2026-06-07:
 * accounting wants these reconciliation lists in a spreadsheet).
 *
 * The page (app/[locale]/(admin)/admin/accounting/shop/page.tsx) is a faithful
 * 1:1 transcription of legacy `pcs-admin/acc-shop.php` — every cleared
 * (`wh.status='2'`) shop-order wallet event tied to a non-empty
 * `tb_header_order.hNo`, GROUPed so each hNo collapses to one row, joined to
 * tb_users for the name + to a type=5 refund-lookup map for the "คืนเงินลูกค้า"
 * column. It computes per-order margin (ราคาขาย − ต้นทุน = ค่าบริการ) and a
 * pinned totals row, then client-slices `rows` 50/page for display.
 *
 * The page's on-screen "⬇ CSV หน้านี้" downloads only the displayed 50-row
 * window. THIS action backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE
 * filtered ledger (capped at EXPORT_CAP), then writes an admin_export_log audit
 * row (PII: customer name; FINANCE: margin figures).
 *
 * DRIFT-FREE: re-runs the EXACT same multi-pass query the page runs — same
 * filter modes (dateGroup year/month · custom date range · default current
 * month) resolved to the same [startDate, endDate], same refund map (type=5 /
 * status='2' across ALL dates, matched by hNo — the legacy date filter is
 * deliberately NOT applied here, mirroring acc-shop.php L112-113), same
 * GROUP BY hNo collapse + ORDER BY wh.date ASC, same derived columns. The ONLY
 * difference vs the page is the displayed window is not sliced (export ALL rows
 * up to EXPORT_CAP). The CSV column keys/labels/value-mapping mirror the page's
 * <CsvButton> cols 1:1.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { startDate, endDate } range.
 *
 * Auth — SAME gate as the page (acc-shop.php L46 → V3 RBAC super + accounting).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all filtered" path (mirrors the other exports).
const EXPORT_CAP = 10000;

/** Legacy `number_format($n, 2)` — "1,234.56" thousand-grouped (matches page). */
function numberFormat2(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  if (Number.isNaN(v)) return "0.00";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** hStatus → label (acc-shop.php L225-232 CASE · matches page hStatusBadge). */
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

/** The resolved date range the page computed from its filter searchParams. */
export type AccShopExportFilter = {
  /** "YYYY-MM-DD" inclusive start (page's `startDate`). */
  startDate: string;
  /** "YYYY-MM-DD" inclusive end (page's `endDate`). */
  endDate: string;
};

type WalletRefundRaw = { amount: number | string; reforder: string };
type WalletShopRaw = { date: string | null; amount: number | string; reforder: string };
type HeaderRaw = {
  hno: string;
  hdate: string | null;
  hstatus: string | null;
  htotalpricechn: number | string;
  hshippingchn: number | string;
  hrate: number | string;
  hratecost: number | string;
  hcostall: number | string;
  userid: string;
};

/**
 * Export the entire filtered shop-order ledger (all pages, capped) as CSV rows
 * for the "⬇ CSV ทั้งหมด" button on /admin/accounting/shop. Reuses the page's
 * exact multi-pass filtered query, unpaginated. Writes an admin_export_log row.
 */
export async function exportAccShopAll(
  filter: AccShopExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // SAME gate as the page (acc-shop.php L46 → super + accounting).
  await requireAdmin(["super", "accounting"]);

  const admin = createAdminClient();
  const { startDate, endDate } = filter;

  // ── Pass 1: refund-lookup map ($sql_reWallet) — type=5/status='2',
  //    matched by hNo across ALL dates (legacy date filter NOT applied). ─────
  const refundWalletRes = await admin
    .from("tb_wallet_hs")
    .select("amount, reforder")
    .eq("type", "5")
    .eq("status", "2");
  if (refundWalletRes.error) {
    console.error("[exportAccShopAll refund tb_wallet_hs] failed", {
      code: refundWalletRes.error.code,
      message: refundWalletRes.error.message,
    });
    return { rows: [], truncated: false };
  }
  const refundWalletRows = (refundWalletRes.data ?? []) as unknown as WalletRefundRaw[];

  const refundOrderIds = Array.from(
    new Set(
      refundWalletRows
        .map((w) => Number(w.reforder))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  );
  const orderHnoById = new Map<number, string>();
  if (refundOrderIds.length > 0) {
    const orderRes = await admin
      .from("tb_order")
      .select("id, hno")
      .in("id", refundOrderIds);
    if (orderRes.error) {
      console.error("[exportAccShopAll tb_order] failed", {
        code: orderRes.error.code,
        message: orderRes.error.message,
      });
    }
    for (const o of (orderRes.data ?? []) as Array<{ id: number; hno: string }>) {
      if (o.hno) orderHnoById.set(o.id, o.hno);
    }
  }

  const refundByHno = new Map<string, number>();
  for (const w of refundWalletRows) {
    const orderId = Number(w.reforder);
    if (!Number.isFinite(orderId)) continue;
    const hno = orderHnoById.get(orderId);
    if (!hno) continue;
    const prev = refundByHno.get(hno) ?? 0;
    refundByHno.set(hno, prev + Number(w.amount));
  }

  // ── Pass 2: main ledger ($sql_Table) — cleared wallet events tied to a
  //    non-empty hNo within the date range, ORDER BY wh.date ASC. ────────────
  //    Capped: fetch one extra to detect truncation honestly.
  const walletRes = await admin
    .from("tb_wallet_hs")
    .select("date, amount, reforder")
    .eq("status", "2")
    .not("reforder", "is", null)
    .neq("reforder", "")
    .gte("date", `${startDate}T00:00:00`)
    .lte("date", `${endDate}T23:59:59`)
    .order("date", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (walletRes.error) {
    console.error("[exportAccShopAll ledger tb_wallet_hs] failed", {
      code: walletRes.error.code,
      message: walletRes.error.message,
    });
    return { rows: [], truncated: false };
  }
  const walletRows = (walletRes.data ?? []) as unknown as WalletShopRaw[];

  const candidateHnos = Array.from(
    new Set(walletRows.map((w) => w.reforder).filter((s) => !!s && s !== "")),
  );

  // ── Pass 2a: tb_header_order rows for those hnos ─────────────────────────
  const headerByHno = new Map<string, HeaderRaw>();
  if (candidateHnos.length > 0) {
    const headerRes = await admin
      .from("tb_header_order")
      .select(
        "hno, hdate, hstatus, htotalpricechn, hshippingchn, hrate, hratecost, hcostall, userid",
      )
      .in("hno", candidateHnos);
    if (headerRes.error) {
      console.error("[exportAccShopAll tb_header_order] failed", {
        code: headerRes.error.code,
        message: headerRes.error.message,
      });
    }
    for (const h of (headerRes.data ?? []) as unknown as HeaderRaw[]) {
      if (!headerByHno.has(h.hno)) headerByHno.set(h.hno, h);
    }
  }

  // ── Pass 2b: tb_users for the customer-name display ──────────────────────
  const userIds = Array.from(
    new Set(
      Array.from(headerByHno.values())
        .map((h) => h.userid)
        .filter(Boolean),
    ),
  );
  const userById = new Map<string, { username: string; userlastname: string }>();
  if (userIds.length > 0) {
    const usersRes = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", userIds);
    if (usersRes.error) {
      console.error("[exportAccShopAll tb_users] failed", {
        code: usersRes.error.code,
        message: usersRes.error.message,
      });
    }
    for (const u of (usersRes.data ?? []) as Array<{
      userID: string;
      userName: string;
      userLastName: string;
    }>) {
      userById.set(u.userID, { username: u.userName, userlastname: u.userLastName });
    }
  }

  // ── Assemble in legacy order (GROUP BY hNo + ORDER BY wh.date ASC) ────────
  const seenHnos = new Set<string>();
  const rows: CsvRow[] = [];
  for (const w of walletRows) {
    const hno = w.reforder;
    if (!hno || seenHnos.has(hno)) continue;
    const h = headerByHno.get(hno);
    if (!h) continue; // legacy `ho.hNo<>''` drops unjoined rows
    seenHnos.add(hno);
    const u = userById.get(h.userid) ?? { username: "", userlastname: "" };

    const amount = Number(w.amount);
    const htotalpricechn = Number(h.htotalpricechn);
    const hshippingchn = Number(h.hshippingchn);
    const hrate = Number(h.hrate);
    const hratecost = Number(h.hratecost);
    const hcostall = Number(h.hcostall);

    const priceUser = (htotalpricechn + hshippingchn) * hrate;
    const pricePCS = hratecost * hcostall;
    const returnWallet = refundByHno.get(hno) ?? 0;
    const profit = h.hstatus === "6" ? 0 : priceUser - pricePCS;

    // SAME column keys/labels/value-mapping as the page <CsvButton> cols.
    rows.push({
      pay_date: w.date ?? "",
      create_date: h.hdate ?? "",
      order_no: hno,
      status: hStatusLabel(h.hstatus),
      pay_user: numberFormat2(amount),
      return_wallet: numberFormat2(returnWallet),
      price_sell: numberFormat2(priceUser),
      cost: numberFormat2(pricePCS),
      service_fee: numberFormat2(profit),
      member_code: h.userid,
      customer_name: `${u.username} ${u.userlastname}`.trim(),
    });

    if (rows.length >= EXPORT_CAP) break;
  }

  // Truncation: either the wallet pass capped, OR we hit the row cap above.
  const truncated = walletRows.length > EXPORT_CAP || rows.length >= EXPORT_CAP;

  await logAdminExport({
    dataset: "acc-shop",
    filters: { startDate, endDate },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

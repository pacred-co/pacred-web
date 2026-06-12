/**
 * Shared aggregation helpers for the two per-customer revenue reports:
 *   /admin/reports/user-all     (report-user-all.php — ยอดรวมทุกบริการ)
 *   /admin/reports/sales-group  (report-sales-group-by-user.php — ยอดขายรวมตามรหัส)
 *
 * Faithful to the legacy PHP aggregation (read from disk per AGENTS §0a/§0b):
 *   ฝากสั่งซื้อ (shop)   → tb_header_order: SUM(htotalpriceuser), COUNT(hno)  WHERE hstatus<>6 GROUP BY userid
 *   ฝากนำเข้า (import)   → tb_forwarder:    SUM(ftotalprice),    COUNT(id)    GROUP BY userid
 *   ฝากโอน (yuan)        → tb_payment:      SUM(paythb),         COUNT(id)    GROUP BY userid
 *
 * NOTE on table casing (verified against migration 0081 DDL):
 *   - tb_header_order / tb_forwarder / tb_payment columns are all-lowercase.
 *   - tb_users columns are also all-lowercase in the DDL (userid, username,
 *     userlastname, userstatus, userregistered, coid, adminidsale, shopuser,
 *     channel, usertel). PostgREST folds unquoted identifiers to lowercase,
 *     so we select lowercase everywhere to match the stored schema exactly.
 *
 * READ-ONLY: these are reports — no writes to any money/status table.
 */

// ── Legacy label maps (admin/include/function.php) ───────────────────────────

/** shopUserName($value) — "ซื้อไปทำไม" */
export function shopUserLabel(value: string | null | undefined): string {
  switch (value) {
    case "1":
      return "ซื้อไปใช้เอง";
    case "2":
      return "ซื้อไปขาย";
    default:
      return "ไม่ระบุ";
  }
}

/** channelUserName($value) — "รู้จักเราจาก / ช่องทางที่รู้จักมา" */
export function channelUserLabel(value: string | null | undefined): string {
  switch (value) {
    case "1":
      return "ค้นหาโดยใช้ Google";
    case "2":
      return "Facebook / Instagram";
    case "3":
      return "Youtube";
    case "4":
      return "Banner เว็บไซต์อื่นๆ";
    case "5":
      return "Tiktok";
    case "6":
      return "Twitter";
    case "7":
      return "เพื่อน/คนรู้จักแนะนำ";
    case "8":
      return "ผู้ใช้งานแนะนำ";
    case "9":
      return "Pantip / บทความ";
    case "10":
      return "จัดบูธ / อบรมสัมมนา";
    default:
      return "ไม่ระบุ";
  }
}

// ── Number formatting ────────────────────────────────────────────────────────

export function thb(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function intFmt(n: number): string {
  return Number(n || 0).toLocaleString("en-US");
}

// ── Per-user service aggregate ───────────────────────────────────────────────

/** One service bucket per customer (amount + order count + last activity date). */
export type ServiceBucket = {
  amount: number;
  count: number;
  lastDate: string | null;
};

export function emptyBucket(): ServiceBucket {
  return { amount: 0, count: 0, lastDate: null };
}

/**
 * Fold a list of {userid, amount, date} rows into a per-userid bucket map.
 * Mirrors the legacy GROUP BY userid + ORDER BY <date> DESC last-date pick.
 */
export function foldByUser(
  rows: Array<{ userid: string | null; amount: number | string | null; date: string | null }>,
): Map<string, ServiceBucket> {
  const map = new Map<string, ServiceBucket>();
  for (const r of rows) {
    const key = r.userid ?? "";
    if (!key) continue;
    const b = map.get(key) ?? emptyBucket();
    b.amount += Number(r.amount || 0);
    b.count += 1;
    const d = r.date ?? null;
    if (d && (!b.lastDate || d > b.lastDate)) b.lastDate = d;
    map.set(key, b);
  }
  return map;
}

"use server";

/**
 * E6 — read-side action for the shop-order refund-history list page.
 *
 * Legacy `pcs-admin/shopping-return.php` default mode = `home.php`
 * (3-tab list of past refunds). The refund ACTION already exists
 * (`adminRefundShopOrderItem` in `actions/admin/service-orders-refund.ts`)
 * + per-item UI button, but there was no LIST page for ops to review
 * "ขอดูประวัติคืนเงิน" (the owner's manual ad-hoc question).
 *
 * Schema citation (0081_pcs_legacy_schema.sql + the refund-action header):
 *   - tb_wallet_hs WHERE type='5' AND typeservice='1' = the per-item
 *     shop-order refund credit (the refund action writes EXACTLY this)
 *   - reforder = the parent `hno` (so we can join back to tb_header_order)
 *   - userid → tb_users for member_code + name display
 *   - adminid → tb_admin for the "ผู้ทำรายการ" column
 *
 * Pure helpers (date / pagination / search-match math) live in
 * `lib/admin/refund-history-helpers.ts` so the unit test can exercise
 * them without booting Supabase. The action re-exports the helpers
 * the page consumes so callers only need ONE import.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  daysAgoIso,
  todayIso,
  endOfDayTs,
  refundHistoryRange,
  DEFAULT_REFUND_WINDOW_DAYS,
} from "@/lib/admin/refund-history-helpers";

// ────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────

export type RefundHistoryRow = {
  id:             number;     // tb_wallet_hs.id
  date:           string | null;
  amountThb:      number;
  reforder:       string | null;  // parent hno
  userid:         string;
  customerName:   string | null;  // tb_users.userName + userLastName
  memberCode:     string | null;  // = userid (tb_users.userID is the member code)
  hno:            string | null;  // resolved from reforder via tb_header_order
  orderTitle:     string | null;  // tb_header_order.htitle (joined)
  note:           string;
  adminId:        string | null;  // tb_wallet_hs.adminid (= legacy adminID)
  adminName:      string | null;  // tb_admin.adminname + adminlastname
};

export type ListRefundHistoryInput = {
  dateFrom?:   string;     // YYYY-MM-DD inclusive (defaults to 30d ago)
  dateTo?:     string;     // YYYY-MM-DD inclusive (defaults to today)
  search?:     string;     // matches hno OR userid
  page?:       number;     // 1-based
  pageSize?:   number;     // default 50
};

export type ListRefundHistoryResult =
  | { ok: true; rows: RefundHistoryRow[]; total: number }
  | { ok: false; error: string };

/**
 * Read the per-item shop-refund history (`tb_wallet_hs.type='5' AND
 * typeservice='1'`) and resolve the customer + order + admin display
 * fields in 3 follow-up joins.
 *
 * Pagination is exact (count: "exact") so the pager renders the right
 * total page count — never relies on the silent 1000-row PostgREST cap.
 */
export async function listRefundHistory(
  input: ListRefundHistoryInput,
): Promise<ListRefundHistoryResult> {
  // RBAC — same audience as the refund action + the refund list page
  // (super/accounting/ops). Sales/sales_admin can NOT view refunds —
  // money lane.
  await requireAdmin(["super", "accounting", "ops"]);

  const admin = createAdminClient();
  const page = Number.isFinite(input.page) && (input.page ?? 0) >= 1
    ? Math.floor(input.page!)
    : 1;
  const pageSize = Number.isFinite(input.pageSize) && (input.pageSize ?? 0) >= 1
    ? Math.floor(input.pageSize!)
    : 50;
  const { from, to } = refundHistoryRange(page, pageSize);

  const fromDate = input.dateFrom ?? daysAgoIso(DEFAULT_REFUND_WINDOW_DAYS);
  const toDate   = input.dateTo   ?? todayIso();
  const search   = (input.search ?? "").trim();

  // ── Step 1: query tb_wallet_hs for the refund rows ─────────────
  // The refund action writes type='5' AND typeservice='1' for shop
  // refunds (per actions/admin/service-orders-refund.ts L210-212).
  // status filter intentionally OMITTED — refunds always settle as
  // status='2' (the action commits the credit straight to the wallet),
  // but ops sometimes want to see in-flight rows too if a future
  // workflow lands a pending state.
  let q = admin
    .from("tb_wallet_hs")
    .select(
      "id,date,amount,reforder,userid,note,adminid",
      { count: "exact" },
    )
    .eq("type", "5")
    .eq("typeservice", "1")
    .gte("date", `${fromDate}T00:00:00`)
    .lte("date", endOfDayTs(toDate))
    .order("date", { ascending: false })
    .range(from, to);

  // Search by hno (reforder) OR userid — PostgREST .or() syntax.
  // Drop dangerous chars (same pattern as service-orders search).
  if (search) {
    const safe = search.replace(/[%,*()]/g, "");
    q = q.or(`reforder.ilike.%${safe}%,userid.ilike.%${safe}%`);
  }

  const { data: hsRows, error: hsErr, count: total } = await q;
  if (hsErr) {
    console.error("[/admin/service-orders/refunds] tb_wallet_hs list failed", {
      code: hsErr.code,
      message: hsErr.message,
    });
    return { ok: false, error: `db_error:${hsErr.code ?? "unknown"}` };
  }
  const raw = (hsRows ?? []) as Array<{
    id:        number;
    date:      string | null;
    amount:    number | string;
    reforder:  string | null;
    userid:    string;
    note:      string | null;
    adminid:   string | null;
  }>;

  if (raw.length === 0) {
    return { ok: true, rows: [], total: total ?? 0 };
  }

  // ── Step 2: join tb_users for customer name (camelCase columns) ─
  const userids = Array.from(new Set(raw.map((r) => r.userid).filter(Boolean)));
  const userByUid = new Map<
    string,
    { userName: string | null; userLastName: string | null }
  >();
  if (userids.length > 0) {
    const { data: userRows, error: userErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName")
      .in("userID", userids);
    if (userErr) {
      console.error("[/admin/service-orders/refunds] tb_users join failed", {
        code: userErr.code,
        message: userErr.message,
      });
    }
    for (const u of (userRows ?? []) as Array<{
      userID:       string;
      userName:     string | null;
      userLastName: string | null;
    }>) {
      userByUid.set(u.userID, { userName: u.userName, userLastName: u.userLastName });
    }
  }

  // ── Step 3: join tb_header_order for the order title ────────────
  const hnos = Array.from(
    new Set(raw.map((r) => r.reforder).filter((h): h is string => !!h)),
  );
  const orderByHno = new Map<string, { htitle: string | null }>();
  if (hnos.length > 0) {
    const { data: orderRows, error: orderErr } = await admin
      .from("tb_header_order")
      .select("hno,htitle")
      .in("hno", hnos);
    if (orderErr) {
      console.error("[/admin/service-orders/refunds] tb_header_order join failed", {
        code: orderErr.code,
        message: orderErr.message,
      });
    }
    for (const o of (orderRows ?? []) as Array<{
      hno:    string;
      htitle: string | null;
    }>) {
      orderByHno.set(o.hno, { htitle: o.htitle });
    }
  }

  // ── Step 4: join tb_admin for the admin display name ────────────
  // tb_admin uses camelCase columns (post-0113 rename — see
  // 0113_align_pilot_users_admin_co.sql · matches lib/admin/assign-sales-rep.ts
  // + actions/admin/service-orders-refund.ts L73).
  const adminIds = Array.from(
    new Set(raw.map((r) => r.adminid).filter((a): a is string => !!a)),
  );
  const adminByAdminId = new Map<
    string,
    { adminName: string | null; adminLastName: string | null }
  >();
  if (adminIds.length > 0) {
    const { data: adminRows, error: adminErr } = await admin
      .from("tb_admin")
      .select("adminID,adminName,adminLastName")
      .in("adminID", adminIds);
    if (adminErr) {
      console.error("[/admin/service-orders/refunds] tb_admin join failed", {
        code: adminErr.code,
        message: adminErr.message,
      });
    }
    for (const a of (adminRows ?? []) as Array<{
      adminID:       string;
      adminName:     string | null;
      adminLastName: string | null;
    }>) {
      adminByAdminId.set(a.adminID, {
        adminName:     a.adminName,
        adminLastName: a.adminLastName,
      });
    }
  }

  // ── Shape ──────────────────────────────────────────────────────
  const rows: RefundHistoryRow[] = raw.map((r) => {
    const u = userByUid.get(r.userid);
    const customerName = u
      ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() || null
      : null;
    const o = r.reforder ? orderByHno.get(r.reforder) : undefined;
    const a = r.adminid ? adminByAdminId.get(r.adminid) : undefined;
    const adminName = a
      ? `${a.adminName ?? ""} ${a.adminLastName ?? ""}`.trim() || null
      : null;
    return {
      id:           r.id,
      date:         r.date,
      amountThb:    Number(r.amount ?? 0),
      reforder:     r.reforder,
      userid:       r.userid,
      customerName,
      memberCode:   r.userid,  // tb_users.userID IS the PR member code
      hno:          r.reforder,
      orderTitle:   o?.htitle ?? null,
      note:         r.note ?? "",
      adminId:      r.adminid,
      adminName,
    };
  });

  return { ok: true, rows, total: total ?? 0 };
}

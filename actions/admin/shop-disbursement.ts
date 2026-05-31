"use server";

/**
 * Faithful-port Server Actions for the legacy admin-PUSH
 * "เบิกจ่ายค่าสินค้า" (shop-affiliate profit/cost disbursement) flow —
 * re-sweep A2 #23, D1 / ADR-0017.
 *
 * The accounting team selects shop orders (`tb_header_order`) whose
 * payment has cleared, batches them into ONE disbursement ("ทำรายการ
 * เบิกเงิน"), and pays the China-side bank account. Data lives in:
 *   - `tb_shop_pay_h`   — the batch header (one per disbursement)
 *   - `tb_shop_pay_sub` — the fan-out (one row per shop order in the batch)
 * Creating a batch flips `tb_header_order.hShopPay='1'` so the order is
 * never double-disbursed.
 *
 * ── Legacy source (the SQL handlers being modelled) ─────────────────
 *   - `report-shops-profit-pay.php`            L4-62  — the create handler
 *       SELECT ID FROM tb_header_order WHERE hNo IN (…) AND hShopPay<>1
 *         ↳ if any row already paid → 'eRe' (duplicate) abort
 *       INSERT tb_shop_pay_h (date, amount, status='1', adminIDCreate,
 *                             nameBank, nameUserBank, noUserBank, title)
 *       INSERT tb_shop_pay_sub (hNo, sphID) × N
 *       UPDATE tb_header_order SET hShopPay='1' WHERE hNo IN (…)
 *   - `include/pages/report-shops-profit-pay/getListShop.php`         —
 *       the "selected rows" modal: SELECT … WHERE ID IN (…) AND
 *       hShopPay IS NULL → re-resolves ID[]→hNo[] + sums priceUser
 *       (= the amount POSTed). It DROPS already-disbursed rows here too.
 *   - `report-shops-profit-pay.php`            L143-191 / default view —
 *       the eligibility query: tb_header_order ho LEFT JOIN tb_wallet_hs
 *       wh ON ho.hNo=wh.refOrder WHERE wh.status='2' AND hStatus>2 AND
 *       hStatus<>6 [+ DATE(wh.date) range].
 *   - `report-shops-profit-pay-history.php`    L60 / L175 / L250-254 —
 *       the batch list + per-batch detail join.
 *
 * ── Casing (prod schema · migration 0081 · probed 2026-06-01) ───────
 *   tb_shop_pay_h / tb_shop_pay_sub / tb_header_order / tb_wallet_hs /
 *   tb_account_pcs → ALL lowercase columns. (tb_admin is camelCase —
 *   read via resolveLegacyAdminId below.)
 *
 * ── NOT NULL gotcha (faithful-port on strict Postgres) ──────────────
 *   The legacy MySQL ran non-strict, so the INSERT omitting NOT NULL
 *   columns silently got ''/0 defaults. Postgres is strict and these
 *   migrated columns are NOT NULL with no default — so we supply the
 *   exact empty-string / zero values the legacy effectively wrote:
 *     tb_shop_pay_h.imagesslip = ''   (slip uploaded later at pay-out)
 *     tb_shop_pay_h.adminidupdate = ''(filled when status→2 at pay-out)
 *     tb_shop_pay_h.nameuserbank/nouserbank/namebank = '' when no
 *       account chosen (legacy left $nameBank etc. unset → '')
 *     tb_shop_pay_sub.hcostallth = pricePCS (the per-order China cost
 *       in THB — this column was ADDED to the migrated schema; the
 *       legacy INSERT omitted it. We populate it with the cost so the
 *       NOT NULL is satisfied AND the column carries meaningful data.)
 *
 * ── Money-path discipline (§0c) ─────────────────────────────────────
 *   - Every Supabase call destructures `error`; we abort the batch on
 *     any insert/update error (no silent partial writes).
 *   - Idempotency: a SELECT re-check (`hShopPay<>1`) gates the INSERT,
 *     AND the final UPDATE is scoped `…WHERE hShopPay IS NULL` so a
 *     concurrent double-submit can't flip the same row twice / pay twice.
 *   - The batch amount is RECOMPUTED server-side from the order rows
 *     (computeDisbursementTotals) — the client number is never trusted.
 *   - `withAdmin(["accounting","super"])` gates the mutation; audit via
 *     logAdminAction.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import {
  createShopDisbursementSchema,
  type CreateShopDisbursementInput,
} from "@/lib/validators/admin-shop-disbursement";
import {
  computeShopOrderAmounts,
  computeDisbursementTotals,
  isOrderStatusEligible,
  type ShopOrderAmounts,
} from "@/lib/admin/shop-disbursement-calc";

// ────────────────────────────────────────────────────────────
// Helper — resolve the current Supabase user's legacy `tb_admin.adminID`
// (the username string `tb_shop_pay_h.adminidcreate` varchar(30) wants).
// Mirror of the helper in actions/admin/combine-bill.ts §resolveLegacyAdminId.
// ────────────────────────────────────────────────────────────
async function resolveLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error("[shop-disbursement] auth.getUser failed", {
      code: authErr.code,
      message: authErr.message,
    });
  }
  const email = user?.email ?? null;
  if (!email) return "system";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error("[shop-disbursement] tb_admin lookup failed", {
      code: error.code,
      message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return email.slice(0, 30);
}

// ────────────────────────────────────────────────────────────
// Shared shapes
// ────────────────────────────────────────────────────────────

/** A `tb_header_order` row enriched with the computed margin + the
 *  customer name (for the eligible list + the create modal). */
export type EligibleShopOrder = ShopOrderAmounts & {
  /** tb_header_order.ID — the checkbox value the create form posts. */
  id: number;
  hstatus: string | null;
  htitle: string | null;
  hcount: number | null;
  /** The settled wallet date (tb_wallet_hs.date) — legacy "วันที่ชำระเงิน". */
  walletDate: string | null;
  userid: string;
  username: string | null;
  userlastname: string | null;
};

type HeaderOrderRaw = {
  id: number;
  hno: string;
  hstatus: string | null;
  hshoppay: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | string | null;
  hshippingchn: number | string | null;
  hrate: number | string | null;
  hratecost: number | string | null;
  hcostall: number | string | null;
  userid: string;
};

// ────────────────────────────────────────────────────────────
// Date helpers — default = current month (legacy "first day of this
// month" .. "last day of this month").
// ────────────────────────────────────────────────────────────
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function firstDayOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}
function lastDayOfMonth(startDate?: string): string {
  let y: number;
  let m: number;
  if (startDate) {
    const [yy, mm] = startDate.split("-");
    y = Number(yy);
    m = Number(mm);
  } else {
    const d = new Date();
    y = d.getFullYear();
    m = d.getMonth() + 1;
  }
  const last = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(last)}`;
}

function resolveRange(range?: { start?: string; end?: string }): {
  start: string;
  end: string;
} {
  const start = range?.start && /^\d{4}-\d{2}-\d{2}$/.test(range.start)
    ? range.start
    : firstDayOfThisMonth();
  const end = range?.end && /^\d{4}-\d{2}-\d{2}$/.test(range.end)
    ? range.end
    : lastDayOfMonth(range?.start);
  return { start, end };
}

// ════════════════════════════════════════════════════════════
// READ — eligible shop orders for disbursement
// ════════════════════════════════════════════════════════════
//
// Legacy default view (report-shops-profit-pay.php L183-191):
//   tb_header_order ho LEFT JOIN tb_wallet_hs wh ON ho.hNo=wh.refOrder
//   WHERE DATE(wh.date) BETWEEN start AND end AND hStatus>2 AND hStatus<>6
//   AND wh.status='2'  [filter mode also: AND hShopPay IS NULL]
//
// Because there's NO FK relationship between tb_header_order and
// tb_wallet_hs (PostgREST can't embed — confirmed by probe), we run the
// proven two-query manual join used by /admin/accounting/shop:
//   1. tb_wallet_hs status=2 + date range → set of settled hNos
//   2. tb_header_order hStatus>2,<>6, hShopPay NULL, hNo IN (settled set)
// then enrich with tb_users names + per-order margin math.
//
// Date range filters on the SETTLED WALLET date (tb_wallet_hs.date), NOT
// the order date — faithful to the legacy `DATE(date)` resolving to wh.

export async function getEligibleShopOrdersForDisbursement(
  range?: { start?: string; end?: string },
): Promise<
  AdminActionResult<{
    orders: EligibleShopOrder[];
    start: string;
    end: string;
    totals: {
      priceUserAll: number;
      pricePCSAll: number;
      profitAll: number;
      vat7All: number;
    };
  }>
> {
  return withAdmin(["accounting", "super"], async () => {
    const admin = createAdminClient();
    const { start, end } = resolveRange(range);

    // ── (1) settled wallet events in the date range → hNo set ──
    //   tb_wallet_hs WHERE status='2' AND DATE(date) BETWEEN start AND end
    //   (refOrder carries the shop order's hNo for shop payments).
    const { data: walletRows, error: walletErr } = await admin
      .from("tb_wallet_hs")
      .select("reforder, date")
      .eq("status", "2")
      .not("reforder", "is", null)
      .neq("reforder", "")
      .gte("date", `${start}T00:00:00`)
      .lte("date", `${end}T23:59:59`);
    if (walletErr) {
      console.error("[shop-disbursement] tb_wallet_hs query failed", {
        start,
        end,
        code: walletErr.code,
        message: walletErr.message,
      });
      return { ok: false, error: walletErr.message };
    }

    // Map hNo → latest settled wallet date (for the "วันที่ชำระเงิน" column).
    const walletDateByHno = new Map<string, string | null>();
    for (const w of (walletRows ?? []) as Array<{ reforder: string; date: string | null }>) {
      const hno = w.reforder;
      if (!hno) continue;
      const prev = walletDateByHno.get(hno);
      // keep the most recent settled date
      if (prev == null || (w.date != null && w.date > prev)) {
        walletDateByHno.set(hno, w.date);
      }
    }
    const settledHnos = Array.from(walletDateByHno.keys());
    if (settledHnos.length === 0) {
      return {
        ok: true,
        data: {
          orders: [],
          start,
          end,
          totals: { priceUserAll: 0, pricePCSAll: 0, profitAll: 0, vat7All: 0 },
        },
      };
    }

    // ── (2) eligible header orders among the settled hNos ──
    //   hStatus>2 AND hStatus<>6 AND hShopPay IS NULL AND hNo IN (settled)
    // PostgREST `.in()` caps the list size; chunk to stay safe (URL
    // length + parameter ceiling) at 200 hNos per request.
    const headerRows: HeaderOrderRaw[] = [];
    const CHUNK = 200;
    for (let i = 0; i < settledHnos.length; i += CHUNK) {
      const slice = settledHnos.slice(i, i + CHUNK);
      const { data, error } = await admin
        .from("tb_header_order")
        .select(
          "id, hno, hstatus, hshoppay, htitle, hcount, htotalpricechn, hshippingchn, hrate, hratecost, hcostall, userid",
        )
        .in("hno", slice)
        .gt("hstatus", "2")
        .neq("hstatus", "6")
        .is("hshoppay", null);
      if (error) {
        console.error("[shop-disbursement] tb_header_order query failed", {
          chunkStart: i,
          code: error.code,
          message: error.message,
        });
        return { ok: false, error: error.message };
      }
      headerRows.push(...((data ?? []) as HeaderOrderRaw[]));
    }

    if (headerRows.length === 0) {
      return {
        ok: true,
        data: {
          orders: [],
          start,
          end,
          totals: { priceUserAll: 0, pricePCSAll: 0, profitAll: 0, vat7All: 0 },
        },
      };
    }

    // ── (3) enrich with customer names ──
    const userIds = Array.from(new Set(headerRows.map((h) => h.userid).filter(Boolean)));
    const nameByUserId = new Map<string, { username: string | null; userlastname: string | null }>();
    if (userIds.length > 0) {
      const { data: userData, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", userIds);
      if (userErr) {
        // names are non-critical — log + continue with "—"
        console.error("[shop-disbursement] tb_users query failed", {
          code: userErr.code,
          message: userErr.message,
        });
      }
      for (const u of (userData ?? []) as Array<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
      }>) {
        nameByUserId.set(u.userID, { username: u.userName, userlastname: u.userLastName });
      }
    }

    // ── (4) compute margins + assemble ──
    const orders: EligibleShopOrder[] = headerRows.map((h) => {
      const amounts = computeShopOrderAmounts(h);
      const names = nameByUserId.get(h.userid) ?? { username: null, userlastname: null };
      return {
        ...amounts,
        id: Number(h.id),
        hstatus: h.hstatus,
        htitle: h.htitle,
        hcount: h.hcount,
        walletDate: walletDateByHno.get(h.hno) ?? null,
        userid: h.userid,
        username: names.username,
        userlastname: names.userlastname,
      };
    });

    const totals = computeDisbursementTotals(headerRows);

    return {
      ok: true,
      data: {
        orders,
        start,
        end,
        totals: {
          priceUserAll: totals.priceUserAll,
          pricePCSAll: totals.pricePCSAll,
          profitAll: totals.profitAll,
          vat7All: totals.vat7All,
        },
      },
    };
  });
}

// ════════════════════════════════════════════════════════════
// CREATE — batch disbursement (report-shops-profit-pay.php L4-62)
// ════════════════════════════════════════════════════════════

export async function createShopDisbursementBatch(
  input: CreateShopDisbursementInput,
): Promise<AdminActionResult<{ batchId: number; amount: number; orderCount: number }>> {
  const parsed = createShopDisbursementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const { orderIds, title, accountId } = parsed.data;

  return withAdmin(["accounting", "super"], async ({ adminId }) => {
    const admin = createAdminClient();

    // ── (a) Load the selected orders by ID (the checkbox value) ──
    //   Legacy getListShop.php: SELECT … WHERE ID IN (…) AND hShopPay IS NULL.
    //   We pull the full margin fields too so the amount can be recomputed.
    const { data: orderData, error: orderErr } = await admin
      .from("tb_header_order")
      .select(
        "id, hno, hstatus, hshoppay, htotalpricechn, hshippingchn, hrate, hratecost, hcostall",
      )
      .in("id", orderIds);
    if (orderErr) {
      console.error("[shop-disbursement] load selected orders failed", {
        code: orderErr.code,
        message: orderErr.message,
      });
      return { ok: false, error: orderErr.message };
    }
    const rows = (orderData ?? []) as HeaderOrderRaw[];
    if (rows.length === 0) {
      return { ok: false, error: "ไม่พบรายการที่เลือก" };
    }

    // ── (b) Idempotency / eligibility re-check ──
    //   Legacy L26-28: SELECT ID FROM tb_header_order WHERE hNo IN (…)
    //   AND hShopPay<>1 — but the inverse semantics matter: the legacy
    //   aborts ('eRe') if num_rows==0 of `hShopPay<>1`, i.e. when EVERY
    //   selected order is already paid. We strengthen it: reject if ANY
    //   selected order is already disbursed (hShopPay='1') OR fails the
    //   status gate — so a stale tab can't sneak a double-pay through.
    const alreadyDisbursed = rows.filter((r) => r.hshoppay === "1");
    if (alreadyDisbursed.length > 0) {
      return {
        ok: false,
        error: `ข้อมูลซ้ำ — รายการต่อไปนี้เบิกจ่ายไปแล้ว: ${alreadyDisbursed
          .map((r) => r.hno)
          .join(", ")}`,
      };
    }
    const ineligible = rows.filter(
      (r) => !isOrderStatusEligible({ hstatus: r.hstatus, hshoppay: r.hshoppay }),
    );
    if (ineligible.length > 0) {
      return {
        ok: false,
        error: `รายการต่อไปนี้ไม่อยู่ในเงื่อนไขเบิกจ่าย: ${ineligible
          .map((r) => r.hno)
          .join(", ")}`,
      };
    }

    // ── (c) Recompute the batch amount + per-order cost (server-trusted) ──
    const totals = computeDisbursementTotals(rows);
    const amount = totals.priceUserAll; // = SUM(priceUser) — legacy $amount
    // Per-order China cost (THB) → tb_shop_pay_sub.hcostallth (NOT NULL).
    const costByHno = new Map<string, number>();
    for (const r of totals.rows) costByHno.set(r.hno, r.pricePCS);

    // ── (d) Resolve the receiving bank account (optional) ──
    let nameBank = "";
    let nameUserBank = "";
    let noUserBank = "";
    if (accountId !== undefined) {
      const { data: acc, error: accErr } = await admin
        .from("tb_account_pcs")
        .select("bankname, accountname, accountnumber")
        .eq("id", accountId)
        .maybeSingle<{
          bankname: string | null;
          accountname: string | null;
          accountnumber: string | null;
        }>();
      if (accErr) {
        console.error("[shop-disbursement] tb_account_pcs lookup failed", {
          accountId,
          code: accErr.code,
          message: accErr.message,
        });
        return { ok: false, error: accErr.message };
      }
      if (!acc) {
        return { ok: false, error: "ไม่พบบัญชีรับเงินที่เลือก" };
      }
      nameBank = (acc.bankname ?? "").slice(0, 2); // namebank varchar(2)
      nameUserBank = acc.accountname ?? "";
      noUserBank = acc.accountnumber ?? "";
    }

    // ── (e) INSERT tb_shop_pay_h (status='1' = รอดำเนินการ) ──
    //   Legacy L29-31. NOT NULL columns omitted by legacy are supplied
    //   with the '' / later-filled values (see file-header gotcha).
    const legacyAdminId = safeLegacyAdminId(await resolveLegacyAdminId(), 30);
    const nowIso = new Date().toISOString();
    const { data: batchRow, error: batchErr } = await admin
      .from("tb_shop_pay_h")
      .insert({
        date: nowIso,
        amount,
        status: "1",
        adminidcreate: legacyAdminId,
        namebank: nameBank,
        nameuserbank: nameUserBank,
        nouserbank: noUserBank,
        title,
        imagesslip: "", // slip uploaded at pay-out (status→2)
        adminidupdate: "", // filled at pay-out
      })
      .select("id")
      .single<{ id: number }>();
    if (batchErr) {
      console.error("[shop-disbursement] tb_shop_pay_h insert failed", {
        code: batchErr.code,
        message: batchErr.message,
      });
      return { ok: false, error: batchErr.message };
    }
    const batchId = Number(batchRow.id);

    // ── (f) INSERT tb_shop_pay_sub × N (hNo, sphID, hcostallth) ──
    //   Legacy L48-50 INSERTed (hNo, sphID) only; the migrated schema
    //   adds NOT NULL hcostallth → we populate with the per-order cost.
    const subRows = rows.map((r) => ({
      hno: r.hno,
      sphid: batchId,
      hcostallth: costByHno.get(r.hno) ?? 0,
    }));
    const { error: subErr } = await admin.from("tb_shop_pay_sub").insert(subRows);
    if (subErr) {
      console.error("[shop-disbursement] tb_shop_pay_sub insert failed", {
        batchId,
        code: subErr.code,
        message: subErr.message,
      });
      // Best-effort cleanup of the orphan header (the orders are NOT yet
      // flipped, so no money state changed). Faithful: legacy doesn't
      // compensate, but leaving an orphan header with no sub-rows is
      // worse than legacy's — we delete it so a retry is clean.
      await admin.from("tb_shop_pay_h").delete().eq("id", batchId);
      await logAdminAction(adminId, "shop_disbursement.create_failed", "tb_shop_pay_h", String(batchId), {
        legacy_admin_id: legacyAdminId,
        order_ids: orderIds,
        error: subErr.message,
      });
      return { ok: false, error: subErr.message };
    }

    // ── (g) Flip tb_header_order.hShopPay='1' (idempotent) ──
    //   Legacy L53-55 UPDATE … WHERE hNo IN (…). We scope the UPDATE to
    //   `…WHERE hShopPay IS NULL` so a concurrent double-submit can only
    //   flip rows that are still un-disbursed — no double-pay.
    const hnos = rows.map((r) => r.hno);
    const { error: flipErr } = await admin
      .from("tb_header_order")
      .update({ hshoppay: "1" })
      .in("hno", hnos)
      .is("hshoppay", null);
    if (flipErr) {
      console.error("[shop-disbursement] hShopPay flip failed", {
        batchId,
        code: flipErr.code,
        message: flipErr.message,
      });
      // The batch + sub rows exist; surface the partial state in audit.
      // We do NOT roll back the batch (faithful: legacy leaves it too);
      // an admin can re-run the flip / inspect via the history detail.
      await logAdminAction(adminId, "shop_disbursement.flip_failed", "tb_shop_pay_h", String(batchId), {
        legacy_admin_id: legacyAdminId,
        hnos,
        error: flipErr.message,
      });
      return { ok: false, error: flipErr.message };
    }

    await logAdminAction(adminId, "shop_disbursement.create", "tb_shop_pay_h", String(batchId), {
      legacy_admin_id: legacyAdminId,
      amount,
      order_count: rows.length,
      hnos,
      account_id: accountId ?? null,
    });

    revalidatePath("/admin/shop-disbursement");
    revalidatePath("/admin/shop-disbursement/history");
    return { ok: true, data: { batchId, amount, orderCount: rows.length } };
  });
}

// ════════════════════════════════════════════════════════════
// READ — batch history (report-shops-profit-pay-history.php list mode)
// ════════════════════════════════════════════════════════════

export type ShopDisbursementBatchSummary = {
  id: number;
  date: string | null;
  amount: number;
  adminidcreate: string | null;
  status: string | null; // '1'=รอดำเนินการ, '2'=จ่ายแล้ว
  imagesslip: string | null;
  title: string | null;
};

export async function getShopDisbursementHistory(): Promise<
  AdminActionResult<{ batches: ShopDisbursementBatchSummary[] }>
> {
  return withAdmin(["accounting", "super"], async () => {
    const admin = createAdminClient();
    // Legacy L60: SELECT ID, date, imagesSlip, amount, adminIDCreate,
    // status FROM tb_shop_pay_h (no filter — full list, sorted desc by
    // date in the DataTable). We sort here server-side.
    const { data, error } = await admin
      .from("tb_shop_pay_h")
      .select("id, date, amount, adminidcreate, status, imagesslip, title")
      .order("date", { ascending: false });
    if (error) {
      console.error("[shop-disbursement] history query failed", {
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    const batches = ((data ?? []) as Array<{
      id: number;
      date: string | null;
      amount: number | string;
      adminidcreate: string | null;
      status: string | null;
      imagesslip: string | null;
      title: string | null;
    }>).map((b) => ({
      id: Number(b.id),
      date: b.date,
      amount: Number(b.amount),
      adminidcreate: b.adminidcreate,
      status: b.status,
      imagesslip: b.imagesslip,
      title: b.title,
    }));
    return { ok: true, data: { batches } };
  });
}

// ════════════════════════════════════════════════════════════
// READ — single batch detail (history.php?id= mode + print source)
// ════════════════════════════════════════════════════════════

export type ShopDisbursementBatchDetail = {
  batch: {
    id: number;
    date: string | null;
    dateupdate: string | null;
    amount: number;
    title: string | null;
    status: string | null;
    adminidcreate: string | null;
    adminidupdate: string | null;
    namebank: string | null;
    nameuserbank: string | null;
    nouserbank: string | null;
    imagesslip: string | null;
  };
  orders: Array<
    ShopOrderAmounts & {
      id: number;
      hstatus: string | null;
      htitle: string | null;
      hcount: number | null;
      userid: string;
      username: string | null;
      userlastname: string | null;
    }
  >;
  totals: {
    priceUserAll: number;
    pricePCSAll: number;
    profitAll: number;
    vat7All: number;
  };
};

export async function getShopDisbursementBatch(
  batchId: number,
): Promise<AdminActionResult<ShopDisbursementBatchDetail>> {
  if (!Number.isFinite(batchId) || batchId <= 0) {
    return { ok: false, error: "invalid_batch_id" };
  }
  return withAdmin(["accounting", "super"], async () => {
    const admin = createAdminClient();

    // ── (1) batch header (history.php L175) ──
    const { data: batch, error: batchErr } = await admin
      .from("tb_shop_pay_h")
      .select(
        "id, date, dateupdate, amount, title, status, adminidcreate, adminidupdate, namebank, nameuserbank, nouserbank, imagesslip",
      )
      .eq("id", batchId)
      .maybeSingle<{
        id: number;
        date: string | null;
        dateupdate: string | null;
        amount: number | string;
        title: string | null;
        status: string | null;
        adminidcreate: string | null;
        adminidupdate: string | null;
        namebank: string | null;
        nameuserbank: string | null;
        nouserbank: string | null;
        imagesslip: string | null;
      }>();
    if (batchErr) {
      console.error("[shop-disbursement] batch header query failed", {
        batchId,
        code: batchErr.code,
        message: batchErr.message,
      });
      return { ok: false, error: batchErr.message };
    }
    if (!batch) return { ok: false, error: "not_found" };

    // ── (2) the batch's orders (history.php L250-254) ──
    //   tb_shop_pay_sub sps WHERE sps.sphID=? → hNo[]
    //   then tb_header_order ho WHERE hNo IN (…)
    const { data: subData, error: subErr } = await admin
      .from("tb_shop_pay_sub")
      .select("hno")
      .eq("sphid", batchId);
    if (subErr) {
      console.error("[shop-disbursement] tb_shop_pay_sub query failed", {
        batchId,
        code: subErr.code,
        message: subErr.message,
      });
      return { ok: false, error: subErr.message };
    }
    const hnos = Array.from(
      new Set(((subData ?? []) as Array<{ hno: string }>).map((s) => s.hno).filter(Boolean)),
    );

    let headerRows: HeaderOrderRaw[] = [];
    if (hnos.length > 0) {
      const collected: HeaderOrderRaw[] = [];
      const CHUNK = 200;
      for (let i = 0; i < hnos.length; i += CHUNK) {
        const slice = hnos.slice(i, i + CHUNK);
        const { data, error } = await admin
          .from("tb_header_order")
          .select(
            "id, hno, hstatus, hshoppay, htitle, hcount, htotalpricechn, hshippingchn, hrate, hratecost, hcostall, userid",
          )
          .in("hno", slice);
        if (error) {
          console.error("[shop-disbursement] batch orders query failed", {
            batchId,
            code: error.code,
            message: error.message,
          });
          return { ok: false, error: error.message };
        }
        collected.push(...((data ?? []) as HeaderOrderRaw[]));
      }
      headerRows = collected;
    }

    // ── (3) customer names ──
    const userIds = Array.from(new Set(headerRows.map((h) => h.userid).filter(Boolean)));
    const nameByUserId = new Map<string, { username: string | null; userlastname: string | null }>();
    if (userIds.length > 0) {
      const { data: userData, error: userErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName")
        .in("userID", userIds);
      if (userErr) {
        console.error("[shop-disbursement] batch tb_users query failed", {
          code: userErr.code,
          message: userErr.message,
        });
      }
      for (const u of (userData ?? []) as Array<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
      }>) {
        nameByUserId.set(u.userID, { username: u.userName, userlastname: u.userLastName });
      }
    }

    const orders = headerRows.map((h) => {
      const amounts = computeShopOrderAmounts(h);
      const names = nameByUserId.get(h.userid) ?? { username: null, userlastname: null };
      return {
        ...amounts,
        id: Number(h.id),
        hstatus: h.hstatus,
        htitle: h.htitle,
        hcount: h.hcount,
        userid: h.userid,
        username: names.username,
        userlastname: names.userlastname,
      };
    });

    const totals = computeDisbursementTotals(headerRows);

    return {
      ok: true,
      data: {
        batch: {
          id: Number(batch.id),
          date: batch.date,
          dateupdate: batch.dateupdate,
          amount: Number(batch.amount),
          title: batch.title,
          status: batch.status,
          adminidcreate: batch.adminidcreate,
          adminidupdate: batch.adminidupdate,
          namebank: batch.namebank,
          nameuserbank: batch.nameuserbank,
          nouserbank: batch.nouserbank,
          imagesslip: batch.imagesslip,
        },
        orders,
        totals: {
          priceUserAll: totals.priceUserAll,
          pricePCSAll: totals.pricePCSAll,
          profitAll: totals.profitAll,
          vat7All: totals.vat7All,
        },
      },
    };
  });
}

// ════════════════════════════════════════════════════════════
// READ — receiving bank accounts (for the create modal dropdown)
// ════════════════════════════════════════════════════════════

export type ShopPayAccount = {
  id: number;
  bankname: string | null;
  accountname: string | null;
  accountnumber: string | null;
};

export async function getShopPayAccounts(): Promise<
  AdminActionResult<{ accounts: ShopPayAccount[] }>
> {
  return withAdmin(["accounting", "super"], async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tb_account_pcs")
      .select("id, bankname, accountname, accountnumber")
      .order("id", { ascending: false });
    if (error) {
      console.error("[shop-disbursement] tb_account_pcs list failed", {
        code: error.code,
        message: error.message,
      });
      return { ok: false, error: error.message };
    }
    const accounts = ((data ?? []) as Array<{
      id: number;
      bankname: string | null;
      accountname: string | null;
      accountnumber: string | null;
    }>).map((a) => ({
      id: Number(a.id),
      bankname: a.bankname,
      accountname: a.accountname,
      accountnumber: a.accountnumber,
    }));
    return { ok: true, data: { accounts } };
  });
}

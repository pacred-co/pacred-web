"use server";

/**
 * Customer Payment-Status Board (owner 2026-06-28) — listPaymentStatus.
 *
 * One read action that answers "ลูกค้าคนไหนจ่ายแล้ว/ยังไม่จ่าย · จ่ายตรงไหม ·
 * ขาย/ต้นทุน · เงินสด/เครดิต · รถ/เรือ/แอร์ · admin เกี่ยวข้อง · สถานะ ยังไม่ชำระ ค่าอะไร"
 * for ฝากนำเข้า orders (tb_forwarder) — the richest money/payment surface. Scoped
 * to the payment-relevant lifecycle (fstatus 5 รอชำระ → 6 เตรียมส่ง → 7 ส่งแล้ว) so
 * the pull is small + fast. Read-only; the board's rows deep-link to the already-
 * guarded forwarder detail for edits (§0d · no new money-mutation path).
 *
 * Cost/profit columns are gated server-side via canViewCostProfit (ปอน's money-
 * visibility tiers) — a non-cost role gets cost/profit = null, never the number.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { logger } from "@/lib/logger";
import { calcForwarderOutstanding, type ForwarderPriceFields } from "@/lib/forwarder/outstanding";
import { SHIP_BY_LABEL, TRANSPORT_TYPE_LABEL } from "./reports-profit-types";
import { LEGACY_FORWARDER_STATUS, type LegacyForwarderCode } from "@/lib/legacy-status-map";
import type {
  PaymentBoardRow,
  PaymentBoardFilters,
  PaymentBoardResult,
} from "./payment-board-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };

const LIMIT = 2000;

/** The "ค่าอะไร / next" hint per fstatus (what the customer owes / next step). */
const PAY_HINT: Record<string, string> = {
  "5": "รอลูกค้าชำระค่านำเข้า",
  "6": "ชำระแล้ว · เตรียมส่ง",
  "7": "ชำระแล้ว · ส่งแล้ว",
};

type FwdRow = ForwarderPriceFields & {
  id: number | string;
  userid: string | null;
  fstatus: string | null;
  fcosttotalprice: number | string | null;
  fcredit: number | string | null;
  fshipby: string | null;
  ftransporttype: string | null;
  adminid: string | null;
  adminidupdate: string | null;
  fdate: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
};

type UserRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userCredit: string | null;
  userCreditValue: number | string | null;
  adminIDSale: string | null;
};

export async function listPaymentStatus(
  filters: PaymentBoardFilters = {},
): Promise<Ok<PaymentBoardResult> | Err> {
  const { roles } = await requireAdmin(["super", "accounting", "ops", "sales", "sales_admin"]);
  const showCost = canViewCostProfit(roles);
  try {
    const admin = createAdminClient();
    const limit = Math.min(filters.limit ?? LIMIT, LIMIT);

    // Payment-relevant lifecycle only (รอชำระ → เตรียมส่ง → ส่งแล้ว).
    let q = admin
      .from("tb_forwarder")
      .select(
        "id, userid, fstatus, ftotalprice, ftransportprice, fpriceupdate, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany, fcosttotalprice, fcredit, fshipby, ftransporttype, adminid, adminidupdate, fdate, ftrackingchn, fcabinetnumber",
      )
      .in("fstatus", ["5", "6", "7"])
      .order("fdate", { ascending: false })
      .limit(limit);

    if (filters.mode && ["1", "2", "3"].includes(filters.mode)) {
      q = q.eq("ftransporttype", filters.mode);
    }

    const { data, error } = await q;
    if (error) {
      logger.error("reports", "payment-board forwarder query failed", error);
      return { ok: false, error: error.message };
    }
    const fwd = (data ?? []) as FwdRow[];
    const capped = fwd.length >= limit;

    // Resolve customer name + credit + rep (chunked .in()).
    const userMap = new Map<string, UserRow>();
    const ids = Array.from(new Set(fwd.map((r) => (r.userid ?? "").trim()).filter(Boolean)));
    for (let i = 0; i < ids.length; i += 300) {
      const chunk = ids.slice(i, i + 300);
      const { data: us, error: uErr } = await admin
        .from("tb_users")
        .select('"userID","userName","userLastName","userCompany","userCredit","userCreditValue","adminIDSale"')
        .in("userID", chunk);
      if (uErr) { logger.error("reports", "payment-board tb_users failed", uErr); continue; }
      for (const u of (us ?? []) as UserRow[]) userMap.set(u.userID, u);
    }

    const term = (filters.q ?? "").trim().toLowerCase();
    const rows: PaymentBoardRow[] = [];
    let totalOwed = 0;
    let unpaidCount = 0;

    for (const r of fwd) {
      const uid = (r.userid ?? "").trim();
      const u = userMap.get(uid);
      const name = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || uid || "—";
      const owed = calcForwarderOutstanding(r);
      const sold = Number(r.ftotalprice ?? 0);
      const cost = Number(r.fcosttotalprice ?? 0);
      const fcreditAmt = Number(r.fcredit ?? 0);
      const creditRoom = Number(u?.userCreditValue ?? 0);
      const isCredit = fcreditAmt > 0 || (u?.userCredit ?? "") === "1" || creditRoom > 0;
      const payState: PaymentBoardRow["payState"] = r.fstatus === "5" ? "unpaid" : "paid";

      // Filters (pay/money/search) applied in JS over the small lifecycle set.
      if (filters.pay === "unpaid" && payState !== "unpaid") continue;
      if (filters.pay === "paid" && payState !== "paid") continue;
      if (filters.money === "credit" && !isCredit) continue;
      if (filters.money === "cash" && isCredit) continue;
      if (term) {
        const hay = `${name} ${uid} ${r.ftrackingchn ?? ""} ${r.fcabinetnumber ?? ""} ${r.id}`.toLowerCase();
        if (!hay.includes(term)) continue;
      }

      if (payState === "unpaid") { totalOwed += owed; unpaidCount += 1; }

      rows.push({
        fid: String(r.id),
        userid: uid,
        customerName: name,
        payState,
        owed,
        sold,
        cost: showCost ? cost : 0,
        profit: showCost ? sold - cost : 0,
        isCredit,
        creditRoom,
        modeLabel: TRANSPORT_TYPE_LABEL[(r.ftransporttype ?? "").trim()] ?? "—",
        carrierLabel: SHIP_BY_LABEL[(r.fshipby ?? "").trim()] ?? ((r.fshipby ?? "").trim() || "—"),
        fstatus: r.fstatus ?? "",
        statusLabel: LEGACY_FORWARDER_STATUS[(r.fstatus ?? "") as LegacyForwarderCode]?.thai ?? PAY_HINT[r.fstatus ?? ""] ?? r.fstatus ?? "—",
        repAdmin: (u?.adminIDSale ?? "").trim() || "—",
        lastAdmin: (r.adminidupdate ?? r.adminid ?? "").trim() || "—",
        fdate: r.fdate,
        tracking: (r.ftrackingchn ?? "").trim() || (r.fcabinetnumber ?? "").trim() || "—",
      });
    }

    return { ok: true, data: { rows, totalOwed, unpaidCount, capped } };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "payment-board threw", err);
    return { ok: false, error: err.message };
  }
}

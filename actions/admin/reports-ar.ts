"use server";

/**
 * Wave C BI · Theme 1 — AR-AGING (ลูกหนี้การค้า · the cash-collection cockpit).
 *
 * The big audit (docs/research/big-audit-2026-06-01/_MASTER-PLAN.md) called the
 * 47k-row tb_forwarder dataset an "unmined goldmine"; ~457 rows sit at fstatus=5
 * "รอชำระเงิน" = real cash waiting to be collected, and nothing aggregates it by
 * age. This report ages every OUTSTANDING ฝากนำเข้า order into 0-30 / 31-60 /
 * 61-90 / 90+ day buckets and rolls them up per customer so collections can work
 * the worst debtors top-down.
 *
 * ── OUTSTANDING SET (reports-ar-types.ts has the full rationale) ─────────────
 * A forwarder row is outstanding when EITHER:
 *   (A) fstatus='5'  — รอชำระเงิน (awaiting-payment stage · the canonical map in
 *       lib/legacy-status-map.ts + sidebar-counts.ts), OR
 *   (B) fcredit='1' AND paydeposit<>'1' — shipped-on-credit, not paid in full
 *       (identical rule to /admin/reports/credit-pending).
 * fstatus='99' (cancelled) excluded. We run the two sets as separate queries and
 * union by `id` (matches credit-pending's exact .eq/.neq semantics; avoids the
 * PostgREST `.or()` + NULL-handling foot-guns).
 *
 * ── AMOUNT + AGE ─────────────────────────────────────────────────────────────
 * Outstanding amount per row = calcForwarderOutstanding() (lib/forwarder/
 * outstanding.ts · port of legacy calPriceForwarderMain — sum of the price
 * columns − discount − 1% juristic allowance). Age in days = NOW − fdate
 * (computed in this SERVER action with new Date(), never in render).
 *
 * Read-only · createAdminClient (RLS-bypass) · capped pull + JS aggregate
 * (PostgREST can't GROUP BY · matches reports-profit.ts / reports-sla.ts).
 * Every supabase query destructures { data, error } (AGENTS.md §0c); a failed
 * customer-name lookup is non-fatal (names degrade to the userid).
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logger } from "@/lib/logger";
import {
  calcForwarderOutstanding,
  type ForwarderPriceFields,
} from "@/lib/forwarder/outstanding";
import {
  AGING_BUCKETS,
  bucketForAge,
  type AgingBucketKey,
  type ArAgingReport,
  type BucketTotal,
  type DebtorRow,
} from "./reports-ar-types";

type Ok<T> = { ok: true; data: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

// Same cap as reports-profit.ts / reports-sla.ts. The outstanding pool is small
// (~457 rows at fstatus=5 + the credit tail) — far under this; we still flag if
// it's ever hit so a future spike doesn't silently understate the totals.
const LIMIT = 20_000;
const MS_PER_DAY = 86_400_000;

/** Default number of top debtors the page shows. */
const DEFAULT_TOP_N = 50;

/** Columns calcForwarderOutstanding needs + the AR keys (lowercase · 0081). */
const SELECT_COLS =
  "id,userid,fstatus,fcredit,paydeposit,fdate," +
  "ftotalprice,ftransportprice,fpriceupdate,fshippingservice,pricecrate," +
  "ftransportpricechnthb,priceother,fdiscount,fusercompany";

type ArForwarderRow = ForwarderPriceFields & {
  id: number;
  userid: string | null;
  fstatus: string | null;
  fcredit: string | null;
  paydeposit: string | null;
  fdate: string | null;
};

/** Mutable per-customer accumulator while bucketing. */
type DebtorAcc = {
  amount: number;
  orders: number;
  oldestMs: number | null;
  byBucket: Record<AgingBucketKey, number>;
};

function emptyByBucket(): Record<AgingBucketKey, number> {
  return { b0_30: 0, b31_60: 0, b61_90: 0, b90p: 0 };
}

/** Whole days since an ISO timestamp (>=0). Null/invalid → 0 (treated young). */
function ageDays(iso: string | null, nowMs: number): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  const d = Math.floor((nowMs - t) / MS_PER_DAY);
  return d > 0 ? d : 0;
}

/**
 * Build the AR-aging report.
 *
 * @param topN — how many top debtors to return (default 50, worst-first).
 */
export async function getArAgingReport(topN = DEFAULT_TOP_N): Promise<Result<ArAgingReport>> {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  try {
    const admin = createAdminClient();

    // Set A — awaiting-payment stage (fstatus='5' · the cash-waiting pool).
    const qAwaiting = admin
      .from("tb_forwarder")
      .select(SELECT_COLS)
      .eq("fstatus", "5")
      .order("fdate", { ascending: true, nullsFirst: false })
      .limit(LIMIT);

    // Set B — shipped-on-credit, not paid in full (matches credit-pending).
    const qCredit = admin
      .from("tb_forwarder")
      .select(SELECT_COLS)
      .eq("fcredit", "1")
      .neq("paydeposit", "1")
      .neq("fstatus", "99")
      .order("fdate", { ascending: true, nullsFirst: false })
      .limit(LIMIT);

    const [
      { data: aData, error: aErr },
      { data: bData, error: bErr },
    ] = await Promise.all([qAwaiting, qCredit]);

    if (aErr) {
      logger.error("reports", "ar-aging awaiting-payment query failed", aErr);
      return { ok: false, error: aErr.message };
    }
    if (bErr) {
      logger.error("reports", "ar-aging credit query failed", bErr);
      return { ok: false, error: bErr.message };
    }

    const aRows = (aData ?? []) as unknown as ArForwarderRow[];
    const bRows = (bData ?? []) as unknown as ArForwarderRow[];
    const capped = aRows.length >= LIMIT || bRows.length >= LIMIT;

    // Union by id (a row could match both sets — fstatus=5 AND on credit).
    const byId = new Map<number, ArForwarderRow>();
    for (const r of [...aRows, ...bRows]) byId.set(r.id, r);
    const rows = Array.from(byId.values());

    const nowMs = Date.now();

    // ── Bucket totals + per-customer rollup ────────────────────────────────
    const bucketAmt: Record<AgingBucketKey, number> = emptyByBucket();
    const bucketCnt: Record<AgingBucketKey, number> = emptyByBucket();
    let grandTotal = 0;
    let grandCount = 0;
    const debtors = new Map<string, DebtorAcc>();

    for (const r of rows) {
      const amount = calcForwarderOutstanding(r);
      if (amount <= 0) continue; // nothing owed → not a receivable
      const fdateMs = r.fdate ? new Date(r.fdate).getTime() : NaN;
      const age = ageDays(r.fdate, nowMs);
      const bkt = bucketForAge(age);

      bucketAmt[bkt] += amount;
      bucketCnt[bkt] += 1;
      grandTotal += amount;
      grandCount += 1;

      const uid = (r.userid ?? "").trim() || "(ไม่ระบุ)";
      const acc =
        debtors.get(uid) ?? { amount: 0, orders: 0, oldestMs: null, byBucket: emptyByBucket() };
      acc.amount += amount;
      acc.orders += 1;
      acc.byBucket[bkt] += amount;
      if (Number.isFinite(fdateMs)) {
        acc.oldestMs = acc.oldestMs === null ? fdateMs : Math.min(acc.oldestMs, fdateMs);
      }
      debtors.set(uid, acc);
    }

    const buckets: BucketTotal[] = AGING_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      amount: bucketAmt[b.key],
      count: bucketCnt[b.key],
    }));

    // ── Top-N debtors (worst-first by amount) ──────────────────────────────
    const allDebtors = Array.from(debtors.entries())
      .map(([userid, a]) => ({
        userid,
        amount: a.amount,
        orders: a.orders,
        oldestAgeDays: a.oldestMs !== null ? ageDays(new Date(a.oldestMs).toISOString(), nowMs) : 0,
        byBucket: a.byBucket,
      }))
      .sort((x, y) => y.amount - x.amount);

    const debtorCount = allDebtors.length;
    const top = allDebtors.slice(0, Math.max(0, topN));

    // Resolve names/phones for the displayed debtors only (tb_users camelCase).
    const ids = top.map((d) => d.userid).filter((u) => u && u !== "(ไม่ระบุ)");
    const nameMap = new Map<string, { name: string; phone: string }>();
    if (ids.length > 0) {
      const { data: uRows, error: uErr } = await admin
        .from("tb_users")
        .select("userID, userName, userLastName, userTel")
        .in("userID", ids)
        .limit(LIMIT);
      if (uErr) {
        // Non-fatal — names degrade to the userid.
        logger.error("reports", "ar-aging tb_users lookup failed", uErr);
      }
      type URow = {
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userTel: string | null;
      };
      for (const u of (uRows ?? []) as URow[]) {
        const name = [u.userName, u.userLastName].filter(Boolean).join(" ").trim();
        nameMap.set(u.userID, { name, phone: u.userTel ?? "" });
      }
    }

    const topDebtors: DebtorRow[] = top.map((d) => {
      const meta = nameMap.get(d.userid);
      return {
        userid: d.userid,
        name: meta?.name ?? "",
        phone: meta?.phone ?? "",
        amount: d.amount,
        orders: d.orders,
        oldestAgeDays: d.oldestAgeDays,
        byBucket: d.byBucket,
      };
    });

    return {
      ok: true,
      data: { buckets, grandTotal, grandCount, debtorCount, topDebtors, capped },
    };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    logger.error("reports", "ar-aging threw", err);
    return { ok: false, error: err.message };
  }
}

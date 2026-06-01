/**
 * Wave C BI — AR-aging (ลูกหนี้การค้า · ยอดค้างชำระตามอายุหนี้): shared types.
 *
 * Co-located NON-"use server" module (the sibling `reports-ar.ts` is a
 * `"use server"` file and may only export async functions — CLAUDE_TECHNICAL.md
 * "use server" rule). Type aliases + the bucket vocabulary live here.
 *
 * ── WHAT "AR" MEANS HERE (source = tb_forwarder · LIVE legacy table) ─────────
 * An "outstanding receivable" = a ฝากนำเข้า order the customer still owes for.
 * Pacred has no single "invoice" ledger for cargo; the money owed lives on the
 * forwarder row itself. We treat a forwarder row as OUTSTANDING when EITHER:
 *   (a) fstatus='5'  — "รอชำระเงิน" (the canonical awaiting-payment stage ·
 *       lib/legacy-status-map.ts LEGACY_FORWARDER_STATUS · sidebar-counts.ts
 *       forwarderArrived family). This is the ~457-row cash-waiting pool the
 *       big audit flagged.  OR
 *   (b) fcredit='1' AND paydeposit <> '1'  — shipped-on-credit and not yet paid
 *       in full (same rule as /admin/reports/credit-pending).
 * fstatus='99' (cancelled/special) is always excluded.
 *
 * Outstanding amount per row = calcForwarderOutstanding() (lib/forwarder/
 * outstanding.ts · port of legacy calPriceForwarderMain). Age (days) =
 * today − fdate, bucketed 0-30 / 31-60 / 61-90 / 90+.
 *
 * NB columns (tb_forwarder · migration 0081 · ALL LOWERCASE): fstatus, fcredit,
 * paydeposit, fdate, userid + the calcForwarderOutstanding price inputs.
 * tb_users is camelCase (userID / userName / userTel).
 */

/** The four aging buckets, youngest-first. `key` is the stable id/CSS hook. */
export const AGING_BUCKETS = [
  { key: "b0_30",  label: "0–30 วัน",  min: 0,  max: 30 },
  { key: "b31_60", label: "31–60 วัน", min: 31, max: 60 },
  { key: "b61_90", label: "61–90 วัน", min: 61, max: 90 },
  { key: "b90p",   label: "90+ วัน",   min: 91, max: Infinity },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

/** Which bucket an age-in-days falls into. */
export function bucketForAge(days: number): AgingBucketKey {
  if (days <= 30) return "b0_30";
  if (days <= 60) return "b31_60";
  if (days <= 90) return "b61_90";
  return "b90p";
}

/** One bucket's totals (the summary row). */
export type BucketTotal = {
  key: AgingBucketKey;
  label: string;
  /** Σ outstanding THB in this bucket. */
  amount: number;
  /** Count of orders in this bucket. */
  count: number;
};

/**
 * A single sales rep holding outstanding debt (rep-attribution rows).
 * Folded in from the former /admin/accounting/ar-aging twin (deduped 2026-06-02)
 * so the canonical report keeps its rep-attribution view. Source =
 * tb_sales_report.sradminidsale joined over the outstanding fids → tb_admin name.
 */
export type RepAgingRow = {
  /** tb_admin.adminID — the rep who closed the sale. */
  adminID: string;
  /** "ชื่อ สกุล" of the rep, or null if unresolved. */
  repName: string | null;
  /** Σ outstanding THB across this rep's attributed outstanding orders. */
  amount: number;
  /** Number of outstanding orders attributed to this rep. */
  orders: number;
};

/** A single debtor customer (the debtor-table rows). */
export type DebtorRow = {
  /** tb_users.userID (e.g. PR10843) — also the React key. */
  userid: string;
  /** "ชื่อ สกุล" or "" if not resolved. */
  name: string;
  /** tb_users.userTel or "". */
  phone: string;
  /** Σ outstanding THB across all this customer's outstanding orders. */
  amount: number;
  /** Number of outstanding orders for this customer. */
  orders: number;
  /** Whole days since the OLDEST outstanding order's fdate. */
  oldestAgeDays: number;
  /** Per-bucket outstanding amount for this customer (for the mini split). */
  byBucket: Record<AgingBucketKey, number>;
};

/** The full AR-aging payload the page renders. */
export type ArAgingReport = {
  /** Per-bucket totals, ordered youngest→oldest. */
  buckets: BucketTotal[];
  /** Grand total outstanding THB across every bucket. */
  grandTotal: number;
  /** Grand total outstanding ORDER count. */
  grandCount: number;
  /** Distinct debtor-customer count. */
  debtorCount: number;
  /** Top-N debtors by amount (worst-first). */
  topDebtors: DebtorRow[];
  /** Top-10 sales reps by outstanding debt held (attribution via tb_sales_report). */
  topReps: RepAgingRow[];
  /** True if the capped pull hit the row LIMIT (totals may understate). */
  capped: boolean;
};

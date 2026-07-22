/**
 * A customer can pay several forwarder shipments with one uploaded slip.
 * `submitForwarderPayment` keeps one ledger row per shipment, but stamps every
 * row from that submit with the exact same `(userid, imagesslip)` pair.
 *
 * That pair is the persisted payment-group identity.  Do not group by amount or
 * date: both can collide across unrelated bank transfers.  Only direct import
 * slips use this fallback grouping; legacy topup/cascade rows already have the
 * stronger `reforder2` / `tb_wallet_paydeposit` relation.
 */

export type WalletSlipGroupRow = {
  id: number | string;
  userid: string | null;
  imagesslip: string | null;
  type: string | null;
  typeservice?: string | null;
  reforder2?: string | number | null;
  amount?: number | string | null;
};

export function directSlipGroupKey(row: WalletSlipGroupRow): string | null {
  const userid = (row.userid ?? "").trim();
  const slip = (row.imagesslip ?? "").trim();
  const reforder2 = String(row.reforder2 ?? "").trim();
  if (row.type !== "4" || row.typeservice !== "2" || reforder2 || !userid || !slip) {
    return null;
  }
  return `${userid}\u0000${slip}`;
}

export type WalletSlipGroup<T extends WalletSlipGroupRow> = {
  key: string | null;
  anchor: T;
  rows: T[];
  /** Integer satang.  This is the accounting-safe aggregate authority. */
  totalSatang: number;
};

/** Parse base-10 money without multiplying a binary float by 100. */
const toSatang = (value: number | string | null | undefined): number => {
  const text = String(value ?? 0).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return 0;

  const negative = match[1] === "-";
  const whole = Number(match[2]);
  const fraction = match[3] ?? "";
  const cents = Number((fraction.slice(0, 2) + "00").slice(0, 2));
  // Monetary storage is normally two decimals.  If older data contains more,
  // round once at the row boundary using decimal half-up semantics.
  const carry = (fraction[2] ?? "0") >= "5" ? 1 : 0;
  const satang = whole * 100 + cents + carry;
  return negative ? -satang : satang;
};

/** Preserve input order; the first row is the canonical review/detail anchor. */
export function groupDirectWalletSlips<T extends WalletSlipGroupRow>(rows: T[]): WalletSlipGroup<T>[] {
  const result: WalletSlipGroup<T>[] = [];
  const byKey = new Map<string, WalletSlipGroup<T>>();

  for (const row of rows) {
    const key = directSlipGroupKey(row);
    if (!key) {
      result.push({ key: null, anchor: row, rows: [row], totalSatang: toSatang(row.amount) });
      continue;
    }
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(row);
      existing.totalSatang += toSatang(row.amount);
      continue;
    }
    const group = { key, anchor: row, rows: [row], totalSatang: toSatang(row.amount) };
    byKey.set(key, group);
    result.push(group);
  }
  return result;
}

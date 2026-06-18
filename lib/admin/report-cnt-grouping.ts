/**
 * ════════════════════════════════════════════════════════════════════════
 * report-cnt -N sibling grouping (FIX 3 · 2026-06-18 · owner directive).
 *
 * THE PROBLEM
 * ───────────
 * A MOMO carrier SPLITS one customer shipment into `-N` (and `-N/M`) sub-
 * tracking rows ("ซอยตู้") — each is a separate tb_forwarder row with its own
 * kg / cbm / price. On the report-cnt detail the rows render flat, so the
 * single "เรียกเก็บเงินลูกค้า" (collect) action bills the customer per-box. The
 * owner: a customer who ordered ONE shipment must be billed ONCE for the group.
 *
 * THE RULE
 * ────────
 * Group key = `(userid, baseTracking)` where
 *   baseTracking = ftrackingchn with a trailing `-N` (or `-N/M`) stripped.
 * (We reuse `baseTracking` from momo-bill-header.ts so the suffix-stripping is
 *  identical to the box-count Σ fix — it handles both "-3" and "-3/7" forms,
 *  which is strictly the MOMO model in docs/research/report-cnt-forwarder-
 *  detail-map-2026-06-16.md.)
 *
 *   - A row with no `-N` suffix is its own base — it joins its `-N` children
 *     (same userid + same baseTracking).
 *   - Rows for DIFFERENT users never group (the key includes userid).
 *   - A null / "-" tracking can't group → each such row is its own singleton
 *     group (keyed by its row id so two null-tracking rows don't merge).
 *
 * SCOPE — DISPLAY + which fIDs feed ONE group-collect. This module is pure
 * (no DB, no IO, no money write); it only decides the grouping + the combined
 * totals shown. The actual billing reuses the existing per-row money writer
 * `adminReportCntBillToCustomer` (looped over the group's member fIDs).
 *
 * SAFETY — pure · unit-tested. Runs in test:unit.
 * RUN:  pnpm tsx lib/admin/report-cnt-grouping.test.ts
 * ════════════════════════════════════════════════════════════════════════
 */

import { baseTracking } from "./momo-bill-header";

/** The minimum row shape the grouping + combined totals need. */
export type GroupableRow = {
  id: number;
  userid: string;
  ftrackingchn: string | null;
  username?: string | null;
  famount: number | null;
  fvolume: number | null;
  fweight: number | null;
  priceGetUser: number;
  fcosttotalprice: number;
  profitItem: number;
  /** product status code — drives whether a member is collect-eligible (4 = ถึงไทยแล้ว). */
  fstatus: string;
};

/** A parcel group = its key + ordered members + the combined Σ + collect-eligibility. */
export type RowGroup<T extends GroupableRow> = {
  /** stable key: `${userid}::${baseTracking}` (or `${userid}::#${id}` for un-groupable). */
  key: string;
  userid: string;
  username: string | null;
  /** the shared base tracking (sans -N), or the lone row's tracking when un-groupable. */
  baseTracking: string;
  members: T[];
  /** true when >1 member — i.e. the row was split into -N siblings. */
  isSplit: boolean;
  combined: {
    count: number;
    famount: number;
    fvolume: number;
    fweight: number;
    priceGetUser: number;
    fcosttotalprice: number;
    profitItem: number;
  };
  /** member fIDs whose fstatus === "4" (ถึงไทยแล้ว) — the only collect-eligible set. */
  billableIds: number[];
};

/**
 * Group rows by (userid, baseTracking). Order-preserving: a group appears at
 * the position of its FIRST member; members keep their original relative order.
 * Pure — no mutation of the input rows.
 */
export function groupRowsBySibling<T extends GroupableRow>(rows: readonly T[]): RowGroup<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, T[]>();

  for (const r of rows) {
    const base = baseTracking(r.ftrackingchn);
    // Un-groupable (null/"-" tracking) → unique singleton key by row id so two
    // such rows never merge into one fake group.
    const key = base != null ? `${r.userid}::${base}` : `${r.userid}::#${r.id}`;
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(r);
  }

  return order.map((key) => {
    const members = byKey.get(key)!;
    const first = members[0];
    const base = baseTracking(first.ftrackingchn) ?? (first.ftrackingchn ?? "-");
    const combined = members.reduce(
      (acc, m) => ({
        count: acc.count + 1,
        famount: acc.famount + (m.famount ?? 0),
        fvolume: acc.fvolume + (m.fvolume ?? 0),
        fweight: acc.fweight + (m.fweight ?? 0),
        priceGetUser: acc.priceGetUser + m.priceGetUser,
        fcosttotalprice: acc.fcosttotalprice + m.fcosttotalprice,
        profitItem: acc.profitItem + m.profitItem,
      }),
      { count: 0, famount: 0, fvolume: 0, fweight: 0, priceGetUser: 0, fcosttotalprice: 0, profitItem: 0 },
    );
    return {
      key,
      userid: first.userid,
      username: first.username ?? null,
      baseTracking: base,
      members,
      isSplit: members.length > 1,
      combined,
      // Only fstatus 4 (ถึงไทยแล้ว) members can be billed (mirrors the per-row
      // BillToCustomer gate — the action no-ops 5/6/7 + refuses 1/2/3).
      billableIds: members.filter((m) => Number(m.fstatus) === 4).map((m) => m.id),
    };
  });
}

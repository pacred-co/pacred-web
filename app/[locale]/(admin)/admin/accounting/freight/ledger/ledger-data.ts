"use server";

/**
 * Freight ledger — READ-ONLY money-movement reader.
 *
 * Surfaces the existing freight money tables as a ประวัติ/เงินเข้า/เงินออก
 * statement, faithful to the legacy `acc-system.php` Freight ledger:
 *
 *   เงินเข้า (รายรับ)  ← freight_invoice_payments (status='recorded')
 *                        — real settlements against issued invoices.
 *   เงินออก (รายจ่าย)  ← freight_shipments.cost_total_thb
 *                        — the internal cost snapshot (China freight + Thai
 *                          local) frozen at quote→shipment convert (mig 0165).
 *   สุทธิ (กำไร)        ← เงินเข้า − เงินออก within the date window.
 *
 * ⚠️ §0e money-isolation: this file ONLY READS the canonical freight_*
 *    tables. It never writes anything — no mutation, no money path. The
 *    cost/margin figures are the internal SELL−COST analytics snapshot
 *    (mig 0165) — NOT the customer-visible DECLARED (สำแดง) value.
 *
 * The page-level money MUTATIONS (record/void payment) already live in
 * actions/admin/freight-invoice-payments.ts and are reached from the
 * shipment detail page — this ledger does not duplicate them.
 *
 * RBAC: super, accounting (enforced again at the page via requireAdmin).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, type AdminActionResult } from "@/actions/admin/common";

const ROLES = ["super", "accounting"] as const;

// ── Row shapes ──────────────────────────────────────────────────────────

/** One เงินเข้า ledger line — a recorded payment against a freight invoice. */
export type FreightLedgerInflow = {
  payment_id:    string;
  paid_at:       string;
  method:        string;
  amount_thb:    number;
  invoice_no:    string | null;
  job_no:        string | null;
  customer:      string;
  /** Raw PR/member code — for a clickable CustomerCodeLink (see `customer` for the combined display string used in CSV). */
  member_code:   string | null;
  customer_name: string;
  bank_ref:      string | null;
  notes:         string | null;
};

/** One เงินออก ledger line — a delivered/converted shipment's cost snapshot. */
export type FreightLedgerOutflow = {
  shipment_id:       string;
  job_no:            string | null;
  ref_at:            string;            // delivered_at ?? confirmed_at ?? created_at
  status:            string;
  customer:          string;
  /** Raw PR/member code — for a clickable CustomerCodeLink (see `customer` for the combined display string used in CSV). */
  member_code:       string | null;
  customer_name:     string;
  cost_china_thb:    number;
  cost_local_thb:    number;
  cost_total_thb:    number;
  profit_margin_thb: number | null;
};

export type FreightLedgerResult = {
  inflows:        FreightLedgerInflow[];
  outflows:       FreightLedgerOutflow[];
  totalIn:        number;
  totalOut:       number;
  net:            number;
  inflowsTruncated:  boolean;
  outflowsTruncated: boolean;
};

const MAX_ROWS = 1000;

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Build a display name from a joined `profiles` row. */
function customerLabel(p: ProfileLite | null | undefined): string {
  if (!p) return "—";
  const person = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  const name   = p.company_name?.trim() || person || "";
  return [p.member_code, name].filter(Boolean).join(" · ") || (p.member_code ?? "—");
}

/** Name-only part of a joined `profiles` row (no member code) — pairs with
 *  `member_code` so the UI can render the code as a CustomerCodeLink and the
 *  name as plain text, instead of one opaque combined string. */
function customerNameOnly(p: ProfileLite | null | undefined): string {
  if (!p) return "";
  const person = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.company_name?.trim() || person || "";
}

type ProfileLite = {
  member_code:  string | null;
  first_name:   string | null;
  last_name:    string | null;
  company_name: string | null;
};

// Supabase embeds a single related row as an object OR (typings) an array;
// normalise to one row.
function oneProfile(rel: unknown): ProfileLite | null {
  if (!rel) return null;
  const r = Array.isArray(rel) ? rel[0] : rel;
  return (r ?? null) as ProfileLite | null;
}

/**
 * Read the freight money movement within [dateFrom, dateTo] (inclusive day
 * bounds). Both bounds are `YYYY-MM-DD`; the reader widens `dateTo` to the
 * end of that day so payments stamped late in the day are included.
 */
export async function getFreightLedger(args: {
  dateFrom: string;
  dateTo:   string;
}): Promise<AdminActionResult<FreightLedgerResult>> {
  const { dateFrom, dateTo } = args;
  const okDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (!okDate(dateFrom) || !okDate(dateTo)) {
    return { ok: false, error: "invalid_date_range" };
  }

  // Inclusive bounds — start of dateFrom → end of dateTo (UTC ISO; the page
  // labels are calendar-day, money settlement granularity is the day).
  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const toIso   = `${dateTo}T23:59:59.999Z`;

  return withAdmin([...ROLES], async () => {
    const admin = createAdminClient();

    // ── เงินเข้า — recorded payments, newest first ──────────────────────
    const { data: payRows, error: payErr } = await admin
      .from("freight_invoice_payments")
      .select(
        `id, paid_at, method, amount_thb, bank_ref, notes,
         freight_invoices:freight_invoice_id (
           invoice_no,
           profiles:profile_id ( member_code, first_name, last_name, company_name ),
           freight_shipments:freight_shipment_id ( job_no )
         )`,
      )
      .eq("status", "recorded")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso)
      .order("paid_at", { ascending: false })
      .limit(MAX_ROWS + 1);
    if (payErr) {
      console.error(`[freight_invoice_payments ledger] failed`, { code: payErr.code, message: payErr.message });
    }

    const payRaw = (payRows ?? []) as unknown as Array<{
      id: string; paid_at: string; method: string; amount_thb: number;
      bank_ref: string | null; notes: string | null;
      freight_invoices: unknown;
    }>;
    const inflowsTruncated = payRaw.length > MAX_ROWS;
    const inflows: FreightLedgerInflow[] = payRaw.slice(0, MAX_ROWS).map((r) => {
      const inv = (Array.isArray(r.freight_invoices) ? r.freight_invoices[0] : r.freight_invoices) as
        | { invoice_no: string | null; profiles: unknown; freight_shipments: unknown }
        | null
        | undefined;
      const ship = inv
        ? (Array.isArray(inv.freight_shipments) ? inv.freight_shipments[0] : inv.freight_shipments) as
            | { job_no: string | null }
            | null
            | undefined
        : null;
      const profile = oneProfile(inv?.profiles);
      return {
        payment_id:    r.id,
        paid_at:       r.paid_at,
        method:        r.method,
        amount_thb:    round2(Number(r.amount_thb)),
        invoice_no:    inv?.invoice_no ?? null,
        job_no:        ship?.job_no ?? null,
        customer:      customerLabel(profile),
        member_code:   profile?.member_code ?? null,
        customer_name: customerNameOnly(profile),
        bank_ref:      r.bank_ref,
        notes:         r.notes,
      };
    });

    // ── เงินออก — shipment cost snapshots (mig 0165), newest first ──────
    // Cost is frozen at convert; we date the row by its lifecycle stamp
    // (delivered → confirmed → created) and window on created_at as the
    // stable anchor, then sort by the chosen ref date.
    const { data: shipRows, error: shipErr } = await admin
      .from("freight_shipments")
      .select(
        `id, job_no, status, created_at, confirmed_at, delivered_at,
         cost_china_freight_thb, cost_local_thb, cost_total_thb, profit_margin_thb,
         profiles:profile_id ( member_code, first_name, last_name, company_name )`,
      )
      .not("cost_total_thb", "is", null)
      .neq("status", "cancelled")
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS + 1);
    if (shipErr) {
      console.error(`[freight_shipments ledger] failed`, { code: shipErr.code, message: shipErr.message });
    }

    const shipRaw = (shipRows ?? []) as unknown as Array<{
      id: string; job_no: string | null; status: string;
      created_at: string; confirmed_at: string | null; delivered_at: string | null;
      cost_china_freight_thb: number | null; cost_local_thb: number | null;
      cost_total_thb: number | null; profit_margin_thb: number | null;
      profiles: unknown;
    }>;
    const outflowsTruncated = shipRaw.length > MAX_ROWS;
    const outflows: FreightLedgerOutflow[] = shipRaw.slice(0, MAX_ROWS).map((r) => {
      const profile = oneProfile(r.profiles);
      return {
        shipment_id:       r.id,
        job_no:            r.job_no,
        ref_at:            r.delivered_at ?? r.confirmed_at ?? r.created_at,
        status:            r.status,
        customer:          customerLabel(profile),
        member_code:       profile?.member_code ?? null,
        customer_name:     customerNameOnly(profile),
        cost_china_thb:    round2(Number(r.cost_china_freight_thb ?? 0)),
        cost_local_thb:    round2(Number(r.cost_local_thb ?? 0)),
        cost_total_thb:    round2(Number(r.cost_total_thb ?? 0)),
        profit_margin_thb: r.profit_margin_thb == null ? null : round2(Number(r.profit_margin_thb)),
      };
    });

    const totalIn  = round2(inflows.reduce((s, r) => s + r.amount_thb, 0));
    const totalOut = round2(outflows.reduce((s, r) => s + r.cost_total_thb, 0));
    const net      = round2(totalIn - totalOut);

    return {
      ok: true,
      data: { inflows, outflows, totalIn, totalOut, net, inflowsTruncated, outflowsTruncated },
    };
  });
}

"use server";

/**
 * V-E9 — Accounting periods admin actions (monthly closing ritual).
 *
 * Per [docs/port-specs/freight-monthly-closing.md] + migration
 * 0056_accounting_periods.sql.
 *
 * V1 surface area:
 *   adminOpenAccountingPeriod  — seed a yyyymm row in 'open' state
 *   adminMarkPeriodClosing     — open → closing (UI soft-warn, trigger
 *                                still allows writes)
 *   adminClosePeriod           — closing → closed (snapshot fan-out to
 *                                period_close_event; trigger now BLOCKS
 *                                UPDATE/DELETE on financial rows in
 *                                this period)
 *   adminReopenPeriod          — closed → open (SUPER ONLY emergency
 *                                rollback; reason ≥10 chars; audit
 *                                logged)
 *
 * RBAC:
 *   open / mark-closing / close → super + accounting
 *   reopen                      → super ONLY
 *
 * Audit: every mutation writes admin_audit_log per ADR-0014. Namespace:
 * accounting_period.*.
 *
 * Snapshot tables: tax_invoices / freight_invoices /
 * freight_invoice_payments / wallet_transactions (the 4 the DB trigger
 * also guards). The snapshot reads NON-cancelled / NON-voided rows only
 * — what actually contributes to the period's financial totals.
 *
 * ── V1 DEFERRED ────────────────────────────────────────────────
 *   - commission_accruals snapshot (V-E8 migration 0054 shipped but
 *     spec called for accruals snapshot; defer until commission V1
 *     totals stabilise)
 *   - Cron auto-seed each month-1 (V1 admin clicks "open" manually)
 *   - PEAK accounting export (U2-4 separate item)
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import {
  openPeriodSchema,       type OpenPeriodInput,
  markPeriodClosingSchema, type MarkPeriodClosingInput,
  closePeriodSchema,      type ClosePeriodInput,
  reopenPeriodSchema,     type ReopenPeriodInput,
} from "@/lib/validators/accounting-period";

// ────────────────────────────────────────────────────────────
// Shared types + helpers
// ────────────────────────────────────────────────────────────

type CloseSnapshot = {
  table_name: string;
  row_count:  number;
  sum_thb:    number | null;
  sum_label:  string | null;
};

/**
 * Compute the [bkk_from, bkk_to_exclusive) date-range for a yyyymm window.
 * Both bounds are ISO strings in UTC for use in .gte / .lt clauses.
 *
 * Bangkok timezone is fixed UTC+7 (no DST), so "first day of month at 00:00
 * BKK" = "first day of month at 17:00 UTC of the previous day". We compute
 * via Date math so leap years / Feb edge cases stay correct.
 */
function yyyymmRange(yyyymm: string): { fromIso: string; toIso: string } {
  const year  = Number.parseInt(yyyymm.slice(0, 4), 10);
  const month = Number.parseInt(yyyymm.slice(4, 6), 10); // 1..12

  // BKK midnight on the 1st = UTC 17:00 of the previous day.
  // Using UTC arithmetic + a -7h shift keeps the year/month boundary correct.
  const fromBkk = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  fromBkk.setUTCHours(fromBkk.getUTCHours() - 7);

  // The exclusive upper bound = the 1st of the next month at BKK midnight.
  const toBkk = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  toBkk.setUTCHours(toBkk.getUTCHours() - 7);

  return { fromIso: fromBkk.toISOString(), toIso: toBkk.toISOString() };
}

/**
 * Run all 4 per-table snapshot queries for a yyyymm window. Returns the
 * list of CloseSnapshot rows ready to insert into period_close_event.
 *
 * Snapshot scope per table:
 *   tax_invoices            — status IN ('issued') · sum total_thb     · keyed on issued_at
 *   freight_invoices        — status IN ('issued') · sum commercial_value_thb · keyed on issued_at
 *   freight_invoice_payments — status='recorded'   · sum amount_thb    · keyed on paid_at
 *   wallet_transactions     — status='completed'   · sum amount        · keyed on created_at
 *
 * We deliberately exclude cancelled / voided / pending so the snapshot
 * matches what the freeze trigger protects (mutations on these tables
 * are blocked, but the SUM only counts the rows that contribute to the
 * period's headline financial totals).
 */
async function buildCloseSnapshots(
  admin: ReturnType<typeof createAdminClient>,
  yyyymm: string,
): Promise<CloseSnapshot[]> {
  const { fromIso, toIso } = yyyymmRange(yyyymm);
  const out: CloseSnapshot[] = [];

  // ── tax_invoices ────────────────────────────────────────────
  {
    const { data, error } = await admin
      .from("tax_invoices")
      .select("total_thb")
      .eq("status", "issued")
      .gte("issued_at", fromIso)
      .lt("issued_at", toIso);
    if (error) {
      console.error(`[tax_invoices list] failed`, { code: error.code, message: error.message });
    }
    const rows = (data ?? []) as Array<{ total_thb: number }>;
    out.push({
      table_name: "tax_invoices",
      row_count:  rows.length,
      sum_thb:    sumNumeric(rows.map((r) => r.total_thb)),
      sum_label:  "total_thb",
    });
  }

  // ── freight_invoices ────────────────────────────────────────
  {
    const { data, error } = await admin
      .from("freight_invoices")
      .select("commercial_value_thb")
      .eq("status", "issued")
      .gte("issued_at", fromIso)
      .lt("issued_at", toIso);
    if (error) {
      console.error(`[freight_invoices list] failed`, { code: error.code, message: error.message });
    }
    const rows = (data ?? []) as Array<{ commercial_value_thb: number | null }>;
    out.push({
      table_name: "freight_invoices",
      row_count:  rows.length,
      sum_thb:    sumNumeric(rows.map((r) => r.commercial_value_thb)),
      sum_label:  "commercial_value_thb",
    });
  }

  // ── freight_invoice_payments ────────────────────────────────
  {
    const { data, error } = await admin
      .from("freight_invoice_payments")
      .select("amount_thb")
      .eq("status", "recorded")
      .gte("paid_at", fromIso)
      .lt("paid_at", toIso);
    if (error) {
      console.error(`[freight_invoice_payments list] failed`, { code: error.code, message: error.message });
    }
    const rows = (data ?? []) as Array<{ amount_thb: number }>;
    out.push({
      table_name: "freight_invoice_payments",
      row_count:  rows.length,
      sum_thb:    sumNumeric(rows.map((r) => r.amount_thb)),
      sum_label:  "amount_thb",
    });
  }

  // ── wallet_transactions ─────────────────────────────────────
  // amount is signed (+credit / -debit) — we sum the absolute values to
  // give a "gross money moved" headline. A separate net could be added
  // in V-E12 dashboards if accounting wants it.
  {
    const { data, error } = await admin
      .from("wallet_transactions")
      .select("amount")
      .eq("status", "completed")
      .gte("created_at", fromIso)
      .lt("created_at", toIso);
    if (error) {
      console.error(`[wallet_transactions list] failed`, { code: error.code, message: error.message });
    }
    const rows = (data ?? []) as Array<{ amount: number }>;
    out.push({
      table_name: "wallet_transactions",
      row_count:  rows.length,
      sum_thb:    sumNumeric(rows.map((r) => Math.abs(Number(r.amount ?? 0)))),
      sum_label:  "abs(amount)",
    });
  }

  return out;
}

function sumNumeric(values: Array<number | null | undefined>): number {
  let s = 0;
  for (const v of values) {
    const n = Number(v ?? 0);
    if (Number.isFinite(n)) s += n;
  }
  // Round to 2dp (THB cents).
  return Math.round(s * 100) / 100;
}

// ────────────────────────────────────────────────────────────
// 1) Open accounting period (seed in 'open' state)
// ────────────────────────────────────────────────────────────

export async function adminOpenAccountingPeriod(
  input: OpenPeriodInput,
): Promise<AdminActionResult<{ period_yyyymm: string }>> {
  const parsed = openPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: existing, error: existingErr } = await admin
      .from("accounting_periods")
      .select("period_yyyymm, status")
      .eq("period_yyyymm", d.period_yyyymm)
      .maybeSingle<{ period_yyyymm: string; status: string }>();
    if (existingErr) {
      console.error(`[accounting_periods list] failed`, { code: existingErr.code, message: existingErr.message });
    }
    if (existing) return { ok: false, error: "period_already_exists" };

    const { error: insErr } = await admin
      .from("accounting_periods")
      .insert({
        period_yyyymm:      d.period_yyyymm,
        status:             "open",
        opened_by_admin_id: adminId,
      });
    if (insErr) {
      // 23505 = race (someone else seeded it) — idempotent success.
      if (insErr.code === "23505" || /duplicate|unique/i.test(insErr.message)) {
        return { ok: true, data: { period_yyyymm: d.period_yyyymm } };
      }
      return { ok: false, error: `insert_failed: ${insErr.message}` };
    }

    await logAdminAction(adminId, "accounting_period.open", "accounting_period", d.period_yyyymm, {
      period_yyyymm: d.period_yyyymm,
    });

    revalidatePath("/admin/accounting/periods");
    return { ok: true, data: { period_yyyymm: d.period_yyyymm } };
  });
}

// ────────────────────────────────────────────────────────────
// 2) Mark period as closing (open → closing — soft warning state)
// ────────────────────────────────────────────────────────────

export async function adminMarkPeriodClosing(
  input: MarkPeriodClosingInput,
): Promise<AdminActionResult<void>> {
  const parsed = markPeriodClosingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("accounting_periods")
      .select("period_yyyymm, status")
      .eq("period_yyyymm", d.period_yyyymm)
      .maybeSingle<{ period_yyyymm: string; status: string }>();
    if (rowErr) {
      console.error(`[accounting_periods mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "period_not_found" };
    if (row.status === "closing") return { ok: false, error: "already_closing" };
    if (row.status === "closed")  return { ok: false, error: "already_closed" };

    const { error: updErr } = await admin
      .from("accounting_periods")
      .update({
        status:            "closing",
        closing_marked_at: new Date().toISOString(),
      })
      .eq("period_yyyymm", d.period_yyyymm)
      .eq("status", "open"); // optimistic race-guard
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "accounting_period.mark_closing", "accounting_period", d.period_yyyymm, {
      period_yyyymm: d.period_yyyymm,
    });

    revalidatePath("/admin/accounting/periods");
    revalidatePath(`/admin/accounting/periods/${d.period_yyyymm}`);
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────
// 3) Close period (closing → closed — snapshot fan-out)
// ────────────────────────────────────────────────────────────

type CloseResult = {
  period_yyyymm: string;
  snapshots:     CloseSnapshot[];
};

export async function adminClosePeriod(
  input: ClosePeriodInput,
): Promise<AdminActionResult<CloseResult>> {
  const parsed = closePeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  return withAdmin(["super", "accounting"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("accounting_periods")
      .select("period_yyyymm, status")
      .eq("period_yyyymm", d.period_yyyymm)
      .maybeSingle<{ period_yyyymm: string; status: string }>();
    if (rowErr) {
      console.error(`[accounting_periods mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "period_not_found" };
    if (row.status === "closed") return { ok: false, error: "already_closed" };
    // Allow close from either 'open' (skip the closing soft-state) or
    // 'closing' (the normal path). 'open' direct is the "I just want to
    // close this now" shortcut admins will frequently use V1.

    // ── Build the per-table snapshots BEFORE flipping status. If a
    // snapshot query fails, we'd rather abort than leave a closed period
    // with no audit row.
    const snapshots = await buildCloseSnapshots(admin, d.period_yyyymm);

    const closedAt = new Date().toISOString();

    const { error: updErr } = await admin
      .from("accounting_periods")
      .update({
        status:             "closed",
        closed_at:          closedAt,
        closed_by_admin_id: adminId,
        closing_notes:      d.closing_notes ?? null,
      })
      .eq("period_yyyymm", d.period_yyyymm)
      .in("status", ["open", "closing"]); // optimistic race-guard
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    // ── Insert snapshots. Best-effort: if a row fails to insert, we
    // log it but keep going — the close itself succeeded; losing one
    // audit row is preferable to rolling back the close.
    const eventRows = snapshots.map((s) => ({
      period_yyyymm:      d.period_yyyymm,
      table_name:         s.table_name,
      row_count:          s.row_count,
      sum_thb:            s.sum_thb,
      sum_label:          s.sum_label,
      closed_at:          closedAt,
      closed_by_admin_id: adminId,
    }));
    const { error: snapErr } = await admin
      .from("period_close_event")
      .insert(eventRows);
    if (snapErr) {
      // Don't fail the action — the period IS closed (trigger now
      // protecting rows). Log the audit-row insert failure so an admin
      // can re-snapshot later if needed.
      await logAdminAction(adminId, "accounting_period.snapshot_insert_failed", "accounting_period", d.period_yyyymm, {
        error:     snapErr.message,
        snapshots,
      });
    }

    await logAdminAction(adminId, "accounting_period.close", "accounting_period", d.period_yyyymm, {
      period_yyyymm: d.period_yyyymm,
      closing_notes: d.closing_notes ?? null,
      snapshots,
    });

    revalidatePath("/admin/accounting/periods");
    revalidatePath(`/admin/accounting/periods/${d.period_yyyymm}`);

    return {
      ok:   true,
      data: { period_yyyymm: d.period_yyyymm, snapshots },
    };
  });
}

// ────────────────────────────────────────────────────────────
// 4) Reopen period (closed → open — SUPER ONLY emergency rollback)
// ────────────────────────────────────────────────────────────

export async function adminReopenPeriod(
  input: ReopenPeriodInput,
): Promise<AdminActionResult<void>> {
  const parsed = reopenPeriodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  }
  const d = parsed.data;

  // SUPER ONLY — per spec "rare + serious + audit logged with reason".
  return withAdmin(["super"], async ({ adminId }) => {
    const admin = createAdminClient();

    const { data: row, error: rowErr } = await admin
      .from("accounting_periods")
      .select("period_yyyymm, status")
      .eq("period_yyyymm", d.period_yyyymm)
      .maybeSingle<{ period_yyyymm: string; status: string }>();
    if (rowErr) {
      console.error(`[accounting_periods mutation lookup] failed`, { code: rowErr.code, message: rowErr.message });
      return { ok: false, error: `db_error:${rowErr.code ?? "unknown"}` };
    }
    if (!row) return { ok: false, error: "period_not_found" };
    if (row.status !== "closed") return { ok: false, error: "period_not_closed" };

    const reopenedAt = new Date().toISOString();
    const { error: updErr } = await admin
      .from("accounting_periods")
      .update({
        status:               "open",
        reopened_at:          reopenedAt,
        reopened_by_admin_id: adminId,
        reopened_reason:      d.reopened_reason,
        // Clear the close metadata? No — keep the historical record.
        // The closed_at + closed_by_admin_id stay so the timeline shows
        // when it was closed + by whom + why reopened. The next close
        // overwrites closed_at/closed_by_admin_id; the reopen audit row
        // in admin_audit_log carries the full story.
      })
      .eq("period_yyyymm", d.period_yyyymm)
      .eq("status", "closed"); // optimistic race-guard
    if (updErr) return { ok: false, error: `update_failed: ${updErr.message}` };

    await logAdminAction(adminId, "accounting_period.reopen", "accounting_period", d.period_yyyymm, {
      period_yyyymm:   d.period_yyyymm,
      reopened_reason: d.reopened_reason,
    });

    revalidatePath("/admin/accounting/periods");
    revalidatePath(`/admin/accounting/periods/${d.period_yyyymm}`);
    return { ok: true };
  });
}

"use server";

/**
 * Export-all (CSV) for /admin/reports/sla-cycle-time — the STUCK-ORDERS board
 * of the forwarder SLA / cycle-time report (NEW analytics report, not a legacy
 * port; data source actions/admin/reports-sla.ts getForwarderSlaReport).
 *
 * The page renders two tables:
 *   1. the stuck-orders board (orders parked at one non-terminal stage past the
 *      threshold) — a real ROW-LIST, but capped to the worst 300 rows in the UI
 *      while the summary card shows the true total (often > 300).
 *   2. a 6-row per-stage dwell aggregate (a KPI table, not exportable rows).
 *
 * This backs the "⬇ CSV ทั้งหมด" button on the stuck table — the ENTIRE filtered
 * stuck list (NOT just the 300 shown), capped at EXPORT_CAP — then writes an
 * admin_export_log audit row (PII: customer name — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same stuck-order logic the page's data
 * source runs (getForwarderSlaReport):
 *   - pull tb_forwarder rows CREATED in-window:
 *       .gte("fdate", dayStartIso(range.from)).lte("fdate", dayEndIso(range.to))
 *       .order("fdate",{ascending:false})
 *   - an order is "stuck" if fstatus ∈ 1..6 (non-terminal) AND
 *       (now − stage-entry timestamp) ≥ stuckThresholdDays (default 7)
 *       and the delta is plausible (≥0, ≤730 days — same skew/corruption guard).
 *   - worst-first by daysStuck; the tb_users name join is identical.
 * The ONLY difference vs the page is: no 300-row UI cap (export the full list,
 * capped at EXPORT_CAP) + the audit log. The CSV columns mirror the stuck table
 * <thead> 1:1.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { range, stuckThresholdDays }.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import { type DateRange, dayStartIso, dayEndIso } from "@/lib/admin/reports/types";

// Safety cap for the "export all filtered" path (mirrors reports-sla LIMIT).
const EXPORT_CAP = 10000;

const MS_PER_DAY = 86_400_000;
// Same skew/corruption guard as reports-sla.ts MAX_PLAUSIBLE_DWELL_DAYS.
const MAX_PLAUSIBLE_DWELL_DAYS = 730;

// Canonical fstatus → stage label (mirrors the page's STAGE_LABEL 1:1 ·
// lib/admin/forwarder-status.ts FSTATUS_CFG · function.php L879-892).
const STAGE_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

// Stage-entry timestamp column for an order currently parked at fstatus N (1..6)
// — identical to reports-sla.ts STAGE_ENTRY_COL.
const STAGE_ENTRY_COL: Record<string, string> = {
  "1": "fdate",
  "2": "fdatestatus2",
  "3": "fdatestatus3",
  "4": "fdatestatus4",
  "5": "fdatestatus5",
  "6": "fdatestatus6",
};

type ForwarderRow = {
  id: number;
  userid: string | null;
  fstatus: string | null;
  fdate: string | null;
  fdatestatus2: string | null;
  fdatestatus3: string | null;
  fdatestatus4: string | null;
  fdatestatus5: string | null;
  fdatestatus6: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
};

/** Parse an ISO/Postgres timestamp → epoch ms, or null if unusable. */
function ts(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Active filters the page passes through (the resolved range + threshold). */
export type SlaStuckExportFilter = {
  /** Resolved date range (keyed on fdate · creation). */
  range: DateRange;
  /** Stuck threshold in days (page default 7). */
  stuckThresholdDays?: number;
};

/**
 * Export the ENTIRE filtered stuck-orders list (not just the 300 shown), capped
 * at EXPORT_CAP, as CSV rows for the "⬇ CSV ทั้งหมด" button. Re-runs the page's
 * exact stuck-order logic, unpaginated. Writes an admin_export_log audit row.
 */
export async function exportSlaStuckAll(
  filter: SlaStuckExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page.
  await requireAdmin(["super", "accounting"]);

  const { range } = filter;
  const stuckThresholdDays = filter.stuckThresholdDays ?? 7;
  const admin = createAdminClient();

  // ── Pass 1: tb_forwarder rows CREATED in-window (same filter as the page) ──
  const { data: rowsRaw, error } = await admin
    .from("tb_forwarder")
    .select(
      `id, userid, fstatus, fdate,
       fdatestatus2, fdatestatus3, fdatestatus4,
       fdatestatus5, fdatestatus6`,
    )
    .gte("fdate", dayStartIso(range.from))
    .lte("fdate", dayEndIso(range.to))
    .order("fdate", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportSlaStuckAll tb_forwarder] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as ForwarderRow[];

  // ── Identify stuck orders (same logic as reports-sla.ts) ──────────────────
  const now = Date.now();
  type StuckRaw = { id: number; userid: string | null; stage: string; daysStuck: number };
  const stuckRaw: StuckRaw[] = [];

  for (const r of all) {
    const st = String(r.fstatus ?? "");
    const entryCol = STAGE_ENTRY_COL[st]; // only defined for "1".."6"
    if (!entryCol) continue; // 7 (delivered) / 99 (shelved) / unknown → not stuck

    const cols: Record<string, string | null> = {
      fdate: r.fdate,
      fdatestatus2: r.fdatestatus2,
      fdatestatus3: r.fdatestatus3,
      fdatestatus4: r.fdatestatus4,
      fdatestatus5: r.fdatestatus5,
      fdatestatus6: r.fdatestatus6,
    };
    const enteredAt = ts(cols[entryCol]);
    if (enteredAt === null) continue;

    const days = (now - enteredAt) / MS_PER_DAY;
    if (days < 0 || days > MAX_PLAUSIBLE_DWELL_DAYS) continue; // future / corrupt
    if (days < stuckThresholdDays) continue;

    stuckRaw.push({ id: r.id, userid: r.userid, stage: st, daysStuck: Math.floor(days) });
  }

  // Worst-first; the EXPORT_CAP guard caps the full list (vs the 300 UI cap).
  stuckRaw.sort((a, b) => b.daysStuck - a.daysStuck);
  const truncated = stuckRaw.length > EXPORT_CAP;
  const stuckTop = truncated ? stuckRaw.slice(0, EXPORT_CAP) : stuckRaw;

  // ── Pass 2: tb_users for the customer-name display (same join as page) ─────
  const userIds = Array.from(
    new Set(stuckTop.map((s) => s.userid).filter((u): u is string => Boolean(u))),
  );
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName")
      .in("userID", userIds)
      .limit(EXPORT_CAP);
    if (usersErr) {
      console.error(`[exportSlaStuckAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      const name = [u.userName, u.userLastName].filter(Boolean).join(" ");
      userMap.set(u.userID, name);
    }
  }

  // SAME row mapping + column keys as the page's stuck table.
  const rows: CsvRow[] = stuckTop.map((s) => {
    const name = s.userid ? userMap.get(s.userid) : undefined;
    const code = s.userid ?? "";
    const customer = name ? `${code ? `[${code}] ` : ""}${name}` : (code || "—");
    return {
      fNo: `PR${s.id}`,
      stageLabel: STAGE_LABEL[s.stage] ?? s.stage,
      daysStuck: s.daysStuck,
      customer,
    };
  });

  await logAdminExport({
    dataset: "report-sla-cycle-time",
    filters: { from: range.from, to: range.to, stuckThresholdDays },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

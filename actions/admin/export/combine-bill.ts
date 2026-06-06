"use server";

/**
 * /admin/forwarders/combine-bill — FULL-filtered CSV export (owner directive 2026-06-07).
 *
 * Mirrors the /admin/leads golden reference (actions/admin/leads.ts →
 * exportLeadsAll). The page at
 * app/[locale]/(admin)/admin/forwarders/combine-bill/page.tsx builds its filtered
 * list of tb_bill rows (+ tb_bill_item fan-out) INLINE; this action replicates
 * that EXACT filtered query (date range / 90-day default / all-time) with the
 * ONLY difference being no per-page pagination — one capped page of up to
 * EXPORT_CAP rows instead of the 50-row .range() window. The CSV row shape +
 * columns are byte-identical to the page's CsvButton.
 *
 * Every full export writes one admin_export_log audit row (PII walk-off trail).
 *
 * Per AGENTS.md §0c / CLAUDE_TECHNICAL.md — every Supabase query destructures
 * `error`. Per Rule A — the page passes its already-derived filter window
 * (filterStart/filterEnd) so the export can never re-derive a different WHERE
 * clause and drift from the on-screen table.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

const EXPORT_CAP = 10000;

type BillRow = {
  billid: number;
  date: string | null;
  printstatus: string;
  adminid: string;
};

type BillItemRow = {
  id: number;
  billid: number;
  fid: number;
};

/**
 * The already-derived filter state the page computed from its URL params.
 * Passing the resolved window (not the raw URL) guarantees the export's WHERE
 * clause matches the page's exactly — no re-derivation, no drift.
 *   - filterMode "range"   → date window via filterStart/filterEnd
 *   - filterMode "default" → last-90-days window via filterStart/filterEnd
 *   - filterMode "all"     → no date filter (filterStart/filterEnd null)
 */
export type CombineBillExportFilter = {
  filterMode: "range" | "all" | "default";
  filterStart: string | null;
  filterEnd: string | null;
};

export async function exportCombineBillAll(
  filter: CombineBillExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same role gate as the page (warehouse + ops + accounting view this screen).
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  const admin = createAdminClient();

  // ── tb_bill — IDENTICAL filter to the page, minus .range() pagination.
  let billsQ = admin
    .from("tb_bill")
    .select("billid, date, printstatus, adminid")
    .order("billid", { ascending: false })
    .limit(EXPORT_CAP);

  if (filter.filterStart && filter.filterEnd) {
    billsQ = billsQ
      .gte("date", `${filter.filterStart}T00:00:00`)
      .lte("date", `${filter.filterEnd}T23:59:59`);
  }

  const { data: billRows, error: billErr } = await billsQ;
  if (billErr) {
    console.error("[exportCombineBillAll] tb_bill query failed", {
      code: billErr.code,
      message: billErr.message,
    });
    return { rows: [], truncated: false };
  }
  const bills = (billRows ?? []) as unknown as BillRow[];

  // ── tb_bill_item fan-out for the exported bills — same 2-query .in() pattern
  //    the page uses (no FK between tb_bill_item.billid and tb_bill.billid, so
  //    PostgREST can't embed-join — see the page comment for the full history).
  const itemsByBill = new Map<number, number[]>();
  if (bills.length > 0) {
    const visibleBillIds = bills.map((b) => b.billid);
    const { data: itemRows, error: itemErr } = await admin
      .from("tb_bill_item")
      .select("id, billid, fid")
      .in("billid", visibleBillIds)
      .order("billid", { ascending: true })
      .limit(50000);
    if (itemErr) {
      console.error("[exportCombineBillAll] tb_bill_item query failed", {
        visibleBillCount: visibleBillIds.length,
        code: itemErr.code,
        message: itemErr.message,
      });
      // Items being absent here is a real bug, but for an export we degrade to
      // empty fan-out columns rather than failing the whole download.
    } else {
      const rawItems = (itemRows ?? []) as unknown as BillItemRow[];
      if (rawItems.length >= 50000) {
        console.warn("[exportCombineBillAll] tb_bill_item hit the 50k cap", {
          visibleBillCount: visibleBillIds.length,
        });
      }
      for (const r of rawItems) {
        const arr = itemsByBill.get(r.billid);
        if (arr) arr.push(r.fid);
        else itemsByBill.set(r.billid, [r.fid]);
      }
    }
  }

  // ── Shape into CSV rows — IDENTICAL keys/values to the page's CsvButton
  //    mapping (see combine-bill/page.tsx — the rows={...} prop).
  const rows: CsvRow[] = bills.map((row): CsvRow => {
    const fids = itemsByBill.get(row.billid) ?? [];
    return {
      billid: row.billid,
      date: row.date ?? "",
      adminid: row.adminid ?? "",
      printstatus: row.printstatus === "1" ? "พิมพ์แล้ว" : "ยังไม่พิมพ์",
      item_count: fids.length,
      forwarder_ids: fids.join(", "),
    };
  });

  const truncated = rows.length >= EXPORT_CAP;

  // ── Audit (best-effort · never blocks the export). ──────────────────────
  await logAdminExport({
    dataset: "combine-bill",
    filters: {
      filterMode: filter.filterMode,
      filterStart: filter.filterStart,
      filterEnd: filter.filterEnd,
    },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

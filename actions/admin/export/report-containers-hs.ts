"use server";

/**
 * Export-all (CSV) for /admin/reports/containers-hs — the aggregate HS-code
 * report (sums qty/weight/value/duty per HS code across all containers, with an
 * optional container.created_at date filter). Mirror of legacy report-cnt.php.
 *
 * The page (app/[locale]/(admin)/admin/reports/containers-hs/page.tsx):
 *   1. pulls every container_hs_lines row (capped .limit(10000)), then fetches
 *      the containers (id, container_no, created_at) + hs_codes (description)
 *      metadata in SEPARATE queries and merges in JS — container_hs_lines has
 *      no usable FK so a PostgREST embed throws PGRST200 (verified live),
 *   2. filters in-memory by the container.created_at date range,
 *   3. aggregates per hs_code (qty / weight_kg / value_thb / duty_thb estimate /
 *      distinct-container count / line count), sorted by value_thb DESC,
 *   4. then client-slices that full aggregate list DEFAULT_PAGE_SIZE/page for
 *      display. The on-screen "⬇ CSV หน้านี้" downloads only the visible page;
 *      this action backs the 2nd "⬇ CSV ทั้งหมด" button — every aggregate row
 *      across all pages — then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same 3-query fetch the page runs
 *   1. .from("container_hs_lines").select("hs_code, qty, weight_kg, value_thb,
 *        duty_pct_used, container_id").limit(EXPORT_CAP)
 *   2. .from("containers").select("id, container_no, created_at").in("id", …)
 *   3. .from("hs_codes").select("code, description").in("code", …)   // key = `code`
 * then applies the SAME date filter + the SAME per-hs_code aggregation +
 * the SAME value_thb DESC sort. The only difference vs the page is the absence
 * of the display pagination slice + the audit log. The CSV columns mirror the
 * page's CsvButton cols 1:1 (and the on-screen <thead> labels).
 *
 * RBAC: the page has no explicit role gate (relies on the (admin) layout's
 * any-admin gate); we gate this export to the container-report family roles
 * used by the sibling container/HS-code reports
 * (report-cnt.php → ["super","ops","accounting","warehouse"]).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { dateFrom, dateTo } filter.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path (mirrors the page's .limit(10000)).
const EXPORT_CAP = 10000;

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

// container_hs_lines has NO usable FK to containers/hs_codes (PGRST200 on embed),
// so — like the page — we fetch lines, then container + hs metadata separately
// and merge in JS. hs_codes lookup key = `code` (NOT `hs_code`).
type LineRow = {
  hs_code: string;
  qty: number;
  weight_kg: number;
  value_thb: number;
  duty_pct_used: number | null;
  container_id: string | null;
};
type ContainerMeta = { id: string; container_no: string | null; created_at: string };

type Aggregate = {
  hs_code: string;
  description: string;
  qty: number;
  weight_kg: number;
  value_thb: number;
  duty_thb: number;
  containers: Set<string>;
  lines: number;
};

/** Active filters the page passes through (the resolved date range). */
export type ContainersHsExportFilter = {
  /** container.created_at lower bound (YYYY-MM-DD), or "" for none. */
  dateFrom: string;
  /** container.created_at upper bound (YYYY-MM-DD), or "" for none. */
  dateTo: string;
};

/**
 * Export the entire aggregated HS-code report (every aggregate row across all
 * display pages, within the date filter) as CSV rows for the "⬇ CSV ทั้งหมด"
 * button. Reuses the page's exact fetch + date filter + per-hs_code aggregation
 * + value_thb DESC sort. Writes an admin_export_log audit row.
 */
export async function exportContainersHsAll(
  filter: ContainersHsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super", "ops", "accounting", "warehouse"]);

  const { dateFrom, dateTo } = filter;
  const admin = createAdminClient();

  // 1) SAME line fetch as the page (no embed — capped at EXPORT_CAP).
  const { data, error } = await admin
    .from("container_hs_lines")
    .select(`hs_code, qty, weight_kg, value_thb, duty_pct_used, container_id`)
    .limit(EXPORT_CAP);
  if (error) {
    console.error(`[exportContainersHsAll container_hs_lines] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }
  const lineRows = (data ?? []) as unknown as LineRow[];
  // Truncation guard: the source query is line-level capped at EXPORT_CAP.
  const truncated = lineRows.length >= EXPORT_CAP;

  // 2) Container metadata in a SEPARATE query (no FK), merged in JS.
  const containerIds = Array.from(
    new Set(lineRows.map((l) => l.container_id).filter((x): x is string => !!x)),
  );
  const containerMap = new Map<string, ContainerMeta>();
  if (containerIds.length > 0) {
    const { data: ctData, error: ctErr } = await admin
      .from("containers")
      .select("id, container_no, created_at")
      .in("id", containerIds);
    if (ctErr) console.error(`[exportContainersHsAll containers meta] failed`, { code: ctErr.code, message: ctErr.message });
    for (const c of (ctData ?? []) as ContainerMeta[]) containerMap.set(c.id, c);
  }

  // 3) HS-code descriptions in a SEPARATE query (key column = `code`).
  const hsCodes = Array.from(new Set(lineRows.map((l) => l.hs_code).filter((x): x is string => !!x)));
  const hsDescMap = new Map<string, string>();
  if (hsCodes.length > 0) {
    const { data: hsData, error: hsErr } = await admin
      .from("hs_codes")
      .select("code, description")
      .in("code", hsCodes);
    if (hsErr) console.error(`[exportContainersHsAll hs_codes meta] failed`, { code: hsErr.code, message: hsErr.message });
    for (const h of (hsData ?? []) as Array<{ code: string; description: string | null }>) {
      hsDescMap.set(h.code, h.description ?? "");
    }
  }

  // SAME date filter on container.created_at as the page.
  const lines = lineRows
    .map((l) => ({ ...l, container: l.container_id ? containerMap.get(l.container_id) ?? null : null }))
    .filter((r) => {
      if (!r.container) return false;
      if (dateFrom && r.container.created_at < dateFrom) return false;
      if (dateTo && r.container.created_at > dateTo + "T23:59:59") return false;
      return true;
    });

  // SAME per-HS-code aggregation as the page.
  const buckets = new Map<string, Aggregate>();
  for (const r of lines) {
    const key = r.hs_code;
    let b = buckets.get(key);
    if (!b) {
      b = {
        hs_code: key,
        description: hsDescMap.get(key) ?? "",
        qty: 0,
        weight_kg: 0,
        value_thb: 0,
        duty_thb: 0,
        containers: new Set(),
        lines: 0,
      };
      buckets.set(key, b);
    }
    b.qty += Number(r.qty);
    b.weight_kg += Number(r.weight_kg);
    b.value_thb += Number(r.value_thb);
    b.duty_thb += (Number(r.value_thb) * Number(r.duty_pct_used ?? 0)) / 100;
    b.lines += 1;
    if (r.container) b.containers.add(r.container.id);
  }

  const aggregates = Array.from(buckets.values()).sort(
    (a, b) => b.value_thb - a.value_thb,
  );
  const grandValue = aggregates.reduce((s, a) => s + a.value_thb, 0);

  // SAME column keys as the page's CsvButton cols (mirrors the <thead> 1:1).
  const rows: CsvRow[] = aggregates.map((a) => {
    const pct = grandValue > 0 ? (a.value_thb / grandValue) * 100 : 0;
    return {
      hs_code: a.hs_code,
      description: a.description,
      containers: a.containers.size,
      lines: a.lines,
      qty: a.qty.toLocaleString("th-TH"),
      weight_kg: a.weight_kg.toLocaleString("th-TH", {
        minimumFractionDigits: 2,
      }),
      value_thb: thb(a.value_thb),
      duty_thb: thb(a.duty_thb),
      pct: pct.toFixed(1) + "%",
    };
  });

  await logAdminExport({
    dataset: "report-containers-hs",
    filters: { dateFrom, dateTo },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

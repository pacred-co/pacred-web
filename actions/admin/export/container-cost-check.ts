"use server";

/**
 * Export-all (CSV) for /admin/forwarders/container-cost-check — the LANE A
 * เช็คต้นทุนตู้ Sheet worklist (legacy pcs-admin/check-sang-cost.php).
 *
 * The page (app/[locale]/(admin)/admin/forwarders/container-cost-check/page.tsx)
 * reads the container_cost_sheet_cache snapshot (refreshed by the
 * /api/cron/sync-container-cost-sheet cron every 20 min), rolls it up
 * per cabinet (distinct tracking_chn = parcelCount, OR'd checked flag),
 * matches each cabinet name vs the distinct tb_forwarder.fcabinetnumber set
 * (พบ/ไม่พบ in PCS), and renders the full worklist (no DB pagination — the
 * whole computed list is shown). This action backs the "⬇ CSV ทั้งหมด" button.
 *
 * DRIFT-FREE: this re-runs the EXACT same cache read + per-cabinet rollup +
 * tb_forwarder cabinet-match the page does, capped at EXPORT_CAP cabinets,
 * with the same 5 columns. The page already loads the full list, so the only
 * differences here are the EXPORT_CAP guard + the audit log.
 *
 * NOTE: unlike the page, this export does NOT use the live-sheet fallback —
 * an export should reflect the canonical cached snapshot. When the cache is
 * empty there is nothing to export (returns []).
 *
 * RBAC matches the page: super / ops / accounting (money tier).
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path (cap is on the rolled-up cabinet rows).
const EXPORT_CAP = 10000;

/**
 * Export the entire container-cost-check worklist (every cabinet from the
 * cached Sheet snapshot, matched vs tb_forwarder, capped at EXPORT_CAP) as
 * CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses the page's exact cache read
 * + per-cabinet rollup + cabinet match. Writes an admin_export_log audit row.
 */
export async function exportContainerCostCheckAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // SAME gate as the page (money-tier reconciliation surface).
  await requireAdmin(["super", "ops", "accounting"]);

  const admin = createAdminClient();

  // ── 1) Read the cached sheet snapshot (same as the page fast path) ──
  const { data: cacheRows, error: cacheErr } = await admin
    .from("container_cost_sheet_cache")
    .select("cabinet_number, tracking_chn, checked")
    .order("cabinet_number", { ascending: true })
    .limit(50_000);
  if (cacheErr) {
    console.error(`[exportContainerCostCheckAll cache] failed`, {
      code: cacheErr.code,
      message: cacheErr.message,
    });
    return { rows: [], truncated: false };
  }

  // ── 2) Build per-cabinet rollups (SAME as the page) ──
  type Roll = { parcels: Set<string>; checked: boolean };
  const rolls = new Map<string, Roll>();
  for (const r of (cacheRows ?? []) as Array<{
    cabinet_number: string;
    tracking_chn: string;
    checked: boolean;
  }>) {
    let roll = rolls.get(r.cabinet_number);
    if (!roll) {
      roll = { parcels: new Set<string>(), checked: false };
      rolls.set(r.cabinet_number, roll);
    }
    if (r.tracking_chn) roll.parcels.add(r.tracking_chn);
    if (r.checked) roll.checked = true;
  }

  // ── 3) Match vs distinct tb_forwarder.fcabinetnumber (SAME as the page) ──
  const cabinetNames = Array.from(rolls.keys());
  const pcsSet = new Set<string>();
  if (cabinetNames.length > 0) {
    for (let i = 0; i < cabinetNames.length; i += 500) {
      const chunk = cabinetNames.slice(i, i + 500);
      const { data: fwd, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("fcabinetnumber")
        .in("fcabinetnumber", chunk)
        .limit(50_000);
      if (fwdErr) {
        console.error(`[exportContainerCostCheckAll cabinet match] failed`, {
          code: fwdErr.code,
          message: fwdErr.message,
        });
        continue;
      }
      for (const r of (fwd ?? []) as Array<{ fcabinetnumber: string | null }>) {
        if (r.fcabinetnumber) pcsSet.add(r.fcabinetnumber);
      }
    }
  }

  // SAME row shape + sort (th-locale) as the page.
  const cabinets = Array.from(rolls.entries())
    .map(([cabinetNumber, roll]) => ({
      cabinetNumber,
      parcelCount: roll.parcels.size,
      checked: roll.checked,
      inPcs: pcsSet.has(cabinetNumber),
    }))
    .sort((a, b) => a.cabinetNumber.localeCompare(b.cabinetNumber, "th"));

  const truncated = cabinets.length > EXPORT_CAP;
  const capped = truncated ? cabinets.slice(0, EXPORT_CAP) : cabinets;

  // SAME column keys + Thai labels as the page's <thead> / CsvButton cols.
  const rows: CsvRow[] = capped.map((c, idx) => ({
    index: idx + 1,
    cabinetNumber: c.cabinetNumber,
    dataStatus: c.inPcs ? "พบข้อมูล" : "ไม่พบข้อมูล",
    checkStatus: c.checked ? "เช็คแล้ว" : "—",
    parcelCount: c.parcelCount,
  }));

  await logAdminExport({
    dataset: "container-cost-check",
    filters: {},
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}

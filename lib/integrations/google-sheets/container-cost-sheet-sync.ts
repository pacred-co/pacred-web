/**
 * Container-cost-sheet → cache sync (LANE A · continuous sync).
 *
 * Owner directive ("sync ตลอดเวลาเขามาอัพเดท ตั้งซิงค์ไว้เลย"): pull
 * แสง's container-cost Google Sheet on a schedule into a small cache
 * table (`container_cost_sheet_cache`) so the worklist
 * (`/admin/forwarders/container-cost-check`) + the per-parcel diff
 * (`/admin/report-cnt/{cnt}?action=cost-update`) read FAST + stay fresh.
 *
 * This is a READ-ONLY mirror of the sheet — it NEVER writes
 * `tb_forwarder`. Applying sheet costs into the live cost column
 * (`fcosttotalprice`) stays a deliberate, confirm-gated admin action
 * (`actions/admin/report-cnt-cost-update.ts`), never automatic.
 *
 * Best-effort + idempotent: each run replaces the whole cache inside one
 * logical pass (delete-all → batch insert). The sheet is small (a few
 * thousand parcels), so a full refresh is simpler + safer than an
 * incremental diff, and guarantees the cache exactly mirrors the sheet
 * (drops removed rows). The `container_cost_sheet_state` singleton tracks
 * last-run / last-success / row counts / last-error for the cron-health
 * dashboard.
 *
 * Server-only.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

import {
  fetchContainerCostSheet,
  type SheetParcel,
} from "./container-cost-sheet-adapter";

export type ContainerCostSheetSyncResult =
  | {
      status: "success";
      sheetId: string;
      range: string;
      parcelCount: number;
      cabinetCount: number;
      rawRowCount: number;
      inserted: number;
    }
  | {
      status: "failure";
      reason: "not_configured" | "auth_failed" | "fetch_failed" | "db_error";
      message?: string;
    };

/** Insert the cache in chunks to stay under PostgREST payload limits. */
const INSERT_CHUNK = 500;

export async function syncContainerCostSheet(): Promise<ContainerCostSheetSyncResult> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  // Always stamp last_run_at (so the dashboard shows the cron fired even
  // when the sheet is unconfigured). Best-effort.
  const stampRun = async (patch: Record<string, unknown>) => {
    const { error } = await admin
      .from("container_cost_sheet_state")
      .update({ last_run_at: nowIso, ...patch })
      .eq("id", 1);
    if (error) {
      logger.warn("container-cost-sync", "state update failed", { message: error.message });
    }
  };

  // 1) Live-read + aggregate the sheet.
  const res = await fetchContainerCostSheet();
  if (!res.ok) {
    await stampRun({ last_error: `${res.reason}${res.message ? `: ${res.message}` : ""}` });
    return { status: "failure", reason: res.reason, message: res.message };
  }

  const { parcels, cabinets, rawRowCount } = res.data;

  // 2) Replace the cache. Delete-all then batch-insert. We do NOT wrap in
  //    an explicit transaction (PostgREST has no multi-statement txn from
  //    the JS client); the brief window between delete + insert is
  //    acceptable for an internal cost-reconciliation cache, and a failed
  //    insert is recorded in last_error so the next run self-heals.
  const { error: delErr } = await admin
    .from("container_cost_sheet_cache")
    .delete()
    .gte("id", 0); // delete all rows (id is bigserial, always ≥ 1)
  if (delErr) {
    await stampRun({ last_error: `db_error (delete): ${delErr.message}` });
    return { status: "failure", reason: "db_error", message: delErr.message };
  }

  let inserted = 0;
  for (let i = 0; i < parcels.length; i += INSERT_CHUNK) {
    const chunk = parcels.slice(i, i + INSERT_CHUNK).map((p: SheetParcel) => ({
      cabinet_number:   p.cabinetNumber,
      tracking_chn:     p.trackingChn,
      user_id:          p.userId,
      amount:           p.amount,
      weight:           p.weight,
      volume:           p.volume,
      price_other:      p.priceOther,
      cost_total_price: p.costTotalPrice,
      product_type:     p.productType,
      checked:          false,
      synced_at:        nowIso,
    }));
    const { error: insErr } = await admin
      .from("container_cost_sheet_cache")
      .insert(chunk);
    if (insErr) {
      await stampRun({
        last_error: `db_error (insert @${i}): ${insErr.message}`,
        row_count: inserted,
        cabinet_count: cabinets.length,
      });
      return { status: "failure", reason: "db_error", message: insErr.message };
    }
    inserted += chunk.length;
  }

  // 3) Mark the cabinet "checked" flag from the sheet rollup (col P).
  //    Done as a per-cabinet update over the inserted rows.
  const checkedCabinets = cabinets.filter((c) => c.checked).map((c) => c.cabinetNumber);
  if (checkedCabinets.length > 0) {
    const { error: chkErr } = await admin
      .from("container_cost_sheet_cache")
      .update({ checked: true })
      .in("cabinet_number", checkedCabinets);
    if (chkErr) {
      logger.warn("container-cost-sync", "checked-flag update failed", { message: chkErr.message });
    }
  }

  await stampRun({
    last_synced_at: nowIso,
    last_error: null,
    sheet_id: res.sheetId,
    row_count: inserted,
    cabinet_count: cabinets.length,
  });

  logger.info("container-cost-sync", "sync complete", {
    parcelCount: parcels.length,
    cabinetCount: cabinets.length,
    rawRowCount,
    inserted,
  });

  return {
    status: "success",
    sheetId: res.sheetId,
    range: res.range,
    parcelCount: parcels.length,
    cabinetCount: cabinets.length,
    rawRowCount,
    inserted,
  };
}

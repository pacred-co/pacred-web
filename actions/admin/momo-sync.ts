"use server";

/**
 * MOMO JMF container sync — admin manual-trigger action (Sprint-11 P2.1).
 *
 * The cron at `/api/cron/momo-sync` runs daily at 01:30 ICT to pull MOMO
 * container + shipment updates into the cargo spine. This action exposes
 * the same `syncContainersFromMomo` core for a manual trigger (admin UI
 * "Sync now" button), parallel to `adminSyncCargoThai` in cargothai.ts.
 *
 * Auth: ops or accounting (super bypasses via requireAdmin).
 *
 * Idempotent — re-running for the same window is safe (lookups keyed on
 * cargo_containers.code, cargo_shipments.shipment_code, and the per-event
 * dedupe set in tracking append).
 *
 * Returns a friendly TH error when MOMO_JMF_TOKEN / MOMO_JMF_BASE_URL are
 * unset so the admin UI can show a "ขอ token จาก MOMO ops" banner instead
 * of a generic crash.
 *
 * @see lib/integrations/momo-jmf/sync.ts
 * @see actions/admin/cargothai.ts (sibling pattern)
 */

import { revalidatePath } from "next/cache";
import { syncContainersFromMomo } from "@/lib/integrations/momo-jmf";
import { logger } from "@/lib/logger";
import { withAdmin, type AdminActionResult } from "./common";

export type MomoSyncSummary = {
  /** Containers returned by listContainers (post-filter). */
  containers_scanned:  number;
  /** Container rows inserted or updated in cargo_containers. */
  containers_upserted: number;
  /** Containers that threw mid-process (manifest unreachable etc.). */
  containers_skipped:  number;
  /** Shipments inserted or updated in cargo_shipments. */
  shipments_upserted:  number;
  /** Tracking events appended (after idempotency check). */
  tracking_appended:   number;
  /** Status transitions logged in cargo_container_status_history. */
  status_transitions:  number;
  /** Per-container error list (empty on full success). */
  errors:              Array<{ code: string; reason: string }>;
};

export type MomoSyncInput = {
  /** ISO datetime — pull containers updated since this point. Defaults to
   *  24 hours ago. */
  since?: string;
};

/**
 * Manual / cron-triggered MOMO container sync. Auth-gates first, then
 * calls `syncContainersFromMomo` which upserts into the cargo spine.
 */
export async function adminSyncMomoContainers(
  input: MomoSyncInput = {},
): Promise<AdminActionResult<MomoSyncSummary>> {
  return withAdmin(["ops", "accounting"], async () => {
    const since = input.since
      ? new Date(input.since)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (Number.isNaN(since.getTime())) {
      return { ok: false, error: "since: invalid ISO datetime" };
    }

    const res = await syncContainersFromMomo(since);

    if (!res.ok) {
      logger.warn("momo-sync", "manual sync failed", { reason: res.reason });
      return { ok: false, error: `MOMO sync failed: ${res.reason ?? "unknown"}` };
    }

    // Token unset → ok=true with reason='not_configured'. Surface as the
    // friendly TH error so the banner explains the actual cause.
    if (res.reason === "not_configured") {
      return {
        ok: false,
        error: "ระบบยังไม่ได้ตั้งค่า MOMO API token — ติดต่อทีม Pacred",
      };
    }

    const summary: MomoSyncSummary = {
      containers_scanned:  res.fetched,
      containers_upserted: res.upserted,
      containers_skipped:  res.skipped,
      shipments_upserted:  res.shipments_upserted,
      tracking_appended:   res.tracking_appended,
      status_transitions:  res.status_transitions,
      errors:              res.errors,
    };

    // Revalidate the admin pages that surface MOMO state — best-effort,
    // OK if any of these routes haven't been built yet.
    revalidatePath("/admin/momo-lcl");
    revalidatePath("/admin/warehouse/containers");
    logger.info("momo-sync", "manual sync done", summary);

    return { ok: true, data: summary };
  });
}

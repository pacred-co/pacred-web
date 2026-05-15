/**
 * MOMO JMF — sync orchestrator (skeleton).
 *
 * Pulls container + shipment updates from MOMO and writes to Pacred DB:
 *   - cargo_containers
 *   - cargo_shipments
 *   - cargo_shipment_tracking
 *   - cargo_container_status_history
 *
 * Called from Vercel cron `/api/cron/momo-jmf-sync/route.ts` (to be
 * added by ภูม per implementation roadmap step 4 in docs/integrations/
 * momo-jmf.md).
 *
 * Idempotent — re-running is safe; upserts keyed on:
 *   - cargo_containers.code           (unique)
 *   - cargo_shipments.shipment_code   (unique)
 *   - cargo_shipment_tracking (shipment_id, scanned_at, event) — composite
 *
 * @see docs/integrations/momo-jmf.md (roadmap step 4)
 * @see docs/architecture/container-centric-model.md
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { listContainers } from "./client";
import { MOMO_STATUS_TO_PACRED } from "./types";

export type SyncResult = {
  ok:       boolean;
  fetched:  number;
  upserted: number;
  skipped:  number;
  errors:   Array<{ code: string; reason: string }>;
};

/**
 * Full incremental sync.  Pulls containers updated since `since` from MOMO,
 * upserts into `cargo_containers` keyed on `code`, logs status transitions
 * into `cargo_container_status_history`, then sub-fetches manifest +
 * tracking per container.
 *
 * **STATUS: SKELETON.**  Body is intentionally minimal pending ก๊อต MOMO-1
 * endpoint confirmation.  ภูม fills the upsert loop once the actual MOMO
 * response shape is locked.
 *
 * TODO (ภูม, after ก๊อต MOMO-1):
 *   1. Verify the `MomoContainerSummary` type matches actual MOMO response;
 *      adjust `types.ts` if not
 *   2. Implement the upsert loop:
 *        for each MOMO container c:
 *          pacredStatus = MOMO_STATUS_TO_PACRED[c.status] ?? 'packing'
 *          { data: existing } = supabase
 *            .from('cargo_containers')
 *            .select('id, status')
 *            .eq('code', c.code)
 *            .maybeSingle()
 *          if (existing && existing.status !== pacredStatus) {
 *            await supabase.from('cargo_container_status_history').insert({
 *              cargo_container_id: existing.id,
 *              from_status:        existing.status,
 *              to_status:          pacredStatus,
 *              source:             'momo',
 *            })
 *          }
 *          await supabase.from('cargo_containers').upsert({
 *            code:            c.code,
 *            transport_mode:  c.transport_mode,
 *            origin:          c.origin,
 *            destination:     c.destination,
 *            status:          pacredStatus,
 *            packed_at:       c.packed_at,
 *            sealed_at:       c.sealed_at,
 *            eta:             c.eta,
 *            actual_arrival:  c.actual_arrival,
 *            source:          'momo',
 *            total_boxes:     c.total_boxes,
 *            total_weight_kg: c.total_weight_kg,
 *            total_cbm:       c.total_cbm,
 *          }, { onConflict: 'code' })
 *          result.upserted++
 *   3. Sub-fetch manifest per container → upsert cargo_shipments keyed on
 *      shipment_code; resolve customer_ref → profile_id via member_code lookup
 *   4. Sub-fetch tracking per shipment → upsert cargo_shipment_tracking;
 *      skip events that already exist (same shipment_id + scanned_at + event)
 *   5. Persist last-sync timestamp — recommend a row in `public.settings`
 *      keyed on a string like 'momo_jmf_last_sync' rather than its own table
 *   6. Add audit log entry per sync run (count fetched/upserted/errors)
 *      so admin/dashboard can show "last MOMO sync: 2 min ago, 12 containers"
 */
export async function syncContainersFromMomo(since?: Date): Promise<SyncResult> {
  const result: SyncResult = {
    ok:       false,
    fetched:  0,
    upserted: 0,
    skipped:  0,
    errors:   [],
  };

  const list = await listContainers(since);
  if (!list.ok) {
    result.errors.push({ code: "_root", reason: list.error });
    return result;
  }

  result.fetched = list.data.length;

  // SKELETON: defer the actual upsert loop to ภูม implementation.
  // Pseudo-code in the JSDoc above; pattern reference: actions/admin/csv-imports.ts
  // for the upsert + audit + idempotency conventions.
  const admin = createAdminClient();
  void admin;          // suppress unused-var lint until impl lands
  void MOMO_STATUS_TO_PACRED; // imported for ภูม to wire into the upsert

  result.ok = true;
  return result;
}

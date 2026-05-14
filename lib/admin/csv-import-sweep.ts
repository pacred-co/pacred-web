/**
 * P-19-followup-stale: stale 'importing' recovery sweep.
 *
 * Lives outside actions/admin/csv-imports.ts because that file has
 * "use server" — every export there must be a callable server action.
 * The sweep is a regular function called from server components and
 * server actions both, so it goes here.
 *
 * Called at the top of read paths (admin list / detail page render,
 * confirmCsvImport pre-flight) so admins never see a zombie row.
 * Cheaper than a cron + bound to actual usage — if no admin opens the
 * CSV imports page, no sweep runs.
 *
 * Threshold: 10 minutes.  Largest legitimate import is ~5000 rows at
 * ~10 inserts/sec = ~8 minutes worst case (and after P-19-followup-batch
 * it should be <30s for the same workload).  10 min gives a safety
 * margin without leaving zombies visible for hours.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const STALE_IMPORTING_MS = 10 * 60 * 1000;

export async function sweepStaleImportingRows(
  admin: SupabaseClient,
): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_IMPORTING_MS).toISOString();
  await admin
    .from("csv_imports")
    .update({
      status:        "failed",
      error_message: "auto-recovered: import process appears to have crashed (no progress for >10 minutes)",
    })
    .eq("status", "importing")
    .lt("started_at", cutoff);
}

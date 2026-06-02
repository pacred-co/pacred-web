/**
 * PCS↔Pacred sync orchestrator — shared by cron + admin manual trigger.
 *
 * Steps:
 *   1. Read `pcs_sync_state` for `last_sync_at`
 *   2. fetchPcsDeltas({ since })
 *   3. Loop rows → applyPcsRowToTbForwarder
 *   4. Insert a `pcs_sync_logs` row + update state
 *
 * Always best-effort; failures get logged + the cursor only advances on
 * success (so a failed run is retried next interval against the same
 * window, no data loss).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPcsDeltas, PcsSyncFetchError } from "./client";
import { applyPcsRowToTbForwarder } from "./merge";

export type RunPcsSyncOpts = {
  /** Override the cursor — admin manual trigger may pull a wider window. */
  sinceOverride?: string;
  /** Override the limit — default 500. */
  limit?:         number;
};

export type RunPcsSyncResult = {
  ok:                  boolean;
  since:               string;
  until:               string;
  rowsSeen:            number;
  rowsUpserted:        number;
  rowsSkippedNoMatch:  number;
  rowsSkippedNoWrite:  number;
  rowsFailed:          number;
  durationMs:          number;
  error:               string | null;
  /** The inserted pcs_sync_logs row id (for the dashboard). */
  logId:               number | null;
};

export async function runPcsSync(
  admin: SupabaseClient,
  opts: RunPcsSyncOpts = {},
): Promise<RunPcsSyncResult> {
  const startedAt = Date.now();

  // ── 1. Resolve `since` cursor ──
  let since: string;
  if (opts.sinceOverride) {
    since = opts.sinceOverride;
  } else {
    const { data: state, error: stateErr } = await admin
      .from("pcs_sync_state")
      .select("last_sync_at")
      .eq("id", 1)
      .maybeSingle();
    if (stateErr) {
      console.error("[pcs-sync state-read] failed", {
        code: stateErr.code, message: stateErr.message,
      });
      return finalise(admin, {
        since:        new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        until:        new Date().toISOString(),
        rowsSeen:     0,
        rowsUpserted: 0,
        rowsSkippedNoMatch: 0,
        rowsSkippedNoWrite: 0,
        rowsFailed:   0,
        error:        `state_read_failed:${stateErr.code ?? "unknown"}`,
        durationMs:   Date.now() - startedAt,
      });
    }
    const stateRec = state as unknown as { last_sync_at: string } | null;
    since = stateRec?.last_sync_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  }

  // ── 2. Fetch deltas ──
  let resp;
  try {
    resp = await fetchPcsDeltas({ since, limit: opts.limit });
  } catch (e) {
    const isPcsErr = e instanceof PcsSyncFetchError;
    const code     = isPcsErr ? e.code : "PCS_NETWORK_ERROR";
    const message  = e instanceof Error ? e.message : String(e);
    console.error("[pcs-sync fetch] failed", { code, message });
    return finalise(admin, {
      since,
      until:        new Date().toISOString(),
      rowsSeen:     0,
      rowsUpserted: 0,
      rowsSkippedNoMatch: 0,
      rowsSkippedNoWrite: 0,
      rowsFailed:   0,
      error:        `${code}: ${message}`,
      durationMs:   Date.now() - startedAt,
    });
  }

  // ── 3. Apply each row ──
  let upserted = 0, skippedNoMatch = 0, skippedNoWrite = 0, failed = 0;
  for (const row of resp.rows) {
    const r = await applyPcsRowToTbForwarder(row, admin);
    if (r.action === "upsert") upserted++;
    else if (r.action === "skip" && r.reason === "no_match")          skippedNoMatch++;
    else if (r.action === "skip" && r.reason === "no_writable_fields") skippedNoWrite++;
    else if (r.action === "error") failed++;
  }

  // ── 4. Finalise — advance cursor only on success-ish ──
  return finalise(admin, {
    since,
    until:        resp.now,
    rowsSeen:     resp.rows.length,
    rowsUpserted: upserted,
    rowsSkippedNoMatch: skippedNoMatch,
    rowsSkippedNoWrite: skippedNoWrite,
    rowsFailed:   failed,
    error:        failed > 0 ? `${failed}_rows_failed` : null,
    durationMs:   Date.now() - startedAt,
    advanceCursorTo: resp.now,
  });
}

// ────────────────────────────────────────────────────────────────
// Finalise — write log + state, return result
// ────────────────────────────────────────────────────────────────

type FinaliseInput = {
  since:              string;
  until:              string;
  rowsSeen:           number;
  rowsUpserted:       number;
  rowsSkippedNoMatch: number;
  rowsSkippedNoWrite: number;
  rowsFailed:         number;
  error:              string | null;
  durationMs:         number;
  advanceCursorTo?:   string;
};

async function finalise(
  admin: SupabaseClient,
  inp:   FinaliseInput,
): Promise<RunPcsSyncResult> {
  // Combined skipped count for the log column (caller spec: rows_skipped_newer).
  const rowsSkipped = inp.rowsSkippedNoMatch + inp.rowsSkippedNoWrite;

  // Insert log row.
  const { data: logRow, error: logErr } = await admin
    .from("pcs_sync_logs")
    .insert({
      since:              inp.since,
      until:              inp.until,
      rows_seen:          inp.rowsSeen,
      rows_upserted:      inp.rowsUpserted,
      rows_skipped_newer: rowsSkipped,
      rows_failed:        inp.rowsFailed,
      duration_ms:        inp.durationMs,
      error:              inp.error,
    })
    .select("id")
    .maybeSingle();
  if (logErr) {
    console.error("[pcs-sync log-insert] failed", {
      code: logErr.code, message: logErr.message,
    });
  }
  const logId = (logRow as unknown as { id: number } | null)?.id ?? null;

  // Update state.
  const stateUpdate: Record<string, unknown> = {
    last_run_at: new Date().toISOString(),
    last_error:  inp.error,
  };
  if (inp.advanceCursorTo && !inp.error) {
    stateUpdate.last_sync_at = inp.advanceCursorTo;
  }
  const { error: stateErr } = await admin
    .from("pcs_sync_state")
    .update(stateUpdate)
    .eq("id", 1);
  if (stateErr) {
    console.error("[pcs-sync state-update] failed", {
      code: stateErr.code, message: stateErr.message,
    });
  }

  return {
    ok:                 !inp.error,
    since:              inp.since,
    until:              inp.until,
    rowsSeen:           inp.rowsSeen,
    rowsUpserted:       inp.rowsUpserted,
    rowsSkippedNoMatch: inp.rowsSkippedNoMatch,
    rowsSkippedNoWrite: inp.rowsSkippedNoWrite,
    rowsFailed:         inp.rowsFailed,
    durationMs:         inp.durationMs,
    error:              inp.error,
    logId,
  };
}

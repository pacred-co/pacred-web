/**
 * CTT warehouse Google Sheet → Pacred sync adapter (Gap #1 pilot · LIVE WIRE).
 *
 * Legacy faithful port:
 *   - `pcs-admin/api-sheets-ctt.php`            — the sheet pull endpoint
 *   - `member/run-time/cttupdate/index.php`     — the cron driver
 *   - `tb_notify_sheet_ctt`                     — dedupe state (`numrow` = last sheet row processed)
 *
 * Legacy flow note:
 *   Legacy NEVER auto-INSERTed from the sheet — its cron only cached the
 *   JSON to disk, and an admin per-row clicked "add" to commit. Pacred
 *   v1 ports the *match-and-update* path (mirrors MOMO propagate · the
 *   canonical safe writer pattern in
 *   `lib/integrations/momo-isolated/propagate.ts`): for every sheet row
 *   we look up `tb_forwarder` by tracking number and apply FORWARD-ONLY
 *   updates to the matched row. INSERT-new-from-sheet is deliberately
 *   NOT in scope (admins keep doing that through the manual CTT form at
 *   `/admin/api-sheets-ctt`).
 *
 * Three FORWARD-ONLY field updates, each gated by safety rules:
 *   1. fcabinetnumber ← sheet `cabinet` cell. EMPTY-ONLY (never overwrites
 *                       a non-blank manual entry · CTT sheet is partner
 *                       data, manual admin wins). Skipped when
 *                       `fcabinet_locked=true` (backlog #259 · migration
 *                       0150 · admin's defensive belt vs partner-API
 *                       misroutes).
 *   2. fdatetothai    ← parsed sheet `arrival` cell. Only when MOMO/CTT
 *                       indicates arrival + tb_forwarder has no
 *                       fdatetothai yet (NULL or legacy '0000-00-00'
 *                       sentinel).
 *   3. fstatus        ← mapped from sheet `status` label. Strict
 *                       FORWARD-only (rank-gated). The fstatus write can
 *                       trigger customer-facing side-effects under the
 *                       legacy notification path, so this stays opt-in
 *                       (env gate · see below) until ภูม has eyeballed
 *                       the propagation log.
 *
 * NEVER touched here (same discipline as MOMO):
 *   - Money columns (ftotalprice, paydeposit, fcredit, etc.)
 *   - userid (a wrong customer match would bill the wrong customer)
 *   - INSERT-new (admin's manual CTT form owns that path)
 *
 * Env gates (see also `.env.example` § GOOGLE_SHEETS_*):
 *   GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON  required (service account)
 *   GOOGLE_SHEETS_CTT_ID                required (sheet id)
 *   GOOGLE_SHEETS_CTT_RANGE             default `CTT-New!A2:AZ`
 *   CTT_CRON_LIVE                       default OFF · `true` flips the
 *                                         adapter from DRY-RUN to writing
 *                                         to tb_forwarder. The cabinet +
 *                                         arrival writes happen on flip;
 *                                         the fstatus advance ALSO
 *                                         requires `CTT_CRON_PROPAGATE_STATUS=true`
 *                                         (parallels the MOMO opt-in gate).
 *   CTT_COL_TRACKING / CTT_COL_CABINET / CTT_COL_ARRIVAL / CTT_COL_STATUS
 *                                       per-column 0-based index overrides
 *                                       (see `ctt-helpers.ts` for the
 *                                         default map). Set if/when the
 *                                         CTT sheet layout changes — no
 *                                         code redeploy needed.
 *
 * Dry-run mode is preserved for safety: until the env flips ON, this
 * adapter only LOGS + COUNTS what it WOULD write and never advances the
 * `tb_notify_sheet_ctt.numrow` cursor — the first real LIVE run still
 * picks up every queued row from the original cursor. After the flip the
 * cursor IS advanced (so we don't re-process the same row range every
 * hour — but every row keeps the same forward-only safety even on
 * re-process, so cursor advance is a perf optimisation, not a correctness
 * one).
 *
 * Returning a structured summary lets the cron route emit a clean
 * `cron-invocations` row for the /admin/system/crons page.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

import { readSheet, type SheetsReadResult } from "./client";
import {
  readCttColumnMap,
  parseCttRow,
  parseArrivalDate,
  ctTStatusLabelToFstatus,
  shouldWriteCabinet,
  shouldWriteArrival,
  fstatusAdvanceTarget,
  type CttSheetRow,
} from "./ctt-helpers";

/**
 * CTT sync result shape — mirrors the CargoThai cron summary so the
 * admin observability page can render both with the same template.
 *
 * The optional `propagate` block surfaces matched/updated/skipped/locked
 * counts on LIVE runs so /admin/system/crons can show the impact. On
 * DRY-RUN runs the block reports what WOULD have happened.
 */
export type CttSyncSummary =
  | {
      status: "success";
      mode: "dry-run" | "live";
      lastNumrow: number;
      newRowCount: number;
      sampleNewRow: string[] | null;
      sheetId: string;
      range: string;
      propagate?: CttPropagationCounts;
    }
  | {
      status: "failure";
      reason:
        | "not_configured"
        | "sheet_id_missing"
        | "auth_failed"
        | "fetch_failed"
        | "db_error";
      message?: string;
    };

export type CttPropagationCounts = {
  /** Rows from the sheet that had a non-empty tracking number. */
  scanned:              number;
  /** Of `scanned`: rows that matched 1+ tb_forwarder row by ftrackingchn. */
  matched:              number;
  /** Number of tb_forwarder rows that received at least one column write. */
  updated:              number;
  /** tb_forwarder rows fully fresh (matched, but every column was up-to-date). */
  noopFresh:            number;
  /** Of `updated`: how many had a cabinet write. */
  cabinetWrites:        number;
  /** Of `updated`: how many had an arrival-date write. */
  arrivedWrites:        number;
  /** Of `updated`: how many had an fstatus advance (gate-controlled). */
  statusAdvanceWrites:  number;
  /** Matched rows where we WOULD have advanced fstatus but the env gate is
   *  off. Lets ภูม preview impact before flipping `CTT_CRON_PROPAGATE_STATUS`. */
  statusAdvanceSkippedByGate: number;
  /** B4 · backlog #259 (migration 0150): rows where the sheet had a cabinet
   *  but `fcabinet_locked=true` blocked the write. Surfaced for audit. */
  cabinetLocked:        number;
  /** Per-row errors. Best-effort: one bad row never fails the whole batch. */
  errors:               Array<{ trackingNo: string; message: string }>;
};

const SHEET_ID_ENV = "GOOGLE_SHEETS_CTT_ID";
const SHEET_RANGE_ENV = "GOOGLE_SHEETS_CTT_RANGE";
const LIVE_ENV = "CTT_CRON_LIVE";
const STATUS_GATE_ENV = "CTT_CRON_PROPAGATE_STATUS";

/**
 * Default range — start at row 2 (skip header) through column AZ to be
 * safe (legacy sheets have ~18 cols today). Override via env if needed.
 */
const DEFAULT_RANGE = "CTT-New!A2:AZ";

function emptyPropagationCounts(): CttPropagationCounts {
  return {
    scanned: 0,
    matched: 0,
    updated: 0,
    noopFresh: 0,
    cabinetWrites: 0,
    arrivedWrites: 0,
    statusAdvanceWrites: 0,
    statusAdvanceSkippedByGate: 0,
    cabinetLocked: 0,
    errors: [],
  };
}

export async function syncCttSheet(): Promise<CttSyncSummary> {
  // 1) Resolve config from env. Sheet ID is per-installation (legacy
  //    `15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk` is PCS Cargo's, not
  //    Pacred's — ก๊อต provisions the Pacred-owned copy).
  const sheetId = process.env[SHEET_ID_ENV];
  if (!sheetId) {
    return { status: "failure", reason: "sheet_id_missing" };
  }
  const range = process.env[SHEET_RANGE_ENV] ?? DEFAULT_RANGE;
  const liveMode = process.env[LIVE_ENV] === "true";
  const statusGate = process.env[STATUS_GATE_ENV] === "true";
  const columnMap = readCttColumnMap();

  // 2) Read the dedupe cursor. Legacy `tb_notify_sheet_ctt` has 1 row
  //    that we UPDATE in place; if the row doesn't exist yet (fresh
  //    install) we treat numrow as 0.
  const admin = createAdminClient();
  const { data: cursorRow, error: cursorErr } = await admin
    .from("tb_notify_sheet_ctt")
    .select("id, numrow")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; numrow: number }>();
  if (cursorErr) {
    logger.warn("ctt-sync", "cursor read failed", { message: cursorErr.message });
    return { status: "failure", reason: "db_error", message: cursorErr.message };
  }
  const lastNumrow = cursorRow?.numrow ?? 0;

  // 3) Fetch the sheet. The Sheets v4 contract returns rows starting
  //    from `range` row 1 — since DEFAULT_RANGE is `A2:AZ`, the first
  //    returned row corresponds to sheet row 2. To convert sheet-row
  //    numbers (1-based, what numrow stores) we add 1 to the index.
  const fetchRes: SheetsReadResult = await readSheet(sheetId, range);
  if (!fetchRes.ok) {
    return {
      status: "failure",
      reason: fetchRes.reason,
      message: fetchRes.message,
    };
  }

  // 4) Compute the new-rows window.
  //    The sheet row number for `rows[i]` = i + 2 (header row 1 + 0-indexed).
  //    Keep rows where sheet_row_number > lastNumrow.
  const headerOffset = 2;
  const newRows = fetchRes.rows
    .map((row, i) => ({ row, sheetRowNumber: i + headerOffset }))
    .filter(({ sheetRowNumber }) => sheetRowNumber > lastNumrow);
  const newRowCount = newRows.length;

  // 5) Parse the rows + extract the load-bearing fields. Filter out rows
  //    with no tracking number — without a match key we can't propagate.
  const parsed: CttSheetRow[] = newRows
    .map(({ row, sheetRowNumber }) => parseCttRow(row, sheetRowNumber, columnMap))
    .filter((p) => p.tracking !== "");

  // 6) DRY-RUN mode (default · current state when CTT_CRON_LIVE !== "true").
  //    We log enough to validate the foundation without inserting into
  //    tb_forwarder or pushing notifications. The dedupe cursor is
  //    deliberately NOT advanced so the first live run still picks up
  //    every queued row from the original cursor.
  if (!liveMode) {
    logger.info("ctt-sync", "dry-run summary", {
      lastNumrow,
      sheetRowCount: fetchRes.rows.length,
      newRowCount,
      parsedRowsWithTracking: parsed.length,
      sampleNewRow: newRows[0]?.row ?? null,
    });

    return {
      status: "success",
      mode: "dry-run",
      lastNumrow,
      newRowCount,
      sampleNewRow: newRows[0]?.row ?? null,
      sheetId,
      range,
      propagate: {
        ...emptyPropagationCounts(),
        scanned: parsed.length,
      },
    };
  }

  // 7) LIVE mode — propagate to tb_forwarder via tracking match.
  const propagate = await propagateCttToForwarders(parsed, statusGate);

  // 8) Advance the dedupe cursor on a successful LIVE run. We always
  //    move to the max sheet row processed so we don't re-scan it next
  //    hour. (Forward-only guards make re-scan harmless for correctness;
  //    this is a perf optimisation + keeps the propagation counts in
  //    `cron_invocations` representative of the latest delta.)
  if (parsed.length > 0) {
    const maxRow = parsed.reduce(
      (acc, r) => Math.max(acc, r.sheetRowNumber),
      lastNumrow,
    );
    if (maxRow > lastNumrow) {
      const cursorPayload = { numrow: maxRow, date: new Date().toISOString() };
      if (cursorRow?.id != null) {
        const { error: updateErr } = await admin
          .from("tb_notify_sheet_ctt")
          .update(cursorPayload)
          .eq("id", cursorRow.id);
        if (updateErr) {
          logger.warn("ctt-sync", "cursor update failed (non-fatal)", {
            message: updateErr.message,
            maxRow,
          });
        }
      } else {
        const { error: insertErr } = await admin
          .from("tb_notify_sheet_ctt")
          .insert(cursorPayload);
        if (insertErr) {
          logger.warn("ctt-sync", "cursor insert failed (non-fatal)", {
            message: insertErr.message,
            maxRow,
          });
        }
      }
    }
  }

  logger.info("ctt-sync", "live propagation summary", {
    lastNumrow,
    newRowCount,
    propagate,
  });

  return {
    status: "success",
    mode: "live",
    lastNumrow,
    newRowCount,
    sampleNewRow: newRows[0]?.row ?? null,
    sheetId,
    range,
    propagate,
  };
}

// ─────────────────────────────────────────────────────────────
// Internal: per-batch propagation. Kept inside this file because it is
// tightly coupled to the sheet-parse step; the SAFETY rules are factored
// out to `ctt-helpers.ts` and unit-tested there.
// ─────────────────────────────────────────────────────────────
async function propagateCttToForwarders(
  rows: CttSheetRow[],
  statusGate: boolean,
): Promise<CttPropagationCounts> {
  const result = emptyPropagationCounts();
  result.scanned = rows.length;
  if (rows.length === 0) return result;

  const admin = createAdminClient();

  // Batch-lookup tb_forwarder by ftrackingchn IN (...). One query handles
  // all candidates (typical batch < 200 rows — no chunking needed).
  // Include fcabinet_locked so the cabinet guard below can skip rows that
  // admin has manually locked against partner-sync overwrites.
  const trackings = Array.from(new Set(rows.map((r) => r.tracking).filter(Boolean)));
  const { data: matchedRows, error: lookupErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, fstatus, fcabinetnumber, fdatetothai, fcabinet_locked")
    .in("ftrackingchn", trackings);
  if (lookupErr) {
    console.error("[propagateCttToForwarders] tb_forwarder lookup failed", {
      code: lookupErr.code,
      message: lookupErr.message,
    });
    result.errors.push({
      trackingNo: "(batch)",
      message: `lookup failed: ${lookupErr.code} ${lookupErr.message}`,
    });
    return result;
  }

  type ForwarderHit = {
    id:              number;
    ftrackingchn:    string | null;
    fstatus:         string | null;
    fcabinetnumber:  string | null;
    fdatetothai:     string | null;
    fcabinet_locked: boolean | null;
  };
  const forwardersByTracking = new Map<string, ForwarderHit[]>();
  for (const row of (matchedRows ?? []) as unknown as ForwarderHit[]) {
    const key = row.ftrackingchn ?? "";
    if (!key) continue;
    const list = forwardersByTracking.get(key) ?? [];
    list.push(row);
    forwardersByTracking.set(key, list);
  }
  result.matched = (matchedRows ?? []).length;

  for (const sheetRow of rows) {
    const hits = forwardersByTracking.get(sheetRow.tracking);
    if (!hits || hits.length === 0) continue;

    const incomingFstatus = ctTStatusLabelToFstatus(sheetRow.statusLabel);
    const incomingArrival = parseArrivalDate(sheetRow.arrivalRaw);

    for (const f of hits) {
      const updates: Record<string, string> = {};

      // 1. cabinet — EMPTY-ONLY + lock-respect.
      const cabinetDecision = shouldWriteCabinet({
        incoming:      sheetRow.cabinet,
        currentValue:  f.fcabinetnumber,
        cabinetLocked: f.fcabinet_locked,
      });
      if (cabinetDecision.write) {
        updates.fcabinetnumber = sheetRow.cabinet;
        result.cabinetWrites += 1;
      } else if (cabinetDecision.locked) {
        // Logged + counted so staff can audit the lock impact.
        console.info(
          `[propagateCttToForwarders] cabinet-write SKIPPED (locked) ` +
          `fid=${f.id} tracking=${sheetRow.tracking} ` +
          `current=${JSON.stringify(f.fcabinetnumber ?? null)} ` +
          `wouldHaveWritten=${JSON.stringify(sheetRow.cabinet)}`,
        );
        result.cabinetLocked += 1;
      }

      // 2. fdatetothai — forward-only.
      if (
        shouldWriteArrival({
          incomingDate: incomingArrival,
          currentValue: f.fdatetothai,
        })
      ) {
        // The helper already guaranteed `incomingArrival` is non-null
        // (it returned true), so the non-null assertion is safe and
        // satisfies tsc's signature for the update payload.
        updates.fdatetothai = incomingArrival!;
        result.arrivedWrites += 1;
      }

      // 3. fstatus — forward-only AND env-gated. The gate parallels MOMO's
      //    MOMO_SYNC_PROPAGATE_STATUS: the rank-advance is computed
      //    unconditionally so the dashboard sees a "would-have-advanced"
      //    count even with the gate OFF, but the actual write only fires
      //    when the gate is ON.
      const target = fstatusAdvanceTarget({
        incomingFstatus,
        currentValue: f.fstatus,
      });
      if (target !== null) {
        if (statusGate) {
          updates.fstatus = target;
          result.statusAdvanceWrites += 1;
        } else {
          result.statusAdvanceSkippedByGate += 1;
        }
      }

      if (Object.keys(updates).length === 0) {
        result.noopFresh += 1;
        continue;
      }

      const { error: updateErr } = await admin
        .from("tb_forwarder")
        .update(updates)
        .eq("id", f.id);
      if (updateErr) {
        console.error("[propagateCttToForwarders] update failed", {
          forwarderId: f.id,
          tracking:    sheetRow.tracking,
          updates,
          code:        updateErr.code,
          message:     updateErr.message,
        });
        result.errors.push({
          trackingNo: sheetRow.tracking,
          message:    `forwarder #${f.id}: ${updateErr.code} ${updateErr.message}`,
        });
        continue;
      }
      result.updated += 1;
    }
  }

  return result;
}

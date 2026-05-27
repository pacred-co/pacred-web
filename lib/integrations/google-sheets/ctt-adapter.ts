/**
 * CTT warehouse Google Sheet → Pacred sync adapter (pilot for Gap #1).
 *
 * Legacy faithful port:
 *   - `pcs-admin/api-sheets-ctt.php`            — the sheet pull endpoint
 *   - `member/run-time/cttupdate/index.php`     — the cron driver
 *   - `tb_notify_sheet_ctt`                     — dedupe state (`numrow` = last sheet row processed)
 *
 * Legacy flow:
 *   1. Read tb_notify_sheet_ctt.numrow → the last row index already pushed.
 *   2. Read the CTT sheet (rows numrow+1 onward).
 *   3. For each new row: insert into `tb_forwarder` (warehouse intake) +
 *      LINE Notify the operations team that new shipments landed.
 *   4. UPDATE tb_notify_sheet_ctt SET numrow=<new max>, date=now().
 *
 * Pacred port — STATE-OF-PLAY:
 *   ✅ Sheets client foundation (`./client.ts`)
 *   ✅ Dedupe table reads + writes (this file)
 *   🟡 Sheet ID + tab name + column layout — owner/ก๊อต-supplied (env)
 *   🟡 tb_forwarder INSERT shape — needs row→column mapping per sheet header
 *   🟡 LINE push target list — was LINE Notify per-user (now dead 2025-03-31);
 *      replace with LINE Messaging API push to the ops staff LINE OA group
 *      via `lib/notifications/sendNotification`. Recipient roster TBD.
 *
 * Until the 🟡 items above are wired, this adapter runs in DRY-RUN mode:
 *   - Reads the sheet, computes the new-rows window, logs a count + a
 *     sample of the first new row, but does NOT insert into tb_forwarder
 *     and does NOT push notifications. The `numrow` dedupe cursor is ALSO
 *     NOT advanced — that way the cron can safely run + log every cycle
 *     while ก๊อต/ภูม finalize the sheet layout, and the first real run
 *     will pick up every row from the original cursor.
 *
 * Returning a structured summary lets the cron route emit a clean
 * `cron-invocations` row for the /admin/system/crons page.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

import { readSheet, type SheetsReadResult } from "./client";

/**
 * CTT sync result shape — mirrors the CargoThai cron summary so the
 * admin observability page can render both with the same template.
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

const SHEET_ID_ENV = "GOOGLE_SHEETS_CTT_ID";
const SHEET_RANGE_ENV = "GOOGLE_SHEETS_CTT_RANGE";

/**
 * Default range — start at row 2 (skip header) through column AZ to be
 * safe (legacy sheets have ~20 cols today). Override via env if needed.
 */
const DEFAULT_RANGE = "CTT-New!A2:AZ";

export async function syncCttSheet(): Promise<CttSyncSummary> {
  // 1) Resolve config from env. Sheet ID is per-installation (legacy
  //    `15g49hwP8dx1bOVbVKcp1V33I_o1gSLJYeqEIdRS4Mpk` is PCS Cargo's, not
  //    Pacred's — ก๊อต provisions the Pacred-owned copy).
  const sheetId = process.env[SHEET_ID_ENV];
  if (!sheetId) {
    return { status: "failure", reason: "sheet_id_missing" };
  }
  const range = process.env[SHEET_RANGE_ENV] ?? DEFAULT_RANGE;

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
  const newRows = fetchRes.rows.filter(
    (_row, i) => i + headerOffset > lastNumrow,
  );
  const newRowCount = newRows.length;

  // 5) DRY-RUN mode (current state — see file docstring 🟡 items).
  //    We log enough to validate the foundation without inserting into
  //    tb_forwarder or pushing notifications. The dedupe cursor is
  //    deliberately NOT advanced so the first live run still picks up
  //    every queued row from the original cursor.
  logger.info("ctt-sync", "dry-run summary", {
    lastNumrow,
    sheetRowCount: fetchRes.rows.length,
    newRowCount,
    sampleNewRow: newRows[0] ?? null,
  });

  return {
    status: "success",
    mode: "dry-run",
    lastNumrow,
    newRowCount,
    sampleNewRow: newRows[0] ?? null,
    sheetId,
    range,
  };
}

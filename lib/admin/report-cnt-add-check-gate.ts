/**
 * Pure status-gate for /admin/report-cnt/[fNo] "เพิ่มในรายการตรวจสอบแล้ว"
 * (2026-06-09 bug fix · ภูม-reported).
 *
 * Background: the legacy POST handler `report-cnt.php` L1916 accepted any
 * fID the admin checked, which meant a row whose physical goods were still
 * in transit (fstatus '1'/'2'/'3' / not at the TH warehouse) could land in
 * the QA queue and be "ตรวจสอบ"-ed against nothing in the warehouse. This
 * module is the gate the Server Action (`adminReportCntAddCheck`) consults
 * and the test file (`report-cnt-add-check-gate.test.ts`) exercises.
 *
 * SOLID — pure function · no DB · no IO · no Next imports. Lives in `lib/`
 * (not in the `"use server"` action file) because (a) `"use server"`
 * modules may only export async functions, and (b) the action's import
 * graph pulls in `server-only`, which throws under bare tsx → tests can't
 * import action modules. Mirror-vs-import would silently drift; a real
 * shared module + a real import here keeps the action + test in lock-step.
 *
 * Threshold: REPORT_CNT_ADD_CHECK_MIN_FSTATUS = "4" (= "ถึงไทยแล้ว" =
 * physical arrival at the TH warehouse). The 2026-06-09 spec said "6"
 * but that's wrong — per lib/admin/forwarder-status.ts:
 *   "4" = "ถึงไทยแล้ว"  ← THIS is when QA inspection becomes meaningful
 *   "5" = "รอชำระเงิน"   (still in TH, just waiting for customer to pay)
 *   "6" = "เตรียมส่ง"    (already past QA, preparing for delivery)
 *   "7" = "ส่งแล้ว"       (also accepted — a delivered row CAN re-enter QA
 *                          for a dispute/damage claim)
 * ภูม screenshot 2026-06-09 showed rows ticked at fstatus=4 ("ถึงโกดัง
 * ไทยแล้ว") which SHOULD pass — that's exactly the case this gate exists
 * to enable. The constant is the only change point if policy shifts.
 */

export const REPORT_CNT_ADD_CHECK_MIN_FSTATUS = "4";

/** Mirror of `FSTATUS_CFG` labels (lib/admin/forwarder-status.ts) — kept
 *  duplicated here so the gate stays import-light (no React/Tailwind
 *  drag-in). Sync if labels move. */
export const FSTATUS_LABEL: Record<string, string> = {
  "1": "รอเข้าโกดังจีน",
  "2": "ถึงโกดังจีนแล้ว",
  "3": "กำลังส่งมาไทย",
  "4": "ถึงไทยแล้ว",
  "5": "รอชำระเงิน",
  "6": "เตรียมส่ง",
  "7": "ส่งแล้ว",
};

export type ReportCntAddCheckRow = {
  id: number;
  fstatus: string | null;
  fidorco: string | null;
};

export type ReportCntAddCheckGateResult =
  | { ok: true }
  | {
      ok: false;
      blockedFidorcos: string[];
      blockedCount: number;
      sampleStatuses: string[];
    };

/**
 * Decide whether the batch may proceed.
 *
 * Returns `{ ok: true }` only when every row's `fstatus >= minFstatus`
 * (legacy single-char-digit string compare — '4' < '5' < '6'…).
 *
 * Otherwise returns `{ ok: false, … }` with a sample of blocked rows
 * for the staff-facing error message (capped at 5 identifiers — use the
 * `fidorco` when present, else `#<id>`). All-or-nothing semantics —
 * partial inserts would silently succeed on some IDs and leave staff
 * guessing; rejecting the whole batch forces them to fix the selection.
 *
 * Edge cases:
 *   - `fstatus === null` or `""` → rejected (treated as "<min").
 *   - `fstatus === "7"` (ส่งแล้ว / delivered) → accepted (legacy had no
 *     upper bound; a delivered row CAN re-enter QA for dispute/damage).
 *   - `fstatus` exactly equal to `minFstatus` ("4") → accepted (boundary).
 */
export function evaluateReportCntAddCheckStatus(
  rows: ReportCntAddCheckRow[],
  minFstatus: string = REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
): ReportCntAddCheckGateResult {
  const blocked = rows.filter((r) => {
    const s = (r.fstatus ?? "").trim();
    if (s === "") return true; // null / empty = "not at TH warehouse yet"
    return s < minFstatus;
  });
  if (blocked.length === 0) return { ok: true };
  const blockedFidorcos = blocked
    .slice(0, 5)
    .map((r) => r.fidorco ?? `#${r.id}`);
  const sampleStatuses = Array.from(
    new Set(blocked.map((r) => (r.fstatus ?? "").trim() || "(ว่าง)")),
  ).slice(0, 5);
  return { ok: false, blockedFidorcos, blockedCount: blocked.length, sampleStatuses };
}

/**
 * Client-side hint: "is this single row eligible to be ticked?".
 * Used by the React row checkbox to disable + tooltip rows below the gate.
 */
export function isRowEligibleForAddCheck(
  fstatus: string | null,
  minFstatus: string = REPORT_CNT_ADD_CHECK_MIN_FSTATUS,
): boolean {
  const s = (fstatus ?? "").trim();
  if (s === "") return false;
  return s >= minFstatus;
}

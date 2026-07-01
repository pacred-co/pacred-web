/**
 * MOMO Live status propagation — PURE decision helpers (no DB · no "server-only").
 *
 * URGENT (owner/ภูม 2026-07-01): MOMO's PARTNER token (`import/track`) only reports
 * status up to "ออกจากโกดังจีน/exported" and then DROPS the parcel once it advances,
 * so many tb_forwarder rows sit STUCK at an early fstatus. But MOMO's OWN web
 * (momocargo.com, logged in as the Pacred master account · lib/integrations/momo-web/
 * client.ts) sees EVERY parcel in EVERY status board WITH the member code — the RICHER
 * source. MOMO is source-of-truth for STATUS, so we propagate the Live-board status
 * into tb_forwarder.fstatus (แต้ม stays only for weight/CBM verification).
 *
 * These helpers hold the two safety rules the propagator leans on, extracted so they
 * are unit-testable without a database or a live MOMO login:
 *   1. liveStatusToFstatus — map a MOMO Live BOARD status key (the tab a parcel was
 *      returned from · the most reliable signal) → the Pacred fstatus code. The board
 *      a parcel is ON is authoritative: a parcel in the `arrival_kodang` board IS at
 *      "ถึงโกดังจีน". Faithful to the existing partner-feed mapping in
 *      lib/integrations/momo-isolated/propagate.ts (momoStatusToFstatus).
 *   2. isForwardAdvance / FSTATUS_RANK — FORWARD-ONLY: advance a row ONLY when the
 *      MOMO-Live status is STRICTLY newer than the row's current fstatus. NEVER demote.
 *      The DB writer also expresses this as a `.gte`/`.in('fstatus', ...)` WHERE guard
 *      so the UPDATE is TOCTOU-safe + idempotent (a re-run advances 0 rows).
 *
 * READ-ONLY / no side effects. STATUS-ONLY intent (the writer touches only fstatus +
 * the matching fdatestatusN + adminidupdate) — nothing here concerns money.
 */

import { MOMO_LIVE_STATUSES, type MomoLiveStatus } from "./types";

/**
 * MOMO Live BOARD status → Pacred tb_forwarder.fstatus code (string).
 * `null` = this board has no clean forwarder-status equivalent → skip.
 *
 * Board → fstatus, faithful to legacy forwarder.php status keys 1..7 and to the
 * partner-feed mapping (propagate.ts momoStatusToFstatus):
 *   waiting        รอเข้าโกดังจีน   → '1'
 *   arrival_kodang ถึงโกดังจีน       → '2'
 *   sending_thai   กำลังส่งมาไทย     → '3'
 *   wait_pay       รอชำระค่าขนส่ง   → '5'  (MOMO has no ถึงไทย '4' board; wait_pay
 *                                          implies arrived-TH + awaiting payment)
 *   sending        กำลังนำส่ง        → '6'
 *   done           จัดส่งให้แล้ว     → '7'
 */
const LIVE_STATUS_TO_FSTATUS: Record<MomoLiveStatus, string> = {
  waiting: "1",
  arrival_kodang: "2",
  sending_thai: "3",
  wait_pay: "5",
  sending: "6",
  done: "7",
};

export function liveStatusToFstatus(board: MomoLiveStatus | null | undefined): string | null {
  if (!board) return null;
  return LIVE_STATUS_TO_FSTATUS[board] ?? null;
}

/**
 * Rank tb_forwarder fstatus for "forward-only" comparison. Higher = later in the flow.
 * Unknown codes get rank 0 so they never overwrite a known status. Mirrors the rank
 * table in propagate.ts (fstatusRank).
 */
export const FSTATUS_RANK: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "99": 99,
};

export function fstatusRank(v: string | null | undefined): number {
  if (!v) return 0;
  return FSTATUS_RANK[v] ?? 0;
}

/**
 * True when advancing `current` → `target` is a STRICTLY FORWARD move (never demote,
 * never no-op-equal). The core forward-only rule the writer's WHERE guard enforces.
 */
export function isForwardAdvance(
  current: string | null | undefined,
  target: string | null | undefined,
): boolean {
  const t = fstatusRank(target);
  if (t === 0) return false; // target has no known rank → never advance
  return t > fstatusRank(current);
}

/**
 * The fdatestatusN column that pairs with an fstatus code, so the writer can stamp the
 * arrival/status date for the destination status (only when empty — never overwrites a
 * real stamp). Returns null for codes with no dedicated date column in tb_forwarder.
 *
 * tb_forwarder date columns (legacy forwarder.php): fdatestatus2 (ถึงโกดังจีน),
 * fdatestatus3 (กำลังส่งมาไทย), fdatetothai (ถึงไทย — used for '4'/'5' arrival),
 * fdatestatus6 (เตรียมส่ง), fdatestatus7 (ส่งแล้ว). '1' has no dedicated stamp.
 */
export function fdateColumnForFstatus(fstatus: string): string | null {
  switch (fstatus) {
    case "2": return "fdatestatus2";
    case "3": return "fdatestatus3";
    case "5": return "fdatetothai"; // arrived-TH signal (no fdatestatus4/5 in legacy)
    case "6": return "fdatestatus6";
    case "7": return "fdatestatus7";
    default:  return null; // '1' / '4' — no dedicated stamp
  }
}

/**
 * The MAXIMUM fstatus rank the MOMO-Live auto-propagate may advance a row TO.
 *
 * owner/ภูม 2026-07-01 ("อัปเดตเฉพาะที่ค้างถึงโกดังจีน อย่าไปชนอันอื่น"): MOMO is the
 * source-of-truth for the CHINA-SIDE journey only — รอเข้าโกดังจีน → ถึงโกดังจีน →
 * กำลังส่งมาไทย (fstatus 1 → 2 → 3). The THAILAND-SIDE flow is Pacred's OWN workflow and
 * must NEVER be moved by a MOMO scrape:
 *   '4' ถึงไทย    ← warehouse scan-arrival
 *   '5' รอชำระ    ← the seller has set the freight rate (money/billing gate)
 *   '6'/'7'       ← Pacred driver dispatch / delivered
 * If MOMO could push a row to '5' it would drop into the billing queue BEFORE the rate is
 * set; to '7' it would read "ส่งแล้ว" while our driver hasn't delivered. So cap at '3'.
 */
export const MAX_LIVE_PROPAGATE_FSTATUS_RANK = 3;

/**
 * The Live boards the auto-propagate ACTS on — the China-side journey only (fstatus rank
 * ≤ MAX_LIVE_PROPAGATE_FSTATUS_RANK = 1/2/3). `wait_pay`/`sending`/`done` map to 5/6/7 in
 * LIVE_STATUS_TO_FSTATUS above (kept complete for display/reference) but are DELIBERATELY
 * excluded here, so a MOMO scrape can never drive a Thailand-side / billing / dispatch
 * status. The propagator fetches ONLY these boards.
 */
export const PROPAGATABLE_LIVE_STATUSES: readonly MomoLiveStatus[] = MOMO_LIVE_STATUSES.filter(
  (s) => {
    const f = liveStatusToFstatus(s);
    return f !== null && fstatusRank(f) <= MAX_LIVE_PROPAGATE_FSTATUS_RANK;
  },
);

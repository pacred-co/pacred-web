/**
 * Departed-container advance — PURE decision helpers (no DB · unit-testable).
 *
 * URGENT (owner/ภูม 2026-07-01): MOMO's import/track API only reports status up to
 * "ออกจากโกดังจีน/exported" and then DROPS the parcel once it advances — so many
 * tb_forwarder rows sit STUCK at fstatus '1' (รอเข้าโกดังจีน) or '2' (ถึงโกดังจีนแล้ว)
 * even after their container has already DEPARTED China and is "กำลังส่งมาไทย"
 * (fstatus '3'). Customers complain. We bypass the broken API using the แต้ม (iTAM)
 * container ETD we already store in `taem_container_etd_eta` (migration 0195).
 *
 * These helpers hold the two safety rules the DB job leans on, extracted so they can
 * be unit-tested without a database:
 *   1. isContainerDeparted — a container has DEPARTED only when its แต้ม ETD is in the
 *      PAST (etd < today). A future/absent/blank ETD is NOT departed.
 *   2. ADVANCEABLE_FROM_FSTATUS — the ONLY statuses we advance are '1' and '2'. This
 *      is the forward-only guard: a row at 3/4/5/6/7 is already at-or-past
 *      "กำลังส่งมาไทย" and MUST NEVER be demoted. The DB job also expresses this as a
 *      `.in('fstatus', ADVANCEABLE_FROM_FSTATUS)` WHERE clause so the UPDATE is
 *      TOCTOU-safe + idempotent (a re-run advances 0 rows).
 *
 * READ-ONLY / no side effects. STATUS-ONLY intent (the job writes only fstatus +
 * fdatestatus3 + adminidupdate) — nothing here touches money.
 */

/** The target status we advance a departed-container forwarder to: กำลังส่งมาไทย. */
export const ADVANCE_TO_FSTATUS = "3" as const;

/**
 * The ONLY source statuses eligible to advance to '3'. Forward-only: a departed
 * container may still hold rows that never reached the china warehouse ('1') or
 * reached it but weren't marked in-transit ('2'); both are BEHIND '3'. Anything
 * already at '3' or later is left untouched (never demoted). Kept as a readonly
 * tuple so the DB job can spread it straight into `.in('fstatus', ...)`.
 */
export const ADVANCEABLE_FROM_FSTATUS = ["1", "2"] as const;

/** yyyy-mm-dd for "today" in UTC — matches how the job stamps date-only values. */
export function todayYmd(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Normalize an ETD (date | timestamptz | "" | "0000-00-00" | null) to yyyy-mm-dd,
 * or null when there is no usable date. The legacy "0000-00-00" sentinel is treated
 * as "no ETD" (never departed).
 */
export function normalizeEtd(etd: string | null | undefined): string | null {
  if (!etd) return null;
  const s = String(etd).trim();
  if (s === "" || s.startsWith("0000-00-00")) return null;
  return s.slice(0, 10);
}

/**
 * A container has DEPARTED China when its แต้ม ETD is strictly in the PAST
 * (etd < today). Today's ETD is NOT yet departed (the ship leaves during the day);
 * being strict avoids advancing a row on the exact departure date before it's real.
 * A null/blank/future ETD → not departed.
 */
export function isContainerDeparted(
  etd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const d = normalizeEtd(etd);
  if (!d) return false;
  return d < todayYmd(now);
}

/** The minimum a forwarder row needs for the advance decision. */
export type AdvanceCandidateRow = { id: number; fstatus: string | null };

/** True when this forwarder row is eligible to advance (fstatus ∈ {1,2}). */
export function isAdvanceableForwarder(row: AdvanceCandidateRow): boolean {
  const s = (row.fstatus ?? "").trim();
  return (ADVANCEABLE_FROM_FSTATUS as readonly string[]).includes(s);
}

/**
 * Filter a container's forwarder rows to only those eligible to advance to '3'
 * (forward-only). Used by the DB job to count/plan; the actual write additionally
 * carries the `.in('fstatus', ADVANCEABLE_FROM_FSTATUS)` WHERE guard so a status that
 * changed between read and write can never be demoted.
 */
export function selectAdvanceableForwarders<T extends AdvanceCandidateRow>(
  rows: T[],
): T[] {
  return rows.filter(isAdvanceableForwarder);
}

/**
 * "จะมาถึงไทย" ETA window — the ONE home for the legacy arrival-range rule.
 *
 * Legacy rule (forwarder.php L595-609): the stored `fdatetothai` is the START of
 * an arrival WINDOW, not an exact day. The window length depends on the transport
 * mode, because a truck's ETA is tighter than a vessel's:
 *
 *   ftransporttype = "1" (ทางรถ)        → base .. base + 2 วัน
 *   otherwise      ("2" เรือ · "3" แอร์) → base .. base + 4 วัน
 *
 * The `0000-00-00` sentinel means "no ETA yet" → null (render nothing).
 *
 * WHY THIS FILE: the same rule is currently hand-copied in three places, each with
 * its own output format — `forwarders-table.tsx` (`formatEtaRange`, "04/07 - 08/07
 * ± 4 วัน"), `forwarders/[fNo]/page.tsx` (inline, "04/07/2569 ถึง 08/07/2569") and
 * `/service-import/[fNo]` (the detail page's comment says it was copied 1:1 from
 * there). Three copies of one legacy rule will drift. New callers must use this;
 * the existing three should migrate here rather than gain a fourth copy.
 */

import { formatThaiDate } from "@/lib/utils/thai-datetime";

/** Truck ETAs are tighter than sea/air — the legacy window lengths. */
const WINDOW_DAYS_TRUCK = 2;
const WINDOW_DAYS_SEA_AIR = 4;

export type EtaWindow = {
  /** First day of the arrival window (= the stored `fdatetothai`). */
  from: Date;
  /** Last day of the window (`from` + the mode's offset). */
  to: Date;
  /** How many days wide the window is (2 for ทางรถ, else 4). */
  days: number;
};

/**
 * Resolve `fdatetothai` + `ftransporttype` into the arrival window.
 *
 * @returns null when there is no usable ETA (empty · the `0000-00-00` sentinel ·
 *          an unparseable value) — the caller renders nothing.
 */
export function resolveEtaWindow(
  base: string | null | undefined,
  transportType: string | null | undefined,
): EtaWindow | null {
  const raw = (base ?? "").trim();
  if (!raw || raw.startsWith("0000-00-00")) return null;
  // Pin to local midnight: a bare "YYYY-MM-DD" parses as UTC and can render as the
  // previous day in Asia/Bangkok.
  const from = new Date(`${raw.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(from.getTime())) return null;

  const days = transportType === "1" ? WINDOW_DAYS_TRUCK : WINDOW_DAYS_SEA_AIR;
  const to = new Date(from);
  to.setDate(to.getDate() + days);
  return { from, to, days };
}

/**
 * The window as "DD/MM/YY ถึง DD/MM/YY" (Thai BE short year, matching every other
 * date on the admin tables via {@link formatThaiDate}).
 *
 * @returns null when there is no ETA — the caller renders nothing.
 */
export function formatEtaWindowThai(
  base: string | null | undefined,
  transportType: string | null | undefined,
): string | null {
  const w = resolveEtaWindow(base, transportType);
  if (!w) return null;
  return `${formatThaiDate(w.from)} ถึง ${formatThaiDate(w.to)}`;
}

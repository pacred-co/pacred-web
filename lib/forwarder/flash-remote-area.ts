/**
 * flashRemoteAreaBadge — พื้นที่ห่างไกล / พื้นที่ท่องเที่ยวพิเศษ warning for a
 * destination zip. Faithful port of legacy `flashRemoteArea()`
 * (pcs-admin/include/function.php L2617) which prints a red badge on the
 * forwarder-check / delivery rows warning about a Flash surcharge.
 *
 * SOT: the zip lists live ONCE in `lib/tools/flash-price.ts`
 * (REMOTE_AREA_ZIPS / TOURIST_AREA_ZIPS, exported as FLASH_REMOTE_AREA_ZIPS /
 * FLASH_TOURIST_AREA_ZIPS). This helper only wraps them in O(1) Sets — it does
 * NOT paste a second copy of the numbers (§0e / SOT rule).
 *
 * Fidelity note: legacy used `array_search($zip, $list, true)` and `if($x)`,
 * which — due to PHP's falsy `0` index — silently FAILS to warn on the very
 * first zip of each array. This port uses Set membership (correct), so it warns
 * on every listed zip incl. the first. That is strictly more correct and
 * matches the owner's clear intent (warn on remote/tourist zips).
 */
import {
  FLASH_REMOTE_AREA_ZIPS,
  FLASH_TOURIST_AREA_ZIPS,
} from "@/lib/tools/flash-price";

const REMOTE = new Set(FLASH_REMOTE_AREA_ZIPS);
const TOURIST = new Set(FLASH_TOURIST_AREA_ZIPS);

export type FlashRemoteAreaBadge = { kind: "remote" | "tourist"; label: string } | null;

/** Returns the warning badge for a destination zip, or null when normal. */
export function flashRemoteAreaBadge(zip: string | null | undefined): FlashRemoteAreaBadge {
  const z = (zip ?? "").toString().trim();
  if (!z) return null;
  if (REMOTE.has(z)) return { kind: "remote", label: "พื้นที่ห่างไกล" };
  if (TOURIST.has(z)) return { kind: "tourist", label: "พื้นที่ท่องเที่ยวพิเศษ" };
  return null;
}

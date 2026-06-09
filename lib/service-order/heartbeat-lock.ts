/**
 * Pure helpers for the shop-order heartbeat lock (legacy
 * `pcs-admin/include/pages/shops/updateLock.php` port).
 *
 * Extract reasons:
 *   - `isLockExpired(now, hlockedat)` — the same comparison runs in the
 *     server action (decide whether to grant a take-over) AND in the UI
 *     banner client island (decide whether to show the "expired · click
 *     to take over" affordance). Pure function → one tested place,
 *     guaranteed-identical semantics across server + client.
 *
 *   - `LOCK_TTL_MS` / `HEARTBEAT_INTERVAL_MS` — magic numbers used in
 *     both layers. The 50/60 split (50s heartbeat, 60s expiry) gives a
 *     10-sec safety margin so a slow round-trip never lets the lock
 *     expire under the active editor.
 *
 *   - `nextLockExpiry()` — single source of truth for "what timestamp
 *     should I write to hlockedat?". A tiny pure wrapper around
 *     `new Date(now + LOCK_TTL_MS)` so the server action body stays
 *     test-pure (we control `now` instead of having to mock `Date.now`).
 *
 *   - `secondsUntilExpiry(now, hlockedat)` — formats the countdown for
 *     the UI banner ("เหลือ 43s"). Negative = expired (banner switches
 *     from "กำลังถูกแก้ไข" to "ล็อคหมดอายุ — คลิกเพื่อแก้ไข").
 */

/** Hard expiry — the lock is valid until `hlockedat`, which we set to NOW + this. */
export const LOCK_TTL_MS = 60_000;

/** Client heartbeat cadence — 10s safety margin under the 60s expiry. */
export const HEARTBEAT_INTERVAL_MS = 50_000;

/**
 * Is the lock represented by `hlockedat` already past `now`?
 * - `null` / missing → no lock at all → counts as "expired" (free to acquire).
 * - non-finite Date  → treat as expired (defensive against malformed input).
 */
export function isLockExpired(now: Date, hlockedat: Date | string | null | undefined): boolean {
  if (hlockedat == null) return true;
  const t = typeof hlockedat === "string" ? new Date(hlockedat) : hlockedat;
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return true;
  return ms <= now.getTime();
}

/** Whether a lock held by `hlockedby` may be acquired by `currentAdminId`. */
export function canAcquireLock(args: {
  now: Date;
  currentAdminId: string;
  hlockedby: string | null | undefined;
  hlockedat: Date | string | null | undefined;
}): boolean {
  const { now, currentAdminId, hlockedby, hlockedat } = args;
  // Unlocked → free.
  if (!hlockedby) return true;
  // Same admin re-acquiring (heartbeat path) → free.
  if (hlockedby === currentAdminId) return true;
  // Different admin → only if the existing lock has expired.
  return isLockExpired(now, hlockedat);
}

/** Compute the timestamp to write into hlockedat on the next heartbeat. */
export function nextLockExpiry(now: Date): Date {
  return new Date(now.getTime() + LOCK_TTL_MS);
}

/**
 * Whole seconds remaining until the lock expires (positive = still locked).
 * Returns 0 (not negative) when the lock has already lapsed — the UI banner
 * uses this to drive a countdown that cleanly stops at "ล็อคหมดอายุ".
 */
export function secondsUntilExpiry(now: Date, hlockedat: Date | string | null | undefined): number {
  if (hlockedat == null) return 0;
  const t = typeof hlockedat === "string" ? new Date(hlockedat) : hlockedat;
  const ms = t.getTime();
  if (!Number.isFinite(ms)) return 0;
  const remaining = Math.max(0, Math.ceil((ms - now.getTime()) / 1000));
  return remaining;
}

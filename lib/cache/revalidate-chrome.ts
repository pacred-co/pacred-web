import { revalidateTag } from "next/cache";

/**
 * Realtime-freshness helpers (owner 2026-06-06 "กดปุ้ปไปปั้ป" — data must
 * update instantly after an action, no manual refresh).
 *
 * The sidebar/header BADGE counts + aggregate totals are served from
 * `unstable_cache` with a 60-second TTL, keyed on a NON-path key:
 *   - "pcs-chrome"          → lib/legacy/pcs-chrome.ts  (customer chrome:
 *     wallet balance, cart count, forwarder/order counts, payment-due)
 *   - "admin-sidebar-counts"→ actions/admin/sidebar-counts.ts (admin queues)
 *   - "wallet-system-totals"→ lib/admin/wallet-totals.ts (admin wallet/cashback)
 *
 * A non-path `unstable_cache` key is invalidated ONLY by a matching
 * `revalidateTag` — `revalidatePath` does NOT reach it. The codebase had 744
 * `revalidatePath` calls but ZERO `revalidateTag` calls, so these badges
 * stayed stale up to 60s after a mutation. A Server Action that changes any
 * counted / balance value must call the matching helper below (alongside its
 * existing `revalidatePath`) so the badge updates the moment the action lands.
 */

// Next 16 changed `revalidateTag` from a 1-arg call to a 2-arg call:
//   revalidateTag(tag: string, profile: string | CacheLifeConfig): undefined
// The second `profile` arg is now REQUIRED (TS2554 without it). We pass
// `{ expire: 0 }` (a CacheLifeConfig) to force the tagged entry to expire
// immediately — i.e. purge-now, the behaviour the old 1-arg call had. (This
// is the same Next-16 gotcha noted in actions/profile-avatar.ts.)
const EXPIRE_NOW = { expire: 0 } as const;

/** Customer sidebar/header badges (wallet balance · cart · forwarder · order). */
export function bustCustomerChrome(): void {
  revalidateTag("pcs-chrome", EXPIRE_NOW);
}

/** Admin sidebar queue badges + the /admin wallet/cashback total cards. */
export function bustAdminChrome(): void {
  revalidateTag("admin-sidebar-counts", EXPIRE_NOW);
  revalidateTag("wallet-system-totals", EXPIRE_NOW);
}

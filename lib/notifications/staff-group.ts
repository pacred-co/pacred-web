/**
 * Staff-group LINE notification — the Pacred replacement for legacy
 * `lineNotify()` (the staff/ops LINE-group ping fired when a customer creates a
 * payment / forwarder / shop order, so staff verify it promptly).
 *
 * WHY THIS EXISTS (P1-24 · 2026-05-31)
 * -----------------------------------
 * Legacy `member/include/function.php` defined a family of staff-group pings —
 * `lineNotify()`, `lineNotifyShops()`, `lineNotifyForwarder()`,
 * `lineNotifyTopUp()` … — each POSTing to **`https://notify-api.line.me/api/notify`**
 * (the LINE **Notify** API) with a hardcoded staff-group token. On every new
 * customer submit (e.g. `pcs-admin/payment.php` add handler → `lineNotify(...)`)
 * the ops team got an instant "มีรายการฝากชำระใหม่ #N จากคุณ PRxxxx" bubble.
 *
 * Two things broke that mechanism for Pacred:
 *   1. **LINE Notify reached EOL in April 2025** — `notify-api.line.me` is dead.
 *      The legacy staff token cannot be reused.
 *   2. The replacement is a **LINE OA push** (`api.line.me/v2/bot/message/push`)
 *      to a **group the Pacred bot (@pacred) is a member of** — which needs that
 *      group's id, a value we do NOT yet have.
 *
 * So this helper is the faithful port of the *intent* on the new transport,
 * env-gated + dev-safe:
 *   - fires a real push only when `LINE_STAFF_GROUP_ID` is set, a channel token
 *     exists, and `LINE_PUSH_BYPASS !== "true"`;
 *   - otherwise logs and no-ops (never pushes to a real group from dev, never
 *     throws — staff notify is best-effort, it must never fail the customer's
 *     submit).
 *
 * 🔧 TO ACTIVATE (owner / ก๊อต — one-time):
 *   1. Create (or pick) the internal staff LINE group used for ops alerts.
 *   2. Add the Pacred Shipping OA bot (@pacred · channel 2009931373) to it.
 *   3. Read the `groupId` from the webhook event the bot receives on join
 *      (or via the LINE webhook log) — looks like `Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
 *   4. Set `LINE_STAFF_GROUP_ID=<that id>` on Vercel prod (+ `.env.local`).
 *   5. Ensure `LINE_PUSH_BYPASS=false` in the Production scope.
 * Until then this is a wired, reachable no-op — the moment the id lands, every
 * call site below starts pinging staff with zero further code change.
 *
 * Server-only. Best-effort. Never throws.
 */
import "server-only";
import { logger } from "@/lib/logger";

const SCOPE = "staff-group-notify";

/**
 * Push a plain-text alert to the internal staff LINE-OA group.
 * Returns true only when a real push was sent + accepted.
 */
export async function notifyStaffGroup(message: string): Promise<boolean> {
  const groupId = process.env.LINE_STAFF_GROUP_ID;
  const token   = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  // Dev-safe / not-yet-configured → log + no-op (same philosophy as
  // LINE_PUSH_BYPASS for customer pushes: dev never pings the real group).
  if (process.env.LINE_PUSH_BYPASS === "true" || !groupId || !token) {
    logger.info(SCOPE, "staff-group push skipped (bypass/unconfigured)", {
      hasGroupId: Boolean(groupId),
      hasToken:   Boolean(token),
      bypass:     process.env.LINE_PUSH_BYPASS === "true",
    });
    return false;
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({
        to:       groupId,
        messages: [{ type: "text", text: message }],
      }),
    });
    if (!res.ok) {
      logger.warn(SCOPE, "staff-group push non-OK", { status: res.status });
      return false;
    }
    return true;
  } catch (e) {
    // Never throw — a failed staff ping must not fail the customer's submit.
    logger.error(SCOPE, "staff-group push failed", e, {});
    return false;
  }
}

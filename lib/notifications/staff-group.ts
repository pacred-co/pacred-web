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

/** Optional rich-card options for a staff-group ping. */
export type StaffGroupNotifyOpts = {
  /** Deep-link target — absolute https URL, or an app-relative path ("/admin/…")
   *  which is prefixed with the site base. Adds a tappable button to the card. */
  url?: string;
  /** Button label (default "เปิดดูในระบบ"). */
  urlLabel?: string;
  /** Card header title (default "แจ้งเตือนทีมงาน Pacred"). */
  title?: string;
};

const SITE_BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://pacred.co.th").replace(/\/$/, "");

/** Resolve opts.url (absolute or "/relative") → https deep-link, or null. */
function resolveDeepLink(url?: string): string | null {
  if (!url) return null;
  const full = url.startsWith("http")
    ? url
    : `${SITE_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
  return full.startsWith("https://") ? full : null; // LINE uri buttons require https
}

/** Build a LINE Flex bubble: brand header · message body · deep-link button. */
function buildStaffCard(message: string, deepLink: string | null, opts: StaffGroupNotifyOpts) {
  const bodyLines = message
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((line) => ({ type: "text", text: line, size: "sm", color: "#333333", wrap: true }));

  const bubble: Record<string, unknown> = {
    type: "bubble",
    header: {
      type: "box", layout: "vertical", backgroundColor: "#B30000", paddingAll: "12px",
      contents: [{
        type: "text", text: opts.title || "แจ้งเตือนทีมงาน Pacred",
        color: "#FFFFFF", weight: "bold", size: "md", wrap: true,
      }],
    },
    body: { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: bodyLines },
  };

  if (deepLink) {
    bubble.footer = {
      type: "box", layout: "vertical", paddingAll: "10px",
      contents: [{
        type: "button", style: "primary", color: "#B30000", height: "sm",
        action: { type: "uri", label: (opts.urlLabel || "เปิดดูในระบบ").slice(0, 20), uri: deepLink },
      }],
    };
  }

  const altText = (message.split("\n")[0] || opts.title || "แจ้งเตือน Pacred").slice(0, 380);
  return { type: "flex", altText, contents: bubble };
}

/**
 * Push an alert to the internal staff LINE-OA group.
 * - `notifyStaffGroup(text)` → plain-text bubble (backward-compatible).
 * - `notifyStaffGroup(text, { url, urlLabel, title })` → a Flex card with a tappable
 *   deep-link button (url may be absolute https or an app-relative "/admin/…" path).
 * Returns true only when a real push was sent + accepted. Never throws.
 */
export async function notifyStaffGroup(
  message: string,
  opts: StaffGroupNotifyOpts = {},
): Promise<boolean> {
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

  const deepLink = resolveDeepLink(opts.url);
  // Send a Flex card when there's a deep-link or an explicit title; else plain text.
  const messages = deepLink || opts.title
    ? [buildStaffCard(message, deepLink, opts)]
    : [{ type: "text", text: message }];

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:  `Bearer ${token}`,
      },
      body: JSON.stringify({ to: groupId, messages }),
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

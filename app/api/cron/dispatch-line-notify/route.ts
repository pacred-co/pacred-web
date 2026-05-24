/**
 * GET /api/cron/dispatch-line-notify  — Sprint-2 P1.3
 *
 * Scans `notifications` rows that haven't been pushed via LINE Notify
 * yet and fans them out to each customer's connected LINE Notify
 * channel. Channel-aware: a row whose category is explicitly off on
 * `profiles.line_notify_channels` is skipped (the auto-recompute
 * model in `actions/line-notify.ts` defaults missing keys to opt-IN —
 * matches the legacy behaviour where any event triggers the single
 * token when set).
 *
 * Suggested schedule: `*​/2 * * * *` (every 2 minutes — keeps the
 * notification ↔ LINE Notify latency under 2 min without spamming the
 * upstream API). Configure in vercel.json + the admin /admin/system/
 * crons console.
 *
 * Legacy reference:
 *   pcsc/public_html/run-time/line/index.php — cron-triggered loop
 *   that walks tb_users with userLineNotify set + tb_notify_* tables
 *   and posts to notify-api.line.me/api/notify.
 *
 * Why this is a foundation: LINE Notify EOL April 2025. Long-term
 * replacement is LINE Messaging API per-user (already wired via
 * lib/notifications/index.ts). This cron exists to keep migrated
 * customers' connect-buttons functional during the transition.
 *
 * Server-only — uses createAdminClient to bypass RLS (the cron runs
 * as service_role, no customer session).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { instrumentCron } from "@/lib/cron/instrument";
import { pushToLineNotify } from "@/lib/notifications/line-notify";
import { logger } from "@/lib/logger";

// Max rows to process per cron tick. Caps DB scan + push fan-out so a
// backlog never causes the cron to time-out (Vercel cron has 60s
// limit). Backlog will drain across consecutive ticks.
const BATCH_LIMIT = 200;

// Map notifications.category → line_notify_channels key. The dispatcher
// consults the customer's channels map and skips the push if the key
// is explicitly false. Mirrors the labels in the LineNotifyPanel
// component on /profile.
const CATEGORY_TO_CHANNEL: Record<string, string> = {
  order:        "order_created",
  payment:      "payment_approved",
  forwarder:    "shipment_arrived",
  yuan_payment: "wallet_topup",
  wallet:       "wallet_topup",
  sales:        "wallet_refund",  // commission payout = inbound credit
  promo:        "promo",
  system:       "promo",          // catch-all bucket; rarely opt-out
};

export async function GET(request: Request) {
  return instrumentCron({
    cronPath: "/api/cron/dispatch-line-notify",
    request,
    handler: async () => {
      const admin = createAdminClient();

      // Step 1 — pull a page of pending notifications whose customer has a
      // LINE Notify token set. Inner join via profile_id; the partial
      // index from migration 0106 keeps this fast even at scale.
      type Row = {
        id:         string;
        profile_id: string;
        category:   string;
        title:      string;
        body:       string;
        link_href:  string | null;
        token:      string;
        channels:   Record<string, boolean> | null;
      };
      const { data: rows, error } = await admin
        .from("notifications")
        .select(
          "id, profile_id, category, title, body, link_href, " +
          "profiles!notifications_profile_id_fkey ( line_notify_token, line_notify_channels )",
        )
        .is("delivered_line_notify_at", null)
        .order("created_at", { ascending: true })
        .limit(BATCH_LIMIT);
      if (error) {
        logger.error("dispatch-line-notify", "scan failed", error);
        return {
          status:  "failure",
          summary: { scanned: 0, pushed: 0, skipped: 0, errors: 1 },
          payload: { ok: false, error: error.message },
        };
      }

      // The PostgREST join returns the profiles row as an object (1:1).
      // Filter out rows where the customer hasn't connected LINE Notify.
      type RawJoin = {
        id:         string;
        profile_id: string;
        category:   string;
        title:      string;
        body:       string;
        link_href:  string | null;
        profiles: {
          line_notify_token:    string | null;
          line_notify_channels: Record<string, boolean> | null;
        } | null;
      };
      const candidates: Row[] = ((rows ?? []) as unknown as RawJoin[])
        .filter((r) => Boolean(r.profiles?.line_notify_token))
        .map((r) => ({
          id:         r.id,
          profile_id: r.profile_id,
          category:   r.category,
          title:      r.title,
          body:       r.body,
          link_href:  r.link_href,
          token:      r.profiles!.line_notify_token!,
          channels:   r.profiles!.line_notify_channels,
        }));

      let pushed  = 0;
      let skipped = 0;
      let errors  = 0;

      // Step 2 — for each, check the channel toggle + push.
      for (const row of candidates) {
        const channelKey = CATEGORY_TO_CHANNEL[row.category] ?? row.category;
        const optedOut   = row.channels?.[channelKey] === false;
        if (optedOut) {
          // Stamp delivered_line_notify_at so the row doesn't re-enter
          // the scan window on every tick — explicit opt-out is a
          // permanent skip for this row.
          await admin
            .from("notifications")
            .update({ delivered_line_notify_at: new Date().toISOString() })
            .eq("id", row.id);
          skipped += 1;
          continue;
        }

        // Build the LINE message body. Title + body + optional link;
        // LINE Notify wraps at ~1000 chars so we don't truncate here.
        const lines = [`📦 ${row.title}`, row.body];
        if (row.link_href) {
          // Render full URL when SITE_URL is configured so the message
          // is tappable in LINE; otherwise drop the link line.
          const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
          if (base) lines.push(`${base}${row.link_href}`);
        }
        const message = lines.filter(Boolean).join("\n");

        // pushToLineNotify uses the customer's token (read via admin client
        // inside the helper). LINE_PUSH_BYPASS=true short-circuits with a
        // success log — safe default for dev.
        const ok = await pushToLineNotify(row.profile_id, message);
        if (ok) {
          const { error: updErr } = await admin
            .from("notifications")
            .update({ delivered_line_notify_at: new Date().toISOString() })
            .eq("id", row.id);
          if (updErr) {
            logger.warn("dispatch-line-notify", "stamp delivered_at failed", {
              notificationId: row.id, reason: updErr.message,
            });
            errors += 1;
          } else {
            pushed += 1;
          }
        } else {
          // Increment the delivery_attempts so a permanently-broken
          // token surfaces in the audit (token revoked on LINE side
          // → 401 from push → ok=false). The row stays unstamped so
          // the next tick retries; a future enhancement could nuke
          // the token after N failures.
          await admin
            .from("notifications")
            .update({ delivery_attempts: (1 as unknown as number) })
            .eq("id", row.id);
          errors += 1;
        }
      }

      const totalScanned = candidates.length;
      const overallStatus =
        errors > 0 && pushed === 0 ? "failure"
          : errors > 0 ? "partial"
          : "success";

      return {
        status:  overallStatus,
        summary: { scanned: totalScanned, pushed, skipped, errors },
        payload: { ok: errors === 0, scanned: totalScanned, pushed, skipped, errors },
      };
    },
  });
}

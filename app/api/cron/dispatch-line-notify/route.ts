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
import {
  clearLineNotifyToken,
  pushToLineNotify,
} from "@/lib/notifications/line-notify";
import { logger } from "@/lib/logger";

// Max rows to process per cron tick. Caps DB scan + push fan-out so a
// backlog never causes the cron to time-out (Vercel cron has 60s
// limit). Backlog will drain across consecutive ticks.
const BATCH_LIMIT = 200;

// After this many consecutive transient failures we give up on a row
// (stamp it as permanently-failed) so the cron doesn't keep retrying
// forever. The number matches the existing
// `notifications.delivery_attempts` counter — incremented each tick
// the row remains pending.
const MAX_FAILED_ATTEMPTS = 5;

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
        attempts:   number;
        token:      string;
        channels:   Record<string, boolean> | null;
      };
      const { data: rows, error } = await admin
        .from("notifications")
        .select(
          "id, profile_id, category, title, body, link_href, delivery_attempts, " +
          "profiles!notifications_profile_id_fkey ( line_notify_token, line_notify_channels )",
        )
        .is("delivered_line_notify_at", null)
        .lt("delivery_attempts", MAX_FAILED_ATTEMPTS)
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
        delivery_attempts: number | null;
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
          attempts:   r.delivery_attempts ?? 0,
          token:      r.profiles!.line_notify_token!,
          channels:   r.profiles!.line_notify_channels,
        }));

      let pushed       = 0;
      let skipped      = 0;
      let revoked      = 0;
      let transient    = 0;
      let permaFailed  = 0;
      // Profiles whose token we already nuked this tick — avoids racing
      // multiple notification rows against the same dead token (each
      // would otherwise issue its own UPDATE).
      const tokensNukedThisTick = new Set<string>();

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

        // pushToLineNotify returns a richer result so we can act on the
        // specific failure mode (revoked token = nuke; rate-limited =
        // leave alone; transient = bump attempts).
        const result = await pushToLineNotify(row.profile_id, message);

        if (result.ok) {
          const { error: updErr } = await admin
            .from("notifications")
            .update({ delivered_line_notify_at: new Date().toISOString() })
            .eq("id", row.id);
          if (updErr) {
            logger.warn("dispatch-line-notify", "stamp delivered_at failed", {
              notificationId: row.id, reason: updErr.message,
            });
            transient += 1;
          } else {
            pushed += 1;
          }
          continue;
        }

        // Failure path — branch by reason.
        if (result.reason === "token_revoked") {
          // Token dead upstream → nuke from profiles + mark the
          // current row as "no LINE Notify delivery possible" so it
          // never re-enters the scan. Skip subsequent rows for the
          // same profile in this tick (their token is also gone, but
          // the column read is cached from the join — clearing once
          // is enough; the next tick won't include them at all).
          if (!tokensNukedThisTick.has(row.profile_id)) {
            await clearLineNotifyToken(row.profile_id);
            tokensNukedThisTick.add(row.profile_id);
          }
          await admin
            .from("notifications")
            .update({
              delivered_line_notify_at: new Date().toISOString(),
              last_delivery_error:      "line_notify_token_revoked",
            })
            .eq("id", row.id);
          revoked += 1;
          continue;
        }

        if (result.reason === "rate_limited") {
          // Upstream throttle — DON'T bump attempts (not the customer's
          // fault, not a permanent failure). Row stays unstamped → next
          // tick retries naturally after the rate-limit window expires.
          transient += 1;
          continue;
        }

        if (result.reason === "no_token") {
          // Shouldn't happen — the scan filter only selects rows whose
          // joined profile has a token. Defensive: stamp so we don't
          // loop, but log loudly.
          logger.warn("dispatch-line-notify", "no_token from joined-token row", {
            notificationId: row.id,
          });
          await admin
            .from("notifications")
            .update({ delivered_line_notify_at: new Date().toISOString() })
            .eq("id", row.id);
          skipped += 1;
          continue;
        }

        // transient_http / throw → bump attempts. After
        // MAX_FAILED_ATTEMPTS the scan filter drops this row from
        // future ticks (lt-filter); stamp `last_delivery_error` for
        // ops visibility on the permanent-fail set.
        const nextAttempts = row.attempts + 1;
        const stampNow     = nextAttempts >= MAX_FAILED_ATTEMPTS;
        await admin
          .from("notifications")
          .update({
            delivery_attempts:        nextAttempts,
            last_delivery_error:      result.reason === "throw"
              ? "push_threw"
              : `http_${result.httpStatus ?? "unknown"}`,
            // Permanent-fail rows ALSO get stamped delivered_at so
            // they leave the scan window entirely — keeps the
            // partial-index from migration 0106 small.
            ...(stampNow ? { delivered_line_notify_at: new Date().toISOString() } : {}),
          })
          .eq("id", row.id);
        if (stampNow) permaFailed += 1;
        else          transient   += 1;
      }

      const totalScanned    = candidates.length;
      const irrecoverable   = revoked + permaFailed;  // rows we'll never retry
      const overallStatus =
        irrecoverable > 0 && pushed === 0 ? "failure"
          : (irrecoverable > 0 || transient > 0) ? "partial"
          : "success";

      return {
        status:  overallStatus,
        summary: { scanned: totalScanned, pushed, skipped, revoked, transient, permaFailed },
        payload: {
          ok:          irrecoverable === 0 && transient === 0,
          scanned:     totalScanned,
          pushed,
          skipped,
          revoked,
          transient,
          permaFailed,
        },
      };
    },
  });
}

/**
 * LINE Notify per-user OAuth settings page (Gap #3 — D1).
 *
 * Connects a customer's personal LINE Notify so they receive order /
 * import / payment / refund status updates pushed straight to their LINE.
 * Mirrors legacy `member/line-notify.php` (the connect / disconnect screen
 * the existing 8,898 migrated PCS customers know).
 *
 * Three states this Server Component renders, driven entirely by the
 * `profiles` row of the signed-in user:
 *
 *   1. NOT connected (line_notify_token IS NULL):
 *      → "เชื่อมต่อ LINE Notify" green CTA. Click → server action
 *        getLineOAuthAuthorizeUrl() → window.location to the LINE Notify
 *        OAuth authorize URL → LINE redirects to /api/linenotify/callback
 *        → here with ?status=connected (or ?status=error&reason=...).
 *
 *   2. CONNECTED (line_notify_token IS NOT NULL):
 *      → "✓ เชื่อมต่อแล้ว" status banner + the connected-at timestamp
 *        + a channels checkbox group (4 categories: order / import /
 *        payment / refund) + a red "ยกเลิกการเชื่อมต่อ" CTA. The disconnect
 *        button is a Server Action (disconnectLineNotify) and the channels
 *        save is a Server Action (updateLineNotifyChannels).
 *
 *   3. POST-CALLBACK flash (URL has ?status=connected or
 *      ?status=error&reason=<key>): banner above the main card.
 *
 * Mobile-first per docs/conventions.md §11 — single column at 360/390px,
 * tap targets ≥ 44px (the connect + disconnect CTAs are `py-3 text-base`
 * → 48px tall), body text ≥ 16px (`text-base`).
 *
 * ⚠️ LINE Notify EOL April 2025 — this page is a TRANSITION surface.
 * The long-term replacement is LINE Messaging API per-user push
 * (lib/notifications/index.ts; populated via /liff/link). Both can coexist;
 * once Messaging-API adoption is high enough, this page retires + the
 * connect-button hides itself when LINE_NOTIFY_CLIENT_ID is unset.
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createClient } from "@/lib/supabase/server";
import { LineNotifySettingsForm } from "@/components/line-notify/settings-form";

// The (protected) layout requires the user be signed in; we additionally
// read the LINE Notify columns straight from `profiles` so this page
// always sees the latest connect state (no caching gotchas after the
// callback redirect).
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string; reason?: string }>;

// Canonical list of LINE Notify channel keys the UI exposes. Kept here
// (not in lib/) because the dispatcher reads/writes `line_notify_channels`
// as freeform jsonb — this list is the UI's opinion about which events
// matter to a customer, NOT a schema constraint. Adding a 5th category
// later means adding a row here + the matching i18n key, no migration.
const CHANNEL_KEYS = [
  "order_updates",
  "import_updates",
  "payment_updates",
  "refund_updates",
] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

export default async function LineNotifySettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const t = await getTranslations("lineNotify");
  const { user } = await requireAuth();

  // Read the LINE Notify columns from `profiles`. Owner-scoped client so
  // RLS guards against another user's row sneaking through. We do NOT
  // expose `line_notify_token` to the client — only whether it's set
  // (`isConnected`), the connected-at timestamp, and the channel map.
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("line_notify_token, line_notify_connected_at, line_notify_channels")
    .eq("id", user.id)
    .maybeSingle<{
      line_notify_token: string | null;
      line_notify_connected_at: string | null;
      line_notify_channels: Record<string, boolean> | null;
    }>();

  const isConnected = Boolean(profile?.line_notify_token);
  const connectedAt = profile?.line_notify_connected_at ?? null;

  // Build the channel map the form starts from — missing key = opt-in by
  // default (matches the opt-out semantics documented on migration 0101
  // `line_notify_channels`). Initial seed: all four channels checked.
  const stored = profile?.line_notify_channels ?? {};
  const channels: Record<ChannelKey, boolean> = Object.fromEntries(
    CHANNEL_KEYS.map((k) => [k, stored[k] !== false]),
  ) as Record<ChannelKey, boolean>;

  // ?status=connected | error flash banner (URL set by the callback route).
  const sp = await searchParams;
  const flashStatus = sp.status === "connected" || sp.status === "error" ? sp.status : null;
  const flashReason = sp.reason ?? null;

  // Whether the connect-button is even available — when env credentials
  // are missing the authorize-URL builder throws, so we gate the button
  // at render time to avoid a broken UX. The full check happens server-
  // side inside `getLineOAuthAuthorizeUrl` (returns
  // `error: "line_notify_unavailable"`); this is a UI-friendly hint.
  const lineNotifyAvailable = Boolean(process.env.LINE_NOTIFY_CLIENT_ID);

  return (
    <main className="mx-auto w-full max-w-[640px] px-4 py-8 space-y-6">
      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          {t("kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </header>

      {/* Flash banner from ?status= */}
      {flashStatus === "connected" && (
        <div
          role="status"
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          <strong className="font-semibold">{t("flashConnectedTitle")}</strong>
          <br />
          {t("flashConnectedBody")}
        </div>
      )}
      {flashStatus === "error" && (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          <strong className="font-semibold">{t("flashErrorTitle")}</strong>
          <br />
          {flashReason === "denied"
            ? t("flashErrorDenied")
            : t("flashErrorGeneric", { reason: flashReason ?? "unknown" })}
        </div>
      )}

      {/* Main card */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-sm">
        <LineNotifySettingsForm
          isConnected={isConnected}
          connectedAt={connectedAt}
          channels={channels}
          channelKeys={[...CHANNEL_KEYS]}
          lineNotifyAvailable={lineNotifyAvailable}
        />
      </section>

      {/* EOL transition notice — gives the customer context for why this
          extra channel exists alongside the Messaging-API OA push. */}
      <p className="text-xs text-muted">{t("eolNote")}</p>

      <div>
        <Link
          href="/dashboard"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          {t("backToDashboard")}
        </Link>
      </div>
    </main>
  );
}

"use client";

/**
 * LINE Notify settings client surface (Gap #3 — D1).
 *
 * Three behaviours, all powered by the server actions in actions/line-notify.ts:
 *
 *   1. CONNECT — calls getLineOAuthAuthorizeUrl() which mints a CSRF state
 *      cookie + returns the authorize URL; we `window.location` to it so
 *      the browser follows the OAuth round-trip. The callback handler
 *      (app/api/linenotify/callback/route.ts) brings the user back here
 *      with ?status=connected | error.
 *
 *   2. DISCONNECT — calls disconnectLineNotify() which revokes the token
 *      upstream + NULLs the columns. On success we router.refresh() so the
 *      page re-reads the now-empty profile + flips back to the connect view.
 *
 *   3. CHANNELS — checkbox group; the four flags are persisted to
 *      profiles.line_notify_channels via updateLineNotifyChannels(). Save
 *      is optimistic with explicit feedback — the dispatcher cron uses
 *      the value on its next tick (no realtime push triggered here).
 *
 * Why a client component: server actions can only be invoked from event
 * handlers (the connect URL needs a window.location, channels need
 * controlled inputs). The server component (page.tsx) renders the chrome
 * and passes the initial state.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  getLineOAuthAuthorizeUrl,
  disconnectLineNotify,
  updateLineNotifyChannels,
} from "@/actions/line-notify";

type ChannelKey = string;

type Props = {
  isConnected: boolean;
  connectedAt: string | null;
  channels: Record<ChannelKey, boolean>;
  channelKeys: ChannelKey[];
  /** False when LINE_NOTIFY_CLIENT_ID env is unset — disable connect CTA. */
  lineNotifyAvailable: boolean;
};

export function LineNotifySettingsForm({
  isConnected,
  connectedAt,
  channels: initialChannels,
  channelKeys,
  lineNotifyAvailable,
}: Props) {
  const t = useTranslations("lineNotify");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channels, setChannels] = useState(initialChannels);
  const [channelsDirty, setChannelsDirty] = useState(false);
  const [feedback, setFeedback] = useState<
    | null
    | { kind: "ok" | "err"; key: string }
  >(null);

  // ── CONNECT ────────────────────────────────────────────────────────
  function onConnect() {
    setFeedback(null);
    startTransition(async () => {
      const res = await getLineOAuthAuthorizeUrl();
      if (!res.ok) {
        setFeedback({ kind: "err", key: res.error });
        return;
      }
      // `data` is typed Optional on the success branch (shared ActionResult<T>
      // shape uses `data?: T`) — defend against an unexpected empty payload
      // so we don't `undefined.url` in a generated build.
      if (!res.data?.url) {
        setFeedback({ kind: "err", key: "line_notify_unavailable" });
        return;
      }
      // Full-page navigation — the OAuth round-trip MUST be a top-level
      // navigation so the LINE Notify domain can render its consent UI.
      window.location.href = res.data.url;
    });
  }

  // ── DISCONNECT ─────────────────────────────────────────────────────
  function onDisconnect() {
    if (!confirm(t("disconnectConfirm"))) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await disconnectLineNotify();
      if (!res.ok) {
        setFeedback({ kind: "err", key: res.error });
        return;
      }
      // Refresh the page to re-read the (now NULL) token column and flip
      // back to the connect view.
      router.refresh();
    });
  }

  // ── CHANNELS ───────────────────────────────────────────────────────
  function onToggleChannel(key: ChannelKey) {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
    setChannelsDirty(true);
    setFeedback(null);
  }

  function onSaveChannels() {
    setFeedback(null);
    startTransition(async () => {
      const res = await updateLineNotifyChannels(channels);
      if (!res.ok) {
        setFeedback({ kind: "err", key: res.error });
        return;
      }
      setChannelsDirty(false);
      setFeedback({ kind: "ok", key: "channelsSaved" });
    });
  }

  // ── RENDER ─────────────────────────────────────────────────────────
  if (!isConnected) {
    // NOT-connected state — connect CTA + the marketing blurb.
    return (
      <div className="space-y-4 text-center">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          aria-hidden
        >
          <LineIcon className="h-8 w-8" />
        </div>

        <h2 className="text-lg font-semibold text-foreground">
          {t("notConnectedTitle")}
        </h2>
        <p className="text-sm text-muted">{t("notConnectedBlurb")}</p>

        {!lineNotifyAvailable && (
          <p className="text-xs text-rose-600">{t("unavailable")}</p>
        )}

        <Button
          type="button"
          size="lg"
          fullWidth
          onClick={onConnect}
          disabled={pending || !lineNotifyAvailable}
          // Brand-style green — LINE green so the connect button reads as
          // "LINE-y" rather than the Pacred primary red.
          className="!bg-emerald-500 hover:!bg-emerald-600"
        >
          <LineIcon className="h-5 w-5" />
          {pending ? t("connecting") : t("connect")}
        </Button>

        {feedback && (
          <p
            className={`text-xs ${
              feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
            }`}
            role={feedback.kind === "err" ? "alert" : "status"}
          >
            {translateFeedback(t, feedback.key)}
          </p>
        )}
      </div>
    );
  }

  // CONNECTED state — status banner + channels + disconnect.
  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className="flex items-start gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span aria-hidden className="text-lg leading-none">
          ✓
        </span>
        <div className="flex-1">
          <p className="font-semibold">{t("connectedTitle")}</p>
          {connectedAt && (
            <p className="text-xs text-emerald-800/80 mt-0.5">
              {t("connectedAt", { when: formatDateTime(connectedAt, locale) })}
            </p>
          )}
        </div>
      </div>

      {/* Channels */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          {t("channelsLegend")}
        </legend>
        <p className="text-xs text-muted -mt-1">{t("channelsBlurb")}</p>
        <div className="space-y-2">
          {channelKeys.map((key) => (
            <label
              key={key}
              className="flex items-start gap-3 rounded-lg border border-border px-3 py-3 cursor-pointer hover:bg-surface-alt/40 transition-colors"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-5 w-5 rounded border-border text-primary-600 focus:ring-primary-500"
                checked={Boolean(channels[key])}
                onChange={() => onToggleChannel(key)}
                disabled={pending}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {t(`channel.${key}.label`)}
                </p>
                <p className="text-xs text-muted">
                  {t(`channel.${key}.desc`)}
                </p>
              </div>
            </label>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={onSaveChannels}
          disabled={pending || !channelsDirty}
        >
          {pending ? t("saving") : t("saveChannels")}
        </Button>
      </fieldset>

      {/* Disconnect */}
      <div className="pt-2 border-t border-border">
        <Button
          type="button"
          size="lg"
          fullWidth
          onClick={onDisconnect}
          disabled={pending}
          // Rose / "danger" tone — making this look like a destructive action
          // so customers don't tap it casually.
          className="!bg-rose-500 hover:!bg-rose-600 text-white"
        >
          {pending ? t("disconnecting") : t("disconnect")}
        </Button>
      </div>

      {feedback && (
        <p
          className={`text-xs text-center ${
            feedback.kind === "ok" ? "text-emerald-700" : "text-rose-700"
          }`}
          role={feedback.kind === "err" ? "alert" : "status"}
        >
          {translateFeedback(t, feedback.key)}
        </p>
      )}
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Pick a translation for the action-result key. Maps the known server-
 * action error strings to friendly TH/EN copy; unknown keys fall back to
 * the generic "ลองอีกครั้ง" / "Please try again" message so we never blank
 * out the user.
 */
function translateFeedback(t: (key: string) => string, key: string): string {
  const known = [
    "channelsSaved",
    "not_signed_in",
    "line_notify_unavailable",
    "read_failed",
    "update_failed",
    "invalid_channels",
    "rate_limit",
  ];
  if (known.includes(key)) {
    return t(`feedback.${key}`);
  }
  return t("feedback.generic");
}

function formatDateTime(iso: string, locale: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale === "th" ? "th-TH" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Inline LINE wordmark — kept here so the connect button has a recognisable
 *  brand glyph without an extra image asset round-trip. Geometric stand-in
 *  for the official LINE Notify mascot (we can't ship the LINE logo without
 *  brand approval); reads as a chat-bubble + check, which matches the action. */
function LineIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

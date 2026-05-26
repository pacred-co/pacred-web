"use client";

/**
 * Client surface for the /line-settings page (task L, 2026-05-26).
 *
 * Two behaviours:
 *   1. CONNECT (isLinked=false) — render a primary CTA that navigates to
 *      the LIFF URL. On desktop the LINE Login page opens (full-page
 *      navigation; LIFF handles the redirect back to /liff/link after
 *      OAuth). Inside the LINE in-app browser (mobile) the same URL
 *      stays in-place. Either way the page is replaced — no popup, no
 *      window.open ambiguity.
 *   2. DISCONNECT (isLinked=true) — confirm + call disconnectLineAccount.
 *      On success we router.refresh() so the server re-renders the
 *      "not connected" branch.
 *
 * Why a client component:
 *   - The disconnect needs a `confirm()` dialog + a transition wrapper
 *     for the spinner state.
 *   - The connect CTA could be a plain <a> in the server component, but
 *     keeping both branches inside one client component makes the UI a
 *     single mental model (and the confirm-and-feedback path lives next
 *     to the navigate path).
 *
 * Mobile-first per docs/conventions.md §11 — full-width buttons, 48px tall
 * (`size="lg"` → py-3 text-base = 48px tap target).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { disconnectLineAccount } from "@/actions/line-settings";

export function LineSettingsActions({
  isLinked,
  liffUrl,
}: {
  isLinked: boolean;
  liffUrl: string;
}) {
  const t = useTranslations("lineSettings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<
    | null
    | { kind: "ok" | "err"; message: string }
  >(null);

  function onConnect() {
    setFlash(null);
    // Full-page navigation — LIFF needs the URL change to happen at the
    // top level so the LINE Login flow can render its consent UI. Using
    // window.location instead of <Link> because the LIFF URL is external
    // to the next-intl router. Same-window so the in-app browser
    // (mobile) doesn't open a new tab the user can't easily close.
    window.location.href = liffUrl;
  }

  function onDisconnect() {
    setFlash(null);
    if (!window.confirm(t("disconnectConfirm"))) return;
    startTransition(async () => {
      const res = await disconnectLineAccount();
      if (res.ok) {
        setFlash({ kind: "ok", message: t("flashDisconnected") });
        // Re-render the Server Component so it picks up the now-null
        // line_user_id and flips to the "not connected" branch.
        router.refresh();
      } else {
        // Map a few known error codes to friendly TH/EN; fall back to
        // the raw message so we never lose debug context.
        const map: Record<string, string> = {
          rate_limit:                       t("errRateLimit"),
          not_signed_in:                    t("errNotSignedIn"),
          cannot_write_during_impersonation:t("errImpersonation"),
        };
        setFlash({
          kind:    "err",
          message: map[res.error] ?? res.error,
        });
      }
    });
  }

  return (
    <div className="space-y-3">
      {flash && (
        <div
          role={flash.kind === "ok" ? "status" : "alert"}
          className={`rounded-lg px-4 py-3 text-sm ${
            flash.kind === "ok"
              ? "border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
              : "border border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100"
          }`}
        >
          {flash.message}
        </div>
      )}

      {isLinked ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          fullWidth
          onClick={onDisconnect}
          disabled={pending}
        >
          {pending ? t("disconnecting") : t("disconnectButton")}
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          size="lg"
          fullWidth
          onClick={onConnect}
        >
          {t("connectButton")}
        </Button>
      )}
    </div>
  );
}

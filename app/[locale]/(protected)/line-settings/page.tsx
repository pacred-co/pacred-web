/**
 * /line-settings — customer-facing LINE account-link settings page (task L, 2026-05-26).
 *
 * Replaces the dead LINE Notify integration (notify-bot.line.me EOL'd
 * 2025-03-31). The new flow:
 *
 *   1. Customer hits this page from a banner / direct link.
 *   2. If not linked → green CTA "เชื่อมต่อ LINE" → navigates to the LIFF
 *      URL (https://liff.line.me/<LIFF_ID>) which is what /liff/link picks
 *      up. The LIFF page captures liff.getProfile().userId + displayName,
 *      writes them via actions/line-settings.ts, and returns the user
 *      here so they see the "✓ เชื่อมต่อแล้ว" state on next render.
 *   3. If linked → status banner + "ยกเลิกการเชื่อมต่อ" button (calls
 *      disconnectLineAccount).
 *
 * Why a (protected) page (not /liff/link itself):
 *   • LINE Login may strip the Pacred session cookie inside its in-app
 *     webview, so the LIFF page lives under (public) and re-confirms the
 *     session via the server action.  THIS page is the persistent home
 *     the customer can re-visit to see status / disconnect — it needs
 *     the (protected) auth gate.
 *
 * Mobile-first per docs/conventions.md §11. The single-column max-w-[640px]
 * layout + 48px-tall buttons render cleanly at 360/390px viewports.
 *
 * `force-dynamic` because the connected-state is per-user + must show the
 * fresh post-link state immediately when the customer returns from /liff/link.
 */

import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { LineSettingsActions } from "./line-settings-actions";

export const dynamic = "force-dynamic";

/**
 * LIFF id — read from env with the same hardcoded fallback the /liff/link
 * page uses (owner directive: tracking + integration IDs embedded in code,
 * env override supported for dev/staging). The Pacred LIFF app —
 * see developers.line.biz → channel 2010105778 → LIFF.
 */
const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "2010105778-SaSkkGza";

export default async function LineSettingsPage() {
  const t = await getTranslations("lineSettings");
  // requireAuth() handles the /login + /complete-profile redirects; profile
  // is guaranteed non-null after this returns when the status isn't incomplete.
  const { profile } = await requireAuth();

  const isLinked = !!profile?.line_user_id;
  const linkedAt = profile?.line_linked_at ?? null;

  // Pre-format the linked-at timestamp on the server so the page never
  // hydrates an SSR/CSR mismatch from differing toLocaleDateString locales.
  const linkedAtLabel = linkedAt
    ? new Date(linkedAt).toLocaleString("th-TH", {
        year:   "numeric",
        month:  "short",
        day:    "numeric",
        hour:   "2-digit",
        minute: "2-digit",
      })
    : null;

  // The LIFF URL the connect CTA navigates to. https://liff.line.me/<id>
  // works in both the LINE in-app browser (opens in same window) and on
  // desktop (opens LINE Login on the channel; if user has LINE installed,
  // LINE app handles the OAuth; otherwise the LINE web login is used).
  const liffUrl = `https://liff.line.me/${LIFF_ID}`;

  return (
    <main className="app-content content" style={{ paddingTop: 0 }}>
      <div className="content-overlay" />
      <div className="content-wrapper">
        <div className="content-body">
          <div className="mx-auto w-full max-w-[640px] px-4 py-6 space-y-5">
            {/* Header */}
            <header>
              <p className="text-xs font-semibold tracking-widest text-primary-500">
                {t("kicker")}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-foreground">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-foreground/70">
                {t("subtitle")}
              </p>
            </header>

            {/* Status + action card */}
            <section className="rounded-2xl border border-border bg-white p-5 shadow-sm dark:bg-surface">
              {isLinked ? (
                <div className="space-y-4">
                  <div
                    role="status"
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                  >
                    <strong className="font-semibold">
                      {t("statusConnectedTitle")}
                    </strong>
                    {linkedAtLabel && (
                      <>
                        <br />
                        <span className="text-emerald-800 dark:text-emerald-200">
                          {t("statusConnectedAt", { date: linkedAtLabel })}
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-sm text-foreground/80">
                    {t("connectedBody")}
                  </p>

                  {/* Disconnect surface — client component, calls the
                      disconnectLineAccount server action. */}
                  <LineSettingsActions isLinked={true} liffUrl={liffUrl} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    role="status"
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
                  >
                    <strong className="font-semibold">
                      {t("statusNotConnectedTitle")}
                    </strong>
                    <br />
                    <span>{t("statusNotConnectedBody")}</span>
                  </div>

                  {/* Step-by-step copy — the customer needs to friend the
                      Pacred OA BEFORE linking (so we can actually push to
                      them after the link). */}
                  <ol className="list-decimal pl-5 text-sm text-foreground/80 space-y-1">
                    <li>
                      {t.rich("stepFriend", {
                        a: (chunks) => (
                          <Link
                            href="/line"
                            className="font-semibold text-primary-600 underline-offset-4 hover:underline"
                          >
                            {chunks}
                          </Link>
                        ),
                      })}
                    </li>
                    <li>{t("stepClickConnect")}</li>
                    <li>{t("stepApproveOnLine")}</li>
                  </ol>

                  <LineSettingsActions isLinked={false} liffUrl={liffUrl} />
                </div>
              )}
            </section>

            {/* EOL transition notice — gives the customer context for why
                this surface exists (replacing the dead LINE Notify). */}
            <p className="text-xs text-foreground/60">
              {t("eolNote")}
            </p>

            <div className="pt-2">
              <Link
                href="/dashboard"
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                {t("backToDashboard")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

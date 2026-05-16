"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { acceptCurrentTos } from "@/actions/tos";
import { CURRENT_TOS_VERSION } from "@/lib/tos";

/**
 * Blocking modal shown when the signed-in user hasn't accepted the
 * current TOS version. Rendered by the (protected) layout — refuses
 * to dismiss until the user clicks accept.
 *
 * V-G4.1 — accepts dynamic version + optional body_md from DB:
 *   - versionNo: the active version label (from getActiveTosVersion)
 *   - title:     optional display title (DB row's title)
 *   - bodyMd:    optional markdown body — if present, rendered as
 *                pre-formatted text inside the modal. If absent, falls
 *                back to the i18n hardcoded summary (existing behavior).
 *
 * When all 3 are null, behaves exactly like pre-V-G4.1 (uses i18n strings
 * + CURRENT_TOS_VERSION constant).
 */
type Props = {
  versionNo?: string;
  title?:     string | null;
  bodyMd?:    string | null;
};

export function TosGate({ versionNo, title, bodyMd }: Props = {}) {
  const t = useTranslations("tos");
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const displayVersion = versionNo ?? CURRENT_TOS_VERSION;
  const hasDbContent = !!bodyMd;

  function onAccept() {
    if (!agreed) return;
    setError(null);
    startTransition(async () => {
      const res = await acceptCurrentTos();
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="max-w-2xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-surface shadow-2xl">
        <div className="p-6 sm:p-8 space-y-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              {t("kicker")}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-foreground">
              {title ?? t("title")}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {t("version", { version: displayVersion })}
            </p>
          </div>

          {hasDbContent ? (
            <div className="rounded-lg border border-border bg-surface-alt/30 p-4 text-sm leading-relaxed max-h-60 overflow-y-auto">
              {/* V-G4.1: render DB body_md as pre-formatted text. A future
                  V-G4.2 can add proper markdown→HTML rendering (with sanitiser);
                  V1 keeps it plain to avoid XSS surface + dependency creep. */}
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{bodyMd}</pre>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-surface-alt/30 p-4 text-sm leading-relaxed max-h-60 overflow-y-auto">
              <p className="font-semibold mb-2">{t("header")}</p>
              <p className="text-muted">{t("intro")}</p>
              <ol className="mt-3 list-decimal pl-5 space-y-2 text-muted">
                <li>{t("item1")}</li>
                <li>{t("item2")}</li>
                <li>{t("item3")}</li>
                <li>{t("item4")}</li>
                <li>{t("item5")}</li>
              </ol>
              <p className="mt-3 text-xs text-muted/80">
                {t.rich("fullTextLink", {
                  link: () => (
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-500 hover:underline"
                    >
                      /terms
                    </a>
                  ),
                })}
              </p>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-foreground">
              {t.rich("agreeLabel", {
                terms:   (chunks) => <strong>{chunks}</strong>,
                privacy: (chunks) => <strong>{chunks}</strong>,
              })}
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {t("errorPrefix")} {error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={onAccept} disabled={!agreed || pending}>
              {pending ? t("saving") : t("acceptButton")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

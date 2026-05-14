"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { linkLineAccount } from "@/actions/profile";

/**
 * Client half of /liff/link — handles the actual @line/liff dance.
 *
 * Why a separate client component:
 * - `liff.init()` only works in the browser (SDK touches window/document).
 * - Server action `linkLineAccount` is invoked client-side after we have
 *   the LIFF profile.userId in hand.
 *
 * SDK error codes we care about (from @line/liff docs):
 *   - INIT_FAILED        — bad LIFF ID / network
 *   - FORBIDDEN          — user denied profile scope
 *   - INVALID_CONFIG     — missing/wrong scopes in console
 *   - UNAUTHORIZED       — token expired (rare)
 * Anything else is reported as a generic error so we don't leak internals.
 *
 * The page is also useful when liffId is unset (dev) — in that case we
 * surface a "ระบบยังไม่พร้อม" notice instead of crashing on init.
 */

type Status =
  | { kind: "boot" }
  | { kind: "needs_liff_id" }
  | { kind: "needs_login" }     // call liff.login()
  | { kind: "ready"; lineUserId: string; displayName: string }
  | { kind: "linking" }
  | { kind: "linked"; displayName: string }
  | { kind: "already_linked" }
  | { kind: "error"; message: string };

export function LinkLineClient({
  liffId,
  alreadyLinked,
  accountLabel,
}: {
  liffId: string | null;
  alreadyLinked: boolean;
  accountLabel: string;
}) {
  const t = useTranslations("liff");
  // Compute the initial status from props rather than mutating it inside the
  // effect — React Compiler / react-hooks/set-state-in-effect rule rejects
  // synchronous setState in an effect body, and this state is purely derived.
  const [status, setStatus] = useState<Status>(() =>
    alreadyLinked
      ? { kind: "already_linked" }
      : !liffId
        ? { kind: "needs_liff_id" }
        : { kind: "boot" },
  );
  const [, startTransition] = useTransition();
  // Guard against StrictMode double-effect calling liff.init twice — the
  // SDK throws on re-init.
  const initOnce = useRef(false);

  useEffect(() => {
    // Already-linked / no-LIFF-ID branches were handled by initial state;
    // skip the SDK dance entirely.
    if (alreadyLinked || !liffId || initOnce.current) return;

    initOnce.current = true;

    void (async () => {
      try {
        // Dynamic import keeps the LIFF SDK out of the rest-of-app bundle.
        const liffModule = await import("@line/liff");
        const liff = liffModule.default;

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          setStatus({ kind: "needs_login" });
          // Auto-trigger login — there's nothing else to do on this page.
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const profile = await liff.getProfile();
        setStatus({
          kind: "ready",
          lineUserId: profile.userId,
          displayName: profile.displayName ?? "",
        });
      } catch (err: unknown) {
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message: unknown }).message)
            : "init_failed";
        setStatus({ kind: "error", message });
      }
    })();
  }, [liffId, alreadyLinked]);

  function onLink() {
    if (status.kind !== "ready") return;
    const userId = status.lineUserId;
    const name = status.displayName;
    setStatus({ kind: "linking" });
    startTransition(async () => {
      const res = await linkLineAccount(userId);
      if (res.ok) {
        setStatus({ kind: "linked", displayName: name });
      } else {
        setStatus({ kind: "error", message: res.error });
      }
    });
  }

  async function closeLiff() {
    try {
      const liff = (await import("@line/liff")).default;
      if (liff.isInClient()) liff.closeWindow();
      else window.location.href = "/profile";
    } catch {
      window.location.href = "/profile";
    }
  }

  // ──────────────────────────────────────────── UI states
  if (status.kind === "already_linked") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">{t("alreadyLinkedBody")}</p>
        <Button type="button" variant="outline" onClick={closeLiff}>
          {t("backToProfile")}
        </Button>
      </div>
    );
  }

  if (status.kind === "needs_liff_id") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {t("liffIdMissing")}
        </p>
        <p className="text-xs text-muted">{t("liffIdMissingHint")}</p>
      </div>
    );
  }

  if (status.kind === "boot" || status.kind === "needs_login") {
    return <p className="text-sm text-muted">{t("initializing")}</p>;
  }

  if (status.kind === "ready") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          {t("readyBody", { lineName: status.displayName, account: accountLabel })}
        </p>
        <Button type="button" onClick={onLink}>
          {t("confirmLink")}
        </Button>
      </div>
    );
  }

  if (status.kind === "linking") {
    return <p className="text-sm text-muted">{t("linking")}</p>;
  }

  if (status.kind === "linked") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          {t("linkedBody", { lineName: status.displayName })}
        </p>
        <Button type="button" variant="outline" onClick={closeLiff}>
          {t("done")}
        </Button>
      </div>
    );
  }

  // status.kind === "error"
  return (
    <div className="space-y-2">
      <p className="text-sm text-red-600 dark:text-red-400">
        {t("errorPrefix")}: {translateError(status.message, t)}
      </p>
      <p className="text-xs text-muted">{t("errorHint")}</p>
    </div>
  );
}

function translateError(code: string, t: ReturnType<typeof useTranslations>): string {
  // Surface known server-action codes as friendly Thai/EN messages; fall back
  // to the raw code so we don't lose debug context.
  switch (code) {
    case "line_already_linked":
      return t("errAlreadyLinked");
    case "invalid_line_user_id":
      return t("errInvalidUserId");
    case "not_signed_in":
      return t("errNotSignedIn");
    default:
      return code;
  }
}

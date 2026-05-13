"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { updatePasswordAfterRecovery } from "@/actions/auth";

type Props = {
  email: string | null;
};

export function ResetPasswordForm({ email }: Props) {
  const t = useTranslations("forgot_password");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await updatePasswordAfterRecovery(password);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-6 text-center">
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          {t("kicker")}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">
          {t("resetTitle")}
        </h1>
        {email && (
          <p className="mt-2 text-sm text-muted">
            {t("resetSubtitle", { email })}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            {t("newPasswordLabel")}
            <span className="ml-0.5 text-red-600">*</span>
          </span>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              placeholder="••••••••"
              minLength={6}
              maxLength={30}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
            >
              {showPwd ? t("hide") : t("show")}
            </button>
          </div>
          <span className="block text-xs text-muted">{t("passwordHint")}</span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Button
          type="button"
          onClick={onSubmit}
          disabled={pending || password.length < 6}
          fullWidth
          size="lg"
        >
          {pending ? t("saving") : t("confirmReset")}
        </Button>
      </div>
    </>
  );
}

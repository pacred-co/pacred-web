"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { changePassword } from "@/actions/security";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function SecurityPanel() {
  const t = useTranslations("profile");
  const [current, setCurrent] = useState("");
  const [next, setNext]       = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const res = await changePassword({
        currentPassword: current,
        newPassword:     next,
        confirmPassword: confirm,
      });
      if (res.ok) {
        setSuccess(true);
        setCurrent(""); setNext(""); setConfirm("");
        setTimeout(() => setSuccess(false), 4000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t("sectionSecurity")}</h2>
        <p className="text-sm text-muted">{t("securityDesc")}</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{t("passwordChanged")}</div>}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("currentPassword")}<span className="text-red-600 ml-0.5">*</span></span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} required autoComplete="current-password" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("newPassword")}<span className="text-red-600 ml-0.5">*</span></span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} required minLength={6} maxLength={30} autoComplete="new-password" />
        <span className="block text-xs text-muted">{t("newPasswordHint")}</span>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t("confirmPassword")}<span className="text-red-600 ml-0.5">*</span></span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} required autoComplete="new-password" />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/profile/security/change-phone"
          className="text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          {t("changePhoneLink")}
        </Link>
        <Button type="submit" disabled={pending || !current || !next || !confirm}>
          {pending ? t("saving") : t("changePassword")}
        </Button>
      </div>
    </form>
  );
}

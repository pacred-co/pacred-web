"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { completeProfile } from "@/actions/profile";

type Props = {
  initial: {
    first_name: string;
    last_name: string;
    phone: string;
    sex: "male" | "female" | "other" | "";
    birthday: string;
  };
  juristicSwitchHref: string;
};

export function CompleteProfileForm({ initial, juristicSwitchHref }: Props) {
  const t = useTranslations("complete_profile");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    const sexRaw = String(formData.get("sex") ?? "");
    const birthdayRaw = String(formData.get("birthday") ?? "");
    startTransition(async () => {
      const res = await completeProfile({
        first_name: String(formData.get("first_name") ?? ""),
        last_name:  String(formData.get("last_name") ?? ""),
        phone:      String(formData.get("phone") ?? ""),
        sex:        sexRaw === "male" || sexRaw === "female" || sexRaw === "other" ? sexRaw : undefined,
        birthday:   birthdayRaw,
        agreed:     formData.get("agreed") === "on",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("firstName")} required>
          <input
            name="first_name"
            defaultValue={initial.first_name}
            className={inputCls}
            required
            maxLength={200}
          />
        </FormField>
        <FormField label={t("lastName")} required>
          <input
            name="last_name"
            defaultValue={initial.last_name}
            className={inputCls}
            required
            maxLength={200}
          />
        </FormField>
        <FormField label={t("phone")} required hint={t("phoneHint")}>
          <input
            name="phone"
            defaultValue={initial.phone}
            className={inputCls}
            required
            inputMode="tel"
            pattern="0\d{8,9}"
            maxLength={10}
          />
        </FormField>
        <FormField label={`${t("sex")} ${t("optionalLabel")}`}>
          <select name="sex" defaultValue={initial.sex} className={inputCls}>
            <option value="">{t("sexUnspecified")}</option>
            <option value="male">{t("sexMale")}</option>
            <option value="female">{t("sexFemale")}</option>
            <option value="other">{t("sexOther")}</option>
          </select>
        </FormField>
        <FormField label={`${t("birthday")} ${t("optionalLabel")}`}>
          <input
            name="birthday"
            type="date"
            defaultValue={initial.birthday}
            className={inputCls}
            max={new Date().toISOString().split("T")[0]}
          />
        </FormField>
      </div>

      <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-border bg-surface-alt/30 p-3">
        <input
          type="checkbox"
          name="agreed"
          required
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm text-foreground">
          {t.rich("agreeLabel", {
            terms: (chunks) => (
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary-500 hover:underline"
              >
                {chunks}
              </a>
            ),
            privacy: (chunks) => (
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary-500 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </span>
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {t("errorPrefix")} {error}
        </div>
      )}

      <Button type="submit" disabled={pending} fullWidth size="lg">
        {pending ? t("saving") : t("submitButton")}
      </Button>

      <p className="text-center text-xs text-muted">
        {t.rich("juristicSwitchHint", {
          link: (chunks) => (
            <a
              href={juristicSwitchHref}
              className="font-semibold text-primary-500 hover:underline"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function FormField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { submitContactMessage } from "@/actions/contact";
import HCaptchaInvisible, { type HCaptchaHandle } from "@/components/hcaptcha-invisible";
import { trackGenerateLead } from "@/lib/analytics";

/**
 * Drop-in contact form (P-6) + D-13-wire (hCaptcha invisible).
 * Place anywhere — handles its own state + submit + success/error UI.
 * ปอน can swap this for a styled version later; the action contract
 * stays stable.
 *
 *   <ContactForm />
 *
 * The CAPTCHA renders nothing in dev (no `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`),
 * `execute()` returns null, and the server-side `verifyHcaptcha` is also
 * a no-op in dev — so the form works locally without any captcha setup.
 */
const ERROR_KEYS: Record<string, string> = {
  rate_limit:     "errRateLimit",
  captcha_failed: "errCaptchaFailed",
  insert_failed:  "errInsertFailed",
};

export function ContactForm() {
  const t = useTranslations("contactForm");
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const captchaRef = useRef<HCaptchaHandle>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // Get CAPTCHA token (null in dev / when site key unset — server tolerates)
      const captchaToken = await captchaRef.current?.execute();

      const res = await submitContactMessage({
        name,
        contact,
        subject: subject || undefined,
        message,
        captchaToken: captchaToken ?? null,
      });
      if (!res.ok) {
        const key = ERROR_KEYS[res.error];
        setError(key ? t(key) : res.error);
        // Reset the widget so a retry obtains a fresh token
        captchaRef.current?.reset();
        return;
      }
      setDone(true);
      setName("");
      setContact("");
      setSubject("");
      setMessage("");
      trackGenerateLead("contact_form");
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-bold text-green-800">✅ {t("successTitle")}</p>
        <p className="mt-2 text-sm text-green-700">
          {t("successBody")}
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-4 text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
        >
          {t("sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("labelName")} required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            required
            maxLength={200}
          />
        </Field>
        <Field label={t("labelContact")} required>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputCls}
            required
            maxLength={200}
            placeholder={t("contactPlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("labelSubject")}>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputCls}
          maxLength={200}
          placeholder={t("subjectPlaceholder")}
        />
      </Field>

      <Field label={t("labelMessage")} required>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputCls} min-h-[140px]`}
          required
          minLength={5}
          maxLength={4000}
          placeholder={t("messagePlaceholder")}
        />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <HCaptchaInvisible ref={captchaRef} />

      <Button type="submit" disabled={pending} fullWidth size="lg">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
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
    </label>
  );
}

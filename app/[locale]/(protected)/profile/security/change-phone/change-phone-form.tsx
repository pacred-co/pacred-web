"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { requestPhoneChangeOtp, confirmPhoneChange } from "@/actions/security";

type Step = "request" | "verify" | "done";

const ERR: Record<string, string> = {
  invalid_phone:   "เบอร์โทรไม่ถูกต้อง",
  invalid_otp:     "OTP ไม่ถูกต้องหรือหมดอายุ",
  invalid_input:   "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  rate_limit:      "ส่ง OTP เกิน 3 ครั้งใน 1 ชม. กรุณารอสักครู่",
  sms_failed:      "ส่ง SMS ไม่สำเร็จ ลองอีกครั้ง",
  db_error:        "ระบบขัดข้อง กรุณาลองใหม่",
  not_signed_in:   "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่",
};

export function ChangePhoneForm({ currentPhone }: { currentPhone: string | null }) {
  const t = useTranslations("change_phone");
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bypassNotice, setBypassNotice] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [otp, setOtp] = useState("");

  function submitRequest() {
    setError(null);
    startTransition(async () => {
      const res = await requestPhoneChangeOtp({ currentPassword, newPhone });
      if (!res.ok) {
        setError(ERR[res.error] ?? res.error);
        return;
      }
      setBypassNotice(!!res.bypass);
      setStep("verify");
      // Free the password from memory once it has done its job
      setCurrentPassword("");
    });
  }

  function submitConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await confirmPhoneChange({ newPhone, otp });
      if (!res.ok) {
        setError(ERR[res.error] ?? res.error);
        return;
      }
      setStep("done");
      setTimeout(() => {
        router.push("/profile");
        router.refresh();
      }, 1500);
    });
  }

  if (step === "done") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
        <p className="font-semibold">{t("successTitle")}</p>
        <p className="mt-1">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {currentPhone && (
        <div className="rounded-lg border border-border bg-surface-alt/30 p-3 text-sm">
          <span className="text-muted">{t("currentPhone")}:</span>{" "}
          <span className="font-mono font-semibold text-foreground">{currentPhone}</span>
        </div>
      )}

      {step === "request" && (
        <>
          <FormField label={t("currentPasswordLabel")} required>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputCls}
              autoComplete="current-password"
            />
          </FormField>

          <FormField label={t("newPhoneLabel")} required hint={t("newPhoneHint")}>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className={inputCls}
              inputMode="tel"
              placeholder="0812345678"
              maxLength={10}
            />
          </FormField>

          {error && <ErrorBox text={error} />}

          <Button
            type="button"
            onClick={submitRequest}
            disabled={pending || !currentPassword || newPhone.length < 8}
            fullWidth
            size="lg"
          >
            {pending ? t("sending") : t("requestOtp")}
          </Button>
        </>
      )}

      {step === "verify" && (
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {t("otpSentTo", { phone: newPhone })}
          </div>

          {bypassNotice && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
              {t("bypassNotice")}
            </div>
          )}

          <FormField label={t("otpLabel")} required>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className={inputCls}
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
            />
          </FormField>

          {error && <ErrorBox text={error} />}

          <Button
            type="button"
            onClick={submitConfirm}
            disabled={pending || otp.length < 1}
            fullWidth
            size="lg"
          >
            {pending ? t("saving") : t("confirmChange")}
          </Button>

          <button
            type="button"
            onClick={() => {
              setStep("request");
              setOtp("");
              setError(null);
            }}
            className="block w-full text-center text-xs text-muted hover:text-primary-600"
          >
            {t("backToRequest")}
          </button>
        </>
      )}
    </div>
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

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {text}
    </div>
  );
}

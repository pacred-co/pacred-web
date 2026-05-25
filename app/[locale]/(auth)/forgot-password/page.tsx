"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { Button } from "@/components/ui/button";
import HCaptchaInvisible, { type HCaptchaHandle } from "@/components/hcaptcha-invisible";
import {
  requestPasswordResetByPhone,
  confirmPasswordResetByPhone,
  requestPasswordResetByEmail,
} from "@/actions/auth";

type Mode = "phone" | "email";
type PhoneStep = "request" | "verify";
type EmailStep = "request" | "sent";

const ERR: Record<string, string> = {
  invalid_phone:   "เบอร์โทรไม่ถูกต้อง",
  invalid_email:   "อีเมลไม่ถูกต้อง",
  invalid_otp:     "OTP ไม่ถูกต้องหรือหมดอายุ",
  invalid_input:   "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  rate_limit:      "ขอรีเซ็ตเกินจำนวนครั้งที่กำหนด กรุณารออีกสักครู่แล้วลองใหม่",
  captcha_failed:  "ระบบตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองใหม่",
  sms_failed:      "ส่ง SMS ไม่สำเร็จ ลองอีกครั้ง",
  db_error:        "ระบบขัดข้อง กรุณาลองใหม่",
  user_not_found:  "ไม่พบบัญชีนี้ในระบบ",
  update_failed:   "ตั้งรหัสผ่านไม่สำเร็จ",
  signin_failed:   "เข้าสู่ระบบหลังรีเซ็ตไม่สำเร็จ",
};

export default function ForgotPasswordPage() {
  const t = useTranslations("forgot_password");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("phone");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // phone path
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("request");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  // 2026-05-25 — When the server-side EMERGENCY_OTP_BYPASS (actions/otp.ts:42)
  // is on, `requestPasswordResetByPhone` returns `data.bypass:true` because
  // no SMS was actually sent. We hide the OTP input on the verify step in
  // that case + auto-fill a placeholder so the customer reaches the
  // "set new password" form without waiting for an SMS that never arrives.
  // `confirmPasswordResetByPhone` short-circuits `verifyOtp` to true under
  // the same flag, so any 6-digit placeholder passes.
  const [otpBypass, setOtpBypass] = useState(false);

  // email path
  const [emailStep, setEmailStep] = useState<EmailStep>("request");
  const [email, setEmail] = useState("");

  // Shared CAPTCHA widget for the password-reset request flows
  const captchaRef = useRef<HCaptchaHandle>(null);

  function submitPhoneRequest() {
    setError(null);
    startTransition(async () => {
      const captchaToken = await captchaRef.current?.execute();
      const res = await requestPasswordResetByPhone(phone, captchaToken ?? null);
      if (!res.ok) {
        setError(ERR[res.error] ?? res.error);
        captchaRef.current?.reset();
        return;
      }
      // If server-side OTP bypass is on, prime the OTP field with a
      // placeholder + remember so we hide the input on the verify step.
      if (res.data?.bypass) {
        setOtpBypass(true);
        setOtp("000000");
      }
      setPhoneStep("verify");
    });
  }

  function submitPhoneConfirm() {
    setError(null);
    startTransition(async () => {
      const res = await confirmPasswordResetByPhone({ phone, otp, password: newPwd });
      if (!res.ok) {
        setError(ERR[res.error] ?? res.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function submitEmailRequest() {
    setError(null);
    startTransition(async () => {
      const captchaToken = await captchaRef.current?.execute();
      const res = await requestPasswordResetByEmail(email, captchaToken ?? null);
      if (!res.ok) {
        setError(ERR[res.error] ?? res.error);
        captchaRef.current?.reset();
        return;
      }
      setEmailStep("sent");
    });
  }

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-[480px] rounded-[18px] bg-white dark:bg-surface p-6 sm:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
          <div className="mb-6 text-center">
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              {t("kicker")}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-foreground">{t("title")}</h1>
            <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
          </div>

          {/* Mode toggle */}
          <div className="mb-5 grid grid-cols-2 rounded-lg border border-border bg-surface-alt/30 p-1">
            <button
              type="button"
              onClick={() => { setMode("phone"); setError(null); }}
              className={`rounded-md py-2 text-sm font-semibold transition ${
                mode === "phone" ? "bg-white dark:bg-surface text-primary-600 shadow-sm" : "text-muted"
              }`}
            >
              {t("modePhone")}
            </button>
            <button
              type="button"
              onClick={() => { setMode("email"); setError(null); }}
              className={`rounded-md py-2 text-sm font-semibold transition ${
                mode === "email" ? "bg-white dark:bg-surface text-primary-600 shadow-sm" : "text-muted"
              }`}
            >
              {t("modeEmail")}
            </button>
          </div>

          {/* ─── PHONE PATH ─── */}
          {mode === "phone" && phoneStep === "request" && (
            <div className="space-y-4">
              <FormField label={t("phoneLabel")} required hint={t("phoneHint")}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                  inputMode="tel"
                  placeholder="0812345678"
                  maxLength={10}
                />
              </FormField>
              {error && <ErrorBox text={error} />}
              <Button
                type="button"
                onClick={submitPhoneRequest}
                disabled={pending || phone.length < 8}
                fullWidth
                size="lg"
              >
                {pending ? t("sending") : t("requestOtp")}
              </Button>
            </div>
          )}

          {mode === "phone" && phoneStep === "verify" && (
            <div className="space-y-4">
              {otpBypass ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  ระบบ SMS อยู่ระหว่างปรับปรุง — กรุณาตั้งรหัสผ่านใหม่ของท่านเลย
                </div>
              ) : (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  {t("otpSentTo", { phone })}
                </div>
              )}
              {!otpBypass && (
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
              )}
              <FormField label={t("newPasswordLabel")} required hint={t("passwordHint")}>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                    minLength={6}
                    maxLength={30}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
                  >
                    {showPwd ? t("hide") : t("show")}
                  </button>
                </div>
              </FormField>
              {error && <ErrorBox text={error} />}
              <Button
                type="button"
                onClick={submitPhoneConfirm}
                disabled={pending || otp.length < 1 || newPwd.length < 6}
                fullWidth
                size="lg"
              >
                {pending ? t("saving") : t("confirmReset")}
              </Button>
              <button
                type="button"
                onClick={() => { setPhoneStep("request"); setError(null); }}
                className="block w-full text-center text-xs text-muted hover:text-primary-600"
              >
                {t("backToPhoneEntry")}
              </button>
            </div>
          )}

          {/* ─── EMAIL PATH ─── */}
          {mode === "email" && emailStep === "request" && (
            <div className="space-y-4">
              <FormField label={t("emailLabel")} required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </FormField>
              {error && <ErrorBox text={error} />}
              <Button
                type="button"
                onClick={submitEmailRequest}
                disabled={pending || email.length < 3}
                fullWidth
                size="lg"
              >
                {pending ? t("sending") : t("sendResetLink")}
              </Button>
            </div>
          )}

          {mode === "email" && emailStep === "sent" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <p className="font-semibold">{t("emailSentTitle")}</p>
                <p className="mt-1">{t("emailSentBody", { email })}</p>
                <p className="mt-2 text-xs text-green-700">{t("emailSentSpam")}</p>
              </div>
              <button
                type="button"
                onClick={() => { setEmailStep("request"); setEmail(""); setError(null); }}
                className="block w-full text-center text-xs text-muted hover:text-primary-600"
              >
                {t("retryDifferentEmail")}
              </button>
            </div>
          )}

          {/* Back to login */}
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="text-sm font-semibold text-primary-600 hover:text-primary-700"
            >
              {t("backToLogin")}
            </Link>
          </div>
        </div>
      </main>
      {/* Invisible CAPTCHA — shared by both phone+email request flows */}
      <HCaptchaInvisible ref={captchaRef} />
      <Footer />
    </>
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

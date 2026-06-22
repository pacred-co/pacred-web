"use client";

/**
 * Client flow for the magic-login page (`/k/[token]`).
 *
 * Two steps, both OTP-gated server actions:
 *   1. "ขอรหัส OTP"  → requestMagicLoginOtp(token) → OTP texted to the phone.
 *   2. enter OTP + "เข้าสู่ระบบ" → redeemMagicLogin(token, otp) → on ok, a FULL
 *      navigation to "/" so middleware picks up the freshly-set session cookies.
 */

import { useState, useTransition } from "react";
import { Loader2, KeyRound, ShieldCheck } from "lucide-react";
import { requestMagicLoginOtp, redeemMagicLogin } from "@/actions/customer-magic-link";

const ERR_TH: Record<string, string> = {
  invalid_link: "ลิงก์ไม่ถูกต้องหรือหมดอายุการใช้งาน",
  not_found: "ไม่พบบัญชีลูกค้าสำหรับลิงก์นี้",
  account_suspended: "บัญชีนี้ถูกระงับการใช้งาน — กรุณาติดต่อเจ้าหน้าที่",
  no_phone: "บัญชีนี้ไม่มีเบอร์โทรสำหรับรับ OTP — กรุณาติดต่อเจ้าหน้าที่",
  rate_limit: "ขอรหัสบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่",
  sms_failed: "ส่ง SMS ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
  invalid_otp: "รหัส OTP ไม่ถูกต้องหรือหมดอายุ",
  signin_failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่ หรือติดต่อเจ้าหน้าที่",
  lookup_failed: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
  db_error: "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง",
};

function errText(code: string): string {
  return ERR_TH[code] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}

export function MagicLoginClient({ token, phoneHint }: { token: string; phoneHint: string }) {
  const [step, setStep] = useState<"start" | "otp">("start");
  const [otp, setOtp] = useState("");
  const [sentHint, setSentHint] = useState(phoneHint);
  const [bypass, setBypass] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function sendOtp() {
    setErr(null);
    start(async () => {
      const res = await requestMagicLoginOtp(token);
      if (!res.ok) {
        setErr(errText(res.error));
        return;
      }
      setBypass(!!res.data?.bypass);
      if (res.data?.phoneHint) setSentHint(res.data.phoneHint);
      setStep("otp");
    });
  }

  function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!bypass && otp.trim().length < 4) {
      setErr("กรุณากรอกรหัส OTP");
      return;
    }
    start(async () => {
      const res = await redeemMagicLogin(token, otp.trim());
      if (!res.ok) {
        setErr(errText(res.error));
        return;
      }
      // Full navigation so the new session cookies take effect (middleware).
      window.location.href = "/";
    });
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </div>
      )}

      {step === "start" ? (
        <>
          <p className="text-sm text-muted">
            กดปุ่มด้านล่างเพื่อรับรหัส OTP ทาง SMS ที่เบอร์ <span className="font-medium text-foreground">{sentHint}</span> แล้วยืนยันเพื่อเข้าสู่ระบบ
          </p>
          <button
            type="button"
            onClick={sendOtp}
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {pending ? "กำลังส่งรหัส..." : "ขอรหัส OTP"}
          </button>
        </>
      ) : (
        <form onSubmit={submitOtp} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">
              รหัส OTP
              <span className="ml-1 font-normal text-muted">
                {bypass ? "· โหมดทดสอบ: กรอกเลขใดก็ได้" : `· ส่งไปที่ ${sentHint}`}
              </span>
            </label>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="______"
              autoFocus
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2.5 text-center text-lg tracking-[0.4em] focus:border-primary-400 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {pending ? "กำลังเข้าสู่ระบบ..." : "ยืนยัน & เข้าสู่ระบบ"}
          </button>
          <button
            type="button"
            onClick={sendOtp}
            disabled={pending}
            className="block w-full text-center text-xs text-primary-600 hover:underline disabled:opacity-50"
          >
            ขอรหัสใหม่อีกครั้ง
          </button>
        </form>
      )}
    </div>
  );
}

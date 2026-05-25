"use client";

import { useState, useTransition, useRef, useEffect, Fragment } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, User, Lock, Mail, Hash, Building2, Loader2, Phone, MessageSquare, ChevronDown, Check } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import {
  registerPersonal,
  registerJuristicStep1,
  saveJuristicStep2,
  uploadJuristicDoc,
  completeJuristicRegistration,
} from "@/actions/auth";
import { requestOtp } from "@/actions/otp";
import { OtpInput } from "@/components/auth/otp-input";
import HCaptchaInvisible, { type HCaptchaHandle } from "@/components/hcaptcha-invisible";
import { trackSignUp } from "@/lib/analytics";

/* ─────────────────────────── TYPES ─────────────────────────── */
export type TabId = "personal" | "juristic";
type JuristicStep = 1 | 2 | 3;

/**
 * Resume state passed from the server wrapper (`page.tsx`) when a signed-in
 * juristic user has `profile.status='incomplete'` — Step 1 already created
 * the auth user + profile row; the client must skip Step 1 and jump straight
 * to Step 2 (corporate info) or Step 3 (docs upload). See ADR-0017 §Phase-B
 * + the 2026-05-25 register-bounce learning.
 */
export type RegisterResumeState = {
  step: 2 | 3;
  taxId: string;
  companyName: string;
  /** Joined per saveJuristicStep2 — we can't split it back, so we only
   *  prefill taxId + companyName + leave address fields blank on resume. */
  companyAddress: string;
};
type ServiceId = "import" | "export" | "customs" | "order" | "payment";
type SourceId = "line" | "fb" | "google" | "youtube" | "tiktok" | "ig" | "friend" | "ad";

/* ─────────────────────────── CONSTANTS ─────────────────────────── */
const ERR: Record<string, string> = {
  invalid_otp: "OTP ไม่ถูกต้องหรือหมดอายุ",
  invalid_input: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  rate_limit: "สมัครเกินจำนวนครั้งที่กำหนด กรุณารอสักครู่แล้วลองใหม่",
  captcha_failed: "ระบบตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองใหม่",
  sms_failed: "ส่ง SMS ไม่สำเร็จ ลองอีกครั้ง",
  signup_failed: "สมัครไม่สำเร็จ — เบอร์นี้อาจสมัครไปแล้ว",
  profile_failed: "บันทึกโปรไฟล์ไม่สำเร็จ",
  signin_failed: "เข้าสู่ระบบหลังสมัครไม่สำเร็จ",
  must_agree: "ต้องยอมรับข้อกำหนดก่อนสมัคร",
  upload_failed: "อัปโหลดไฟล์ไม่สำเร็จ",
  file_too_large: "ไฟล์ใหญ่เกิน 10 MB",
  invalid_mime: "รับเฉพาะ PDF / JPG / PNG",
  not_signed_in: "เซสชันหมดอายุ กรุณา login ใหม่",
};

/**
 * Open-redirect guard for the `?next=` post-signup destination — used when a
 * guest is routed here from the booking calculator's "เปิดออเดอร์ราคานี้"
 * CTA. Only an internal absolute path is honoured.
 */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

const SERVICES: { id: ServiceId; label: string; sub?: string; icon: string }[] = [
  { id: "import",  label: "นำเข้าสินค้า",       sub: "รถ/เรือ/แอร์", icon: "/images/home/iconfloating/pcs-forwarder.png" },
  { id: "export",  label: "ส่งออกสินค้า",       sub: "รถ/เรือ/แอร์", icon: "/images/home/iconfloating/caricon.png" },
  { id: "customs", label: "พิธีการศุลกากร",                    icon: "/images/home/iconfloating/checklistred.png" },
  { id: "order",   label: "ฝากสั่งซื้อสินค้า",                icon: "/images/home/iconfloating/pcs-cart.png" },
  { id: "payment", label: "ฝากโอนชำระสินค้า",                 icon: "/images/home/iconfloating/pcs-payment.png" },
];

const SOURCES: { id: SourceId; label: string; icon: React.ReactNode }[] = [
  {
    id: "line",
    label: "Line",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect width="20" height="20" rx="4.5" fill="#06C755" />
        <path fill="white" d="M16.2 9.3C16.2 6.1 13 3.5 9.1 3.5S2 6.1 2 9.3c0 2.9 2.6 5.4 6.1 5.8.24.05.56.16.64.37.07.2.05.5 0 .7l-.1.62c-.03.2-.15.77.67.42C10.5 16.8 14.7 14 16 12.2c.14-.22.2-.45.2-.7v-.06z" />
        <path fill="#06C755" d="M7.8 10.7H6.5V7.8h-.7v-.6h2v.6H7.8zm2.3 0H9.4l-1.2-1.8v1.8h-.7V7.2h.75l1.15 1.75V7.2h.7zm1.7 0h-1.65V7.2h.7v2.9h.95zm2.1-2.3H12.8V8h1.1v.6h-1.1v.5H14v.6h-1.85V7.2H14z" />
      </svg>
    ),
  },
  {
    id: "fb",
    label: "Facebook",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect width="20" height="20" rx="4.5" fill="#1877F2" />
        <path fill="white" d="M11.2 17v-6.1h2l.3-2.4h-2.3V6.9c0-.7.19-1.18 1.2-1.18H13.6V3.2C13.24 3.14 12.38 3 11.38 3 9.3 3 7.9 4.25 7.9 6.6V8.5H6v2.4h1.9V17h3.3z" />
      </svg>
    ),
  },
  {
    id: "google",
    label: "Google",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect width="20" height="20" rx="4.5" fill="white" stroke="#e0e0e0" strokeWidth="0.8" />
        <path fill="#4285F4" d="M17 10.2c0-.48-.04-.94-.11-1.38H10v2.6h3.95c-.17.9-.7 1.66-1.48 2.17v1.8h2.4C16.1 14.05 17 12.27 17 10.2z" />
        <path fill="#34A853" d="M10 17.5c1.96 0 3.6-.65 4.8-1.75l-2.4-1.8c-.65.44-1.48.7-2.4.7-1.83 0-3.38-1.24-3.93-2.9H3.55v1.84C4.75 15.83 7.2 17.5 10 17.5z" />
        <path fill="#FBBC04" d="M6.07 12.06a4.2 4.2 0 010-2.62V7.6H3.55A7.47 7.47 0 003 10a7.4 7.4 0 00.55 2.41l2.52-1.85z" />
        <path fill="#EA4335" d="M10 5.5c1.03 0 1.96.36 2.68 1.05l2.01-2C13.6 3.24 11.96 2.5 10 2.5a7.5 7.5 0 00-6.45 3.6l2.52 1.85C6.62 6.56 8.17 5.5 10 5.5z" />
      </svg>
    ),
  },
  {
    id: "youtube",
    label: "Youtube",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect width="20" height="20" rx="4.5" fill="#FF0000" />
        <path fill="white" d="M15.8 7.1s-.2-1.3-.8-1.84c-.76-.8-1.6-.81-2-.86C11.12 4.3 10 4.3 10 4.3h-.02s-1.12 0-3.14.1c-.36.05-1.2.06-1.97.86C4.28 5.8 4.07 7.1 4.07 7.1S3.87 8.48 3.87 9.87v1.27c0 1.38.2 2.77.2 2.77s.2 1.28.8 1.84c.76.8 1.76.77 2.2.85C8.5 16.83 10 16.8 10 16.8s1.13-.02 3.15-.22c.36-.05 1.2-.06 1.96-.86.6-.56.8-1.84.8-1.84s.2-1.38.2-2.77V9.87c0-1.4-.2-2.77-.2-2.77zm-8.5 5.64V7.3L13.2 10l-5.9 2.74z" />
      </svg>
    ),
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect width="20" height="20" rx="4.5" fill="#010101" />
        <path fill="#00F2EA" d="M13 3.5v.1c.4 1.05 1.25 1.8 2.25 2.05v1.98c-.9-.08-1.7-.4-2.35-.9v4.57c0 1.97-1.55 3.55-3.47 3.55A3.48 3.48 0 016 11.3a3.48 3.48 0 013.47-3.55c.17 0 .33.02.5.04v2c-.17-.04-.33-.07-.5-.07-.85 0-1.55.7-1.55 1.58 0 .88.7 1.58 1.55 1.58s1.56-.7 1.56-1.58V3.5H13z" />
        <path fill="#FF004F" d="M12.5 3.5v.1c.4 1.05 1.25 1.8 2.25 2.05v1.98c-.9-.08-1.7-.4-2.35-.9v4.57c0 1.97-1.55 3.55-3.47 3.55A3.48 3.48 0 015.5 11.3a3.48 3.48 0 013.47-3.55c.17 0 .33.02.5.04v2c-.17-.04-.33-.07-.5-.07-.85 0-1.55.7-1.55 1.58 0 .88.7 1.58 1.55 1.58s1.56-.7 1.56-1.58V3.5h2.47z" opacity="0.65" transform="translate(0.5 0)" />
      </svg>
    ),
  },
  {
    id: "ig",
    label: "Instagram",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <defs>
          <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F58529" />
            <stop offset="50%" stopColor="#DD2A7B" />
            <stop offset="100%" stopColor="#515BD4" />
          </linearGradient>
        </defs>
        <rect width="20" height="20" rx="4.5" fill="url(#ig-grad)" />
        <rect x="4.5" y="4.5" width="11" height="11" rx="3" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.9" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="14.2" cy="5.8" r="1" fill="white" />
      </svg>
    ),
  },
  {
    id: "friend",
    label: "เพื่อนแนะนำ",
    icon: <span className="text-[18px] leading-none">👥</span>,
  },
  {
    id: "ad",
    label: "โฆษณา",
    icon: <span className="text-[18px] leading-none">📢</span>,
  },
];

/* ─────────────────────────── INPUT BASE STYLES (matches login/page.tsx) ─────────────────────────── */
const INPUT_BASE =
  "w-full rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-4 py-[10px] text-[14px] text-foreground placeholder:text-muted transition focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/10";

/* ─────────────────────────── MAIN PAGE ─────────────────────────── */
export function RegisterClient({
  initialTab = "personal",
  juristicResume = null,
}: {
  initialTab?: TabId;
  juristicResume?: RegisterResumeState | null;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <>
      <NavBar />
      <main className="flex items-start justify-center bg-background px-4 py-3">
        <div className="w-full max-w-[540px] rounded-[24px] border border-white/80 bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,0.04)] dark:border-border dark:bg-surface sm:p-7">

          {/* Logo */}
          <div className="-mb-1 flex h-[40px] items-end justify-center">
            <Image
              src="/images/pacred-logo-red.png"
              alt="Pacred"
              width={140}
              height={140}
              className="h-[52px] w-[52px]"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="mb-1 text-center text-xl font-bold text-foreground">
            สมัครสมาชิก
          </h1>

          {/* Login link */}
          <p className="mb-3 text-center text-[12.5px] text-muted">
            มีบัญชีอยู่แล้ว?{" "}
            <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>

          {/* Tabs */}
          <div className="mb-3 flex gap-1 rounded-xl bg-surface dark:bg-surface-alt p-1">
            {(["personal", "juristic"] as TabId[]).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition ${
                    active
                      ? "bg-white text-primary-600 shadow-[0_2px_10px_rgba(0,0,0,0.07)] dark:bg-background"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {t === "personal"
                    ? <><User className="h-4 w-4" /> บุคคลธรรมดา</>
                    : <><Building2 className="h-4 w-4" /> นิติบุคคล</>}
                </button>
              );
            })}
          </div>

          {tab === "personal" ? <PersonalForm /> : <JuristicForm resume={juristicResume} />}
        </div>
      </main>
    </>
  );
}

/* ─────────────────────────── PERSONAL FORM ─────────────────────────── */
function PersonalForm() {
  const router = useRouter();
  const nextUrl = safeNext(useSearchParams().get("next"));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [services, setServices]   = useState<ServiceId[]>([]);
  const [source, setSource]       = useState<SourceId | null>(null);
  const [email, setEmail]         = useState("");
  const [agreed, setAgreed]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const captchaRef = useRef<HCaptchaHandle>(null);

  // OTP phase state (B1 — Sunday-night blocker per deep-sweep audit)
  const [phase, setPhase] = useState<"form" | "otp">("form");
  const [otpCode, setOtpCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  function toggleService(id: ServiceId) {
    setServices((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  useEffect(() => {
    if (phase !== "otp" || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, resendIn]);

  async function submitRegister(otp: string) {
    // hCaptcha tokens are single-use and expire ~2 min. Mint a FRESH token
    // here at submit time — the token obtained during the OTP-request step
    // is long stale by the time the user has received the SMS and typed the
    // code, so reusing it fails verifyHcaptcha server-side (captcha_failed).
    const captchaToken = (await captchaRef.current?.execute()) ?? null;
    const res = await registerPersonal({
      firstName, lastName, phone, password,
      services,
      howKnow: source ?? null,
      email: email || "",
      otp,
      agreed,
      captchaToken,
    });
    if (res.ok) {
      trackSignUp("personal");
      // Return to a pending `?next=` (booking-calculator CTA) if present.
      // The protected layout still re-routes to /complete-profile when the
      // new profile needs it — so an order quote only survives for a
      // ready-to-order account, which is the intended behaviour.
      router.replace(nextUrl ?? "/");
      router.refresh();
    } else {
      setError(ERR[res.error] ?? res.error);
      captchaRef.current?.reset();
    }
  }

  function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError(ERR.must_agree); return; }
    setError(null);
    startTransition(async () => {
      const req = await requestOtp(phone, "register");
      if (!req.ok) {
        setError(ERR[req.error] ?? req.error);
        return;
      }
      if (req.bypass) {
        // Dev bypass — no SMS round-trip, so submitRegister mints its own
        // fresh captcha token at submit time (same as the real OTP path).
        await submitRegister("bypass");
        return;
      }
      setPhase("otp");
      setOtpCode("");
      setResendIn(60);
    });
  }

  // Take the completed code as an ARGUMENT. OtpInput.onComplete fires with
  // the fresh 6-digit string in the SAME tick setOtpCode is called — the
  // `otpCode` state here is still the previous 5-digit value. Reading state
  // instead of the arg made `length !== 6` true → an instant spurious
  // "OTP ไม่ถูกต้องหรือหมดอายุ" the moment the 6th digit landed.
  function handleVerifyOtp(code: string) {
    if (code.length !== 6) { setError(ERR.invalid_otp); return; }
    setError(null);
    startTransition(async () => {
      await submitRegister(code);
    });
  }

  function handleResendOtp() {
    if (resendIn > 0) return;
    setError(null);
    startTransition(async () => {
      const req = await requestOtp(phone, "register");
      if (!req.ok) { setError(ERR[req.error] ?? req.error); return; }
      setOtpCode("");
      setResendIn(60);
    });
  }

  if (phase === "otp") {
    return (
      <OtpStep
        phone={phone}
        code={otpCode}
        onCodeChange={setOtpCode}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
        onBack={() => { setPhase("form"); setError(null); setOtpCode(""); }}
        resendIn={resendIn}
        pending={pending}
        error={error}
      />
    );
  }

  return (
    <form onSubmit={handleRequestOtp} className="space-y-2.5">
      {/* Name row */}
      <div className="flex gap-3">
        <FieldWrap label="ชื่อจริง">
          <IconInput icon={<User className="h-4 w-4" />}>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              placeholder="ชื่อจริง" className={`${INPUT_BASE} pl-11`} />
          </IconInput>
        </FieldWrap>
        <FieldWrap label="นามสกุล">
          <IconInput icon={<User className="h-4 w-4" />}>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
              placeholder="นามสกุล" className={`${INPUT_BASE} pl-11`} />
          </IconInput>
        </FieldWrap>
      </div>

      {/* Phone */}
      <FieldWrap label="เบอร์โทรศัพท์">
        <PhoneInput value={phone} onChange={setPhone} />
      </FieldWrap>

      {/* Password */}
      <FieldWrap label="รหัสผ่าน">
        <PasswordInput id="pass-p" value={password} onChange={setPassword}
          show={showPwd} onToggle={() => setShowPwd((v) => !v)}
          placeholder="รหัสผ่าน 6-30 ตัวอักษร" />
      </FieldWrap>

      {/* Services + How-know — side by side to keep the form compact */}
      <div className="flex gap-3">
        <FieldWrap label="บริการที่สนใจ">
          <ServiceChips selected={services} onToggle={toggleService} />
        </FieldWrap>
        <FieldWrap label="รู้จักเราจากช่องทางใด">
          <SourceChips selected={source} onSelect={setSource} />
        </FieldWrap>
      </div>

      {/* Email (optional) */}
      <FieldWrap
        label={<>อีเมล <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-[11px] font-normal text-muted">ไม่จำเป็น</span></>}
      >
        <IconInput icon={<Mail className="h-4 w-4" />}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="อีเมล (ไม่ต้องกรอกก็ได้)" className={`${INPUT_BASE} pl-11`} />
        </IconInput>
      </FieldWrap>

      <AgreeRow checked={agreed} onChange={setAgreed} />
      {error && <ErrorBox msg={error} />}
      <HCaptchaInvisible ref={captchaRef} />
      <p className="text-center text-[12px] leading-[1.5] text-muted">
        กดเพื่อรับรหัส OTP 6 หลักทาง SMS — ยืนยันเบอร์แล้วสมัครเสร็จในขั้นถัดไป
      </p>
      <SubmitBtn pending={pending}>
        <MessageSquare className="h-4 w-4" /> ขอรหัส OTP
      </SubmitBtn>
    </form>
  );
}

/* ─────────────────────────── JURISTIC FORM ─────────────────────────── */
function JuristicForm({ resume }: { resume: RegisterResumeState | null }) {
  const router = useRouter();
  const nextUrl = safeNext(useSearchParams().get("next"));
  // When resuming a juristic signup mid-flow (P0 fix 2026-05-25), skip Step 1
  // (auth + profile already exist) and jump to Step 2 or Step 3 per the
  // corporate-row check done server-side in page.tsx.
  const [step, setStep] = useState<JuristicStep>(resume?.step ?? 1);

  /* step 1 */
  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [services, setServices] = useState<ServiceId[]>([]);
  const [source, setSource]     = useState<SourceId | null>(null);

  /* step 1 OTP phase (B1 — Sunday-night blocker) */
  const [step1Phase, setStep1Phase] = useState<"form" | "otp">("form");
  const [otpCode, setOtpCode] = useState("");
  const [resendIn, setResendIn] = useState(0);

  /* step 2 — prefilled from corporate row on resume (taxId + companyName only;
   *  legacy stored company_address joined, can't split back cleanly) */
  const [taxId, setTaxId]               = useState(resume?.taxId ?? "");
  const [taxStatus, setTaxStatus]       = useState<"idle" | "loading" | "found" | "notfound" | "unavailable">(
    resume?.taxId ? "found" : "idle",
  );
  const [companyName, setCompanyName]   = useState(resume?.companyName ?? "");
  const [addressLine, setAddressLine]   = useState("");
  const [subdistrict, setSubdistrict]   = useState("");
  const [district, setDistrict]         = useState("");
  const [province, setProvince]         = useState("");
  const [postcode, setPostcode]         = useState("");

  /* step 3 */
  const [docCompany, setDocCompany] = useState<File | null>(null);
  const [docVAT, setDocVAT]         = useState<File | null>(null);
  const [docID, setDocID]           = useState<File | null>(null);
  const [agreed, setAgreed]         = useState(false);

  const [error, setError]           = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();
  const taxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captchaRef = useRef<HCaptchaHandle>(null);

  function toggleService(id: ServiceId) {
    setServices((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  /* DBD tax lookup */
  function handleTaxInput(val: string) {
    const clean = val.replace(/\D/g, "");
    setTaxId(clean);
    if (taxTimer.current) clearTimeout(taxTimer.current);
    if (clean.length !== 13) { setTaxStatus("idle"); return; }
    setTaxStatus("loading");
    taxTimer.current = setTimeout(() => fetchCompany(clean), 500);
  }

  async function fetchCompany(id: string) {
    const endpoints = [
      `https://opendata.dbd.go.th/api/v1/nameAndAddress?JuristicID=${id}`,
      `https://opendata.dbd.go.th/api/v1/juristicNameAll?JuristicID=${id}`,
    ];
    // Track whether *any* endpoint failed to complete a real lookup. If every
    // call errored (network / WAF block / 4xx / 5xx), the API is unreachable —
    // don't gaslight the user with "ไม่พบข้อมูล" when their tax ID may be
    // perfectly valid. "notfound" is reserved for a genuine 200-with-no-record.
    //
    // NOTE 2026-05-17: DBD retired the `api/v1/*` endpoints (now 404 for every
    // request) + the CKAN `api/3/*` API sits behind an Incapsula WAF that
    // rejects programmatic calls. So in practice every lookup currently lands
    // in the `unavailable` branch → customer fills the form manually. Verified
    // via T-D1 smoke gate. Treat ANY non-OK status as an API error (incl. 404)
    // so the honest "ระบบค้นหาไม่พร้อม กรอกด้วยตนเอง" notice shows.
    let sawApiError = false;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) { sawApiError = true; continue; }
        const json = await res.json();
        const d = json?.data?.[0] || json?.result?.[0] || json?.[0] || null;
        if (!d) continue;
        const name = d.juristic_name_th || d.JuristicNameTH || d.name_th || d.CompanyName || "";
        if (!name) continue;
        setCompanyName(name);
        setAddressLine(d.address || d.Address || d.address_th || "");
        setSubdistrict(d.sub_district || d.SubDistrict || d.tambon || "");
        setDistrict(d.district || d.District || d.amphoe || "");
        setProvince(d.province || d.Province || d.changwat || "");
        setPostcode(d.postcode || d.PostCode || d.zipcode || "");
        setTaxStatus("found");
        return;
      } catch {
        sawApiError = true;
      }
    }
    setTaxStatus(sawApiError ? "unavailable" : "notfound");
  }

  function retryTaxLookup() {
    if (taxId.length === 13) {
      setTaxStatus("loading");
      fetchCompany(taxId);
    }
  }

  /* step 1 OTP countdown */
  useEffect(() => {
    if (step1Phase !== "otp" || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [step1Phase, resendIn]);

  async function submitStep1(otp: string) {
    // Mint a FRESH hCaptcha token here at submit time — single-use tokens
    // expire ~2 min, so the one obtained at OTP-request time is stale by
    // the time the SMS arrives and the user types the code (captcha_failed).
    const captchaToken = (await captchaRef.current?.execute()) ?? null;
    const res = await registerJuristicStep1({
      phone, password,
      services,
      howKnow: source ?? null,
      otp,
      captchaToken,
    });
    if (res.ok) {
      setStep(2);
      setStep1Phase("form");
      setOtpCode("");
    } else {
      setError(ERR[res.error] ?? res.error);
      captchaRef.current?.reset();
    }
  }

  function nextStep1() {
    setError(null);
    startTransition(async () => {
      const req = await requestOtp(phone, "register");
      if (!req.ok) {
        setError(ERR[req.error] ?? req.error);
        return;
      }
      if (req.bypass) {
        // Dev bypass — no SMS round-trip, so submitStep1 mints its own
        // fresh captcha token at submit time (same as the real OTP path).
        await submitStep1("bypass");
        return;
      }
      setStep1Phase("otp");
      setOtpCode("");
      setResendIn(60);
    });
  }

  // Code arrives as an ARGUMENT — see handleVerifyOtp (PersonalForm) for why
  // reading `otpCode` state here races OtpInput.onComplete (stale 5 digits).
  function verifyStep1Otp(code: string) {
    if (code.length !== 6) { setError(ERR.invalid_otp); return; }
    setError(null);
    startTransition(async () => {
      await submitStep1(code);
    });
  }

  function resendStep1Otp() {
    if (resendIn > 0) return;
    setError(null);
    startTransition(async () => {
      const req = await requestOtp(phone, "register");
      if (!req.ok) { setError(ERR[req.error] ?? req.error); return; }
      setOtpCode("");
      setResendIn(60);
    });
  }

  function nextStep2() {
    setError(null);
    startTransition(async () => {
      const res = await saveJuristicStep2({
        taxId, companyName, addressLine,
        subdistrict: subdistrict || null,
        district: district || null,
        province: province || null,
        postcode,
      });
      if (res.ok) setStep(3);
      else setError(ERR[res.error] ?? res.error);
    });
  }

  async function uploadOne(file: File | null, docType: "company_affidavit" | "vat" | "national_id") {
    if (!file) return { ok: true as const };
    const fd = new FormData();
    fd.append("file", file);
    fd.append("docType", docType);
    return uploadJuristicDoc(fd);
  }

  function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError(ERR.must_agree); return; }
    if (!docCompany) { setError("กรุณาแนบเอกสารรับรองบริษัท"); return; }
    if (!docID)      { setError("กรุณาแนบบัตรประชาชนกรรมการ"); return; }
    setError(null);
    startTransition(async () => {
      const r1 = await uploadOne(docCompany, "company_affidavit");
      if (!r1.ok) { const e = (r1 as { error: string }).error; return setError(ERR[e] ?? e); }
      const r2 = await uploadOne(docVAT, "vat");
      if (!r2.ok) { const e = (r2 as { error: string }).error; return setError(ERR[e] ?? e); }
      const r3 = await uploadOne(docID, "national_id");
      if (!r3.ok) { const e = (r3 as { error: string }).error; return setError(ERR[e] ?? e); }
      const done = await completeJuristicRegistration();
      if (done.ok) {
        trackSignUp("juristic");
        // Return to a pending `?next=` (booking-calculator CTA) if present.
        router.replace(nextUrl ?? "/");
        router.refresh();
      } else setError(ERR[done.error] ?? done.error);
    });
  }

  return (
    <form onSubmit={handleFinalSubmit} className="space-y-2.5">
      <StepIndicator step={step} />

      {/* ── STEP 1 — FORM PHASE ── */}
      {step === 1 && step1Phase === "form" && (
        <>
          <div className="-mt-2 text-right text-[11.5px] text-muted">ขั้นตอน 1 / 3</div>

          <FieldWrap label={<>เบอร์โทรศัพท์ <Req /></>}>
            <PhoneInput value={phone} onChange={setPhone} />
          </FieldWrap>

          <FieldWrap label={<>รหัสผ่าน <Req /></>}>
            <PasswordInput id="pass-j" value={password} onChange={setPassword}
              show={showPwd} onToggle={() => setShowPwd((v) => !v)}
              placeholder="รหัสผ่าน 6-30 ตัวอักษร" />
          </FieldWrap>

          <div className="flex gap-3">
            <FieldWrap
              label={<>บริการที่สนใจ <span className="ml-1 text-[11px] font-normal text-muted">(หลายอย่าง)</span></>}
            >
              <ServiceChips selected={services} onToggle={toggleService} />
            </FieldWrap>
            <FieldWrap label="รู้จักเราจากช่องทางใด">
              <SourceChips selected={source} onSelect={setSource} />
            </FieldWrap>
          </div>

          {error && <ErrorBox msg={error} />}
          <HCaptchaInvisible ref={captchaRef} />
          <p className="text-center text-[12px] leading-[1.5] text-muted">
            กดเพื่อรับรหัส OTP 6 หลักทาง SMS — ยืนยันเบอร์แล้วกรอกข้อมูลบริษัทขั้นถัดไป
          </p>
          <div className="flex">
            <NextBtn onClick={nextStep1} pending={pending}>
              <MessageSquare className="h-4 w-4" /> ขอรหัส OTP
            </NextBtn>
          </div>
        </>
      )}

      {/* ── STEP 1 — OTP PHASE ── */}
      {step === 1 && step1Phase === "otp" && (
        <OtpStep
          phone={phone}
          code={otpCode}
          onCodeChange={setOtpCode}
          onVerify={verifyStep1Otp}
          onResend={resendStep1Otp}
          onBack={() => { setStep1Phase("form"); setError(null); setOtpCode(""); }}
          resendIn={resendIn}
          pending={pending}
          error={error}
        />
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <div className="-mt-2 text-right text-[11.5px] text-muted">ขั้นตอน 2 / 3</div>

          <FieldWrap label={<>เลขประจำตัวผู้เสียภาษี <Req /></>}>
            <IconInput icon={<Hash className="h-4 w-4" />}>
              <input type="text" value={taxId}
                onChange={(e) => handleTaxInput(e.target.value)}
                placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก"
                maxLength={13}
                className={`${INPUT_BASE} pl-11`} />
            </IconInput>
            <div className="mt-1 min-h-[18px] text-[12px]">
              {taxStatus === "loading" && <span className="text-amber-600 dark:text-amber-400">⏳ กำลังค้นหาข้อมูลบริษัท...</span>}
              {taxStatus === "found"   && <span className="text-green-600 dark:text-green-400">✅ พบข้อมูลบริษัท กรุณาตรวจสอบความถูกต้อง</span>}
              {taxStatus === "notfound"&& <span className="text-red-600 dark:text-red-400">❌ ไม่พบข้อมูล กรุณากรอกด้วยตนเอง</span>}
              {taxStatus === "unavailable" && (
                <span className="text-amber-600 dark:text-amber-400">
                  ⚠️ ระบบค้นหาข้อมูลบริษัทไม่พร้อมใช้งาน กรุณากรอกด้วยตนเอง
                  <button
                    type="button"
                    onClick={retryTaxLookup}
                    className="ml-2 underline hover:text-amber-700"
                  >
                    ลองอีกครั้ง
                  </button>
                </span>
              )}
              {taxStatus === "idle" && taxId.length > 0 && taxId.length < 13 &&
                <span className="text-muted">กรอก 13 หลัก ({taxId.length}/13)</span>}
            </div>
          </FieldWrap>

          <FieldWrap label={<>ชื่อบริษัท <Req /></>}>
            <IconInput icon={<Building2 className="h-4 w-4" />}>
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ชื่อบริษัท" className={`${INPUT_BASE} pl-11`} />
            </IconInput>
          </FieldWrap>

          {/* Section divider */}
          <div className="flex items-center gap-2.5 pt-1">
            <div className="h-px flex-1 bg-border" />
            <span className="whitespace-nowrap text-[12.5px] font-bold text-foreground">ที่อยู่บริษัท</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <FieldWrap label={<>ที่อยู่ บ้านเลขที่ ถนน ซอย <Req /></>}>
            <input type="text" value={addressLine} onChange={(e) => setAddressLine(e.target.value)}
              placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่" className={INPUT_BASE} />
          </FieldWrap>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "ตำบล/แขวง",    value: subdistrict, set: setSubdistrict, ph: "ตำบล/แขวง" },
              { label: "อำเภอ/เขต",    value: district,    set: setDistrict,    ph: "อำเภอ/เขต" },
              { label: "จังหวัด",      value: province,    set: setProvince,    ph: "จังหวัด" },
              { label: "รหัสไปรษณีย์", value: postcode,    set: setPostcode,    ph: "รหัสไปรษณีย์", max: 5, num: true },
            ].map(({ label, value, set, ph, max, num }) => (
              <FieldWrap key={label} label={label}>
                <input type="text" value={value}
                  onChange={(e) => set(num ? e.target.value.replace(/\D/g, "") : e.target.value)}
                  placeholder={ph} maxLength={max} className={INPUT_BASE} />
              </FieldWrap>
            ))}
          </div>

          {error && <ErrorBox msg={error} />}
          <div className="flex gap-2.5">
            <BackBtn onClick={() => { setStep(1); setError(null); }}>ย้อนกลับ</BackBtn>
            <NextBtn onClick={nextStep2} pending={pending}>ถัดไป</NextBtn>
          </div>
        </>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <>
          <div className="-mt-2 text-right text-[11.5px] text-muted">ขั้นตอน 3 / 3</div>

          <div className="rounded-r-lg border-l-[3px] border-primary-600 bg-primary-50 dark:bg-primary-950/30 px-3 py-2.5 text-[12.5px] leading-[1.5] text-muted">
            กรุณาอัปโหลดเอกสารในรูปแบบ PDF หรือรูปภาพ (JPG, PNG) ขนาดไม่เกิน 10 MB ต่อไฟล์
          </div>

          <UploadField
            label={<>เอกสารรับรองบริษัท (pdf/images) <Req /></>}
            emoji="☁️" file={docCompany} onChange={setDocCompany}
          />
          <UploadField
            label="ใบทะเบียนภาษีมูลค่าเพิ่ม ภ.พ.20 (pdf/images)"
            emoji="📄" file={docVAT} onChange={setDocVAT}
          />
          <UploadField
            label={<>บัตรประชาชนกรรมการ (pdf/images) <Req /></>}
            emoji="🪪" file={docID} onChange={setDocID}
          />

          <AgreeRow checked={agreed} onChange={setAgreed} />
          {error && <ErrorBox msg={error} />}

          <div className="flex gap-2.5">
            <BackBtn onClick={() => { setStep(2); setError(null); }}>ย้อนกลับ</BackBtn>
            <SubmitBtn pending={pending} flex1>สมัครสมาชิก</SubmitBtn>
          </div>
        </>
      )}
    </form>
  );
}

/* ─────────────────────────── SHARED COMPONENTS ─────────────────────────── */

function FieldWrap({ label, children, className = "" }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 ${className}`}>
      <label className="mb-1 block text-[12px] font-semibold text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Req() {
  return <span className="text-primary-600">*</span>;
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        {icon}
      </span>
      {children}
    </div>
  );
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <div className="flex h-[52px] shrink-0 items-center gap-1.5 rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface px-3 text-[14px] font-medium text-foreground">
        <span className="text-base">🇹🇭</span>
        <span>+66</span>
      </div>
      <IconInput icon={<Phone className="h-4 w-4" />}>
        <input type="tel" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="081 234 5678" className={`${INPUT_BASE} pl-11`} />
      </IconInput>
    </div>
  );
}

function PasswordInput({
  id, value, onChange, show, onToggle, placeholder,
}: {
  id: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; placeholder: string;
}) {
  return (
    <IconInput icon={<Lock className="h-4 w-4" />}>
      <input id={id} type={show ? "text" : "password"} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} pl-11 pr-12`} />
      <button type="button" onClick={onToggle}
        aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted transition-colors hover:text-primary-600"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </IconInput>
  );
}

/* ── ServiceChips: multi-select dropdown (one input-row tall, expands on click) ── */
function ServiceChips({ selected, onToggle }: { selected: ServiceId[]; onToggle: (id: ServiceId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const summary =
    selected.length === 0
      ? "เลือกบริการ"
      : selected.length === 1
      ? SERVICES.find((s) => s.id === selected[0])?.label ?? "1 บริการ"
      : `${selected.length} บริการ`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${INPUT_BASE} flex items-center justify-between gap-2 pr-9 text-left cursor-pointer ${
          selected.length === 0 ? "text-muted" : "text-foreground"
        }`}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-white dark:bg-surface shadow-[0_8px_24px_rgba(15,23,42,0.12)] p-1.5 max-h-[280px] overflow-y-auto">
          {SERVICES.map((s) => {
            const active = selected.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onToggle(s.id)}
                className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition cursor-pointer ${
                  active ? "bg-primary-50 text-primary-700 dark:bg-primary-950/30 dark:text-primary-300" : "hover:bg-surface text-foreground"
                }`}
              >
                <Image src={s.icon} alt="" width={28} height={28} className="h-7 w-7 shrink-0 object-contain" />
                <span className="flex-1 leading-tight">
                  {s.label}
                  {s.sub && <span className="ml-1 text-[11px] font-normal opacity-60">({s.sub})</span>}
                </span>
                <span
                  className={`h-4 w-4 rounded border-[1.5px] flex items-center justify-center shrink-0 ${
                    active ? "border-primary-500 bg-primary-500 text-white" : "border-border"
                  }`}
                >
                  {active && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── SourceChips: single-select native dropdown (one input-row tall) ── */
function SourceChips({ selected, onSelect }: { selected: SourceId | null; onSelect: (id: SourceId) => void }) {
  return (
    <div className="relative">
      <select
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value as SourceId)}
        className={`${INPUT_BASE} appearance-none pr-9 cursor-pointer ${selected ? "text-foreground" : "text-muted"}`}
      >
        <option value="" disabled>เลือกช่องทาง</option>
        {SOURCES.map((s) => (
          <option key={s.id} value={s.id} className="text-foreground">
            {s.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}

function AgreeRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="mt-1 flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary-600" />
      <span className="text-[12.5px] leading-[1.55] text-muted">
        ฉันเข้าใจและยอมรับ{" "}
        <Link href="#" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">เงื่อนไขการใช้บริการ</Link>
        {" "}และ{" "}
        <Link href="#" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">นโยบายความเป็นส่วนตัว</Link>
      </span>
    </label>
  );
}

function UploadField({
  label, emoji, file, onChange,
}: {
  label: React.ReactNode; emoji: string; file: File | null; onChange: (f: File | null) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[12px] font-semibold text-foreground">{label}</label>
      <label
        className={`relative block cursor-pointer rounded-2xl border-[1.5px] border-dashed px-4 py-4 text-center transition ${
          file
            ? "border-primary-300 bg-primary-50 dark:bg-primary-950/30"
            : "border-border bg-white dark:bg-surface hover:border-primary-200 hover:bg-primary-50/50 dark:hover:bg-primary-950/20"
        }`}
      >
        <span className="mb-1 block text-[24px] opacity-40">{emoji}</span>
        <div className="text-[12.5px] text-muted">ลากหรือวางไฟล์ที่นี่ หรือคลิกเพื่อเลือก</div>
        {file && <div className="mt-1 text-[12px] font-semibold text-primary-600">✅ {file.name}</div>}
        <input type="file" accept=".pdf,image/*"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function StepIndicator({ step }: { step: JuristicStep }) {
  const steps = [
    { num: 1 as JuristicStep, label: "ข้อมูลติดต่อ" },
    { num: 2 as JuristicStep, label: "ข้อมูลบริษัท" },
    { num: 3 as JuristicStep, label: "เอกสาร" },
  ];
  return (
    <div className="px-1 pb-2">
      <div className="flex items-center">
        {steps.map((s, i) => {
          const status = step === s.num ? "active" : step > s.num ? "done" : "idle";
          const circleClass = `relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold border-2 transition ${
            status === "active"
              ? "bg-white text-primary-600 border-primary-600 dark:bg-background"
              : status === "done"
              ? "bg-primary-600 text-white border-primary-600 shadow-[0_2px_8px_rgba(179,0,0,0.25)]"
              : "bg-surface text-muted border-border"
          }`;
          const labelClass = `mt-1 text-[10.5px] ${
            status === "idle" ? "font-normal text-muted" : "font-semibold text-primary-600"
          }`;
          return (
            <Fragment key={s.num}>
              <div className="flex flex-1 flex-col items-center">
                <div className={circleClass}>{s.num}</div>
                <div className={labelClass}>{s.label}</div>
              </div>
              {i < steps.length - 1 && (
                <div className={`-mt-3.5 h-0.5 flex-1 transition-colors ${
                  step > s.num ? "bg-primary-300" : "bg-border"
                }`} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <p className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{msg}</p>
  );
}

function SubmitBtn({ children, pending, flex1 }: { children: React.ReactNode; pending?: boolean; flex1?: boolean }) {
  return (
    <button type="submit" disabled={pending}
      className={`flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[15px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 ${
        flex1 ? "flex-1" : "w-full"
      }`}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function NextBtn({ onClick, pending, children }: { onClick: () => void; pending?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={pending}
      className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[15px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function BackBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="h-[50px] w-24 shrink-0 rounded-2xl border-[1.5px] border-border bg-white dark:bg-surface text-sm font-semibold text-muted transition hover:border-primary-200 hover:text-foreground"
    >
      ← {children}
    </button>
  );
}

/* ─────────────────────────── OTP STEP (B1 prod blocker) ─────────────────────────── */
function OtpStep({
  phone, code, onCodeChange, onVerify, onResend, onBack,
  resendIn, pending, error,
}: {
  phone: string;
  code: string;
  onCodeChange: (v: string) => void;
  onVerify: (code: string) => void;
  onResend: () => void;
  onBack: () => void;
  resendIn: number;
  pending: boolean;
  error: string | null;
}) {
  function formatPhone(p: string): string {
    const clean = p.replace(/\D/g, "");
    if (clean.length !== 10) return p;
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }

  return (
    <div className="space-y-2.5">
      <div className="text-center">
        <div className="mb-1 text-3xl">📱</div>
        <div className="text-[15px] font-semibold text-foreground">ยืนยันเบอร์โทรศัพท์</div>
        <div className="mt-1 text-[12.5px] text-muted">
          ส่งรหัส OTP 6 หลักไปยัง
        </div>
        <div className="mt-0.5 text-[13.5px] font-semibold text-primary-600">
          {formatPhone(phone)}
        </div>
      </div>

      <div className="py-2">
        <OtpInput
          value={code}
          onChange={onCodeChange}
          onComplete={onVerify}
          disabled={pending}
        />
      </div>

      <div className="text-center text-[12px] text-muted">
        ไม่ได้รับรหัส?{" "}
        {resendIn > 0 ? (
          <span className="text-muted">ขอใหม่ได้ใน {resendIn} วินาที</span>
        ) : (
          <button
            type="button"
            onClick={onResend}
            disabled={pending}
            className="font-semibold text-primary-600 hover:text-primary-700 hover:underline disabled:opacity-50"
          >
            ส่งรหัสใหม่
          </button>
        )}
      </div>

      {error && <ErrorBox msg={error} />}

      <div className="flex gap-2.5">
        <BackBtn onClick={onBack}>ย้อนกลับ</BackBtn>
        <button
          type="button"
          onClick={() => onVerify(code)}
          disabled={pending || code.length !== 6}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[15px] text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          ยืนยันรหัส
        </button>
      </div>
    </div>
  );
}

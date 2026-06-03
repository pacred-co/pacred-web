"use client";

import { useState, useTransition, useRef, useEffect, Fragment } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, User, Lock, Mail, Hash, Building2, Loader2, Phone, MessageSquare, ChevronDown, Check, CheckCircle2, UserRound, BadgeCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import {
  registerPersonal,
  registerJuristicStep1,
  saveJuristicStep2,
  uploadJuristicDoc,
  completeJuristicRegistration,
  type RegisterSuccess,
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
/**
 * Legacy `register.php` `<select name="shopUser">` values — the
 * "ซื้อไปใช้เอง" / "ซื้อไปขาย" question. Stored verbatim as the legacy
 * varchar(1) `"1"` / `"2"`; the server action maps "1"→shop_user=false
 * (use-self), "2"→shop_user=true (resell). Per the legacy column
 * comment in 0081_pcs_legacy_schema.sql: `'1=ซื้อไปใข้เอง'`.
 */
type ShopUserId = "1" | "2";

/* ─────────────────────────── CONSTANTS ─────────────────────────── */
const ERR: Record<string, string> = {
  invalid_otp: "OTP ไม่ถูกต้องหรือหมดอายุ",
  invalid_input: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  rate_limit: "สมัครเกินจำนวนครั้งที่กำหนด กรุณารอสักครู่แล้วลองใหม่",
  captcha_failed: "ระบบตรวจสอบความปลอดภัยไม่ผ่าน กรุณาลองใหม่",
  sms_failed: "ส่ง SMS ไม่สำเร็จ ลองอีกครั้ง",
  signup_failed: "สมัครไม่สำเร็จ — เบอร์นี้อาจสมัครไปแล้ว",
  phone_exists: "เบอร์นี้มีบัญชีอยู่แล้ว — กรุณาเข้าสู่ระบบด้วยรหัสผ่านเดิม (ลืมรหัส กดลืมรหัสผ่านที่หน้าเข้าสู่ระบบ)",
  profile_failed: "บันทึกโปรไฟล์ไม่สำเร็จ",
  signin_failed: "เข้าสู่ระบบหลังสมัครไม่สำเร็จ",
  must_agree: "ต้องยอมรับข้อกำหนดก่อนสมัคร",
  upload_failed: "อัปโหลดไฟล์ไม่สำเร็จ — ลองอีกครั้ง หรือ ตรวจสอบเครือข่าย",
  doc_record_failed: "บันทึกข้อมูลเอกสารไม่สำเร็จ — แจ้งแอดมินหากเจอซ้ำ",
  update_failed: "บันทึกข้อมูลไม่สำเร็จ — แจ้งแอดมินหากเจอซ้ำ",
  file_too_large: "ไฟล์ใหญ่เกิน 10 MB",
  invalid_mime: "รับเฉพาะ PDF / JPG / PNG",
  invalid_doc_type: "ประเภทเอกสารไม่ถูกต้อง",
  no_file: "ไม่พบไฟล์ที่อัปโหลด",
  not_signed_in: "เซสชันหมดอายุ กรุณา login ใหม่",
};

/**
 * Map a server error code → a user message. Handles the `phone_exists:PRxxx`
 * shape (registerPersonal / registerJuristicStep1 append the customer's
 * existing member code after the colon — OTP-gated, so it's their own code)
 * by surfacing the code: "เบอร์นี้มีรหัสอยู่แล้ว: PRxxx — เข้าสู่ระบบ…".
 */
function mapErr(error: string): string {
  if (error.startsWith("phone_exists")) {
    const code = error.split(":")[1]?.trim();
    return code
      ? `เบอร์นี้มีรหัสอยู่แล้ว: ${code} — กรุณาเข้าสู่ระบบด้วยรหัสผ่านเดิม (ลืมรหัสผ่าน กดลืมรหัสผ่านที่หน้าเข้าสู่ระบบ)`
      : ERR.phone_exists;
  }
  return ERR[error] ?? error;
}

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
  initialRecom = null,
}: {
  initialTab?: TabId;
  juristicResume?: RegisterResumeState | null;
  /** Affiliate / co-brand code captured from `?recom=` on the landing URL —
   *  forwarded into both Personal + Juristic submissions. The server wrapper
   *  in `page.tsx` already sanitized + validated it; we just render the
   *  attribution badge + ship it. Legacy parity for `regis-tam.php`. */
  initialRecom?: string | null;
}) {
  const [tab, setTab] = useState<TabId>(initialTab);

  // 2026-05-28 — DROPPED the body-scroll-lock + pinned-viewport-height
  // container. The old layout used `h-[calc(100dvh-56px)] flex flex-col`
  // (pin form to exact viewport) + `overflow-hidden` on <main> + a JS
  // body+html `overflow:hidden` lock on mobile, to suppress a ~64px
  // phantom-scroll tail from the NavBar's drawer. But the consequence
  // was: when popovers (ServiceChips / SourceChips / ShopUserSelect /
  // OTP error banner) expand inside the form, the action area (which
  // uses `mt-auto` to hug the bottom) gets pushed BELOW the visible
  // viewport AND body scroll is locked — user physically cannot reach
  // the "ขอรหัส OTP" / "สมัครสมาชิก" button on a phone (the user's
  // 2026-05-28 complaint: "สไลลงไปกดปุ่ม บันทึกไม่ได้").
  //
  // Now: `min-h-[calc(...)]` so the container is at least one viewport
  // tall (still looks like a full-screen card) but grows when content
  // demands; `overflow-visible` lets the body scroll naturally; the
  // phantom drawer tail is a cosmetic non-issue compared to a dead
  // submit button. The NavBar drawer fix is tracked separately.

  return (
    <>
      <NavBar />
      <main className="flex items-start justify-center bg-background px-4 pt-0 pb-0 md:py-3">
        <div className="w-full max-w-[540px] min-h-[calc(100dvh-56px)] rounded-none border-0 bg-white p-3 shadow-[0_20px_50px_rgba(0,0,0,0.04)] dark:border-border dark:bg-surface sm:p-7 md:min-h-0 md:h-auto md:rounded-[24px] md:border md:border-white/80">

          {/* Logo — wordmark (140×140 source w/ ~25% whitespace top+bottom); render at
              110px square + tight negative margins so title hugs the wordmark baseline.
              HIDDEN on mobile — navbar already shows the Pacred wordmark + saves
              ~88px vertical so the whole form fits in one phone viewport. */}
          <div className="hidden md:-mt-2 md:-mb-7 md:flex h-[88px] items-end justify-center overflow-visible">
            <Image
              src="/images/pacred-logo-red.png"
              alt="Pacred"
              width={140}
              height={140}
              className="h-[110px] w-[110px] object-contain"
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

          {initialRecom && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[12.5px] text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              คุณกำลังสมัครภายใต้กลุ่ม{" "}
              <span className="font-semibold notranslate">{initialRecom}</span>
            </div>
          )}

          {tab === "personal"
            ? <PersonalForm recom={initialRecom} />
            : <JuristicForm resume={juristicResume} recom={initialRecom} />}
        </div>
      </main>
    </>
  );
}

/* ─────────────────────────── PERSONAL FORM ─────────────────────────── */
function PersonalForm({ recom }: { recom: string | null }) {
  const nextUrl = safeNext(useSearchParams().get("next"));
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [phone, setPhone]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPwd, setShowPwd]     = useState(false);
  const [services, setServices]   = useState<ServiceId[]>([]);
  const [source, setSource]       = useState<SourceId | null>(null);
  // Legacy register.php <select name="shopUser"> — "ซื้อไปใช้เอง" / "ซื้อไปขาย".
  // Required field per legacy; null means the customer has not picked yet.
  const [shopUser, setShopUser]   = useState<ShopUserId | null>(null);
  const [email, setEmail]         = useState("");
  const [agreed, setAgreed]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const captchaRef = useRef<HCaptchaHandle>(null);
  // 2026-06-02 — success-popup payload (member code + assigned sales rep).
  // Set on a successful signup → renders RegisterSuccessModal instead of an
  // immediate redirect; the modal's "เข้าสู่ระบบ" button does the redirect.
  const [success, setSuccess] = useState<RegisterSuccess | null>(null);

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
      recom,
      shopUser,
      email: email || "",
      otp,
      agreed,
      captchaToken,
    });
    if (res.ok) {
      trackSignUp("personal");
      // 2026-06-02 — show the success popup (member code + assigned sales rep)
      // instead of redirecting immediately. The modal's "เข้าสู่ระบบ" button
      // performs the hard navigation (see onEnter below). When the payload is
      // missing (member_code couldn't be read), fall back to the prior direct
      // redirect so the user is never stuck on the OTP screen.
      if (res.data) {
        setSuccess(res.data);
      } else {
        window.location.replace(nextUrl ?? "/dashboard");
      }
    } else {
      setError(mapErr(res.error));
      captchaRef.current?.reset();
    }
  }

  function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!shopUser) { setError("กรุณาเลือกประเภทการซื้อสินค้า"); return; }
    if (!agreed) { setError(ERR.must_agree); return; }
    setError(null);
    startTransition(async () => {
      const req = await requestOtp(phone, "register");
      if (!req.ok) {
        setError(mapErr(req.error));
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
      if (!req.ok) { setError(mapErr(req.error)); return; }
      setOtpCode("");
      setResendIn(60);
    });
  }

  // 2026-06-02 — signup committed → show ONLY the success popup (member code +
  // assigned sales rep). The CTA performs the hard redirect to /dashboard.
  if (success) {
    return (
      <RegisterSuccessModal
        data={success}
        onEnter={() => window.location.replace(nextUrl ?? "/dashboard")}
      />
    );
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

      {/* Shop-user — legacy <select name="shopUser"> on register.php
          "ซื้อไปใช้เอง / ซื้อไปขาย". Required field per legacy. Feeds
          sales segmentation (profiles.shop_user boolean). */}
      <FieldWrap label={<>ซื้อสินค้า <Req /></>}>
        <ShopUserSelect selected={shopUser} onSelect={setShopUser} />
      </FieldWrap>

      {/* Email (optional) */}
      <FieldWrap
        label={<>อีเมล <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-[11px] font-normal text-muted">ไม่จำเป็น</span></>}
      >
        <IconInput icon={<Mail className="h-4 w-4" />}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="อีเมล (ไม่ต้องกรอกก็ได้)" className={`${INPUT_BASE} pl-11`} />
        </IconInput>
      </FieldWrap>

      {/* Action area — natural flow under the form fields. 2026-05-28: the
          previous `mt-auto` (form-flex-1) layout pushed this group below
          the viewport when a popover expanded, leaving the submit button
          unreachable on phone. Container is now min-h instead of fixed-h,
          so the body scrolls and the action area follows fields naturally. */}
      <div className="space-y-2.5 pt-2">
        <AgreeRow checked={agreed} onChange={setAgreed} />
        {error && <ErrorBox msg={error} />}
        <HCaptchaInvisible ref={captchaRef} />
        <p className="text-center text-[12px] leading-[1.5] text-muted">
          กดเพื่อรับรหัส OTP 6 หลักทาง SMS — ยืนยันเบอร์แล้วสมัครเสร็จในขั้นถัดไป
        </p>
        <SubmitBtn pending={pending}>
          <MessageSquare className="h-4 w-4" /> ขอรหัส OTP
        </SubmitBtn>
      </div>
    </form>
  );
}

/* ─────────────────────────── JURISTIC FORM ─────────────────────────── */
function JuristicForm({
  resume,
  recom,
}: {
  resume: RegisterResumeState | null;
  recom: string | null;
}) {
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
  // Legacy register.php <select name="shopUser"> — same as PersonalForm.
  // Required for the new account; null means the customer has not picked yet.
  const [shopUser, setShopUser] = useState<ShopUserId | null>(null);

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
  /**
   * Step-3 progress label shown next to the spinner.
   * - "uploading" — files in flight
   * - "finalizing" — uploads done, profiles.status=active in flight
   * - null — idle (button shows just "สมัครสมาชิก")
   *
   * 2026-05-28 — added because users on mobile mistake the spinner alone
   * for "stuck" (3 photos × ~3-10 s each over 4G ≈ 10-30 s total). The
   * status label confirms the upload is making progress.
   */
  const [submitStage, setSubmitStage] = useState<null | "uploading" | "finalizing">(null);
  // 2026-06-02 — success-popup payload, shown after step-3 completes (member
  // code + assigned sales rep) instead of an immediate redirect.
  const [success, setSuccess] = useState<RegisterSuccess | null>(null);
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
    // Gap #5 fix (2026-05-27): switched from the dead
    // `opendata.dbd.go.th/api/v1/*` endpoints (retired 2026-05-17, every
    // request 404'd → every lookup fell into "unavailable" → customer
    // always filled manually) to Pacred's own `/api/dbd/[taxId]` route
    // handler, which calls the CURRENT CKAN 2.10 datastore_search endpoint
    // (`api/3/action/datastore_search`) with the WAF-bypass User-Agent +
    // proper Thai-field-name encoding. The route normalises the response
    // shape so this client-side path no longer juggles 4 alternate field
    // names per attribute (juristic_name_th vs JuristicNameTH vs name_th
    // vs CompanyName, etc.). Response shape:
    //   200 { name, address, subdistrict, district, province, postcode }
    //   400 { error: "invalid_id" }        — not 13-digit
    //   404 { error: "not_found" }         — genuine no-record
    //   502 { error: "api_error"|"fetch_failed", ... } — DBD/WAF down
    try {
      const res = await fetch(`/api/dbd/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 404) {
        setTaxStatus("notfound");
        return;
      }
      if (!res.ok) {
        // 400 (shouldn't happen — we client-gate on 13 digits) or 502 (DBD
        // upstream / WAF down) → honest "fill manually" notice. Reserves
        // "notfound" for a genuine 200-with-no-record case.
        setTaxStatus("unavailable");
        return;
      }
      const d = (await res.json()) as {
        name?: string;
        address?: string;
        subdistrict?: string;
        district?: string;
        province?: string;
        postcode?: string;
      };
      if (!d.name) {
        // Defensive — the route handler should already 404 on no-record,
        // but if it returns a body with no name (edge case) treat as
        // not found rather than write an empty company name.
        setTaxStatus("notfound");
        return;
      }
      setCompanyName(d.name);
      setAddressLine(d.address ?? "");
      setSubdistrict(d.subdistrict ?? "");
      setDistrict(d.district ?? "");
      setProvince(d.province ?? "");
      setPostcode(d.postcode ?? "");
      setTaxStatus("found");
    } catch {
      // Client-side timeout / network failure.
      setTaxStatus("unavailable");
    }
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
      recom,
      shopUser,
      otp,
      captchaToken,
    });
    if (res.ok) {
      setStep(2);
      setStep1Phase("form");
      setOtpCode("");
    } else {
      setError(mapErr(res.error));
      captchaRef.current?.reset();
    }
  }

  function nextStep1() {
    if (!shopUser) { setError("กรุณาเลือกประเภทการซื้อสินค้า"); return; }
    setError(null);
    startTransition(async () => {
      const req = await requestOtp(phone, "register");
      if (!req.ok) {
        setError(mapErr(req.error));
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
      if (!req.ok) { setError(mapErr(req.error)); return; }
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
      else setError(mapErr(res.error));
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
    setSubmitStage("uploading");
    startTransition(async () => {
      try {
        // 2026-05-28 — parallelise the 3 uploads. The previous sequential
        // chain was responsible for the "ไม่ไปต่อ" complaint on mobile:
        // 3 iPhone JPEGs at ~3-10 s each = 10-30 s of pure spinner with
        // no progress signal, easily mistaken for "stuck". Promise.all
        // runs them concurrently → typical total drops to ~5-12 s and
        // the new `submitStage` label keeps the user informed.
        const [r1, r2, r3] = await Promise.all([
          uploadOne(docCompany, "company_affidavit"),
          uploadOne(docVAT, "vat"),
          uploadOne(docID, "national_id"),
        ]);
        if (!r1.ok) { setError(ERR[(r1 as { error: string }).error] ?? (r1 as { error: string }).error); setSubmitStage(null); return; }
        if (!r2.ok) { setError(ERR[(r2 as { error: string }).error] ?? (r2 as { error: string }).error); setSubmitStage(null); return; }
        if (!r3.ok) { setError(ERR[(r3 as { error: string }).error] ?? (r3 as { error: string }).error); setSubmitStage(null); return; }

        setSubmitStage("finalizing");
        const done = await completeJuristicRegistration();
        if (done.ok) {
          trackSignUp("juristic");
          // 2026-06-02 — show the success popup (member code + assigned sales
          // rep) instead of redirecting immediately. The modal's "เข้าสู่ระบบ"
          // button does the hard navigation (see the `success` render below).
          // When the payload is missing, fall back to the prior direct
          // redirect (window.location.replace — same reason as 2026-05-28:
          // /dashboard fires 5 tb_* counts, so a hard nav avoids leaving the
          // submission spinner up; default /dashboard per d1-fidelity §2).
          if (done.data) {
            setSubmitStage(null);
            setSuccess(done.data);
          } else {
            window.location.replace(nextUrl ?? "/dashboard");
          }
          return;
        }
        setError(ERR[done.error] ?? done.error);
        setSubmitStage(null);
      } catch (err) {
        // 2026-05-28 — surface any silent throw from the await chain.
        // Without the try/catch a server-action exception (network drop,
        // bodySizeLimit reject on a >12 MB file, a thrown rather than
        // returned error inside the action) would leave the user staring
        // at a perpetually-spinning button — the original "won't proceed"
        // symptom. Now it falls through to a visible error + the button
        // re-enables so they can retry.
        console.error("juristic submit threw:", err);
        setError(err instanceof Error ? `เกิดข้อผิดพลาด: ${err.message}` : "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่");
        setSubmitStage(null);
      }
    });
  }

  // 2026-06-02 — juristic signup committed (step 3 done) → show ONLY the
  // success popup (member code + assigned sales rep). The CTA redirects.
  if (success) {
    return (
      <RegisterSuccessModal
        data={success}
        onEnter={() => window.location.replace(nextUrl ?? "/dashboard")}
      />
    );
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

          {/* Shop-user — legacy register.php <select name="shopUser">.
              Required per legacy; feeds sales segmentation. */}
          <FieldWrap label={<>ซื้อสินค้า <Req /></>}>
            <ShopUserSelect selected={shopUser} onSelect={setShopUser} />
          </FieldWrap>

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

          {submitStage && (
            <p
              role="status"
              aria-live="polite"
              className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-center text-[12.5px] text-amber-700 dark:text-amber-300"
            >
              {submitStage === "uploading"
                ? "⏳ กำลังอัปโหลดเอกสาร — ใช้เวลา 10-30 วินาที กรุณาอย่าปิดหน้านี้"
                : "✅ อัปโหลดเสร็จ กำลังบันทึกข้อมูล..."}
            </p>
          )}

          <div className="flex gap-2.5">
            <BackBtn onClick={() => { setStep(2); setError(null); }}>ย้อนกลับ</BackBtn>
            <SubmitBtn pending={pending} flex1>
              {submitStage === "uploading" ? "กำลังอัปโหลด..."
                : submitStage === "finalizing" ? "กำลังบันทึก..."
                : "สมัครสมาชิก"}
            </SubmitBtn>
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

/**
 * ShopUserSelect — legacy `register.php` `<select name="shopUser">`.
 *
 *   Legacy options:
 *     value="1" — ซื้อไปใช้เอง  (use-self · default sales segment)
 *     value="2" — ซื้อไปขาย     (resell · reseller segment)
 *
 * Values stored in `tb_users.shopuser` / `tb_register.shopuser` as a
 * varchar(1) (column comment: `'1=ซื้อไปใข้เอง'`). The server action
 * maps `"1"`→`profiles.shop_user=false`, `"2"`→`true`. Per
 * d1-fidelity-customer.md §3.2.
 */
function ShopUserSelect({ selected, onSelect }: { selected: ShopUserId | null; onSelect: (id: ShopUserId) => void }) {
  return (
    <div className="relative">
      <select
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value as ShopUserId)}
        className={`${INPUT_BASE} appearance-none pr-9 cursor-pointer ${selected ? "text-foreground" : "text-muted"}`}
      >
        <option value="" disabled>เลือกประเภทการซื้อสินค้า</option>
        <option value="1" className="text-foreground">ซื้อไปใช้เอง</option>
        <option value="2" className="text-foreground">ซื้อไปขาย</option>
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
  // 2026-05-28 — scroll the error into view + brief focus on mount.
  // The juristic step-3 submit was reported as "won't proceed" — the
  // action was returning an error but the ErrorBox renders ABOVE the
  // submit button and on a long form the user was looking at the
  // button and never saw the message appear. scrollIntoView with
  // `block: 'center'` parks it in the middle of the viewport so it's
  // impossible to miss.
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [msg]);
  return (
    <p
      ref={ref}
      role="alert"
      aria-live="assertive"
      className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400"
    >
      {msg}
    </p>
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

/* ───────────────────── REGISTER SUCCESS MODAL ─────────────────────
 * 2026-06-02 — shown after a signup commits (personal submit + juristic
 * step-3 complete) instead of bouncing straight to /dashboard. Surfaces the
 * minted member code + the assigned sales rep (round-robin · tb_admin pool)
 * so "ทีมงานจะติดต่อกลับ" is concrete. Mobile-first per AGENTS.md §6: full-
 * screen overlay, ≥16px text, the CTA is a 52px tap target.
 */
function RegisterSuccessModal({
  data,
  onEnter,
}: {
  data: RegisterSuccess;
  onEnter: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-success-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-gray-900 p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
          </div>
          <h2
            id="register-success-title"
            className="text-[20px] font-bold text-gray-900 dark:text-white"
          >
            สมัครสำเร็จ 🎉
          </h2>
          <p className="mt-1.5 text-[15px] text-gray-500 dark:text-gray-400">
            ยินดีต้อนรับสู่ Pacred
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {/* Member code */}
          <div className="flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <BadgeCheck className="h-5 w-5 shrink-0 text-primary-600" />
            <div className="min-w-0">
              <p className="text-[13px] text-gray-500 dark:text-gray-400">รหัสสมาชิกของคุณ</p>
              <p className="text-[18px] font-bold tracking-wide text-gray-900 dark:text-white">
                {data.memberCode}
              </p>
            </div>
          </div>

          {/* Assigned sales rep */}
          <div className="flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
            <UserRound className="h-5 w-5 shrink-0 text-primary-600" />
            <div className="min-w-0">
              <p className="text-[13px] text-gray-500 dark:text-gray-400">เซลที่ดูแล</p>
              <p className="text-[16px] font-semibold text-gray-900 dark:text-white">
                Sales {data.repName}
              </p>
              <a
                href={`tel:${data.repPhone.replace(/[^\d+]/g, "")}`}
                className="text-[15px] font-medium text-primary-600 hover:underline"
              >
                โทร {data.repPhone}
              </a>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[14px] leading-[1.6] text-gray-500 dark:text-gray-400">
          ทีมงานจะติดต่อกลับโดยเร็วที่สุด
        </p>

        <button
          type="button"
          onClick={onEnter}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-[15px] text-[16px] font-semibold text-white shadow-[0_8px_20px_rgba(179,0,0,0.25)] transition hover:-translate-y-0.5 hover:bg-primary-700 hover:shadow-[0_12px_25px_rgba(179,0,0,0.35)]"
        >
          เข้าสู่ระบบ
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition, useRef, Fragment } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingTabs } from "@/components/sections/floating-tabs";
import { GoogleIcon, LineIcon, FacebookIcon } from "@/components/icons/social-icons";
import {
  registerPersonal,
  registerJuristicStep1,
  saveJuristicStep2,
  uploadJuristicDoc,
  completeJuristicRegistration,
  signInWithOAuth,
} from "@/actions/auth";

/* ─────────────────────────── TYPES ─────────────────────────── */
type TabId = "personal" | "juristic";
type JuristicStep = 1 | 2 | 3;
type ServiceId = "import" | "export" | "clear" | "customs" | "order" | "payment";
type SourceId = "line" | "fb" | "google" | "youtube" | "tiktok" | "ig" | "friend" | "ad";

/* ─────────────────────────── CONSTANTS ─────────────────────────── */
const ERR: Record<string, string> = {
  invalid_otp: "OTP ไม่ถูกต้องหรือหมดอายุ",
  invalid_input: "ข้อมูลไม่ครบหรือไม่ถูกต้อง",
  rate_limit: "ส่ง OTP เกิน 3 ครั้งใน 1 ชม. กรุณารอสักครู่",
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

const SERVICES: { id: ServiceId; label: string; sub?: string; emoji: string }[] = [
  { id: "import",  label: "นำเข้าสินค้า",        sub: "รถ/เรือ/แอร์", emoji: "📦" },
  { id: "export",  label: "ส่งออกสินค้า",        sub: "รถ/เรือ/แอร์", emoji: "🚢" },
  { id: "clear",   label: "เคลียร์สินค้าติดด่าน",               emoji: "🚧" },
  { id: "customs", label: "พิธีการศุลกากร",                     emoji: "📋" },
  { id: "order",   label: "ฝากสั่งซื้อสินค้า",                 emoji: "🛒" },
  { id: "payment", label: "ฝากโอนชำระสินค้า",                  emoji: "💸" },
];

const SOURCES: { id: SourceId; label: string; icon: React.ReactNode }[] = [
  {
    id: "line", label: "Line",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="#06C755" />
        <path fill="white" d="M16.2 9.3C16.2 6.1 13 3.5 9.1 3.5S2 6.1 2 9.3c0 2.9 2.6 5.4 6.1 5.8.24.05.56.16.64.37.07.2.05.5 0 .7l-.1.62c-.03.2-.15.77.67.42C10.5 16.8 14.7 14 16 12.2c.14-.22.2-.45.2-.7v-.06z" />
        <path fill="#06C755" d="M7.8 10.7H6.5V7.8h-.7v-.6h2v.6H7.8zm2.3 0H9.4l-1.2-1.8v1.8h-.7V7.2h.75l1.15 1.75V7.2h.7zm1.7 0h-1.65V7.2h.7v2.9h.95zm2.1-2.3H12.8V8h1.1v.6h-1.1v.5H14v.6h-1.85V7.2H14z" />
      </svg>
    ),
  },
  {
    id: "fb", label: "Facebook",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="#1877F2" />
        <path fill="white" d="M11.2 17v-6.1h2l.3-2.4h-2.3V6.9c0-.7.19-1.18 1.2-1.18H13.6V3.2C13.24 3.14 12.38 3 11.38 3 9.3 3 7.9 4.25 7.9 6.6V8.5H6v2.4h1.9V17h3.3z" />
      </svg>
    ),
  },
  {
    id: "google", label: "Google",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="white" stroke="#e0e0e0" strokeWidth="0.8" />
        <path fill="#4285F4" d="M17 10.2c0-.48-.04-.94-.11-1.38H10v2.6h3.95c-.17.9-.7 1.66-1.48 2.17v1.8h2.4C16.1 14.05 17 12.27 17 10.2z" />
        <path fill="#34A853" d="M10 17.5c1.96 0 3.6-.65 4.8-1.75l-2.4-1.8c-.65.44-1.48.7-2.4.7-1.83 0-3.38-1.24-3.93-2.9H3.55v1.84C4.75 15.83 7.2 17.5 10 17.5z" />
        <path fill="#FBBC04" d="M6.07 12.06a4.2 4.2 0 010-2.62V7.6H3.55A7.47 7.47 0 003 10a7.4 7.4 0 00.55 2.41l2.52-1.85z" />
        <path fill="#EA4335" d="M10 5.5c1.03 0 1.96.36 2.68 1.05l2.01-2C13.6 3.24 11.96 2.5 10 2.5a7.5 7.5 0 00-6.45 3.6l2.52 1.85C6.62 6.56 8.17 5.5 10 5.5z" />
      </svg>
    ),
  },
  {
    id: "youtube", label: "Youtube",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="#FF0000" />
        <path fill="white" d="M15.8 7.1s-.2-1.3-.8-1.84c-.76-.8-1.6-.81-2-.86C11.12 4.3 10 4.3 10 4.3h-.02s-1.12 0-3.14.1c-.36.05-1.2.06-1.97.86C4.28 5.8 4.07 7.1 4.07 7.1S3.87 8.48 3.87 9.87v1.27c0 1.38.2 2.77.2 2.77s.2 1.28.8 1.84c.76.8 1.76.77 2.2.85C8.5 16.83 10 16.8 10 16.8s1.13-.02 3.15-.22c.36-.05 1.2-.06 1.96-.86.6-.56.8-1.84.8-1.84s.2-1.38.2-2.77V9.87c0-1.4-.2-2.77-.2-2.77zm-8.5 5.64V7.3L13.2 10l-5.9 2.74z" />
      </svg>
    ),
  },
  {
    id: "tiktok", label: "TikTok",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="#010101" />
        <path fill="#00F2EA" d="M13 3.5v.1c.4 1.05 1.25 1.8 2.25 2.05v1.98c-.9-.08-1.7-.4-2.35-.9v4.57c0 1.97-1.55 3.55-3.47 3.55A3.48 3.48 0 016 11.3a3.48 3.48 0 013.47-3.55c.17 0 .33.02.5.04v2c-.17-.04-.33-.07-.5-.07-.85 0-1.55.7-1.55 1.58 0 .88.7 1.58 1.55 1.58s1.56-.7 1.56-1.58V3.5H13z" />
        <path fill="#FF004F" d="M12.5 3.5v.1c.4 1.05 1.25 1.8 2.25 2.05v1.98c-.9-.08-1.7-.4-2.35-.9v4.57c0 1.97-1.55 3.55-3.47 3.55A3.48 3.48 0 015.5 11.3a3.48 3.48 0 013.47-3.55c.17 0 .33.02.5.04v2c-.17-.04-.33-.07-.5-.07-.85 0-1.55.7-1.55 1.58 0 .88.7 1.58 1.55 1.58s1.56-.7 1.56-1.58V3.5h2.47z" opacity="0.65" transform="translate(0.5 0)" />
      </svg>
    ),
  },
  {
    id: "ig", label: "Instagram",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="ig-reg-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F58529" />
            <stop offset="50%" stopColor="#DD2A7B" />
            <stop offset="100%" stopColor="#515BD4" />
          </linearGradient>
        </defs>
        <rect width="20" height="20" rx="4.5" fill="url(#ig-reg-grad)" />
        <rect x="4.5" y="4.5" width="11" height="11" rx="3" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="2.9" fill="none" stroke="white" strokeWidth="1.5" />
        <circle cx="14.2" cy="5.8" r="1" fill="white" />
      </svg>
    ),
  },
  { id: "friend", label: "เพื่อนแนะนำ", icon: <span style={{ fontSize: 18, lineHeight: 1 }}>👥</span> },
  { id: "ad",     label: "โฆษณา",       icon: <span style={{ fontSize: 18, lineHeight: 1 }}>📢</span> },
];

/* ─────────────────────────── MAIN PAGE ─────────────────────────── */
export default function RegisterPage() {
  const t = useTranslations("register");
  const [tab, setTab] = useState<TabId>("personal");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthPending, startOauthTransition] = useTransition();

  function handleOAuth(provider: "google" | "facebook") {
    setOauthError(null);
    startOauthTransition(async () => {
      const res = await signInWithOAuth(provider);
      if (res.ok && res.data) {
        window.location.href = res.data.url;
      } else {
        setOauthError("เข้าสู่ระบบผ่านโซเชียลล้มเหลว ลองใหม่อีกครั้ง");
      }
    });
  }

  function handleLineSignUp() {
    setOauthError("LINE Login กำลังจะมาเร็วๆ นี้");
  }

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-start justify-center bg-[#F0F2F5] dark:bg-background px-4 py-7">
        <div className="w-full max-w-[540px] rounded-[24px] bg-white dark:bg-surface px-9 pb-7 pt-8 shadow-[0_8px_48px_rgba(0,0,0,0.07)]">

          {/* Header */}
          <div className="border-b border-[#F0F2F5] dark:border-border pb-3 mb-4 text-center text-sm text-[#9198A8] tracking-wide">
            {t("title")}
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-2">
            <Image
              src="/images/pacred-logo-red.png"
              alt="Pacred"
              width={160}
              height={52}
              className="h-auto w-auto"
              priority
            />
          </div>

          {/* Login link */}
          <p className="mb-5 text-center text-[13.5px] text-[#8A8F9B]">
            {t("haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-[#D42B2B] hover:underline">
              {t("signInLink")}
            </Link>
          </p>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, borderRadius: 16, backgroundColor: "#F4F5F8", padding: 4, marginBottom: 24 }}>
            {(["personal", "juristic"] as TabId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                style={{
                  flex: 1, height: 38,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  borderRadius: 12, fontSize: 14, fontWeight: 600,
                  border: "none", cursor: "pointer", transition: "all .2s",
                  backgroundColor: tab === id ? "#ffffff" : "transparent",
                  color: tab === id ? "#D42B2B" : "#9198A8",
                  boxShadow: tab === id ? "0 2px 10px rgba(0,0,0,0.07)" : "none",
                }}
              >
                {id === "personal" ? "👤" : "🏢"}{" "}
                {id === "personal" ? t("tabPersonal") : t("tabJuristic")}
              </button>
            ))}
          </div>

          {tab === "personal" ? <PersonalForm /> : <JuristicForm />}

          {/* Social divider */}
          <div className="relative my-7">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#F0F2F5] dark:border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-surface px-4 text-[13px] font-medium text-[#8A8F9B]">
                {t("orSignUpWith")}
              </span>
            </div>
          </div>

          {/* Social buttons */}
          {oauthError && <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400">{oauthError}</p>}
          <div className="grid grid-cols-3 gap-2.5">
            <button type="button" onClick={() => handleOAuth("google")} disabled={oauthPending} className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#ECEEF2] dark:border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50">
              <GoogleIcon className="h-[18px] w-[18px]" /> Google
            </button>
            <button type="button" onClick={handleLineSignUp} disabled={oauthPending} className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#ECEEF2] dark:border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50" style={{ color: "#00B900" }}>
              <LineIcon className="h-[18px] w-[18px]" /> LINE
            </button>
            <button type="button" onClick={() => handleOAuth("facebook")} disabled={oauthPending} className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-[#ECEEF2] dark:border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50" style={{ color: "#1877F2" }}>
              <FacebookIcon className="h-[18px] w-[18px]" /> Facebook
            </button>
          </div>

        </div>
      </main>
      <Footer />
      <FloatingTabs />
    </>
  );
}

/* ─────────────────────────── PERSONAL FORM ─────────────────────────── */
function PersonalForm() {
  const t = useTranslations("register");
  const router = useRouter();
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

  function toggleService(id: ServiceId) {
    setServices((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError(ERR.must_agree); return; }
    setError(null);
    startTransition(async () => {
      const res = await registerPersonal({
        firstName, lastName, phone, password,
        services,
        howKnow: source ?? null,
        email: email || "",
        otp: "bypass",
        agreed,
      });
      if (res.ok) { router.replace("/"); router.refresh(); }
      else setError(ERR[res.error] ?? res.error);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Name row */}
      <div className="mb-3.5 flex gap-3">
        <FieldWrap label={t("firstName")}>
          <StyledInput type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("firstNamePh")} prefix="👤" />
        </FieldWrap>
        <FieldWrap label={t("lastName")}>
          <StyledInput type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
            placeholder={t("lastNamePh")} prefix="👤" />
        </FieldWrap>
      </div>

      <FieldWrap label={t("phone")} className="mb-3.5">
        <PhoneInput value={phone} onChange={setPhone} />
      </FieldWrap>

      <FieldWrap label={t("password")} className="mb-3.5">
        <PasswordInput id="pass-p" value={password} onChange={setPassword}
          show={showPwd} onToggle={() => setShowPwd((v) => !v)}
          placeholder={t("passwordPh")} />
      </FieldWrap>

      <FieldWrap label={<>{t("service")} <span className="ml-1 text-[11px] font-normal text-[#8A8F9B]">{t("serviceMulti")}</span></>} className="mb-3.5">
        <ServiceChips selected={services} onToggle={toggleService} />
      </FieldWrap>

      <FieldWrap label={t("howKnow")} className="mb-3.5">
        <SourceChips selected={source} onSelect={setSource} />
      </FieldWrap>

      <FieldWrap
        label={<>{t("email")} <span className="ml-1 rounded bg-[#F0F2F5] px-1.5 py-0.5 text-[11px] font-normal text-[#8A8F9B]">{t("optional")}</span></>}
        className="mb-3.5"
      >
        <StyledInput type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPh")} prefix="✉️" />
      </FieldWrap>

      <AgreeRow checked={agreed} onChange={setAgreed} />
      {error && <ErrorBox msg={error} />}
      <SubmitBtn pending={pending}>👤 {t("submit")}</SubmitBtn>
    </form>
  );
}

/* ─────────────────────────── JURISTIC FORM ─────────────────────────── */
function JuristicForm() {
  const t = useTranslations("register");
  const router = useRouter();
  const [step, setStep] = useState<JuristicStep>(1);

  /* step 1 */
  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [services, setServices] = useState<ServiceId[]>([]);
  const [source, setSource]     = useState<SourceId | null>(null);

  /* step 2 */
  const [taxId, setTaxId]             = useState("");
  const [companyName, setCompanyName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [subdistrict, setSubdistrict] = useState("");
  const [district, setDistrict]       = useState("");
  const [province, setProvince]       = useState("");
  const [postcode, setPostcode]       = useState("");

  /* step 3 */
  const [docCompany, setDocCompany] = useState<File | null>(null);
  const [docVAT, setDocVAT]         = useState<File | null>(null);
  const [docID, setDocID]           = useState<File | null>(null);
  const [agreed, setAgreed]         = useState(false);

  const [error, setError]           = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();
  const taxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function toggleService(id: ServiceId) {
    setServices((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function handleTaxInput(val: string) {
    const clean = val.replace(/\D/g, "");
    setTaxId(clean);
    if (taxTimer.current) clearTimeout(taxTimer.current);
    if (clean.length !== 13) return;
    taxTimer.current = setTimeout(() => fetchCompany(clean), 600);
  }

  async function fetchCompany(id: string) {
    try {
      const res = await fetch(`/api/dbd/${id}`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return;
      const d = await res.json() as Record<string, string>;
      if (d.name)        setCompanyName(d.name);
      if (d.address)     setAddressLine(d.address);
      if (d.subdistrict) setSubdistrict(d.subdistrict);
      if (d.district)    setDistrict(d.district);
      if (d.province)    setProvince(d.province);
      if (d.postcode)    setPostcode(d.postcode);
    } catch { /* silent — user fills manually */ }
  }

  function nextStep1() {
    if (!phone.trim()) { setError("กรุณากรอกเบอร์โทรศัพท์"); return; }
    if (!password || password.length < 6) { setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"); return; }
    setError(null);
    setStep(2);
  }

  function nextStep2() {
    if (!taxId || taxId.length !== 13) { setError("กรุณากรอกเลขผู้เสียภาษี 13 หลักให้ครบ"); return; }
    if (!companyName.trim()) { setError("กรุณากรอกชื่อบริษัท"); return; }
    if (!addressLine.trim()) { setError("กรุณากรอกที่อยู่บริษัท"); return; }
    setError(null);
    setStep(3);
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
      // Step 1: create account (deferred here so requireGuest() doesn't fire mid-flow)
      const s1 = await registerJuristicStep1({
        phone, password, services,
        howKnow: source ?? null,
        otp: "bypass",
      });
      if (!s1.ok) return setError(ERR[s1.error] ?? s1.error);

      // Step 2: save company info (session now exists)
      const s2 = await saveJuristicStep2({
        taxId, companyName, addressLine,
        subdistrict: subdistrict || null,
        district: district || null,
        province: province || null,
        postcode,
      });
      if (!s2.ok) return setError(ERR[s2.error] ?? s2.error);

      // Step 3: upload docs
      const r1 = await uploadOne(docCompany, "company_affidavit");
      if (!r1.ok) return setError(ERR[(r1 as { ok: false; error: string }).error] ?? "upload_failed");
      const r2 = await uploadOne(docVAT, "vat");
      if (!r2.ok) return setError(ERR[(r2 as { ok: false; error: string }).error] ?? "upload_failed");
      const r3 = await uploadOne(docID, "national_id");
      if (!r3.ok) return setError(ERR[(r3 as { ok: false; error: string }).error] ?? "upload_failed");

      const done = await completeJuristicRegistration();
      if (done.ok) { router.replace("/"); router.refresh(); }
      else setError(ERR[done.error] ?? done.error);
    });
  }

  return (
    <form onSubmit={handleFinalSubmit}>
      <StepIndicator step={step} />

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <>
          <div className="mb-3.5 text-right text-[11.5px] text-[#8A8F9B]">{t("stepOf", { current: 1, total: 3 })}</div>

          <FieldWrap label={<>{t("phone")} <Req /></>} className="mb-3.5">
            <PhoneInput value={phone} onChange={setPhone} />
          </FieldWrap>

          <FieldWrap label={<>{t("password")} <Req /></>} className="mb-3.5">
            <PasswordInput id="pass-j" value={password} onChange={setPassword}
              show={showPwd} onToggle={() => setShowPwd((v) => !v)}
              placeholder={t("passwordPh")} />
          </FieldWrap>

          <FieldWrap label={<>{t("service")} <span className="ml-1 text-[11px] font-normal text-[#8A8F9B]">{t("serviceMulti")}</span></>} className="mb-3.5">
            <ServiceChips selected={services} onToggle={toggleService} />
          </FieldWrap>

          <FieldWrap label={t("howKnow")} className="mb-3.5">
            <SourceChips selected={source} onSelect={setSource} />
          </FieldWrap>

          {error && <ErrorBox msg={error} />}
          <div style={{ display: "flex" }}>
            <NextBtn onClick={nextStep1} pending={pending}>{t("next")}</NextBtn>
          </div>
        </>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <div className="mb-3.5 text-right text-[11.5px] text-[#8A8F9B]">{t("stepOf", { current: 2, total: 3 })}</div>

          <FieldWrap label={<>{t("taxId")} <Req /></>} className="mb-1">
            <StyledInput type="text" value={taxId}
              onChange={(e) => handleTaxInput(e.target.value)}
              placeholder={t("taxIdPh")} maxLength={13} prefix="🔢" />
          </FieldWrap>
          <div className="mb-3.5 min-h-[18px] text-[12px] text-[#8A8F9B]">
            {taxId.length > 0 && taxId.length < 13
              ? `กรอก 13 หลัก (${taxId.length}/13)`
              : taxId.length === 13
              ? "กรอกข้อมูลบริษัทด้านล่าง หากระบบดึงข้อมูลได้จะกรอกให้อัตโนมัติ"
              : null}
          </div>

          <FieldWrap label={<>{t("companyName")} <Req /></>} className="mb-3.5">
            <StyledInput type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t("companyNamePh")} prefix="🏛" />
          </FieldWrap>

          <div className="my-4 flex items-center gap-2.5">
            <div className="h-px flex-1 bg-[#F0F2F5] dark:bg-border" />
            <span className="whitespace-nowrap text-[12.5px] font-bold text-foreground">{t("companyAddrTitle")}</span>
            <div className="h-px flex-1 bg-[#F0F2F5] dark:bg-border" />
          </div>

          <FieldWrap label={<>{t("addressLine")} <Req /></>} className="mb-3.5">
            <StyledInput type="text" value={addressLine} onChange={(e) => setAddressLine(e.target.value)}
              placeholder={t("addressLinePh")} />
          </FieldWrap>

          <div className="mb-3.5 grid grid-cols-2 gap-3">
            {[
              { label: t("subdistrict"), value: subdistrict, set: setSubdistrict, ph: t("subdistrict") },
              { label: t("district"),    value: district,    set: setDistrict,    ph: t("district") },
              { label: t("province"),    value: province,    set: setProvince,    ph: t("province") },
              { label: t("postcode"),    value: postcode,    set: setPostcode,    ph: t("postcode"), max: 5, num: true },
            ].map(({ label, value, set, ph, max, num }) => (
              <FieldWrap key={label} label={label}>
                <StyledInput type="text" value={value}
                  onChange={(e) => set(num ? e.target.value.replace(/\D/g, "") : e.target.value)}
                  placeholder={ph} maxLength={max} />
              </FieldWrap>
            ))}
          </div>

          {error && <ErrorBox msg={error} />}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <BackBtn onClick={() => { setStep(1); setError(null); }}>{t("back")}</BackBtn>
            <NextBtn onClick={nextStep2} pending={pending}>{t("next")}</NextBtn>
          </div>
        </>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <>
          <div className="mb-3.5 text-right text-[11.5px] text-[#8A8F9B]">{t("stepOf", { current: 3, total: 3 })}</div>

          <div className="mb-4 rounded-r-lg border-l-[3px] border-[#D42B2B] bg-[#FFF8F6] dark:bg-primary-900/20 px-3 py-2.5 text-[12.5px] leading-[1.5] text-[#8A8F9B]">
            {t("docNote")}
          </div>

          <UploadField label={<>{t("docCompany")} <Req /></>} emoji="☁️" file={docCompany} onChange={setDocCompany} />
          <UploadField label={t("docVAT")}                    emoji="📄" file={docVAT}     onChange={setDocVAT} />
          <UploadField label={<>{t("docID")} <Req /></>}      emoji="🪪" file={docID}      onChange={setDocID} />

          <AgreeRow checked={agreed} onChange={setAgreed} />
          {error && <ErrorBox msg={error} />}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <BackBtn onClick={() => { setStep(2); setError(null); }}>{t("back")}</BackBtn>
            <SubmitBtn pending={pending} flex1>🏢 {t("submit")}</SubmitBtn>
          </div>
        </>
      )}
    </form>
  );
}

/* ─────────────────────────── SHARED COMPONENTS ─────────────────────────── */

const INPUT_BASE_STYLE: React.CSSProperties = {
  height: 44,
  width: "100%",
  borderRadius: 14,
  borderWidth: "1.5px",
  borderStyle: "solid",
  borderColor: "#ECEEF2",
  background: "#FAFBFC",
  padding: "0 14px",
  fontSize: 14,
  color: "#1A1D23",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  outline: "none",
  transition: "all .2s",
};

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string }) {
  const { prefix, onFocus, onBlur, style, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      {prefix && (
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>
          {prefix}
        </span>
      )}
      <input
        {...rest}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={{
          ...INPUT_BASE_STYLE,
          ...(prefix ? { paddingLeft: 36 } : {}),
          ...(focused ? { borderColor: "#E8A0A0", background: "#fff", boxShadow: "0 2px 8px rgba(212,43,43,0.10)" } : {}),
          ...style,
        }}
      />
    </div>
  );
}

function FieldWrap({ label, children, className = "" }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 ${className}`}>
      <label className="mb-1.5 block text-[12.5px] font-semibold text-[#1A1D23] dark:text-foreground">{label}</label>
      {children}
    </div>
  );
}

function Req() {
  return <span className="text-[#D42B2B]">*</span>;
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{
        height: 44, display: "flex", alignItems: "center", gap: 6,
        borderRadius: 14, border: "1.5px solid #ECEEF2", background: "#FAFBFC",
        padding: "0 12px", fontSize: 14, fontWeight: 500, color: "#1A1D23",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 16 }}>🇹🇭</span>
        <span>+66</span>
      </div>
      <StyledInput type="tel" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder="081 234 5678" style={{ flex: 1 }} />
    </div>
  );
}

function PasswordInput({ id, value, onChange, show, onToggle, placeholder }: {
  id: string; value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void; placeholder: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>🔒</span>
      <StyledInput id={id} type={show ? "text" : "password"} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: 36, paddingRight: 40 }} />
      <button type="button" onClick={onToggle}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.35, background: "none", border: "none", cursor: "pointer", transition: "opacity .2s" }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
      >
        {show ? "🙈" : "👁"}
      </button>
    </div>
  );
}

/* ── ServiceChips: top 2 big, bottom 4 compact ── */
function ServiceChips({ selected, onToggle }: { selected: ServiceId[]; onToggle: (id: ServiceId) => void }) {
  const top  = SERVICES.slice(0, 2);
  const rest = SERVICES.slice(2);

  function chipStyle(isActive: boolean): React.CSSProperties {
    return {
      border: `1.5px solid ${isActive ? "#E8A0A0" : "#ECEEF2"}`,
      background: isActive ? "#FFF5F5" : "#FAFBFC",
      color: isActive ? "#D42B2B" : "#9198A8",
      borderRadius: 14, cursor: "pointer", transition: "all .2s",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      textAlign: "center", gap: 4,
      boxShadow: isActive ? "0 2px 8px rgba(212,43,43,0.10)" : "0 1px 3px rgba(0,0,0,0.05)",
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {top.map((s) => {
          const isActive = selected.includes(s.id);
          return (
            <button key={s.id} type="button" onClick={() => onToggle(s.id)}
              style={{ ...chipStyle(isActive), padding: "20px 8px" }}>
              <span style={{ fontSize: 28 }}>{s.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{s.label}</span>
              {s.sub && <span style={{ fontSize: 10, opacity: 0.55, fontWeight: 400 }}>{s.sub}</span>}
            </button>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        {rest.map((s) => {
          const isActive = selected.includes(s.id);
          return (
            <button key={s.id} type="button" onClick={() => onToggle(s.id)}
              style={{ ...chipStyle(isActive), padding: "10px 4px" }}>
              <span style={{ fontSize: 20 }}>{s.emoji}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.2 }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── SourceChips: 4 per row ── */
function SourceChips({ selected, onSelect }: { selected: SourceId | null; onSelect: (id: SourceId) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
      {SOURCES.map((s) => {
        const isActive = selected === s.id;
        return (
          <button key={s.id} type="button" onClick={() => onSelect(s.id)}
            style={{
              minHeight: 54, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              borderRadius: 12,
              border: `1.5px solid ${isActive ? "#E8A0A0" : "#ECEEF2"}`,
              background: isActive ? "#FFF5F5" : "#FAFBFC",
              color: isActive ? "#D42B2B" : "#9198A8",
              fontSize: 11, fontWeight: isActive ? 600 : 400,
              padding: "7px 4px", cursor: "pointer", transition: "all .2s",
              textAlign: "center", lineHeight: 1.3,
              boxShadow: isActive ? "0 2px 8px rgba(212,43,43,0.10)" : "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            {s.icon}
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AgreeRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const t = useTranslations("register");
  return (
    <label className="mb-4 mt-1 flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#D42B2B]" />
      <span className="text-[12.5px] leading-[1.55] text-[#8A8F9B]">
        {t("agreeText")}{" "}
        <Link href="#" className="font-semibold text-[#D42B2B] hover:underline">{t("terms")}</Link>
        {" "}{t("and")}{" "}
        <Link href="#" className="font-semibold text-[#D42B2B] hover:underline">{t("privacy")}</Link>
      </span>
    </label>
  );
}

function UploadField({ label, emoji, file, onChange }: {
  label: React.ReactNode; emoji: string; file: File | null; onChange: (f: File | null) => void;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-[#1A1D23] dark:text-foreground">{label}</label>
      <label
        className="relative block cursor-pointer rounded-[16px] border-[1.5px] border-dashed border-[#ECEEF2] bg-[#FAFBFC] px-4 py-4 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition hover:border-[#E8A0A0] hover:bg-[#FFF5F5]"
        style={file ? { borderColor: "#E8A0A0", background: "#FFF5F5" } : {}}
      >
        <span className="block text-[24px] opacity-40 mb-1">{emoji}</span>
        <div className="text-[12.5px] text-[#8A8F9B]">ลากหรือวางไฟล์ที่นี่ หรือคลิกเพื่อเลือก</div>
        {file && <div className="mt-1 text-[12px] text-[#D42B2B]">✅ {file.name}</div>}
        <input type="file" accept=".pdf,image/*"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0" />
      </label>
    </div>
  );
}

function StepIndicator({ step }: { step: JuristicStep }) {
  const t = useTranslations("register");
  const steps = [
    { num: 1 as JuristicStep, label: t("step1") },
    { num: 2 as JuristicStep, label: t("step2") },
    { num: 3 as JuristicStep, label: t("step3") },
  ];
  return (
    <div style={{ marginBottom: 20, paddingLeft: 4, paddingRight: 4 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((s, i) => {
          const status = step === s.num ? "active" : step > s.num ? "done" : "idle";
          const circleStyle: React.CSSProperties = {
            position: "relative", zIndex: 10,
            display: "flex", width: 28, height: 28,
            alignItems: "center", justifyContent: "center",
            borderRadius: "50%", fontSize: 12, fontWeight: 700, transition: "all .2s",
            ...(status === "active"
              ? { backgroundColor: "#fff", color: "#D42B2B", border: "2px solid #D42B2B" }
              : status === "done"
              ? { backgroundColor: "#D42B2B", color: "#fff", boxShadow: "0 2px 8px rgba(212,43,43,0.25)", border: "2px solid #D42B2B" }
              : { backgroundColor: "#F4F5F8", color: "#9198A8", border: "2px solid #ECEEF2" }),
          };
          return (
            <Fragment key={s.num}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={circleStyle}>{s.num}</div>
                <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: status !== "idle" ? 600 : 400, color: status !== "idle" ? "#D42B2B" : "#8A8F9B" }}>
                  {s.label}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ flex: 1, height: 2, marginTop: -14, backgroundColor: step > s.num ? "#E8A0A0" : "#ECEEF2", transition: "background-color .2s" }} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string }) {
  return <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg}</p>;
}

function SubmitBtn({ children, pending, flex1 }: { children: React.ReactNode; pending?: boolean; flex1?: boolean }) {
  return (
    <button type="submit" disabled={pending}
      style={{ display: "flex", flex: flex1 ? 1 : undefined, width: flex1 ? undefined : "100%", height: 46, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, background: "linear-gradient(90deg,#D42B2B,#B01E1E)", fontSize: 15, fontWeight: 700, color: "#fff", border: "none", cursor: pending ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1, transition: "opacity .2s", boxShadow: "0 4px 14px rgba(212,43,43,0.25)" }}>
      {pending ? <span>⏳</span> : null}
      {children}
    </button>
  );
}

function NextBtn({ onClick, pending, children }: { onClick: () => void; pending?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={pending}
      style={{ display: "flex", flex: 1, height: 46, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, background: "linear-gradient(90deg,#D42B2B,#B01E1E)", fontSize: 15, fontWeight: 700, color: "#fff", border: "none", cursor: pending ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1, transition: "opacity .2s", boxShadow: "0 4px 14px rgba(212,43,43,0.25)" }}>
      {pending ? <span>⏳</span> : null}
      {children}
    </button>
  );
}

function BackBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      style={{ height: 46, width: 96, flexShrink: 0, borderRadius: 14, border: "1.5px solid #ECEEF2", background: "#FAFBFC", fontSize: 14, fontWeight: 600, color: "#9198A8", cursor: "pointer", transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      {children}
    </button>
  );
}

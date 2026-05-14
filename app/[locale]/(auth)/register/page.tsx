"use client";

import { useState, useTransition, useRef, Fragment } from "react";
import Image from "next/image";
import { Link, useRouter } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { FloatingTabs } from "@/components/sections/floating-tabs";
import {
  registerPersonal,
  registerJuristicStep1,
  saveJuristicStep2,
  uploadJuristicDoc,
  completeJuristicRegistration,
} from "@/actions/auth";
import HCaptchaInvisible, { type HCaptchaHandle } from "@/components/hcaptcha-invisible";
import { trackSignUp } from "@/lib/analytics";

/* ─────────────────────────── TYPES ─────────────────────────── */
type TabId = "personal" | "juristic";
type JuristicStep = 1 | 2 | 3;
type ServiceId = "import" | "export" | "clear" | "customs" | "order" | "payment";
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

const SERVICES: { id: ServiceId; label: string; sub?: string; emoji: string }[] = [
  { id: "import",  label: "นำเข้าสินค้า",       sub: "รถ/เรือ/แอร์", emoji: "📦" },
  { id: "export",  label: "ส่งออกสินค้า",       sub: "รถ/เรือ/แอร์", emoji: "🚢" },
  { id: "clear",   label: "เคลียร์สินค้าติดด่าน",              emoji: "🚧" },
  { id: "customs", label: "พิธีการศุลกากร",                    emoji: "📋" },
  { id: "order",   label: "ฝากสั่งซื้อสินค้า",                emoji: "🛒" },
  { id: "payment", label: "ฝากโอนชำระสินค้า",                 emoji: "💸" },
];

const SOURCES: { id: SourceId; label: string; icon: React.ReactNode }[] = [
  {
    id: "line",
    label: "Line",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
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
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="#1877F2" />
        <path fill="white" d="M11.2 17v-6.1h2l.3-2.4h-2.3V6.9c0-.7.19-1.18 1.2-1.18H13.6V3.2C13.24 3.14 12.38 3 11.38 3 9.3 3 7.9 4.25 7.9 6.6V8.5H6v2.4h1.9V17h3.3z" />
      </svg>
    ),
  },
  {
    id: "google",
    label: "Google",
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
    id: "youtube",
    label: "Youtube",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="20" height="20" rx="4.5" fill="#FF0000" />
        <path fill="white" d="M15.8 7.1s-.2-1.3-.8-1.84c-.76-.8-1.6-.81-2-.86C11.12 4.3 10 4.3 10 4.3h-.02s-1.12 0-3.14.1c-.36.05-1.2.06-1.97.86C4.28 5.8 4.07 7.1 4.07 7.1S3.87 8.48 3.87 9.87v1.27c0 1.38.2 2.77.2 2.77s.2 1.28.8 1.84c.76.8 1.76.77 2.2.85C8.5 16.83 10 16.8 10 16.8s1.13-.02 3.15-.22c.36-.05 1.2-.06 1.96-.86.6-.56.8-1.84.8-1.84s.2-1.38.2-2.77V9.87c0-1.4-.2-2.77-.2-2.77zm-8.5 5.64V7.3L13.2 10l-5.9 2.74z" />
      </svg>
    ),
  },
  {
    id: "tiktok",
    label: "TikTok",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
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
      <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
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
    icon: <span style={{ fontSize: 18, lineHeight: 1 }}>👥</span>,
  },
  {
    id: "ad",
    label: "โฆษณา",
    icon: <span style={{ fontSize: 18, lineHeight: 1 }}>📢</span>,
  },
];

/* ─────────────────────────── MAIN PAGE ─────────────────────────── */
export default function RegisterPage() {
  const [tab, setTab] = useState<TabId>("personal");

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-start justify-center bg-[#F0F2F5] px-4 py-7">
        <div className="w-full max-w-[540px] rounded-[24px] bg-white px-9 pb-7 pt-8 shadow-[0_8px_48px_rgba(0,0,0,0.07)]">

          {/* Header */}
          <div className="border-b border-[#F0F2F5] pb-3 mb-4 text-center text-sm text-[#9198A8] tracking-wide">
            สมัครสมาชิก
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
            มีบัญชีอยู่แล้ว?{" "}
            <Link href="/login" className="font-semibold text-[#D42B2B] hover:underline">
              เข้าสู่ระบบ
            </Link>
          </p>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, borderRadius: 16, backgroundColor: "#F4F5F8", padding: 4, marginBottom: 24 }}>
            {(["personal", "juristic"] as TabId[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  height: 38,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  transition: "all .2s",
                  backgroundColor: tab === t ? "#ffffff" : "transparent",
                  color: tab === t ? "#D42B2B" : "#9198A8",
                  boxShadow: tab === t ? "0 2px 10px rgba(0,0,0,0.07)" : "none",
                }}
              >
                {t === "personal" ? "👤" : "🏢"}{" "}
                {t === "personal" ? "บุคคลธรรมดา" : "นิติบุคคล"}
              </button>
            ))}
          </div>

          {tab === "personal" ? <PersonalForm /> : <JuristicForm />}
        </div>
      </main>
      <Footer />
      <FloatingTabs />
    </>
  );
}

/* ─────────────────────────── PERSONAL FORM ─────────────────────────── */
function PersonalForm() {
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
  const captchaRef = useRef<HCaptchaHandle>(null);

  function toggleService(id: ServiceId) {
    setServices((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) { setError(ERR.must_agree); return; }
    setError(null);
    startTransition(async () => {
      const captchaToken = await captchaRef.current?.execute();
      const res = await registerPersonal({
        firstName, lastName, phone, password,
        services,
        howKnow: source ?? null,
        email: email || "",
        otp: "bypass",
        agreed,
        captchaToken: captchaToken ?? null,
      });
      if (res.ok) {
        trackSignUp("personal");
        router.replace("/");
        router.refresh();
      } else { setError(ERR[res.error] ?? res.error); captchaRef.current?.reset(); }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Name row */}
      <div className="mb-3.5 flex gap-3">
        <FieldWrap label="ชื่อจริง">
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>👤</span>
            <StyledInput type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
              placeholder="ชื่อจริง" extraStyle={{ paddingLeft: 36 }} />
          </div>
        </FieldWrap>
        <FieldWrap label="นามสกุล">
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>👤</span>
            <StyledInput type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
              placeholder="นามสกุล" extraStyle={{ paddingLeft: 36 }} />
          </div>
        </FieldWrap>
      </div>

      {/* Phone */}
      <FieldWrap label="เบอร์โทรศัพท์" className="mb-3.5">
        <PhoneInput value={phone} onChange={setPhone} />
      </FieldWrap>

      {/* Password */}
      <FieldWrap label="รหัสผ่าน" className="mb-3.5">
        <PasswordInput id="pass-p" value={password} onChange={setPassword}
          show={showPwd} onToggle={() => setShowPwd((v) => !v)}
          placeholder="รหัสผ่าน 6-30 ตัวอักษร" />
      </FieldWrap>

      {/* Services */}
      <FieldWrap label="บริการที่สนใจ" className="mb-3.5">
        <ServiceChips selected={services} onToggle={toggleService} />
      </FieldWrap>

      {/* How know */}
      <FieldWrap label="รู้จักเราจากช่องทางใด" className="mb-3.5">
        <SourceChips selected={source} onSelect={setSource} />
      </FieldWrap>

      {/* Email (optional) */}
      <FieldWrap
        label={<>อีเมล <span className="ml-1 rounded bg-[#F0F2F5] px-1.5 py-0.5 text-[11px] font-normal text-[#8A8F9B]">ไม่จำเป็น</span></>}
        className="mb-3.5"
      >
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>✉️</span>
          <StyledInput type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="อีเมล (ไม่ต้องกรอกก็ได้)" extraStyle={{ paddingLeft: 36 }} />
        </div>
      </FieldWrap>

      <AgreeRow checked={agreed} onChange={setAgreed} />
      {error && <ErrorBox msg={error} />}
      <HCaptchaInvisible ref={captchaRef} />
      <SubmitBtn pending={pending}>👤 สมัครสมาชิก</SubmitBtn>
    </form>
  );
}

/* ─────────────────────────── JURISTIC FORM ─────────────────────────── */
function JuristicForm() {
  const router = useRouter();
  const [step, setStep] = useState<JuristicStep>(1);

  /* step 1 */
  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd]   = useState(false);
  const [services, setServices] = useState<ServiceId[]>([]);
  const [source, setSource]     = useState<SourceId | null>(null);

  /* step 2 */
  const [taxId, setTaxId]               = useState("");
  const [taxStatus, setTaxStatus]       = useState<"idle" | "loading" | "found" | "notfound" | "unavailable">("idle");
  const [companyName, setCompanyName]   = useState("");
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
    // Track whether *any* endpoint behaved like a real API. If every call
    // failed with a network error / 5xx, the API is down — don't gaslight
    // the user with "ไม่พบข้อมูล" when their tax ID may be perfectly valid.
    let sawApiError = false;
    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.status >= 500) { sawApiError = true; continue; }
        if (!res.ok) continue;
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

  /* step navigation */
  function nextStep1() {
    setError(null);
    startTransition(async () => {
      const captchaToken = await captchaRef.current?.execute();
      const res = await registerJuristicStep1({
        phone, password,
        services,
        howKnow: source ?? null,
        otp: "bypass",
        captchaToken: captchaToken ?? null,
      });
      if (res.ok) setStep(2);
      else { setError(ERR[res.error] ?? res.error); captchaRef.current?.reset(); }
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
        router.replace("/");
        router.refresh();
      } else setError(ERR[done.error] ?? done.error);
    });
  }

  return (
    <form onSubmit={handleFinalSubmit}>
      {/* Step indicator */}
      <StepIndicator step={step} />

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <>
          <div className="mb-3.5 text-right text-[11.5px] text-[#8A8F9B]">ขั้นตอน 1 / 3</div>

          <FieldWrap label={<>เบอร์โทรศัพท์ <Req /></>} className="mb-3.5">
            <PhoneInput value={phone} onChange={setPhone} />
          </FieldWrap>

          <FieldWrap label={<>รหัสผ่าน <Req /></>} className="mb-3.5">
            <PasswordInput id="pass-j" value={password} onChange={setPassword}
              show={showPwd} onToggle={() => setShowPwd((v) => !v)}
              placeholder="รหัสผ่าน 6-30 ตัวอักษร" />
          </FieldWrap>

          <FieldWrap
            label={<>บริการที่สนใจ <span className="ml-1 text-[11px] font-normal text-[#8A8F9B]">(เลือกได้หลายอย่าง)</span></>}
            className="mb-3.5"
          >
            <ServiceChips selected={services} onToggle={toggleService} />
          </FieldWrap>

          <FieldWrap label="รู้จักเราจากช่องทางใด" className="mb-3.5">
            <SourceChips selected={source} onSelect={setSource} />
          </FieldWrap>

          {error && <ErrorBox msg={error} />}
          <HCaptchaInvisible ref={captchaRef} />
          <div style={{ display: "flex" }}>
            <NextBtn onClick={nextStep1} pending={pending}>ถัดไป →</NextBtn>
          </div>
        </>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <>
          <div className="mb-3.5 text-right text-[11.5px] text-[#8A8F9B]">ขั้นตอน 2 / 3</div>

          {/* Tax ID with auto-fill */}
          <FieldWrap label={<>เลขประจำตัวผู้เสียภาษี <Req /></>} className="mb-1">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>🔢</span>
              <StyledInput type="text" value={taxId}
                onChange={(e) => handleTaxInput(e.target.value)}
                placeholder="เลขประจำตัวผู้เสียภาษี 13 หลัก"
                maxLength={13}
                extraStyle={{ paddingLeft: 36 }} />
            </div>
          </FieldWrap>
          {/* Tax status */}
          <div className="mb-3.5 min-h-[18px] text-[12px]">
            {taxStatus === "loading" && <span className="text-amber-500">⏳ กำลังค้นหาข้อมูลบริษัท...</span>}
            {taxStatus === "found"   && <span className="text-green-600">✅ พบข้อมูลบริษัท กรุณาตรวจสอบความถูกต้อง</span>}
            {taxStatus === "notfound"&& <span className="text-red-500">❌ ไม่พบข้อมูล กรุณากรอกด้วยตนเอง</span>}
            {taxStatus === "unavailable" && (
              <span className="text-amber-600">
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
              <span className="text-[#8A8F9B]">กรอก 13 หลัก ({taxId.length}/13)</span>}
          </div>

          <FieldWrap label={<>ชื่อบริษัท <Req /></>} className="mb-3.5">
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>🏛</span>
              <StyledInput type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ชื่อบริษัท" extraStyle={{ paddingLeft: 36 }} />
            </div>
          </FieldWrap>

          {/* Section divider */}
          <div className="my-4 flex items-center gap-2.5">
            <div className="h-px flex-1 bg-[#F0F2F5]" />
            <span className="whitespace-nowrap text-[12.5px] font-bold text-[#1A1D23]">ที่อยู่บริษัท</span>
            <div className="h-px flex-1 bg-[#F0F2F5]" />
          </div>

          <FieldWrap label={<>ที่อยู่ บ้านเลขที่ ถนน ซอย <Req /></>} className="mb-3.5">
            <StyledInput type="text" value={addressLine} onChange={(e) => setAddressLine(e.target.value)}
              placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่" />
          </FieldWrap>

          <div className="mb-3.5 grid grid-cols-2 gap-3">
            {[
              { label: "ตำบล/แขวง",    value: subdistrict, set: setSubdistrict, ph: "ตำบล/แขวง" },
              { label: "อำเภอ/เขต",    value: district,    set: setDistrict,    ph: "อำเภอ/เขต" },
              { label: "จังหวัด",      value: province,    set: setProvince,    ph: "จังหวัด" },
              { label: "รหัสไปรษณีย์", value: postcode,    set: setPostcode,    ph: "รหัสไปรษณีย์", max: 5, num: true },
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
            <BackBtn onClick={() => { setStep(1); setError(null); }}>← ย้อนกลับ</BackBtn>
            <NextBtn onClick={nextStep2} pending={pending}>ถัดไป →</NextBtn>
          </div>
        </>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <>
          <div className="mb-3.5 text-right text-[11.5px] text-[#8A8F9B]">ขั้นตอน 3 / 3</div>

          <div className="mb-4 rounded-r-lg border-l-[3px] border-[#D42B2B] bg-[#FFF8F6] px-3 py-2.5 text-[12.5px] leading-[1.5] text-[#8A8F9B]">
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

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <BackBtn onClick={() => { setStep(2); setError(null); }}>← ย้อนกลับ</BackBtn>
            <SubmitBtn pending={pending} flex1>🏢 สมัครสมาชิก</SubmitBtn>
          </div>
        </>
      )}
    </form>
  );
}

/* ─────────────────────────── SHARED COMPONENTS ─────────────────────────── */

const INPUT_STYLE: React.CSSProperties = {
  height: 44,
  width: "100%",
  borderRadius: 14,
  border: "1.5px solid #ECEEF2",
  background: "#FAFBFC",
  padding: "0 14px",
  fontSize: 14,
  color: "#1A1D23",
  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  outline: "none",
  transition: "all .2s",
};

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement> & { extraStyle?: React.CSSProperties }) {
  const { extraStyle, onFocus, onBlur, style, ...rest } = props;
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...rest}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      style={{
        ...INPUT_STYLE,
        ...(focused ? { borderColor: "#E8A0A0", background: "#fff", boxShadow: "0 2px 8px rgba(212,43,43,0.10)" } : {}),
        ...extraStyle,
        ...style,
      }}
    />
  );
}

function FieldWrap({ label, children, className = "" }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex-1 ${className}`}>
      <label className="mb-1.5 block text-[12.5px] font-semibold text-[#1A1D23]">{label}</label>
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
        placeholder="081 234 5678" extraStyle={{ flex: 1 }} />
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
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 15, opacity: 0.4, pointerEvents: "none" }}>🔒</span>
      <StyledInput id={id} type={show ? "text" : "password"} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        extraStyle={{ paddingLeft: 36, paddingRight: 40 }} />
      <button type="button" onClick={onToggle}
        style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, opacity: 0.35, background: "none", border: "none", cursor: "pointer", transition: "opacity .2s" }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.8")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "0.35")}
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
      borderRadius: 14,
      cursor: "pointer",
      transition: "all .2s",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      gap: 4,
      boxShadow: isActive
        ? "0 2px 8px rgba(212,43,43,0.10)"
        : "0 1px 3px rgba(0,0,0,0.05)",
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Row 1 — 2 large hero cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {top.map((s) => {
          const isActive = selected.includes(s.id);
          return (
            <button
              key={s.id} type="button" onClick={() => onToggle(s.id)}
              style={{ ...chipStyle(isActive), padding: "20px 8px" }}
            >
              <span style={{ fontSize: 28 }}>{s.emoji}</span>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{s.label}</span>
              {s.sub && <span style={{ fontSize: 10, opacity: 0.55, fontWeight: 400 }}>{s.sub}</span>}
            </button>
          );
        })}
      </div>
      {/* Row 2 — 4 compact cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        {rest.map((s) => {
          const isActive = selected.includes(s.id);
          return (
            <button
              key={s.id} type="button" onClick={() => onToggle(s.id)}
              style={{ ...chipStyle(isActive), padding: "10px 4px" }}
            >
              <span style={{ fontSize: 20 }}>{s.emoji}</span>
              <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.2 }}>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── SourceChips: 4 per row → 2 rows for 8 items ── */
function SourceChips({ selected, onSelect }: { selected: SourceId | null; onSelect: (id: SourceId) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
      {SOURCES.map((s) => {
        const isActive = selected === s.id;
        return (
          <button
            key={s.id} type="button" onClick={() => onSelect(s.id)}
            style={{
              minHeight: 54,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              borderRadius: 12,
              border: `1.5px solid ${isActive ? "#E8A0A0" : "#ECEEF2"}`,
              background: isActive ? "#FFF5F5" : "#FAFBFC",
              color: isActive ? "#D42B2B" : "#9198A8",
              fontSize: 11,
              fontWeight: isActive ? 600 : 400,
              padding: "7px 4px",
              cursor: "pointer",
              transition: "all .2s",
              textAlign: "center",
              lineHeight: 1.3,
              boxShadow: isActive
                ? "0 2px 8px rgba(212,43,43,0.10)"
                : "0 1px 3px rgba(0,0,0,0.05)",
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
  return (
    <label className="mb-4 mt-1 flex cursor-pointer items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#D42B2B]" />
      <span className="text-[12.5px] leading-[1.55] text-[#8A8F9B]">
        ฉันเข้าใจและยอมรับ{" "}
        <Link href="#" className="font-semibold text-[#D42B2B] hover:underline">เงื่อนไขการใช้บริการ</Link>
        {" "}และ{" "}
        <Link href="#" className="font-semibold text-[#D42B2B] hover:underline">นโยบายความเป็นส่วนตัว</Link>
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
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-[#1A1D23]">{label}</label>
      <label
        className="relative block cursor-pointer rounded-[16px] border-[1.5px] border-dashed border-[#ECEEF2] bg-[#FAFBFC] px-4 py-4 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition hover:border-[#E8A0A0] hover:bg-[#FFF5F5]"
        style={file ? { borderColor: "#E8A0A0", background: "#FFF5F5" } : {}}>
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
  const steps = [
    { num: 1 as JuristicStep, label: "ข้อมูลติดต่อ" },
    { num: 2 as JuristicStep, label: "ข้อมูลบริษัท" },
    { num: 3 as JuristicStep, label: "เอกสาร" },
  ];
  return (
    <div style={{ marginBottom: 20, paddingLeft: 4, paddingRight: 4 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
      {steps.map((s, i) => {
        const status = step === s.num ? "active" : step > s.num ? "done" : "idle";

        const circleStyle: React.CSSProperties = {
          position: "relative",
          zIndex: 10,
          display: "flex",
          width: 28,
          height: 28,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          fontSize: 12,
          fontWeight: 700,
          transition: "all .2s",
          ...(status === "active"
            ? { backgroundColor: "#fff", color: "#D42B2B", border: "2px solid #D42B2B" }
            : status === "done"
            ? { backgroundColor: "#D42B2B", color: "#fff", boxShadow: "0 2px 8px rgba(212,43,43,0.25)", border: "2px solid #D42B2B" }
            : { backgroundColor: "#F4F5F8", color: "#9198A8", border: "2px solid #ECEEF2" }),
        };

        const labelStyle: React.CSSProperties = {
          marginTop: 4,
          fontSize: 10.5,
          fontWeight: status !== "idle" ? 600 : 400,
          color: status !== "idle" ? "#D42B2B" : "#8A8F9B",
        };

        return (
          <Fragment key={s.num}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={circleStyle}>{s.num}</div>
              <div style={labelStyle}>{s.label}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                marginTop: -14,
                backgroundColor: step > s.num ? "#E8A0A0" : "#ECEEF2",
                transition: "background-color .2s",
              }} />
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
    <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{msg}</p>
  );
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
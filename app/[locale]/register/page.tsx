"use client";

import { useState, Fragment } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Mail,
  ChevronDown,
  Package,
  Ship,
  AlertTriangle,
  ClipboardCheck,
  ShoppingCart,
  Banknote,
  CloudUpload,
  FileText,
  CreditCard,
  Hash,
  Building2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";

const INPUT_BASE =
  "h-11 w-full rounded-[10px] border-[1.5px] border-border bg-white dark:bg-surface px-3.5 text-sm text-foreground placeholder:text-zinc-400 transition focus:border-primary-500 focus:outline-none focus:ring-[3px] focus:ring-primary-500/10";

const SERVICES = [
  { id: "import", label: "serviceImport", sub: "serviceImportSub", Icon: Package },
  { id: "export", label: "serviceExport", sub: "serviceExportSub", Icon: Ship },
  { id: "clear", label: "serviceClear", Icon: AlertTriangle },
  { id: "customs", label: "serviceCustoms", Icon: ClipboardCheck },
  { id: "order", label: "serviceOrder", Icon: ShoppingCart },
  { id: "payment", label: "servicePayment", Icon: Banknote },
] as const;

type TabId = "personal" | "juristic";

export default function RegisterPage() {
  const t = useTranslations("register");

  const [tab, setTab] = useState<TabId>("personal");

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-start justify-center bg-background px-4 py-7">
        <div className="w-full max-w-[540px] rounded-[18px] bg-white dark:bg-surface px-9 pb-7 pt-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
          {/* Logo */}
          <div className="-mb-1 flex justify-center">
            <Image
              src="/images/pacred-logo-red.png"
              alt="Pacred"
              width={160}
              height={52}
              className="h-auto w-auto"
              priority
            />
          </div>

          {/* Title */}
          <h1 className="mb-2 text-center text-2xl font-bold text-foreground">
            {t("title")}
          </h1>

          {/* Login link */}
          <p className="mb-5 text-center text-[13.5px] text-muted">
            {t("haveAccount")}{" "}
            <Link
              href="/login"
              className="font-semibold text-primary-600 hover:underline"
            >
              {t("signInLink")}
            </Link>
          </p>

          {/* Tabs */}
          <div className="mb-6 flex gap-1 rounded-[10px] bg-zinc-100 dark:bg-surface-alt p-1">
            <button
              type="button"
              onClick={() => setTab("personal")}
              className={`flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition ${
                tab === "personal"
                  ? "bg-white dark:bg-surface text-primary-600 shadow-[0_2px_8px_rgba(0,0,0,0.09)]"
                  : "text-muted"
              }`}
            >
              <User className="h-4 w-4" /> {t("tabPersonal")}
            </button>
            <button
              type="button"
              onClick={() => setTab("juristic")}
              className={`flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition ${
                tab === "juristic"
                  ? "bg-white dark:bg-surface text-primary-600 shadow-[0_2px_8px_rgba(0,0,0,0.09)]"
                  : "text-muted"
              }`}
            >
              <Building2 className="h-4 w-4" /> {t("tabJuristic")}
            </button>
          </div>

          {tab === "personal" ? <PersonalForm /> : <JuristicForm />}

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white dark:bg-surface px-4 text-[13px] font-medium text-muted">
                {t("orSignUpWith")}
              </span>
            </div>
          </div>

          {/* Social */}
          <div className="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-primary-500"
            >
              Google
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500"
              style={{ color: "#00B900" }}
            >
              LINE
            </button>
            <button
              type="button"
              className="flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-white dark:bg-surface px-3 py-3 text-[13px] font-semibold transition hover:-translate-y-0.5 hover:border-primary-500"
              style={{ color: "#1877F2" }}
            >
              Facebook
            </button>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

/* ──────────────────────────  PERSONAL  ────────────────────────── */
function PersonalForm() {
  const t = useTranslations("register");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [services, setServices] = useState<string[]>([]);
  const [howKnow, setHowKnow] = useState("");
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);

  function toggleService(id: string) {
    setServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log({ firstName, lastName, phone, password, services, howKnow, email, agreed });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Name row */}
      <div className="mb-3.5 flex gap-3">
        <Field label={t("firstName")}>
          <IconInput Icon={User}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("firstNamePh")}
              className={`${INPUT_BASE} pl-9`}
            />
          </IconInput>
        </Field>
        <Field label={t("lastName")}>
          <IconInput Icon={User}>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("lastNamePh")}
              className={`${INPUT_BASE} pl-9`}
            />
          </IconInput>
        </Field>
      </div>

      {/* Phone */}
      <Field label={t("phone")} className="mb-3.5">
        <PhoneRow value={phone} onChange={setPhone} placeholder={t("phonePh")} />
      </Field>

      {/* Password */}
      <Field label={t("password")} className="mb-3.5">
        <PasswordInput
          value={password}
          onChange={setPassword}
          show={showPwd}
          toggle={() => setShowPwd((s) => !s)}
          placeholder={t("passwordPh")}
        />
      </Field>

      {/* Services */}
      <Field label={t("service")} className="mb-3.5">
        <ServiceChips selected={services} onToggle={toggleService} />
      </Field>

      {/* How know */}
      <Field label={t("howKnow")} className="mb-3.5">
        <SelectField value={howKnow} onChange={setHowKnow} placeholder={t("howKnowPh")} />
      </Field>

      {/* Email */}
      <Field
        label={
          <>
            {t("email")}{" "}
            <span className="ml-1 rounded bg-zinc-100 dark:bg-surface-alt px-1.5 py-0.5 text-[11px] font-normal text-muted">
              {t("optional")}
            </span>
          </>
        }
        className="mb-3.5"
      >
        <IconInput Icon={Mail}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPh")}
            className={`${INPUT_BASE} pl-9`}
          />
        </IconInput>
      </Field>

      {/* Agree */}
      <AgreeRow checked={agreed} onChange={setAgreed} />

      {/* Submit */}
      <SubmitButton>
        <User className="h-4 w-4" /> {t("submit")}
      </SubmitButton>
    </form>
  );
}

/* ──────────────────────────  JURISTIC  ────────────────────────── */
function JuristicForm() {
  const t = useTranslations("register");
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [services, setServices] = useState<string[]>([]);
  const [howKnow, setHowKnow] = useState("");

  // Step 2
  const [taxId, setTaxId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [subdistrict, setSubdistrict] = useState("");
  const [district, setDistrict] = useState("");
  const [province, setProvince] = useState("");
  const [postcode, setPostcode] = useState("");

  // Step 3
  const [docCompany, setDocCompany] = useState<File | null>(null);
  const [docVAT, setDocVAT] = useState<File | null>(null);
  const [docID, setDocID] = useState<File | null>(null);
  const [agreed, setAgreed] = useState(false);

  function toggleService(id: string) {
    setServices((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log({
      phone, password, services, howKnow,
      taxId, companyName, addressLine, subdistrict, district, province, postcode,
      docCompany, docVAT, docID, agreed,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Steps indicator */}
      <StepIndicator step={step} />

      {step === 1 && (
        <>
          <ProgressHint current={1} total={3} />

          <Field label={<>{t("phone")} <Required /></>} className="mb-3.5">
            <PhoneRow value={phone} onChange={setPhone} placeholder={t("phonePh")} />
          </Field>

          <Field label={<>{t("password")} <Required /></>} className="mb-3.5">
            <PasswordInput
              value={password}
              onChange={setPassword}
              show={showPwd}
              toggle={() => setShowPwd((s) => !s)}
              placeholder={t("passwordPh")}
            />
          </Field>

          <Field
            label={
              <>
                {t("service")}{" "}
                <span className="ml-1 text-[11px] font-normal text-muted">
                  {t("serviceMulti")}
                </span>
              </>
            }
            className="mb-3.5"
          >
            <ServiceChips selected={services} onToggle={toggleService} />
          </Field>

          <Field label={t("howKnow")} className="mb-3.5">
            <SelectField value={howKnow} onChange={setHowKnow} placeholder={t("howKnowPh")} />
          </Field>

          <NextButton onClick={() => setStep(2)}>{t("next")}</NextButton>
        </>
      )}

      {step === 2 && (
        <>
          <ProgressHint current={2} total={3} />

          <Field label={<>{t("taxId")} <Required /></>} className="mb-3.5">
            <IconInput Icon={Hash}>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value.replace(/\D/g, ""))}
                placeholder={t("taxIdPh")}
                maxLength={13}
                className={`${INPUT_BASE} pl-9`}
              />
            </IconInput>
          </Field>

          <Field label={<>{t("companyName")} <Required /></>} className="mb-3.5">
            <IconInput Icon={Building2}>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t("companyNamePh")}
                className={`${INPUT_BASE} pl-9`}
              />
            </IconInput>
          </Field>

          <SectionDivider>{t("companyAddrTitle")}</SectionDivider>

          <Field label={<>{t("addressLine")} <Required /></>} className="mb-3.5">
            <input
              type="text"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              placeholder={t("addressLinePh")}
              className={INPUT_BASE}
            />
          </Field>

          <div className="mb-3.5 grid grid-cols-2 gap-3">
            <Field label={t("subdistrict")}>
              <input
                type="text"
                value={subdistrict}
                onChange={(e) => setSubdistrict(e.target.value)}
                placeholder={t("subdistrict")}
                className={INPUT_BASE}
              />
            </Field>
            <Field label={t("district")}>
              <input
                type="text"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder={t("district")}
                className={INPUT_BASE}
              />
            </Field>
            <Field label={t("province")}>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                placeholder={t("province")}
                className={INPUT_BASE}
              />
            </Field>
            <Field label={t("postcode")}>
              <input
                type="text"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.replace(/\D/g, ""))}
                placeholder={t("postcode")}
                maxLength={5}
                className={INPUT_BASE}
              />
            </Field>
          </div>

          <NavButtons onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </>
      )}

      {step === 3 && (
        <>
          <ProgressHint current={3} total={3} />

          <div className="mb-4 rounded-r-lg border-l-[3px] border-primary-500 bg-primary-50 dark:bg-primary-900/20 px-3 py-2.5 text-[12.5px] leading-[1.5] text-muted">
            {t("docNote")}
          </div>

          <UploadField
            label={<>{t("docCompany")} <Required /></>}
            Icon={CloudUpload}
            file={docCompany}
            onChange={setDocCompany}
            placeholder={t("uploadHint")}
          />
          <UploadField
            label={t("docVAT")}
            Icon={FileText}
            file={docVAT}
            onChange={setDocVAT}
            placeholder={t("uploadHint")}
          />
          <UploadField
            label={<>{t("docID")} <Required /></>}
            Icon={CreditCard}
            file={docID}
            onChange={setDocID}
            placeholder={t("uploadHint")}
          />

          <AgreeRow checked={agreed} onChange={setAgreed} />

          <div className="mt-1 flex gap-2.5">
            <BackButton onClick={() => setStep(2)}>{t("back")}</BackButton>
            <SubmitButton>
              <Building2 className="h-4 w-4" /> {t("submit")}
            </SubmitButton>
          </div>
        </>
      )}
    </form>
  );
}

/* ──────────────────────────  SHARED PARTS  ────────────────────────── */

function Field({
  label,
  children,
  className = "",
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex-1 ${className}`}>
      <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function Required() {
  return <span className="text-primary-600">*</span>;
}

function IconInput({
  Icon,
  children,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted opacity-60" />
      {children}
    </div>
  );
}

function PhoneRow({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex gap-2">
      <div className="flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border-[1.5px] border-border bg-zinc-50 dark:bg-surface-alt px-2.5 text-sm">
        <span className="text-base">🇹🇭</span>
        <span>+66</span>
      </div>
      <input
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} flex-1`}
      />
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  toggle,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted opacity-60" />
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} pl-9 pr-10`}
      />
      <button
        type="button"
        onClick={toggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted opacity-50 transition hover:opacity-90"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ServiceChips({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("register");
  return (
    <div className="flex flex-wrap gap-2">
      {SERVICES.map((s) => {
        const active = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            className={`flex h-9 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13px] transition ${
              active
                ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20 font-semibold text-primary-600"
                : "border-border bg-white dark:bg-surface text-muted hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:text-primary-600"
            }`}
          >
            <s.Icon className="h-3.5 w-3.5" />
            {t(s.label as Parameters<typeof t>[0])}
            {"sub" in s && s.sub && (
              <span className="text-[10px] font-normal opacity-60">
                {t(s.sub as Parameters<typeof t>[0])}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const t = useTranslations("register");
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_BASE} appearance-none pr-10`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        <option value="fb">{t("chFacebook")}</option>
        <option value="google">{t("chGoogle")}</option>
        <option value="friend">{t("chFriend")}</option>
        <option value="line">{t("chLine")}</option>
        <option value="tiktok">{t("chTiktok")}</option>
        <option value="other">{t("chOther")}</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </div>
  );
}

function AgreeRow({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTranslations("register");
  return (
    <label className="mb-4 mt-1 flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary-600"
      />
      <span className="text-[12.5px] leading-[1.55] text-muted">
        {t("agreeText")}{" "}
        <Link href="#" className="font-semibold text-primary-600 hover:underline">
          {t("terms")}
        </Link>{" "}
        {t("and")}{" "}
        <Link href="#" className="font-semibold text-primary-600 hover:underline">
          {t("privacy")}
        </Link>
      </span>
    </label>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="flex h-[46px] flex-1 w-full items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-r from-primary-600 to-primary-700 text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.985]"
    >
      {children}
    </button>
  );
}

function NextButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[46px] w-full items-center justify-center gap-1.5 rounded-[10px] bg-gradient-to-r from-primary-600 to-primary-700 text-[15px] font-bold text-white transition hover:opacity-90 active:scale-[0.985]"
    >
      {children}
    </button>
  );
}

function BackButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[46px] w-24 shrink-0 rounded-[10px] border-[1.5px] border-border bg-white dark:bg-surface text-sm font-semibold text-muted transition hover:border-primary-500 hover:text-primary-600"
    >
      {children}
    </button>
  );
}

function NavButtons({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const t = useTranslations("register");
  return (
    <div className="mt-1 flex gap-2.5">
      <BackButton onClick={onBack}>{t("back")}</BackButton>
      <NextButton onClick={onNext}>{t("next")}</NextButton>
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations("register");
  const steps = [
    { num: 1, label: t("step1") },
    { num: 2, label: t("step2") },
    { num: 3, label: t("step3") },
  ];
  return (
    <div className="mb-5 flex items-center">
      {steps.map((s, i) => {
        const status: "active" | "done" | "idle" =
          step === s.num ? "active" : step > s.num ? "done" : "idle";
        return (
          <Fragment key={s.num}>
            <div className="flex flex-1 flex-col items-center">
              <div
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12px] font-bold transition ${
                  status === "active"
                    ? "border-primary-500 bg-primary-50 text-primary-600"
                    : status === "done"
                      ? "border-primary-500 bg-primary-500 text-white"
                      : "border-border bg-white text-muted"
                }`}
              >
                {s.num}
              </div>
              <div
                className={`mt-1 text-[10.5px] ${
                  status !== "idle" ? "font-semibold text-primary-600" : "text-muted"
                }`}
              >
                {s.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`-mt-3.5 h-0.5 flex-1 transition ${
                  step > s.num ? "bg-primary-500" : "bg-border"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function ProgressHint({ current, total }: { current: number; total: number }) {
  const t = useTranslations("register");
  return (
    <div className="mb-3.5 text-right text-[11.5px] text-muted">
      {t("stepOf", { current, total })}
    </div>
  );
}

function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 flex items-center gap-2.5">
      <div className="h-px flex-1 bg-border" />
      <span className="whitespace-nowrap text-[12.5px] font-bold text-foreground">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function UploadField({
  label,
  Icon,
  file,
  onChange,
  placeholder,
}: {
  label: React.ReactNode;
  Icon: React.ComponentType<{ className?: string }>;
  file: File | null;
  onChange: (f: File | null) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground">
        {label}
      </label>
      <label className="relative block cursor-pointer rounded-[10px] border-[1.5px] border-dashed border-border bg-white dark:bg-surface px-4 py-4 text-center transition hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10">
        <Icon className="mx-auto mb-1 h-6 w-6 text-muted opacity-60" />
        <div className="text-[12.5px] text-muted">{placeholder}</div>
        {file && (
          <div className="mt-1 text-[12px] text-primary-600">{file.name}</div>
        )}
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

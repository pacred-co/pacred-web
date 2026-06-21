"use client";

/**
 * Client form for /admin/admins/new.
 *
 * Wave 22 Phase 3 (2026-05-27) — provision a fresh Pacred admin in one
 * server-action call. Form sections:
 *
 *   1. Required (User ID → derives the login email · password · ชื่อ · นามสกุล · role)
 *   2. Recommended HR (phone · nickname · company · employee_type ·
 *      department · section · work email/phone · hired_at · avatar)
 *   3. Advanced (collapsible: birthday · sex · legacy_admin_id ·
 *      admin_note · contract_end_date)
 *
 * Avatar upload — we keep this MVP simple: paste a URL. File upload to
 * Supabase Storage requires a dedicated upload action + bucket-write
 * permission for admins (the `avatars` bucket RLS is per-user-folder
 * `auth.uid()/`), which is an extra wave of work. ภูม can revisit.
 *
 * Per docs/learnings/pacred-design-philosophy.md — Tailwind chrome ·
 * never Bootstrap-4 · live errors · suggestion-password button.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateNew, getNextEmployeeCode } from "@/actions/admin/admins";
import {
  ADMIN_ROLES,
  COMPANY_VALUES,
  EMPLOYEE_TYPES,
  SEX_VALUES,
  suggestAdminPassword,
  ROLE_LABELS,
  type AdminRoleEnum,
} from "@/lib/validators/admin-form";
import { AdminAvatarUploadField } from "@/components/admin/admin-avatar-upload-field";

const COMPANY_LABELS: Record<(typeof COMPANY_VALUES)[number], string> = {
  "pacred":         "Pacred (รวม)",
  "pacred-cargo":   "Pacred Cargo (จีน)",
  "pacred-freight": "Pacred Freight (international)",
};

const EMPLOYEE_TYPE_LABELS: Record<(typeof EMPLOYEE_TYPES)[number], string> = {
  full_time:  "พนักงานประจำ",
  probation:  "ทดลองงาน",
  contract:   "สัญญาจ้าง",
  daily:      "รายวัน",
  intern:     "เด็กฝึกงาน / สหกิจ",
  partner:    "พาร์ทเนอร์",
};

const SEX_LABELS: Record<(typeof SEX_VALUES)[number], string> = {
  male:   "ชาย",
  female: "หญิง",
  other:  "อื่น ๆ",
};

export function AdminCreateNewForm({
  legacyPreset,
}: {
  legacyPreset: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ─── required ────────────────────────────────────────────────────
  // User ID = the staff login identifier (owner 2026-06-15: "ทำช่อง user id
  // ให้กรอก แยกมาข้างบน"). It drives the system email via the proven
  // `admin_*@pacred.co.th` convention that signIn already resolves — so staff
  // log in by this User ID, never by typing an email.
  const [userId, setUserId]       = useState<string>("");
  // REAL email (owner 2026-06-21: separate from the login User ID). Optional.
  const [realEmail, setRealEmail] = useState<string>("");
  const [password, setPassword]   = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName]   = useState<string>("");
  const [role, setRole]           = useState<AdminRoleEnum>("ops");

  // ─── recommended ─────────────────────────────────────────────────
  const [phone, setPhone]               = useState<string>("");
  const [nickname, setNickname]         = useState<string>("");
  const [company, setCompany]           = useState<(typeof COMPANY_VALUES)[number]>("pacred");
  const [employeeType, setEmployeeType] = useState<(typeof EMPLOYEE_TYPES)[number]>("full_time");
  const [department, setDepartment]     = useState<string>("");
  const [section, setSection]           = useState<string>("");
  const [workEmail, setWorkEmail]       = useState<string>("");
  const [workPhone, setWorkPhone]       = useState<string>("");
  const [hiredAt, setHiredAt]           = useState<string>("");
  const [avatarUrl, setAvatarUrl]       = useState<string>("");

  // ─── advanced (collapsible) ──────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState<boolean>(Boolean(legacyPreset));
  const [birthday, setBirthday]         = useState<string>("");
  const [employeeCode, setEmployeeCode] = useState<string>("");
  const [sex, setSex]                   = useState<"" | (typeof SEX_VALUES)[number]>("");
  const [legacyAdminId, setLegacyAdminId] = useState<string>(legacyPreset ?? "");
  const [adminNote, setAdminNote]       = useState<string>("");
  const [contractEndDate, setContractEndDate] = useState<string>("");

  // ─── feedback ────────────────────────────────────────────────────
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());
  // Cross-system phone-dedupe (เดฟ 2026-06-08): when the typed phone already
  // belongs to an existing customer, adminCreateNew refuses → we surface the
  // existing code + a confirm checkbox to deliberately proceed.
  const [phoneDupCode, setPhoneDupCode] = useState<string | null>(null);
  const [allowExistingPhone, setAllowExistingPhone] = useState<boolean>(false);

  // ─── derived login identity ──────────────────────────────────────
  // Sanitise to the safe `admin_*` namespace the signIn fast-path resolves
  // (lib/auth/.../actions/auth.ts:112 → `<id>@pacred.co.th`). Auto-prefix
  // `admin_` so a bare "pupu" still becomes a working login ("admin_pupu");
  // a typed "admin_pupu" stays as-is. derivedEmail is what we actually POST.
  const normalizedUserId = userId.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const loginId = normalizedUserId
    ? (normalizedUserId.startsWith("admin_") ? normalizedUserId : `admin_${normalizedUserId}`)
    : "";
  const derivedEmail = loginId ? `${loginId}@pacred.co.th` : "";

  // Auto-fill the running employee code (YYMMNO) on mount so the operator never
  // types it (owner 2026-06-15: "ออโต้ไปเลย … รันไป"). Pre-fills only when the
  // operator hasn't typed one + this isn't a legacy recreate (those keep their
  // own code). Editable after.
  useEffect(() => {
    if (legacyPreset) return;
    let alive = true;
    getNextEmployeeCode()
      .then((res) => {
        if (alive && res.ok && res.data?.code) {
          setEmployeeCode((cur) => (cur.trim() ? cur : res.data!.code));
        }
      })
      .catch(() => { /* leave blank — adminCreateNew falls back server-side */ });
    return () => { alive = false; };
  }, [legacyPreset]);

  function clearFieldError(key: string) {
    setFieldErrors((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  function generatePassword() {
    setPassword(suggestAdminPassword());
    clearFieldError("password");
  }

  function resetForm() {
    setUserId("");
    setRealEmail("");
    setPassword("");
    setFirstName("");
    setLastName("");
    setRole("ops");
    setPhone("");
    setNickname("");
    setCompany("pacred");
    setEmployeeType("full_time");
    setDepartment("");
    setSection("");
    setWorkEmail("");
    setWorkPhone("");
    setHiredAt("");
    setAvatarUrl("");
    setBirthday("");
    setEmployeeCode("");
    setSex("");
    setLegacyAdminId(legacyPreset ?? "");
    setAdminNote("");
    setContractEndDate("");
    setShowAdvanced(Boolean(legacyPreset));
    setError(null);
    setSuccess(null);
    setFieldErrors(new Set());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const errs = new Set<string>();
    if (!loginId)          errs.add("userId");
    if (!password)         errs.add("password");
    if (password.length > 0 && password.length < 8) errs.add("password");
    if (!firstName.trim()) errs.add("firstName");
    if (!lastName.trim())  errs.add("lastName");
    setFieldErrors(errs);
    if (errs.size > 0) {
      setError("กรอกข้อมูลให้ครบช่องที่ขีดเส้นแดง");
      return;
    }

    startTransition(async () => {
      const result = await adminCreateNew({
        login_id: loginId,                       // the staff login USERNAME
        email: realEmail.trim() || undefined,    // REAL email (optional · NOT the login key)
        password,
        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        role,

        phone:              phone.trim() || undefined,
        nickname:           nickname.trim() || undefined,
        company,
        employee_type:      employeeType,
        department:         department.trim() || undefined,
        section:            section.trim() || undefined,
        work_email:         workEmail.trim() || undefined,
        work_phone:         workPhone.trim() || undefined,
        hired_at:           hiredAt || undefined,
        avatar_url:         avatarUrl.trim() || undefined,

        birthday:           birthday || undefined,
        employee_code:      employeeCode.trim() || undefined,
        sex:                sex || undefined,
        legacy_admin_id:    legacyAdminId.trim() || undefined,
        admin_note:         adminNote.trim() || undefined,
        contract_end_date:  contractEndDate || undefined,
        allow_existing_phone: allowExistingPhone,
      });

      if (!result.ok) {
        // Cross-system phone duplicate — show the existing customer code and a
        // confirm checkbox instead of a raw error (the operator may genuinely
        // be promoting an existing customer to staff).
        if (result.error?.startsWith("phone_exists_customer:")) {
          const code = result.error.split(":")[1] ?? "";
          setPhoneDupCode(code);
          setError(
            `เบอร์นี้มีรหัสลูกค้าอยู่แล้ว: ${code} — ปกติแล้วบุคคลคนเดียวควรมีรหัสเดียว. ` +
            `ถ้าตั้งใจจะตั้งลูกค้าคนนี้เป็นพนักงาน ให้ติ๊กยืนยันด้านล่างแล้วบันทึกอีกครั้ง.`,
          );
          return;
        }
        setError(result.error);
        return;
      }

      const newId      = result.data?.profileId;
      const memberCode = result.data?.member_code ?? "";
      setSuccess(
        `บันทึกสำเร็จ — สมาชิก ${memberCode || ""} (${firstName} ${lastName}) ` +
        `${memberCode ? "· " : ""}กำลังพาไปหน้ารายชื่อ...`,
      );
      setTimeout(() => {
        // Land on the list so ภูม can immediately verify the row
        // appears + visit the detail to fill in any remaining HR data.
        router.push(`/admin/admins?s=1${newId ? `#pr-${newId}` : ""}`);
        router.refresh();
      }, 1000);
    });
  }

  const hasFieldError = (k: string) => fieldErrors.has(k);
  const errCls = (k: string) =>
    hasFieldError(k)
      ? "border-red-400 ring-1 ring-red-200 focus:border-red-500 focus:ring-red-300"
      : "border-border focus:border-primary-500 focus:ring-primary-200";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* ─── Global toast feedback ────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
          {phoneDupCode && (
            <label className="mt-3 flex items-center gap-2 font-medium text-red-900">
              <input
                type="checkbox"
                checked={allowExistingPhone}
                onChange={(e) => setAllowExistingPhone(e.target.checked)}
                className="h-4 w-4 accent-red-600"
              />
              ยืนยันสร้างพนักงานใหม่ทั้งที่เบอร์นี้มีรหัสลูกค้า {phoneDupCode} อยู่แล้ว
            </label>
          )}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✓ {success}
        </div>
      )}

      {/* ─── 1. REQUIRED — login + identity ───────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          🔑 ข้อมูลเข้าระบบ + ตัวตน <span className="text-red-500">*</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* User ID — the staff login identifier (owner 2026-06-15) */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1">
              User ID (ไอดีเข้าระบบ) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); clearFieldError("userId"); }}
              maxLength={40}
              placeholder="เช่น admin_pupu"
              disabled={pending}
              autoComplete="off"
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 ${errCls("userId")}`}
              required
            />
            {loginId ? (
              <p className="mt-1 text-[11px] text-green-700">
                ✓ พนักงานจะเข้าระบบด้วย User ID: <code className="font-mono font-semibold">{loginId}</code>{" "}
                + รหัสผ่านด้านล่าง
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted">
                ตัวพิมพ์เล็ก / ตัวเลข / ขีดล่าง — ระบบเติม{" "}
                <code className="font-mono">admin_</code> ให้อัตโนมัติถ้าไม่ได้พิมพ์
              </p>
            )}
          </div>

          {/* derived system email (read-only) */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              อีเมลระบบ (สร้างจาก User ID อัตโนมัติ)
            </label>
            <input
              type="text"
              value={derivedEmail}
              readOnly
              tabIndex={-1}
              placeholder="— กรอก User ID ก่อน —"
              className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm font-mono text-muted outline-none"
            />
            <p className="mt-1 text-[11px] text-muted">
              ลง <code className="font-mono">auth.users</code> ให้เอง — พนักงาน login ด้วย User ID ไม่ต้องพิมพ์อีเมลนี้.
            </p>
          </div>

          {/* REAL email — separate from the login User ID (owner 2026-06-21) */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              อีเมลจริง (สำหรับติดต่อ){" "}
              <span className="text-[10px] text-muted">— ไม่บังคับ · คนละช่องกับ User ID</span>
            </label>
            <input
              type="email"
              value={realEmail}
              onChange={(e) => setRealEmail(e.target.value)}
              maxLength={200}
              placeholder="เช่น somchai@gmail.com"
              disabled={pending}
              autoComplete="off"
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2"
            />
            <p className="mt-1 text-[11px] text-muted">
              อีเมลจริงของพนักงาน — เก็บไว้ใช้ติดต่อ ไม่เกี่ยวกับการ login.
            </p>
          </div>

          {/* password + generate */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              รหัสผ่าน <span className="text-red-500">*</span>{" "}
              <span className="text-[10px] text-muted">(ขั้นต่ำ 8 ตัว)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearFieldError("password"); }}
                maxLength={72}
                placeholder="≥ 8 ตัวอักษร"
                disabled={pending}
                autoComplete="off"
                className={`flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 ${errCls("password")}`}
                required
              />
              <button
                type="button"
                onClick={generatePassword}
                disabled={pending}
                className="rounded-xl border border-primary-300 bg-primary-50 px-3 py-2.5 text-xs text-primary-700 hover:bg-primary-100 whitespace-nowrap"
                title="สุ่มรหัสผ่าน 12 ตัวอักษร"
              >
                🎲 สุ่ม
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              ผู้สร้างจดไว้แล้วบอกพนักงานทาง phone/LINE — ระบบไม่ส่งทางเมล.
            </p>
          </div>

          {/* first + last name */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ชื่อ <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); clearFieldError("firstName"); }}
              maxLength={200}
              placeholder="ชื่อจริง"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("firstName")}`}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              นามสกุล <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); clearFieldError("lastName"); }}
              maxLength={200}
              placeholder="นามสกุล"
              disabled={pending}
              className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${errCls("lastName")}`}
              required
            />
          </div>

          {/* role */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1">
              บทบาท (role) <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRoleEnum)}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              required
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted">
              ดูคำแนะนำการเลือก role ที่ <code className="font-mono">docs/research/tb-admin-13-row-reference.md</code> §&ldquo;Suggested-role mapping logic&rdquo;.
              เปลี่ยน role ภายหลังได้ที่หน้า /edit.
            </p>
          </div>

          {/* employee code — auto-running YYMMNO (owner 2026-06-15) */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-muted mb-1">
              รหัสพนักงาน (ออโต้ · รันต่อจากเลขล่าสุด)
            </label>
            <input
              type="text"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              maxLength={20}
              placeholder="กำลังสร้างอัตโนมัติ…"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
            <p className="mt-1 text-[11px] text-muted">
              รูปแบบ YYMMNO (ปี-เดือน-เลขรัน) — ระบบเติมเลขถัดไปให้อัตโนมัติ เปลี่ยนเดือน/ปีก็รันต่อ · ใช้ login ได้ · แก้ได้ถ้าต้องการ.
            </p>
          </div>
        </div>
      </section>

      {/* ─── 2. RECOMMENDED — HR card ─────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📇 ข้อมูล HR (แนะนำให้กรอก)
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* phone + nickname */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">เบอร์ส่วนตัว</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={50}
              placeholder="0xx-xxx-xxxx"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              ชื่อเล่น (ใช้เป็น display name ในแชทลูกค้า)
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={120}
              placeholder="ชื่อเล่น"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>

          {/* company + employee_type */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">บริษัท</label>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value as (typeof COMPANY_VALUES)[number])}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            >
              {COMPANY_VALUES.map((c) => (
                <option key={c} value={c}>{COMPANY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">ประเภทพนักงาน</label>
            <select
              value={employeeType}
              onChange={(e) => setEmployeeType(e.target.value as (typeof EMPLOYEE_TYPES)[number])}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            >
              {EMPLOYEE_TYPES.map((t) => (
                <option key={t} value={t}>{EMPLOYEE_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* department + section */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">แผนก (department)</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              maxLength={100}
              placeholder="เช่น Sales Cargo / Accounting / ITDT"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">ตำแหน่ง (section)</label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              maxLength={100}
              placeholder="เช่น Sales Manager / Driver / Warehouse"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>

          {/* work email + work phone */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">อีเมลบริษัท (work)</label>
            <input
              type="email"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              maxLength={254}
              placeholder="sales01.work@pacred.co"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">เบอร์บริษัท (work)</label>
            <input
              type="tel"
              value={workPhone}
              onChange={(e) => setWorkPhone(e.target.value)}
              maxLength={50}
              placeholder="02-xxx-xxxx ต่อ xxx"
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>

          {/* hired_at + avatar */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">วันที่เริ่มงาน (hired_at)</label>
            <input
              type="date"
              value={hiredAt}
              onChange={(e) => setHiredAt(e.target.value)}
              disabled={pending}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            />
          </div>
          <div>
            <AdminAvatarUploadField
              value={avatarUrl}
              onChange={setAvatarUrl}
              disabled={pending}
            />
          </div>
        </div>
      </section>

      {/* ─── 3. ADVANCED (collapsible) ─────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center justify-between w-full text-left"
        >
          <h2 className="text-sm font-semibold tracking-wide text-foreground">
            ⚙️ ฟิลด์เพิ่มเติม
          </h2>
          <span className="text-xs text-muted">
            {showAdvanced ? "▼ ซ่อน" : "▶ เปิด"}
          </span>
        </button>

        {showAdvanced && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">วันเกิด</label>
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            {/* รหัสพนักงาน moved to section 1 (auto-filled) — owner 2026-06-15 */}
            <div>
              <label className="block text-xs font-medium text-muted mb-1">เพศ</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as "" | (typeof SEX_VALUES)[number])}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              >
                <option value="">— ไม่ระบุ —</option>
                {SEX_VALUES.map((s) => (
                  <option key={s} value={s}>{SEX_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">
                legacy_admin_id{" "}
                <span className="text-[10px] text-muted">
                  (กรอกเฉพาะตอน recreate 13 admin เก่า — empty สำหรับพนักงานใหม่)
                </span>
              </label>
              <input
                type="text"
                value={legacyAdminId}
                onChange={(e) => setLegacyAdminId(e.target.value)}
                maxLength={64}
                placeholder="legacy adminID เช่น admin_xxxx (ถ้า port มาจาก PCS เก่า)"
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
              <p className="mt-1 text-[11px] text-muted">
                เชื่อม <code className="font-mono">tb_users.adminidsale</code> เดิมเข้ากับ Pacred admin คนใหม่
                — บังคับ unique. ดูชื่อ legacy ที่ <code className="font-mono">docs/research/tb-admin-13-row-reference.md</code>.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                วันสิ้นสุดสัญญา (contract_end_date)
              </label>
              <input
                type="date"
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
              <p className="mt-1 text-[11px] text-muted">
                สำหรับ employee_type = probation — cron เช็คใกล้หมดเวลาทดลองงาน.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-muted mb-1">
                หมายเหตุ HR (ภายในเท่านั้น)
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="บันทึก HR เช่น &quot;ลาออกแล้วกลับมาใหม่ 2026-04&quot; / &quot;เคยเป็น sales01 ใน PCS เก่า&quot;"
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
              <p className="mt-1 text-[11px] text-muted">{adminNote.length} / 2000</p>
            </div>
          </div>
        )}
      </section>

      {/* ─── STICKY ACTIONS ─────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={resetForm}
            disabled={pending}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            รีเซ็ตฟอร์ม
          </button>

          <div className="flex items-center gap-3">
            {fieldErrors.size > 0 && (
              <span className="text-xs text-red-600">ยังขาด {fieldErrors.size} ช่อง</span>
            )}
            <button
              type="submit"
              disabled={pending || !loginId || !password || !firstName || !lastName}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังสร้าง..." : "✓ สร้าง Admin"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

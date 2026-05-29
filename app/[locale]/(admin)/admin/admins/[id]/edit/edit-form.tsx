"use client";

/**
 * Client form for /admin/admins/[id]/edit.
 *
 * Wave 22 Phase 4 (2026-05-27) — edit profiles + admin_contact_extras
 * + role + is_active on an existing Pacred-native admin. Fires 3
 * separate server actions:
 *
 *   - adminUpdateProfileFields  → profiles + admin_contact_extras UPSERT
 *   - adminToggleActive         → flip is_active on a role grant
 *   - adminChangeRole           → swap role (UPSERT new + soft-delete old)
 *
 * Email/password are READ-ONLY (chrome shows them; mutation lives in a
 * separate Supabase Dashboard flow — see banner on the page).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminUpdateProfileFields,
  adminToggleActive,
  adminChangeRole,
  type AdminEditLoad,
} from "@/actions/admin/admins";
import {
  ADMIN_ROLES,
  COMPANY_VALUES,
  EMPLOYEE_TYPES,
  SEX_VALUES,
  type AdminRoleEnum,
} from "@/lib/validators/admin-form";

const ROLE_LABELS: Record<AdminRoleEnum, string> = {
  super:                     "Super Admin",
  // 2026-05-28 ดึก — Wave 26 · `manager` role from migration 0118.
  manager:                   "Cargo Manager",
  ops:                       "Ops",
  accounting:                "Accounting",
  sales_admin:               "Cargo Sales Manager (#29)",
  sales:                     "Cargo Sales Staff (#30)",
  qa:                        "QA & QC (#5)",
  warehouse:                 "Warehouse",
  driver:                    "Driver",
  interpreter:               "Interpreter (ล่ามจีน)",
  freight_sales_manager:     "Freight Sales Manager",
  freight_sales:             "Freight Sales",
  freight_export_manager:    "Freight Export Manager",
  freight_export_cs:         "Freight Export CS/Doc",
  freight_export_doc:        "Freight Export Doc",
  freight_export_clearance:  "Freight Export Clearance",
  freight_clearance_both:    "Freight Clearance Import+Export",
  freight_export_messenger:  "Freight Export Messenger",
  freight_import_manager:    "Freight Import Manager",
  freight_import_cs:         "Freight Import CS/Doc",
  freight_import_doc:        "Freight Import Doc",
  freight_import_clearance:  "Freight Import Clearance",
  freight_import_messenger:  "Freight Import Messenger",
};

const COMPANY_LABELS: Record<(typeof COMPANY_VALUES)[number], string> = {
  "pacred":         "Pacred (รวม)",
  "pacred-cargo":   "Pacred Cargo",
  "pacred-freight": "Pacred Freight",
};

const EMPLOYEE_TYPE_LABELS: Record<(typeof EMPLOYEE_TYPES)[number], string> = {
  full_time:  "พนักงานประจำ",
  probation:  "ทดลองงาน",
  contract:   "สัญญาจ้าง",
  daily:      "รายวัน",
  intern:     "เด็กฝึกงาน",
  partner:    "พาร์ทเนอร์",
};

const SEX_LABELS: Record<(typeof SEX_VALUES)[number], string> = {
  male:   "ชาย",
  female: "หญิง",
  other:  "อื่น ๆ",
};

export function AdminEditForm({ initial }: { initial: AdminEditLoad }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ─── identity (editable) ─────────────────────────────────────────
  const [firstName, setFirstName] = useState<string>(initial.first_name ?? "");
  const [lastName, setLastName]   = useState<string>(initial.last_name ?? "");
  const [phone, setPhone]         = useState<string>(initial.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string>(initial.avatar_url ?? "");
  const [birthday, setBirthday]   = useState<string>(initial.birthday ?? "");
  const [sex, setSex]             = useState<"" | (typeof SEX_VALUES)[number]>(
    (initial.sex as (typeof SEX_VALUES)[number] | null) ?? "",
  );

  // ─── HR sidecar ──────────────────────────────────────────────────
  const [nickname, setNickname]               = useState<string>(initial.nickname ?? "");
  const [company, setCompany]                 = useState<(typeof COMPANY_VALUES)[number]>(
    (initial.company as (typeof COMPANY_VALUES)[number] | null) ?? "pacred",
  );
  const [employeeType, setEmployeeType]       = useState<(typeof EMPLOYEE_TYPES)[number]>(
    (initial.employee_type as (typeof EMPLOYEE_TYPES)[number] | null) ?? "full_time",
  );
  const [department, setDepartment]           = useState<string>(initial.department ?? "");
  const [section, setSection]                 = useState<string>(initial.section ?? "");
  const [workEmail, setWorkEmail]             = useState<string>(initial.work_email ?? "");
  const [workPhone, setWorkPhone]             = useState<string>(initial.work_phone ?? "");
  const [hiredAt, setHiredAt]                 = useState<string>(initial.hired_at ?? "");
  const [contractEndDate, setContractEndDate] = useState<string>(initial.contract_end_date ?? "");
  const [legacyAdminId, setLegacyAdminId]     = useState<string>(initial.legacy_admin_id ?? "");
  const [adminNote, setAdminNote]             = useState<string>(initial.admin_note ?? "");

  // ─── role management ─────────────────────────────────────────────
  // We model role on the form as a SINGLE active role (the most common
  // case). The admins table supports multi-role rows but the existing
  // UX is "one role per admin". A multi-role admin will see all rows
  // in the table below the form so they aren't surprised.
  const activeRoles = initial.roles.filter((r) => r.is_active);
  const primaryRole = (activeRoles[0]?.role as AdminRoleEnum | undefined) ?? "ops";
  const [role, setRole] = useState<AdminRoleEnum>(primaryRole);

  // ─── feedback ────────────────────────────────────────────────────
  const [error, setError]     = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function showOk(msg: string) {
    setError(null);
    setSuccess(msg);
  }
  function showErr(msg: string) {
    setSuccess(null);
    setError(msg);
  }

  // ─── submit: save profile + HR ───────────────────────────────────
  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await adminUpdateProfileFields({
        profile_id: initial.profile_id,

        first_name: firstName.trim(),
        last_name:  lastName.trim(),
        phone:      phone.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
        birthday:   birthday || undefined,
        sex:        sex || undefined,

        nickname:           nickname.trim() || undefined,
        company,
        employee_type:      employeeType,
        department:         department.trim() || undefined,
        section:            section.trim() || undefined,
        work_email:         workEmail.trim() || undefined,
        work_phone:         workPhone.trim() || undefined,
        hired_at:           hiredAt || undefined,
        contract_end_date:  contractEndDate || undefined,
        legacy_admin_id:    legacyAdminId.trim() || undefined,
        admin_note:         adminNote.trim() || undefined,
      });

      if (!result.ok) {
        showErr(result.error);
        return;
      }
      showOk("บันทึกแล้ว — refresh กำลังโหลดข้อมูลล่าสุด");
      router.refresh();
    });
  }

  // ─── role change ─────────────────────────────────────────────────
  function onRoleChange() {
    if (role === primaryRole) {
      showErr("role ใหม่ตรงกับ role ปัจจุบัน — ไม่มีการเปลี่ยน");
      return;
    }
    if (!confirm(
      `เปลี่ยน role จาก "${ROLE_LABELS[primaryRole]}" → "${ROLE_LABELS[role]}" ?\n\n` +
      `ระบบจะ:\n` +
      `  1. ให้ ${role} ใหม่ (is_active=true)\n` +
      `  2. ปิด ${primaryRole} เดิม (is_active=false · history ไม่ลบ)\n\n` +
      `การเปลี่ยน role จะถูก audit-log.`,
    )) return;

    startTransition(async () => {
      const result = await adminChangeRole({
        profile_id: initial.profile_id,
        old_role:   primaryRole,
        new_role:   role,
      });
      if (!result.ok) {
        showErr(result.error);
        return;
      }
      showOk(`เปลี่ยน role เป็น ${ROLE_LABELS[role]} แล้ว`);
      router.refresh();
    });
  }

  // ─── toggle is_active on a specific role row ─────────────────────
  function onToggleRoleActive(targetRole: string, currentActive: boolean) {
    if (!confirm(
      currentActive
        ? `ปิดสิทธิ์ "${ROLE_LABELS[targetRole as AdminRoleEnum] ?? targetRole}" ?\n\n` +
          `พนักงานจะไม่สามารถใช้งานเมนูของ role นี้ได้ทันที.\n` +
          `แถวยังคงอยู่ในตาราง · เปิดกลับได้ทุกเมื่อ.`
        : `เปิดสิทธิ์ "${ROLE_LABELS[targetRole as AdminRoleEnum] ?? targetRole}" กลับ ?`,
    )) return;

    startTransition(async () => {
      const result = await adminToggleActive({
        profile_id: initial.profile_id,
        role:       targetRole as AdminRoleEnum,
        is_active:  !currentActive,
      });
      if (!result.ok) {
        showErr(result.error);
        return;
      }
      showOk(currentActive ? "ปิด role แล้ว" : "เปิด role แล้ว");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* ─── Global feedback ──────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          ✓ {success}
        </div>
      )}

      {/* ─── READ-ONLY login chrome ───────────────────────────── */}
      <section className="rounded-2xl border border-border bg-surface-alt/40 p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          🔒 ข้อมูลเข้าระบบ (read-only)
        </h2>
        <div className="grid gap-3 md:grid-cols-2 text-sm">
          <div>
            <p className="text-xs text-muted">อีเมล (login)</p>
            <p className="font-mono break-all">{initial.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">member_code</p>
            <p className="font-mono">{initial.member_code ?? "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          เปลี่ยน email/password ต้องไปทำที่ Supabase Dashboard.
          {" "}<span className="opacity-75">(/admin reset-password flow — Wave 23.)</span>
        </p>
      </section>

      {/* ─── PROFILE + HR form ────────────────────────────────── */}
      <form onSubmit={onSubmit} className="space-y-5">
        {/* identity */}
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
            👤 ข้อมูลส่วนตัว
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">ชื่อ</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={200}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">นามสกุล</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={200}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">เบอร์ส่วนตัว</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={50}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                Avatar URL{" "}
                <span className="text-[10px] text-muted">(file upload — Wave 23)</span>
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                maxLength={512}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
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
          </div>
        </section>

        {/* HR sidecar */}
        <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
            📇 ข้อมูล HR
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">ชื่อเล่น (display name)</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={120}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
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
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                contract_end_date{" "}
                <span className="text-[10px] text-muted">(probation only)</span>
              </label>
              <input
                type="date"
                value={contractEndDate}
                onChange={(e) => setContractEndDate(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">แผนก</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                maxLength={100}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">ตำแหน่ง</label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                maxLength={100}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">อีเมลบริษัท</label>
              <input
                type="email"
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                maxLength={254}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">เบอร์บริษัท</label>
              <input
                type="tel"
                value={workPhone}
                onChange={(e) => setWorkPhone(e.target.value)}
                maxLength={50}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">วันที่เริ่มงาน</label>
              <input
                type="date"
                value={hiredAt}
                onChange={(e) => setHiredAt(e.target.value)}
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                legacy_admin_id{" "}
                <span className="text-[10px] text-muted">(unique)</span>
              </label>
              <input
                type="text"
                value={legacyAdminId}
                onChange={(e) => setLegacyAdminId(e.target.value)}
                maxLength={64}
                disabled={pending}
                placeholder="admin_pop"
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
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
                disabled={pending}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
              />
              <p className="mt-1 text-[11px] text-muted">{adminNote.length} / 2000</p>
            </div>
          </div>
        </section>

        {/* sticky save */}
        <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังบันทึก..." : "✓ บันทึก HR + ข้อมูลส่วนตัว"}
            </button>
          </div>
        </div>
      </form>

      {/* ─── ROLE management (separate flow) ─────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          🛡 บทบาทและสิทธิ์ (RBAC)
        </h2>

        {/* current roles table */}
        {initial.roles.length > 0 && (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/60">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">Role</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">สถานะ</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted font-semibold">ตัวเลือก</th>
                </tr>
              </thead>
              <tbody>
                {initial.roles.map((r) => (
                  <tr key={r.role} className="border-t border-border hover:bg-surface-alt/40">
                    <td className="px-3 py-2 font-mono">
                      {ROLE_LABELS[r.role as AdminRoleEnum] ?? r.role}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_active ? (
                        <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px]">
                          active
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 text-[10px]">
                          ปิด
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onToggleRoleActive(r.role, r.is_active)}
                        disabled={pending}
                        className={
                          r.is_active
                            ? "rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] text-red-700 hover:bg-red-100 disabled:opacity-50"
                            : "rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        }
                      >
                        {r.is_active ? "ปิด role" : "เปิด role"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* change role */}
        <div>
          <h3 className="text-xs font-semibold text-foreground mb-2">เปลี่ยน role หลัก</h3>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRoleEnum)}
              disabled={pending}
              className="flex-1 min-w-[240px] rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
            >
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                  {r === primaryRole ? " (ปัจจุบัน)" : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRoleChange}
              disabled={pending || role === primaryRole}
              className="rounded-xl border border-primary-300 bg-primary-50 px-4 py-2 text-xs text-primary-700 hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              เปลี่ยน role
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            การเปลี่ยน role จะถูก audit-log. ระบบจะให้ role ใหม่ + soft-delete role เดิม
            (แถวเก่ายังอยู่ในตารางด้านบน · กลับไปเปิดได้).
          </p>
        </div>
      </section>
    </div>
  );
}

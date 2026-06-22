"use client";

/**
 * Per-row staff RBAC management controls for /admin/admins ("row พนักงาน").
 *
 * Tier-1 (no migration) — mirrors the sales-team toggle pattern
 * (sales-team-client.tsx) + the /edit form's RBAC logic, surfaced inline on
 * the staff directory so a super-admin manages role + active per row without
 * opening the full /edit page.
 *
 * Each table row on /admin/admins is ONE (profile_id, role) role grant, so the
 * controls here act on that single grant:
 *   - Role change  → adminChangeRole({ profile_id, old_role: role, new_role })
 *                    (full-24 AdminChangeRoleSchema · UPSERT new + soft-delete old)
 *   - Active toggle → adminToggleActive({ profile_id, role, is_active })
 *
 * §0f confirm-before-mutate: every mutation pops the Pacred-styled confirm
 * dialog BEFORE the server action fires. Success → router.refresh() (re-fetch
 * server truth). On error → revert the optimistic UI + surface the message.
 * Rendered ONLY for `super` (the page gates `canManage`).
 *
 * NO money-path writes — pure RBAC via the EXISTING audited actions.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm, alert } from "@/components/ui/confirm";
import { adminChangeRole, adminToggleActive } from "@/actions/admin/admins";
import {
  ADMIN_ROLES,
  ROLE_LABELS,
  adminRoleSchema,
  type AdminRoleEnum,
} from "@/lib/validators/admin-form";

export function AdminRowManage({
  profileId,
  role,
  isActive,
  staffName,
}: {
  profileId: string;
  role: string;
  isActive: boolean;
  staffName: string;
}) {
  const router = useRouter();
  // `role` is a free string from the DB; narrow to the enum so the controls
  // type-check. If a row ever carries an unknown role (CHECK drift), fall back
  // to "ops" for the select default but keep the raw value in the labels.
  const parsedRole = adminRoleSchema.safeParse(role);
  const currentRole: AdminRoleEnum = parsedRole.success ? parsedRole.data : "ops";

  const [selectedRole, setSelectedRole] = useState<AdminRoleEnum>(currentRole);
  const [active, setActive] = useState<boolean>(isActive);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  // ─── role change ─────────────────────────────────────────────────
  async function onRoleChange(next: AdminRoleEnum) {
    if (next === currentRole) return;

    const ok = await confirm(
      `เปลี่ยน role ของ "${staffName}"\n` +
        `จาก "${ROLE_LABELS[currentRole] ?? currentRole}" → "${ROLE_LABELS[next]}" ?\n\n` +
        `ระบบจะให้สิทธิ์ ${next} ใหม่ + ปิดสิทธิ์ ${currentRole} เดิม (history ไม่ลบ · audit-log).`,
      {
        title: "เปลี่ยน role พนักงาน",
        confirmLabel: "เปลี่ยน role",
        cancelLabel: "ยกเลิก",
      },
    );
    if (!ok) {
      // user cancelled → snap the <select> back to the current role
      setSelectedRole(currentRole);
      return;
    }

    // Optimistic — show the chosen value while the action runs.
    setSelectedRole(next);
    setBusy(true);
    startTransition(async () => {
      const res = await adminChangeRole({
        profile_id: profileId,
        old_role: currentRole,
        new_role: next,
      });
      setBusy(false);
      if (res.ok) {
        router.refresh();
      } else {
        // Revert the optimistic select on failure.
        setSelectedRole(currentRole);
        await alert(`เปลี่ยน role ไม่สำเร็จ: ${res.error}`, { title: "ผิดพลาด" });
      }
    });
  }

  // ─── active toggle ───────────────────────────────────────────────
  async function onToggleActive() {
    const next = !active;
    const ok = await confirm(
      next
        ? `เปิดสิทธิ์ "${ROLE_LABELS[currentRole] ?? currentRole}" ของ "${staffName}" กลับ ?`
        : `ปิดสิทธิ์ "${ROLE_LABELS[currentRole] ?? currentRole}" ของ "${staffName}" ?\n\n` +
            `พนักงานจะใช้เมนูของ role นี้ไม่ได้ทันที · แถวยังอยู่ · เปิดกลับได้ทุกเมื่อ.`,
      {
        title: next ? "เปิดสิทธิ์" : "ปิดสิทธิ์",
        confirmLabel: next ? "เปิดสิทธิ์" : "ปิดสิทธิ์",
        cancelLabel: "ยกเลิก",
      },
    );
    if (!ok) return;

    // Optimistic flip.
    setActive(next);
    setBusy(true);
    startTransition(async () => {
      const res = await adminToggleActive({
        profile_id: profileId,
        role: currentRole,
        is_active: next,
      });
      setBusy(false);
      if (res.ok) {
        router.refresh();
      } else {
        // Revert on failure.
        setActive(active);
        await alert(`อัปเดตสิทธิ์ไม่สำเร็จ: ${res.error}`, { title: "ผิดพลาด" });
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      {/* Role change */}
      <select
        aria-label={`เปลี่ยน role: ${staffName}`}
        value={selectedRole}
        disabled={busy}
        onChange={(e) => onRoleChange(e.target.value as AdminRoleEnum)}
        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-[11px] text-foreground disabled:opacity-50"
      >
        {ADMIN_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={`เปิด/ปิดสิทธิ์: ${staffName}`}
          disabled={busy}
          onClick={onToggleActive}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            active ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              active ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </button>
        <span className={`text-[11px] font-medium ${active ? "text-primary-700" : "text-muted"}`}>
          {active ? "เปิดสิทธิ์" : "ปิดสิทธิ์"}
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  adminGrantRole, adminToggleRole, adminUpdateContactExtras,
} from "@/actions/admin/admins";

// U4-1 RBAC console upgrade — wider Role set covers all 7 enum values
// (super / ops / accounting / sales_admin / warehouse / driver / interpreter).
// Mirrors `AdminRole` in lib/auth/require-admin.ts.
type Role = "super" | "ops" | "accounting" | "sales_admin" | "warehouse" | "driver" | "interpreter";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/50";

export function GrantForm() {
  const router = useRouter();
  const [profileId, setProfileId] = useState("");
  const [role, setRole]           = useState<Role>("ops");
  const [error, setError]         = useState<string | null>(null);
  const [msg,   setMsg]           = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    startTransition(async () => {
      const res = await adminGrantRole({ profile_id: profileId, role });
      if (res.ok) {
        setMsg("เพิ่ม role แล้ว");
        setProfileId("");
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">เพิ่ม admin</h3>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      {msg   && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      <label className="block space-y-1">
        <span className="text-xs font-medium">Profile UUID</span>
        <input value={profileId} onChange={(e) => setProfileId(e.target.value)} className={inputCls} required placeholder="ดูจาก /admin/customers" />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium">Role</span>
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
          <option value="ops">ops — ดูแล ฝากนำเข้า + ฝากสั่ง</option>
          <option value="accounting">accounting — ดูแล wallet + ฝากโอน + เบิกค่าคอม</option>
          <option value="sales_admin">sales_admin — ดูแล ทีมขาย + assign เซลล์</option>
          <option value="warehouse">warehouse — ตัดตู้ + แสกนสินค้า</option>
          <option value="driver">driver — งานส่งของ</option>
          <option value="interpreter">interpreter — ล่ามจีน (commission)</option>
          <option value="super">super — สิทธิ์ทุกอย่าง</option>
        </select>
      </label>
      <Button type="submit" fullWidth disabled={pending}>{pending ? "..." : "เพิ่ม"}</Button>
    </form>
  );
}

export function RowActions({ profileId, role, isActive }: { profileId: string; role: Role; isActive: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  async function toggle() {
    if (!(await confirm(isActive ? `ปิดสิทธิ์ ${role}?` : `เปิดสิทธิ์ ${role}?`))) return;
    startTransition(async () => {
      const res = await adminToggleRole({ profile_id: profileId, role, is_active: !isActive });
      if (res.ok) router.refresh();
    });
  }
  return (
    <Button size="sm" variant="outline" type="button" onClick={toggle} disabled={pending}>
      {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
    </Button>
  );
}

export function ContactForm({ profileId, displayName, directPhone, department, section }: {
  profileId: string; displayName: string | null; directPhone: string | null;
  department: string | null; section: string | null;
}) {
  const router = useRouter();
  const [name,  setName]   = useState(displayName ?? "");
  const [phone, setPhone]  = useState(directPhone ?? "");
  const [dept,  setDept]   = useState(department ?? "");
  const [sec,   setSec]    = useState(section ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await adminUpdateContactExtras({ profile_id: profileId, display_name: name, direct_phone: phone, department: dept, section: sec });
      if (res.ok) { setEditing(false); router.refresh(); }
    });
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-primary-500 hover:underline">
        {displayName ? "แก้ contact" : "+ ตั้งชื่อแสดง / เบอร์ตรง"}
      </button>
    );
  }
  return (
    <div className="space-y-1 mt-1">
      <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="ชื่อแสดง (เซลล์ มิว)" />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="เบอร์ตรง" />
      <div className="flex gap-1">
        <input value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls} placeholder="ฝ่าย (sale)" />
        <input value={sec} onChange={(e) => setSec(e.target.value)} className={inputCls} placeholder="ทีม" />
      </div>
      <div className="flex gap-1">
        <Button size="sm" type="button" onClick={save} disabled={pending}>OK</Button>
        <Button size="sm" variant="outline" type="button" onClick={() => setEditing(false)}>×</Button>
      </div>
    </div>
  );
}

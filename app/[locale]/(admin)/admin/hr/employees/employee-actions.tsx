"use client";

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Pencil, Trash2, KeyRound, Pause, Play } from "lucide-react";
import {
  adminSuspendEmployee, adminResetEmployeePassword, adminRemoveEmployee,
} from "@/actions/admin/employees";

export function EmployeeRowActions({
  profileId, suspended, hasEmail,
}: { profileId: string; suspended: boolean; hasEmail: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function suspend() {
    if (!confirm(suspended ? "เปิดใช้งานบัญชีนี้?" : "พักงานพนักงานคนนี้?")) return;
    startTransition(async () => {
      const res = await adminSuspendEmployee({ profile_id: profileId, suspend: !suspended });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  function reset() {
    if (!hasEmail) { alert("พนักงานคนนี้ไม่มีอีเมลในระบบ — รีเซ็ตไม่ได้"); return; }
    if (!confirm("ส่งอีเมลรีเซ็ตรหัสผ่าน?")) return;
    startTransition(async () => {
      const res = await adminResetEmployeePassword({ profile_id: profileId });
      if (res.ok) alert("✓ ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว");
      else alert(`✗ ${res.error}`);
    });
  }

  function remove() {
    if (!confirm("ลบสิทธิ์ admin ของพนักงานคนนี้ออกจากระบบ?\n(โปรไฟล์ลูกค้ายังคงอยู่ — แค่ยกเลิกสิทธิ์ admin)")) return;
    startTransition(async () => {
      const res = await adminRemoveEmployee({ profile_id: profileId });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  const btn = "inline-flex h-7 w-7 items-center justify-center rounded-md border text-[11px] transition-colors disabled:opacity-50";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => router.push(`/admin/hr/employees/${profileId}` as Parameters<typeof router.push>[0])}
        className={`${btn} border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100`}
        title="แก้ไขข้อมูล"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={suspend}
        disabled={pending}
        className={`${btn} ${suspended
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"}`}
        title={suspended ? "เปิดใช้งาน" : "พักงาน"}
      >
        {suspended ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        className={`${btn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
        title="รีเซ็ตรหัสผ่าน"
      >
        <KeyRound className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className={`${btn} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
        title="ลบบัญชี admin"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

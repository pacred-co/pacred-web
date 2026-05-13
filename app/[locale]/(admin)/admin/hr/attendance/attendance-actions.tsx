"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { LogIn, LogOut, Pencil, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminQuickClock, adminUpsertAttendance } from "@/actions/admin/attendance";

const inputCls = "rounded-md border border-border bg-surface-alt/30 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/40";

export function ClockButton({
  profileId, workDate, field, hasValue,
}: { profileId: string; workDate: string; field: "clock_in" | "clock_out"; hasValue: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function click() {
    if (hasValue && !confirm(`เขียนทับเวลา ${field === "clock_in" ? "เข้า" : "ออก"} ใหม่?`)) return;
    startTransition(async () => {
      const res = await adminQuickClock({ profile_id: profileId, work_date: workDate, field });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  const Icon = field === "clock_in" ? LogIn : LogOut;
  const cls = field === "clock_in"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
    : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";
  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${cls}`}
      title={field === "clock_in" ? "บันทึกเข้างาน (ตอนนี้)" : "บันทึกออกงาน (ตอนนี้)"}
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {field === "clock_in" ? "เข้า" : "ออก"}
    </button>
  );
}

type EditProps = {
  profileId: string;
  workDate: string;
  initial: {
    clock_in:  string | null;
    clock_out: string | null;
    status:    string;
    note:      string | null;
  };
};

export function EditAttendanceButton({ profileId, workDate, initial }: EditProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    clock_in:  initial.clock_in ?  isoToLocal(initial.clock_in) : "",
    clock_out: initial.clock_out ? isoToLocal(initial.clock_out) : "",
    status:    initial.status,
    note:      initial.note ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function isoToLocal(iso: string): string {
    // strip Z and seconds to fit datetime-local input
    return iso.slice(0, 16);
  }

  function save() {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpsertAttendance({
        profile_id: profileId,
        work_date:  workDate,
        clock_in:   form.clock_in  ? new Date(form.clock_in).toISOString()  : null,
        clock_out:  form.clock_out ? new Date(form.clock_out).toISOString() : null,
        status:     form.status as "present" | "late" | "early_leave" | "absent" | "leave" | "holiday" | "off",
        note:       form.note || null,
      });
      if (res.ok) { setOpen(false); router.refresh(); }
      else setErr(res.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1 text-[10px] font-bold hover:bg-amber-100"
        title="แก้ไขเวลา/สถานะ"
      >
        <Pencil className="w-3 h-3" />
        แก้
      </button>
    );
  }

  return (
    <div className="absolute right-0 mt-1 w-72 rounded-xl border border-border bg-white dark:bg-surface shadow-lg p-3 z-20 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold">แก้ไขการเข้างาน {workDate}</h4>
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {err && <div className="rounded-md border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">{err}</div>}

      <label className="block space-y-0.5">
        <span className="text-[10px] font-semibold text-muted">เข้างาน</span>
        <input type="datetime-local" value={form.clock_in}
          onChange={(e) => setForm((f) => ({ ...f, clock_in: e.target.value }))}
          className={`${inputCls} w-full`} />
      </label>
      <label className="block space-y-0.5">
        <span className="text-[10px] font-semibold text-muted">ออกงาน</span>
        <input type="datetime-local" value={form.clock_out}
          onChange={(e) => setForm((f) => ({ ...f, clock_out: e.target.value }))}
          className={`${inputCls} w-full`} />
      </label>
      <label className="block space-y-0.5">
        <span className="text-[10px] font-semibold text-muted">override สถานะ</span>
        <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={`${inputCls} w-full`}>
          <option value="present">มาทำงาน (auto)</option>
          <option value="absent">ขาด (auto)</option>
          <option value="leave">ลา</option>
          <option value="holiday">วันหยุดประเภท</option>
          <option value="off">วันหยุดประจำ</option>
        </select>
      </label>
      <label className="block space-y-0.5">
        <span className="text-[10px] font-semibold text-muted">หมายเหตุ</span>
        <textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className={`${inputCls} w-full`} />
      </label>

      <div className="flex items-center justify-end gap-1">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          บันทึก
        </Button>
      </div>
    </div>
  );
}

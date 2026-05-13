"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, XCircle, Plus, Loader2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminCreateLeave, adminDecideLeave } from "@/actions/admin/attendance";

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

// ────────────────────────────────────────────────────────────
// Approve / Reject per leave row
// ────────────────────────────────────────────────────────────
export function LeaveDecideActions({ id, currentStatus }: { id: string; currentStatus: "pending" | "approved" | "rejected" | "cancelled" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function decide(to: "approved" | "rejected" | "cancelled") {
    let note: string | null = null;
    if (to === "rejected") {
      note = prompt("เหตุผลที่ไม่อนุมัติ:") ?? null;
      if (note === null) return;
    } else if (to === "approved" && !confirm("อนุมัติคำขอลานี้?")) {
      return;
    }
    startTransition(async () => {
      const res = await adminDecideLeave({ id, to_status: to, approval_note: note });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  if (currentStatus !== "pending") {
    if (currentStatus === "approved") {
      return (
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("cancelled")}
          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 text-gray-700 px-2 py-1 text-[10px] font-medium hover:bg-gray-100 disabled:opacity-50"
        >
          {pending && <Loader2 className="w-3 h-3 animate-spin" />}
          ยกเลิกการอนุมัติ
        </button>
      );
    }
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("approved")}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500 text-white px-2.5 py-1 text-xs font-bold hover:bg-emerald-600 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        อนุมัติ
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("rejected")}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 px-2.5 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
      >
        <XCircle className="w-3 h-3" />
        ปฏิเสธ
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// New leave (HR on behalf of employee)
// ────────────────────────────────────────────────────────────
type EmployeeOpt = { id: string; label: string };

export function NewLeaveButton({ employees }: { employees: EmployeeOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    profile_id: "",
    leave_type: "vacation" as "vacation" | "sick" | "personal" | "maternity" | "marriage" | "funeral" | "unpaid" | "other",
    start_date: new Date().toISOString().slice(0, 10),
    end_date:   new Date().toISOString().slice(0, 10),
    reason: "",
    pre_approve: true,
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function dayCount(): number {
    const s = new Date(form.start_date), e = new Date(form.end_date);
    if (e < s) return 0;
    return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.profile_id) { setErr("เลือกพนักงานก่อน"); return; }
    startTransition(async () => {
      const res = await adminCreateLeave({
        profile_id: form.profile_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date:   form.end_date,
        days_count: dayCount(),
        reason: form.reason || null,
        status: form.pre_approve ? "approved" : "pending",
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
        className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow"
      >
        <Plus className="w-4 h-4" />
        เพิ่มคำขอลา
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface border border-border shadow-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">เพิ่มคำขอลาให้พนักงาน</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">พนักงาน *</span>
          <select required value={form.profile_id} onChange={(e) => setForm((f) => ({ ...f, profile_id: e.target.value }))} className={inputCls}>
            <option value="">— เลือก —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ประเภทลา</span>
            <select value={form.leave_type} onChange={(e) => setForm((f) => ({ ...f, leave_type: e.target.value as typeof form.leave_type }))} className={inputCls}>
              <option value="vacation">ลาพักร้อน</option>
              <option value="sick">ลาป่วย</option>
              <option value="personal">ลากิจ</option>
              <option value="maternity">ลาคลอด</option>
              <option value="marriage">ลาสมรส</option>
              <option value="funeral">ลาฌาปนกิจ</option>
              <option value="unpaid">ลาไม่รับค่าจ้าง</option>
              <option value="other">อื่นๆ</option>
            </select>
          </label>
          <div className="rounded-lg border border-border bg-surface-alt/30 p-2 text-xs text-center self-end">
            <p className="text-muted text-[10px]">รวม</p>
            <p className="text-lg font-bold text-primary-600">{dayCount()} วัน</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">จากวันที่</span>
            <input type="date" value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date < e.target.value ? e.target.value : f.end_date }))}
              className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ถึงวันที่</span>
            <input type="date" min={form.start_date} value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className={inputCls} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">เหตุผล</span>
          <textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="เหตุผลในการลา" />
        </label>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.pre_approve} onChange={(e) => setForm((f) => ({ ...f, pre_approve: e.target.checked }))} className="mt-0.5" />
          <span>
            <b>อนุมัติทันที</b> — สถานะจะเป็น approved ทันที + ระบบจะ mark วันที่ลาในตาราง attendance ให้อัตโนมัติ
          </span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm" disabled={pending || dayCount() < 1}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}

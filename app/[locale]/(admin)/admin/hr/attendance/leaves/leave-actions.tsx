"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, XCircle, Plus, Loader2, X, Save, ArrowRight } from "lucide-react";
import { confirm, alert } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { adminCreateLeave, adminDecideLeave } from "@/actions/admin/attendance";
import { LEAVE_TYPE_LABEL, LEAVE_DURATION_LABEL } from "../../_legacy-labels";

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

// ────────────────────────────────────────────────────────────
// Decide a leave row — legacy status flow 1→2→3 (approve) / →4 (reject)
//   1 รอ HR ตรวจสอบ → 2 รอผู้บริหารอนุมัติ → 3 อนุมัติ / 4 ไม่อนุมัติ
// ────────────────────────────────────────────────────────────
export function LeaveDecideActions({ id, currentStatus }: { id: number; currentStatus: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function decide(to: "2" | "3" | "4", confirmMsg?: string) {
    if (confirmMsg && !(await confirm(confirmMsg))) return;
    startTransition(async () => {
      const res = await adminDecideLeave({ id, to_status: to });
      if (res.ok) router.refresh();
      else await alert(res.error);
    });
  }

  // status 3 (approved) / 4 (rejected) = terminal
  if (currentStatus === "3" || currentStatus === "4") return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentStatus === "1" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("2", "ส่งต่อให้ผู้บริหารอนุมัติ?")}
          className="inline-flex items-center gap-1 rounded-md bg-blue-500 text-white px-2.5 py-1 text-xs font-bold hover:bg-blue-600 disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
          ส่งผู้บริหาร
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("3", "อนุมัติการลานี้?")}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500 text-white px-2.5 py-1 text-xs font-bold hover:bg-emerald-600 disabled:opacity-50"
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
        อนุมัติ
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => decide("4", "ไม่อนุมัติการลานี้?")}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 px-2.5 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
      >
        <XCircle className="w-3 h-3" />
        ไม่อนุมัติ
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// New leave (faithful: leave-record/add.php — select tb_admin employee +
//   type(1-4) + duration(1-3) + start/end + reason)
// ────────────────────────────────────────────────────────────
type EmployeeOpt = { id: string; label: string };

export function NewLeaveButton({ employees }: { employees: EmployeeOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    admin_id_leave: "",
    type:           "1" as "1" | "2" | "3" | "4",
    duration:       "1" as "1" | "2" | "3",
    start_date:     new Date().toISOString().slice(0, 10),
    end_date:       "",
    reason:         "",
    pre_approve:    false,
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.admin_id_leave) { setErr("เลือกพนักงานก่อน"); return; }
    if (!form.reason.trim()) { setErr("กรอกเหตุผลการลา"); return; }
    startTransition(async () => {
      const res = await adminCreateLeave({
        admin_id_leave: form.admin_id_leave,
        type:           form.type,
        duration:       form.duration,
        start_date:     form.start_date,
        end_date:       form.end_date || null,
        reason:         form.reason,
        status:         form.pre_approve ? "3" : "1",
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
        เพิ่มการลางาน
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface border border-border shadow-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-foreground">เพิ่มการลางาน</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">พนักงานที่ต้องการลา *</span>
          <select required value={form.admin_id_leave} onChange={(e) => setForm((f) => ({ ...f, admin_id_leave: e.target.value }))} className={inputCls}>
            <option value="">กรุณาเลือกพนักงานที่ต้องการลา</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ประเภทการลา *</span>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))} className={inputCls}>
              {Object.entries(LEAVE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ระยะเวลา *</span>
            <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value as typeof form.duration }))} className={inputCls}>
              {Object.entries(LEAVE_DURATION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">วันที่เริ่มลา *</span>
            <input type="date" required value={form.start_date}
              onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value, end_date: f.end_date && f.end_date < e.target.value ? e.target.value : f.end_date }))}
              className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">วันที่สิ้นสุด (เว้นว่าง = วันเดียว)</span>
            <input type="date" min={form.start_date} value={form.end_date}
              onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              className={inputCls} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">เหตุผล *</span>
          <textarea rows={2} required value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} className={inputCls} placeholder="เหตุผลในการลา" />
        </label>

        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={form.pre_approve} onChange={(e) => setForm((f) => ({ ...f, pre_approve: e.target.checked }))} className="mt-0.5" />
          <span><b>อนุมัติทันที</b> — ตั้งสถานะเป็น &ldquo;อนุมัติ&rdquo; เลย (ข้ามขั้นรอตรวจสอบ)</span>
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm" disabled={pending || !form.admin_id_leave}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            ส่งข้อมูลการลางาน
          </Button>
        </div>
      </form>
    </div>
  );
}

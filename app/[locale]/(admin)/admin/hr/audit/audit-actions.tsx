"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, X, Save, Loader2, Trash2 } from "lucide-react";
import { confirm, alert } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { adminCreateAuditEntry, adminDeleteAuditEntry } from "@/actions/admin/employee-audit";

type EntryType = "praise" | "note" | "warning" | "disciplinary" | "training" | "review" | "other";
type Severity  = "info" | "low" | "medium" | "high" | "critical";

type EmployeeOpt = { id: string; label: string };

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

export function NewAuditButton({ employees, preselect }: { employees: EmployeeOpt[]; preselect?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    profile_id:  preselect ?? "",
    entry_type:  "note" as EntryType,
    severity:    "info" as Severity,
    title:       "",
    description: "",
    related_at:  new Date().toISOString().slice(0, 10),
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.profile_id) { setErr("เลือกพนักงานก่อน"); return; }
    startTransition(async () => {
      const res = await adminCreateAuditEntry({
        profile_id:  form.profile_id,
        entry_type:  form.entry_type,
        severity:    form.severity,
        title:       form.title,
        description: form.description || null,
        related_at:  form.related_at || null,
      });
      if (res.ok) {
        setOpen(false);
        setForm((f) => ({ ...f, title: "", description: "" }));
        router.refresh();
      } else setErr(res.error);
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
        บันทึกใหม่
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <form onSubmit={submit} className="w-full max-w-xl rounded-2xl bg-white dark:bg-surface border border-border shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">บันทึกประวัติพนักงาน</h3>
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

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-muted">ประเภท</span>
            <select value={form.entry_type} onChange={(e) => setForm((f) => ({ ...f, entry_type: e.target.value as EntryType }))} className={inputCls}>
              <option value="praise">ชมเชย</option>
              <option value="note">บันทึกทั่วไป</option>
              <option value="warning">ตักเตือน</option>
              <option value="disciplinary">โทษทางวินัย</option>
              <option value="training">การอบรม</option>
              <option value="review">ประเมินผลงาน</option>
              <option value="other">อื่นๆ</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ความรุนแรง</span>
            <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Severity }))} className={inputCls}>
              <option value="info">Info</option>
              <option value="low">น้อย</option>
              <option value="medium">ปานกลาง</option>
              <option value="high">สูง</option>
              <option value="critical">วิกฤต</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">หัวข้อ *</span>
          <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="เช่น ขาดงานโดยไม่แจ้ง 3 วันติด" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">รายละเอียด</span>
          <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
        </label>

        <label className="block space-y-1 max-w-xs">
          <span className="text-xs font-semibold text-muted">วันที่เกิดเหตุ</span>
          <input type="date" value={form.related_at} onChange={(e) => setForm((f) => ({ ...f, related_at: e.target.value }))} className={inputCls} />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm" disabled={pending || !form.title.trim() || !form.profile_id}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}

export function AuditDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function remove() {
    if (!(await confirm("ลบบันทึกนี้ออกจากระบบ?"))) return;
    startTransition(async () => {
      const res = await adminDeleteAuditEntry({ id });
      if (res.ok) router.refresh();
      else await alert(res.error);
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
      title="ลบ"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
    </button>
  );
}

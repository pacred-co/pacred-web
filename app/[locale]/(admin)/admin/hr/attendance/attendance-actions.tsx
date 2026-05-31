"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Plus, Loader2, Save, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminAddHoliday, adminDeleteHoliday } from "@/actions/admin/attendance";

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

// ────────────────────────────────────────────────────────────
// Add holiday (faithful: time-attendance-system.php case 'add-holiday' form)
// ────────────────────────────────────────────────────────────
export function AddHolidayButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ holiday_name: "", holiday_date: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.holiday_name.trim() || !form.holiday_date) {
      setErr("กรุณากรอกชื่อวันหยุดและวันที่");
      return;
    }
    startTransition(async () => {
      const res = await adminAddHoliday({
        holiday_name: form.holiday_name,
        holiday_date: form.holiday_date,
        note: form.note || null,
      });
      if (res.ok) {
        setForm({ holiday_name: "", holiday_date: "", note: "" });
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error === "duplicate" ? "มีวันหยุดชื่อนี้ในวันเดียวกันอยู่แล้ว" : res.error);
      }
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
        เพิ่มวันหยุด
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface border border-border shadow-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-foreground">ฟอร์มวันหยุดประเพณีบริษัท</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">ชื่อวันหยุด *</span>
          <input value={form.holiday_name} maxLength={255} required
            onChange={(e) => setForm((f) => ({ ...f, holiday_name: e.target.value }))}
            className={inputCls} placeholder="เช่น วันขึ้นปีใหม่" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">วันหยุด (หากมากกว่า 1 วันให้เพิ่มใหม่อีกรายการ) *</span>
          <input type="date" value={form.holiday_date} required
            onChange={(e) => setForm((f) => ({ ...f, holiday_date: e.target.value }))}
            className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">โน๊ตช่วยจำ</span>
          <textarea rows={3} value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            className={inputCls} />
        </label>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm" disabled={pending || !form.holiday_name.trim() || !form.holiday_date}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Delete holiday (faithful: add-holiday/deleteHoliday.php)
// ────────────────────────────────────────────────────────────
export function DeleteHolidayButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm(`ลบวันหยุด "${name}"?`)) return;
    startTransition(async () => {
      const res = await adminDeleteHoliday({ id });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={remove}
      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 px-2 py-1 text-[10px] font-medium hover:bg-red-100 disabled:opacity-50"
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
      ลบรายการ
    </button>
  );
}

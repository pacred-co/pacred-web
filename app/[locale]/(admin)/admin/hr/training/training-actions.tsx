"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Plus, X, Loader2, Save, Trash2, Users2, Pencil,
  CheckCircle2, PlayCircle, MinusCircle, GraduationCap,
} from "lucide-react";
import { confirm, alert, prompt } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import {
  adminUpsertCourse, adminDeleteCourse,
  adminBulkEnrollActiveAdmins, adminEnroll, adminSetEnrollmentStatus,
} from "@/actions/admin/learning";

type Category = "general" | "operations" | "compliance" | "technical" | "soft_skills" | "safety";
type Status = "enrolled" | "in_progress" | "completed" | "failed" | "exempted";

type CourseSeed = {
  id?: string;
  title: string;
  category: Category;
  description: string;
  duration_hours: number;
  instructor: string;
  materials_url: string;
  is_mandatory: boolean;
  is_active: boolean;
};

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

const EMPTY: CourseSeed = {
  title: "", category: "general", description: "", duration_hours: 2,
  instructor: "", materials_url: "", is_mandatory: false, is_active: true,
};

// ────────────────────────────────────────────────────────────
// Course form (create + edit) — modal
// ────────────────────────────────────────────────────────────
export function CourseFormButton({
  buttonLabel, initial, asPencil = false,
}: { buttonLabel: string; initial?: CourseSeed; asPencil?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CourseSeed>(initial ?? EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await adminUpsertCourse({
        id:             form.id,
        title:          form.title,
        category:       form.category,
        description:    form.description || null,
        duration_hours: form.duration_hours,
        instructor:     form.instructor || null,
        materials_url:  form.materials_url || null,
        is_mandatory:   form.is_mandatory,
        is_active:      form.is_active,
      });
      if (res.ok) { setOpen(false); router.refresh(); }
      else setErr(res.error);
    });
  }

  if (!open) {
    if (asPencil) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          title="แก้ไข"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow"
      >
        <Plus className="w-4 h-4" />
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white dark:bg-surface border border-border shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{form.id ? "แก้ไขหลักสูตร" : "เพิ่มหลักสูตรใหม่"}</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">ชื่อหลักสูตร *</span>
          <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="เช่น การใช้งาน LINE OA" />
        </label>

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-muted">หมวด</span>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))} className={inputCls}>
              <option value="general">ทั่วไป</option>
              <option value="operations">การปฏิบัติงาน</option>
              <option value="compliance">กฎหมาย/กำกับ</option>
              <option value="technical">เทคนิค</option>
              <option value="soft_skills">ทักษะอ่อน</option>
              <option value="safety">ความปลอดภัย</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ระยะเวลา (ชม.)</span>
            <input type="number" min={0.25} step={0.25} value={form.duration_hours}
              onChange={(e) => setForm((f) => ({ ...f, duration_hours: parseFloat(e.target.value || "1") }))}
              className={`${inputCls} font-bold`} />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ผู้สอน</span>
            <input value={form.instructor} onChange={(e) => setForm((f) => ({ ...f, instructor: e.target.value }))} className={inputCls} placeholder="ชื่อผู้สอน / ทีมหรือบริษัทภายนอก" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">ลิงก์เอกสาร/สื่อ</span>
            <input type="url" value={form.materials_url} onChange={(e) => setForm((f) => ({ ...f, materials_url: e.target.value }))} className={inputCls} placeholder="https://..." />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">รายละเอียดหลักสูตร</span>
          <textarea rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls} />
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm((f) => ({ ...f, is_mandatory: e.target.checked }))} />
            <span>บังคับเรียน (ทุกคน)</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            <span>เปิดใช้งาน</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm" disabled={pending || !form.title.trim()}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Course row actions (bulk-enroll, delete)
// ────────────────────────────────────────────────────────────
export function CourseRowActions({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function bulkEnroll() {
    if (!(await confirm("Enroll พนักงาน admin ที่ active ทุกคนเข้าหลักสูตรนี้?"))) return;
    startTransition(async () => {
      const res = await adminBulkEnrollActiveAdmins({ course_id: courseId });
      if (res.ok && res.data) {
        await alert(`✓ Enroll สำเร็จ ${res.data.inserted} คน`);
        router.refresh();
      } else if (!res.ok) await alert(res.error);
    });
  }

  async function remove() {
    if (!(await confirm("ลบหลักสูตรนี้ออกจากระบบ? (จะลบ enrollment ทั้งหมดด้วย)"))) return;
    startTransition(async () => {
      const res = await adminDeleteCourse({ id: courseId });
      if (res.ok) router.refresh();
      else await alert(res.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={bulkEnroll}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 px-2 py-1 text-[11px] font-bold hover:bg-blue-100 disabled:opacity-50"
        title="Enroll ทุก active admin"
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users2 className="w-3 h-3" />}
        Enroll ทุกคน
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        title="ลบหลักสูตร"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Enrollment row — stage advance (in_progress → completed/failed/exempt)
// ────────────────────────────────────────────────────────────
export function EnrollmentRowActions({
  enrollmentId, currentStatus,
}: { enrollmentId: string; currentStatus: Status }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function set(to: Status, withScore = false) {
    let score: number | null = null;
    if (withScore) {
      const raw = await prompt("คะแนน (0-100):", "80");
      if (raw === null) return;
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0 || n > 100) { await alert("คะแนนไม่ถูกต้อง"); return; }
      score = n;
    }
    startTransition(async () => {
      const res = await adminSetEnrollmentStatus({ enrollment_id: enrollmentId, status: to, score });
      if (res.ok) router.refresh();
      else await alert(res.error);
    });
  }

  if (currentStatus === "completed" || currentStatus === "failed" || currentStatus === "exempted") {
    return (
      <button
        type="button"
        onClick={() => set("enrolled")}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt px-2 py-0.5 text-[11px] font-medium hover:bg-surface disabled:opacity-50"
      >
        Reset
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {currentStatus === "enrolled" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => set("in_progress")}
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-0.5 text-[11px] font-bold hover:bg-amber-100 disabled:opacity-50"
        >
          <PlayCircle className="w-3 h-3" /> เริ่มเรียน
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => set("completed", true)}
        className="inline-flex items-center gap-1 rounded-md bg-emerald-500 text-white px-2 py-0.5 text-[11px] font-bold hover:bg-emerald-600 disabled:opacity-50"
      >
        <CheckCircle2 className="w-3 h-3" /> Pass
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set("failed", true)}
        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 text-[11px] font-bold hover:bg-red-100 disabled:opacity-50"
      >
        Fail
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => set("exempted")}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt text-foreground px-2 py-0.5 text-[11px] hover:bg-surface disabled:opacity-50"
        title="ยกเว้น (ไม่ต้องเรียน)"
      >
        <MinusCircle className="w-3 h-3" /> Exempt
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Add single enrollment (select employee → enroll)
// ────────────────────────────────────────────────────────────
type EmployeeOpt = { id: string; label: string };

export function AddEnrollmentInline({ courseId, employees }: { courseId: string; employees: EmployeeOpt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profileId) return;
    startTransition(async () => {
      const res = await adminEnroll({ course_id: courseId, profile_id: profileId });
      if (res.ok) { setProfileId(""); setOpen(false); router.refresh(); }
      else await alert(res.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 text-primary-700 px-2 py-1 text-[11px] font-bold hover:bg-primary-100"
      >
        <GraduationCap className="w-3 h-3" />
        + Enroll คนเดียว
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1">
      <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={`${inputCls} text-xs py-1 min-w-[200px]`}>
        <option value="">— เลือกพนักงาน —</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
      </select>
      <Button size="sm" type="submit" disabled={pending || !profileId}>
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enroll"}
      </Button>
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen(false)}>×</Button>
    </form>
  );
}

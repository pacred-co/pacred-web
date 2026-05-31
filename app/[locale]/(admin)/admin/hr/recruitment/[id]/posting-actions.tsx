"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  ArrowRight, CalendarCheck2, X, UserPlus, Trash2, Loader2,
  CheckCheck, XCircle, Phone, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminCreateApplicant, adminAdvanceApplicant, adminScheduleInterview,
  adminDeleteApplicant, adminDeletePosting,
} from "@/actions/admin/recruitment";

type Stage = "applied" | "screening" | "interviewing" | "offered" | "hired" | "rejected";

const STAGE_NEXT: Record<Stage, Stage | null> = {
  applied:      "screening",
  screening:    "interviewing",
  interviewing: "offered",
  offered:      "hired",
  hired:        null,
  rejected:     null,
};
const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied", screening: "Screening", interviewing: "Interview",
  offered: "Offered", hired: "Hired", rejected: "Rejected",
};

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500/40";

// ────────────────────────────────────────────────────────────
// Delete posting (legacy has no status flip — close = delete row)
// ────────────────────────────────────────────────────────────
export function DeletePostingButton({ postingId }: { postingId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    if (!confirm("ลบประกาศรับสมัครงานนี้?")) return;
    startTransition(async () => {
      const res = await adminDeletePosting({ id: postingId });
      if (res.ok) router.push("/admin/hr/recruitment" as Parameters<typeof router.push>[0]);
      else alert(res.error);
    });
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={remove}
      className="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-white/15 backdrop-blur-sm px-3 py-2 text-xs font-medium hover:bg-white/25 disabled:opacity-50"
    >
      {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
      ลบประกาศ
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Quick add applicant inline (Pacred ATS — job_applicants)
// ────────────────────────────────────────────────────────────
export function AddApplicantInline({ postingId }: { postingId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", nickname: "", phone: "", email: "",
    source: "walk_in" as "walk_in" | "website" | "line" | "facebook" | "referral" | "jobsdb" | "other",
    source_note: "", notes: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await adminCreateApplicant({
        posting_id:  postingId,
        first_name:  form.first_name,
        last_name:   form.last_name   || null,
        nickname:    form.nickname    || null,
        phone:       form.phone       || null,
        email:       form.email       || "",
        source:      form.source,
        source_note: form.source_note || null,
        notes:       form.notes       || null,
      });
      if (res.ok) {
        setForm({ first_name: "", last_name: "", nickname: "", phone: "", email: "", source: "walk_in", source_note: "", notes: "" });
        setOpen(false);
        router.refresh();
      } else setErr(res.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/50 text-primary-700 hover:bg-primary-50 hover:border-primary-300 py-3 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        เพิ่มผู้สมัครใหม่ (walk-in / referral / online)
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-primary-200 bg-primary-50/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-sm text-foreground">เพิ่มผู้สมัครใหม่</h4>
        <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <div className="grid gap-2 sm:grid-cols-3">
        <input className={inputCls} placeholder="ชื่อ *" required value={form.first_name}
          onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
        <input className={inputCls} placeholder="นามสกุล" value={form.last_name}
          onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
        <input className={inputCls} placeholder="ชื่อเล่น" value={form.nickname}
          onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} />
        <input className={inputCls} placeholder="เบอร์โทร" value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        <input className={inputCls} type="email" placeholder="อีเมล" value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <select className={inputCls} value={form.source}
          onChange={(e) => setForm((f) => ({ ...f, source: e.target.value as typeof form.source }))}>
          <option value="walk_in">Walk-in</option>
          <option value="website">เว็บไซต์</option>
          <option value="line">LINE OA</option>
          <option value="facebook">Facebook</option>
          <option value="referral">เพื่อนแนะนำ</option>
          <option value="jobsdb">JobsDB</option>
          <option value="other">อื่นๆ</option>
        </select>
        <input className={`${inputCls} sm:col-span-3`} placeholder="ใครแนะนำ / เห็นจากไหน (option)"
          value={form.source_note}
          onChange={(e) => setForm((f) => ({ ...f, source_note: e.target.value }))} />
        <textarea rows={2} className={`${inputCls} sm:col-span-3`} placeholder="โน้ตเพิ่มเติม (HR เท่านั้น)"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
        <Button type="submit" size="sm" disabled={pending || !form.first_name.trim()}>
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          บันทึก
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Applicant card actions (advance / schedule / reject / hire / delete)
// ────────────────────────────────────────────────────────────
type ApplicantProps = {
  applicantId: string;
  stage: Stage;
  phone: string | null;
  email: string | null;
  interviewScheduledAt: string | null;
};

export function ApplicantActions({ applicantId, stage, phone, email, interviewScheduledAt }: ApplicantProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [slot, setSlot] = useState(interviewScheduledAt?.slice(0, 16) ?? "");
  const [location, setLocation] = useState<string>("");

  const next = STAGE_NEXT[stage];

  function move(toStage: Stage, opts?: { reason?: string }) {
    startTransition(async () => {
      const res = await adminAdvanceApplicant({
        applicant_id: applicantId,
        to_stage: toStage,
        rejected_reason: opts?.reason ?? null,
      });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  function reject() {
    const reason = prompt("เหตุผลที่ไม่รับ (option):") ?? "";
    move("rejected", { reason });
  }

  function hire() {
    if (!confirm("ยืนยันรับเข้าทำงาน?\n(จะต้องลิงก์โปรไฟล์ที่หน้า /admin/admins เพื่อเปิดสิทธิ์ admin ภายหลัง)")) return;
    move("hired");
  }

  function schedule() {
    if (!slot) { alert("เลือกวันเวลาก่อน"); return; }
    startTransition(async () => {
      const res = await adminScheduleInterview({
        applicant_id: applicantId,
        interview_scheduled_at: new Date(slot).toISOString(),
        interview_location: location || null,
      });
      if (res.ok) {
        setScheduleOpen(false);
        router.refresh();
      } else alert(res.error);
    });
  }

  function clearSchedule() {
    if (!confirm("ยกเลิกนัดสัมภาษณ์?")) return;
    startTransition(async () => {
      const res = await adminScheduleInterview({
        applicant_id: applicantId,
        interview_scheduled_at: null,
        interview_location: null,
      });
      if (res.ok) {
        setScheduleOpen(false);
        router.refresh();
      } else alert(res.error);
    });
  }

  function remove() {
    if (!confirm("ลบผู้สมัครคนนี้ออกจากระบบ?\n(ถ้าแค่ไม่รับ — กดปุ่ม Reject แทน)")) return;
    startTransition(async () => {
      const res = await adminDeleteApplicant({ applicant_id: applicantId });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  const isFinal = stage === "hired" || stage === "rejected";

  return (
    <div className="space-y-2">
      {/* Contact quick links */}
      <div className="flex flex-wrap gap-1">
        {phone && (
          <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt px-2 py-1 text-[10px] hover:bg-primary-50 hover:border-primary-200">
            <Phone className="w-3 h-3" /> {phone}
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-alt px-2 py-1 text-[10px] hover:bg-primary-50 hover:border-primary-200">
            <Mail className="w-3 h-3" /> ส่งอีเมล
          </a>
        )}
      </div>

      {/* Pipeline actions */}
      {!isFinal && (
        <div className="flex flex-wrap items-center gap-1.5">
          {next && (
            <button
              type="button"
              disabled={pending}
              onClick={() => move(next)}
              className="inline-flex items-center gap-1 rounded-md bg-primary-500 text-white px-2 py-1 text-[10px] font-semibold hover:bg-primary-600 disabled:opacity-50"
              title={`ส่งไปขั้น ${STAGE_LABEL[next]}`}
            >
              <ArrowRight className="w-3 h-3" />
              ไป {STAGE_LABEL[next]}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => setScheduleOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 px-2 py-1 text-[10px] font-semibold hover:bg-amber-100 disabled:opacity-50"
          >
            <CalendarCheck2 className="w-3 h-3" />
            {interviewScheduledAt ? "แก้ไขนัด" : "นัดสัมภาษณ์"}
          </button>
          {(stage === "interviewing" || stage === "offered") && (
            <button
              type="button"
              disabled={pending}
              onClick={hire}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1 text-[10px] font-semibold hover:bg-emerald-100 disabled:opacity-50"
            >
              <CheckCheck className="w-3 h-3" />
              รับเข้าทำงาน
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={reject}
            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 text-red-700 px-2 py-1 text-[10px] font-semibold hover:bg-red-100 disabled:opacity-50"
          >
            <XCircle className="w-3 h-3" />
            ปฏิเสธ
          </button>
        </div>
      )}

      {/* Schedule popover */}
      {scheduleOpen && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2 space-y-1.5">
          <input
            type="datetime-local"
            value={slot}
            onChange={(e) => setSlot(e.target.value)}
            className={inputCls}
          />
          <input
            type="text"
            placeholder="สถานที่นัด (option)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputCls}
          />
          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" onClick={schedule} disabled={pending || !slot}>
              {pending && <Loader2 className="w-3 h-3 animate-spin" />}
              ยืนยันนัด
            </Button>
            {interviewScheduledAt && (
              <Button type="button" size="sm" variant="outline" onClick={clearSchedule} disabled={pending}>
                ลบนัด
              </Button>
            )}
            <Button type="button" size="sm" variant="outline" onClick={() => setScheduleOpen(false)}>
              ปิด
            </Button>
          </div>
        </div>
      )}

      {/* Final-state secondary action: delete only */}
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="inline-flex items-center gap-1 rounded-md text-[10px] text-muted hover:text-red-600 disabled:opacity-50"
      >
        <Trash2 className="w-3 h-3" />
        ลบ
      </button>
    </div>
  );
}

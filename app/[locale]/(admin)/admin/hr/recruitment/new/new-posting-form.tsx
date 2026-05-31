"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { adminCreatePosting } from "@/actions/admin/recruitment";
import {
  POST_COMPANY_LABEL, POST_ADMIN_TYPE_LABEL,
  POST_DEPARTMENT_LABEL, POST_SECTION_LABEL,
} from "../../_legacy-labels";

/**
 * D1 faithful port of post-job.php's 13-field form (company → admin type →
 * department → section cascade + the 9 text fields). The cascade option values
 * are the verbatim legacy codes (stored straight into tb_post_job). Pacred
 * Tailwind chrome; same logic.
 */

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/50";
const labelCls = "block space-y-1";
const labelText = "text-xs font-semibold text-muted";

export function NewPostingForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    company_type:    "" as "" | "1" | "2",
    admin_type:      "" as "" | "1" | "2",
    department:      "",
    section:         "",
    job_title:       "",
    amount:          1,
    salary:          "",
    description:     "",
    qualifications:  "",
    welfare_benefit: "",
    working_time:    "",
    start_date:      "",
    end_date:        "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const deptOptions = form.company_type ? POST_DEPARTMENT_LABEL[form.company_type] ?? {} : {};
  const sectionOptions = form.company_type ? POST_SECTION_LABEL[form.company_type] ?? {} : {};

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.company_type || !form.admin_type || !form.department || !form.section) {
      setErr("กรุณาเลือกบริษัท / ประเภทพนักงาน / แผนก / ฝ่ายให้ครบ");
      return;
    }
    startTransition(async () => {
      const res = await adminCreatePosting({
        company_type:    form.company_type as "1" | "2",
        admin_type:      form.admin_type as "1" | "2",
        department:      form.department,
        section:         form.section,
        job_title:       form.job_title,
        amount:          form.amount,
        description:     form.description,
        qualifications:  form.qualifications,
        welfare_benefit: form.welfare_benefit,
        working_time:    form.working_time,
        start_date:      form.start_date,
        end_date:        form.end_date,
        salary:          form.salary || null,
      });
      if (res.ok && res.data) {
        router.push(`/admin/hr/recruitment/${res.data.id}` as Parameters<typeof router.push>[0]);
      } else {
        setErr(res.ok ? "unknown" : res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{err}</div>
      )}

      {/* 1-2: company + admin type */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelText}>1. บริษัทที่เปิดรับ *</span>
          <select
            required value={form.company_type}
            onChange={(e) => setForm((f) => ({ ...f, company_type: e.target.value as "" | "1" | "2", department: "", section: "" }))}
            className={inputCls}
          >
            <option value="">กรุณาเลือก...</option>
            {Object.entries(POST_COMPANY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          <span className={labelText}>2. ประเภทพนักงาน *</span>
          <select
            required value={form.admin_type}
            onChange={(e) => setForm((f) => ({ ...f, admin_type: e.target.value as "" | "1" | "2" }))}
            className={inputCls}
          >
            <option value="">กรุณาเลือก...</option>
            {Object.entries(POST_ADMIN_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {/* 3-4: department + section cascade */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelText}>3. แผนกที่เปิดรับ *</span>
          <select
            required value={form.department} disabled={!form.company_type}
            onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
            className={`${inputCls} disabled:opacity-50`}
          >
            <option value="">กรุณาเลือก...</option>
            {Object.entries(deptOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          <span className={labelText}>4. ฝ่าย/ตำแหน่ง *</span>
          <select
            required value={form.section} disabled={!form.company_type}
            onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
            className={`${inputCls} disabled:opacity-50`}
          >
            <option value="">กรุณาเลือก...</option>
            {Object.entries(sectionOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {/* 5: job title */}
      <label className={labelCls}>
        <span className={labelText}>5. ชื่อตำแหน่งงาน *</span>
        <input required value={form.job_title} maxLength={500}
          onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))}
          className={inputCls} placeholder="เช่น พนักงานบัญชี / Customer Service" />
      </label>

      {/* 6-7: amount + salary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelText}>6. จำนวนที่รับสมัคร *</span>
          <input type="number" min={1} max={100} required value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: Math.max(1, parseInt(e.target.value || "1", 10)) }))}
            className={`${inputCls} text-right font-bold`} />
        </label>
        <label className={labelCls}>
          <span className={labelText}>7. เงินเดือน (เว้นว่างได้)</span>
          <input value={form.salary} maxLength={500}
            onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
            className={inputCls} placeholder="10,000 - 18,000 บาท" />
        </label>
      </div>

      {/* 8-11: text areas */}
      <label className={labelCls}>
        <span className={labelText}>8. รายละเอียดงาน *</span>
        <textarea rows={5} required value={form.description} maxLength={1000}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={inputCls} placeholder="รายละเอียดงาน" />
      </label>
      <label className={labelCls}>
        <span className={labelText}>9. คุณสมบัติผู้สมัคร *</span>
        <textarea rows={5} required value={form.qualifications} maxLength={1000}
          onChange={(e) => setForm((f) => ({ ...f, qualifications: e.target.value }))}
          className={inputCls} placeholder="คุณสมบัติผู้สมัคร" />
      </label>
      <label className={labelCls}>
        <span className={labelText}>10. สวัสดิการ *</span>
        <textarea rows={4} required value={form.welfare_benefit} maxLength={1000}
          onChange={(e) => setForm((f) => ({ ...f, welfare_benefit: e.target.value }))}
          className={inputCls} placeholder="สวัสดิการ" />
      </label>
      <label className={labelCls}>
        <span className={labelText}>11. เวลาทำงาน *</span>
        <textarea rows={3} required value={form.working_time} maxLength={1000}
          onChange={(e) => setForm((f) => ({ ...f, working_time: e.target.value }))}
          className={inputCls} placeholder="เวลาทำงาน" />
      </label>

      {/* 12-13: start + end */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelText}>12. เวลาเริ่มต้นลงประกาศ *</span>
          <input type="datetime-local" required value={form.start_date}
            onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
            className={inputCls} />
        </label>
        <label className={labelCls}>
          <span className={labelText}>13. เวลาสิ้นสุดประกาศ *</span>
          <input type="datetime-local" required value={form.end_date} min={form.start_date || undefined}
            onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
            className={inputCls} />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={() => router.back()}>ยกเลิก</Button>
        <Button type="submit" disabled={pending || !form.job_title.trim()}>
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          ลงประกาศงาน
        </Button>
      </div>
    </form>
  );
}

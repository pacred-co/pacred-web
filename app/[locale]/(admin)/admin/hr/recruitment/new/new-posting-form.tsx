"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { adminCreatePosting } from "@/actions/admin/recruitment";

type PositionOption = { id: string; name: string; sectionName: string; branchName: string };

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/50";
const labelCls = "block space-y-1";
const labelText = "text-xs font-semibold text-muted";

export function NewPostingForm({ positions }: { positions: PositionOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    title:             "",
    position_id:       "",
    description:       "",
    status:            "open" as "draft" | "open",
    openings_count:    1,
    salary_range_text: "",
    location:          "สำนักงานใหญ่ กรุงเทพฯ",
    employment_type:   "full_time" as "full_time" | "probation" | "contract" | "daily" | "intern" | "partner",
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await adminCreatePosting({
        title:             form.title,
        position_id:       form.position_id || null,
        description:       form.description || null,
        status:            form.status,
        openings_count:    form.openings_count,
        salary_range_text: form.salary_range_text || null,
        location:          form.location || null,
        employment_type:   form.employment_type,
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

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className={labelCls}>
          <span className={labelText}>ชื่อตำแหน่งที่ประกาศ *</span>
          <input
            required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={inputCls} placeholder="เช่น Full-stack Developer / CS / พนักงานบัญชี"
          />
        </label>
        <label className={labelCls}>
          <span className={labelText}>จำนวนรับ</span>
          <input
            type="number" min={1} max={99}
            value={form.openings_count}
            onChange={(e) => setForm((f) => ({ ...f, openings_count: Math.max(1, parseInt(e.target.value || "1", 10)) }))}
            className={`${inputCls} w-24 text-center font-bold`}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelText}>ตำแหน่งในผังองค์กร (option)</span>
          <select
            value={form.position_id}
            onChange={(e) => setForm((f) => ({ ...f, position_id: e.target.value }))}
            className={inputCls}
          >
            <option value="">— ไม่ผูกกับ position —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.branchName} · {p.sectionName} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          <span className={labelText}>ประเภทพนักงาน</span>
          <select
            value={form.employment_type}
            onChange={(e) => setForm((f) => ({ ...f, employment_type: e.target.value as typeof form.employment_type }))}
            className={inputCls}
          >
            <option value="full_time">พนักงานประจำ</option>
            <option value="probation">ทดลองงาน</option>
            <option value="contract">สัญญาจ้าง</option>
            <option value="daily">รายวัน</option>
            <option value="intern">ฝึกงาน</option>
            <option value="partner">พาร์ทเนอร์</option>
          </select>
        </label>

        <label className={labelCls}>
          <span className={labelText}>ช่วงเงินเดือน</span>
          <input
            value={form.salary_range_text}
            onChange={(e) => setForm((f) => ({ ...f, salary_range_text: e.target.value }))}
            className={inputCls} placeholder="35,000 - 60,000 บาท/เดือน"
          />
        </label>
        <label className={labelCls}>
          <span className={labelText}>สถานที่ทำงาน</span>
          <input
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            className={inputCls} placeholder="สำนักงานใหญ่ กรุงเทพฯ"
          />
        </label>
      </div>

      <label className={labelCls}>
        <span className={labelText}>รายละเอียดงาน · คุณสมบัติ · ผลตอบแทน</span>
        <textarea
          rows={6}
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className={inputCls}
          placeholder="• หน้าที่หลัก&#10;• คุณสมบัติ&#10;• สวัสดิการ"
        />
      </label>

      <fieldset className="rounded-lg border border-border p-3 space-y-1.5">
        <legend className="text-xs font-semibold text-muted px-1">สถานะตอนเผยแพร่</legend>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="radio" checked={form.status === "open"} onChange={() => setForm((f) => ({ ...f, status: "open" }))} className="mt-0.5" />
          <span><b>เปิดรับเลย</b> — ประกาศจะแสดงเป็น &ldquo;เปิดรับ&rdquo; + บันทึก posted_at วันนี้</span>
        </label>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input type="radio" checked={form.status === "draft"} onChange={() => setForm((f) => ({ ...f, status: "draft" }))} className="mt-0.5" />
          <span><b>บันทึกเป็นร่าง</b> — เก็บไว้เผยแพร่ทีหลัง</span>
        </label>
      </fieldset>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" onClick={() => router.back()}>ยกเลิก</Button>
        <Button type="submit" disabled={pending || !form.title.trim()}>
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {form.status === "open" ? "ลงประกาศ" : "บันทึกร่าง"}
        </Button>
      </div>
    </form>
  );
}

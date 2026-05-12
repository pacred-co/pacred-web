"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";
import { adminUpsertEmployeeExtras } from "@/actions/admin/employees";

type Props = {
  profileId: string;
  initial: {
    display_name:  string | null;
    nickname:      string | null;
    company:       string | null;
    employee_type: string | null;
    department:    string | null;
    section:       string | null;
    work_email:    string | null;
    work_phone:    string | null;
    direct_phone:  string | null;
    hired_at:      string | null;
  };
};

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/50";
const labelCls = "block space-y-1";
const labelText = "text-xs font-semibold text-muted";

export function EmployeeEditForm({ profileId, initial }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [msg, setMsg]   = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await adminUpsertEmployeeExtras({
        profile_id:    profileId,
        display_name:  form.display_name,
        nickname:      form.nickname,
        company:       (form.company ?? "pacred") as "pacred" | "pacred-cargo" | "pacred-freight",
        employee_type: (form.employee_type ?? "full_time") as "full_time" | "probation" | "contract" | "daily" | "intern" | "partner",
        department:    form.department,
        section:       form.section,
        work_email:    form.work_email,
        work_phone:    form.work_phone,
        direct_phone:  form.direct_phone,
        hired_at:      form.hired_at,
      });
      if (res.ok) { setMsg({ kind: "ok", text: "✓ บันทึกแล้ว" }); router.refresh(); }
      else        setMsg({ kind: "err", text: res.error });
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h2 className="text-base font-bold">ข้อมูลพนักงาน (HR fields)</h2>

      {msg && (
        <div className={`rounded-lg border p-2.5 text-xs ${msg.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          <span className={labelText}>ชื่อแสดง (display name)</span>
          <input value={form.display_name ?? ""} onChange={(e) => set("display_name", e.target.value)} className={inputCls} placeholder='เช่น "เซลล์ มิว"' />
        </label>
        <label className={labelCls}>
          <span className={labelText}>ชื่อเล่น</span>
          <input value={form.nickname ?? ""} onChange={(e) => set("nickname", e.target.value)} className={inputCls} placeholder="ปอน, มิว, ดิว ฯลฯ" />
        </label>

        <label className={labelCls}>
          <span className={labelText}>บริษัท</span>
          <select value={form.company ?? "pacred"} onChange={(e) => set("company", e.target.value)} className={inputCls}>
            <option value="pacred">Pacred</option>
            <option value="pacred-cargo">Pacred Cargo</option>
            <option value="pacred-freight">Pacred Freight</option>
          </select>
        </label>
        <label className={labelCls}>
          <span className={labelText}>ประเภทพนักงาน</span>
          <select value={form.employee_type ?? "full_time"} onChange={(e) => set("employee_type", e.target.value)} className={inputCls}>
            <option value="full_time">พนักงานประจำ</option>
            <option value="probation">ทดลองงาน</option>
            <option value="contract">สัญญาจ้าง</option>
            <option value="daily">รายวัน</option>
            <option value="intern">ฝึกงาน</option>
            <option value="partner">พาร์ทเนอร์</option>
          </select>
        </label>

        <label className={labelCls}>
          <span className={labelText}>แผนก</span>
          <input value={form.department ?? ""} onChange={(e) => set("department", e.target.value)} className={inputCls} placeholder="Operations / Finance / BD & Tech ฯลฯ" />
        </label>
        <label className={labelCls}>
          <span className={labelText}>ทีม / ตำแหน่งเสริม</span>
          <input value={form.section ?? ""} onChange={(e) => set("section", e.target.value)} className={inputCls} placeholder="Sales Team A / CS / Docs ฯลฯ" />
        </label>

        <label className={labelCls}>
          <span className={labelText}>อีเมลบริษัท</span>
          <input type="email" value={form.work_email ?? ""} onChange={(e) => set("work_email", e.target.value)} className={inputCls} placeholder="muew@pacred.co" />
        </label>
        <label className={labelCls}>
          <span className={labelText}>เบอร์โทรบริษัท</span>
          <input value={form.work_phone ?? ""} onChange={(e) => set("work_phone", e.target.value)} className={inputCls} placeholder="02-xxx-xxxx" />
        </label>

        <label className={labelCls}>
          <span className={labelText}>เบอร์ตรง (สำหรับการ์ดเซลล์)</span>
          <input value={form.direct_phone ?? ""} onChange={(e) => set("direct_phone", e.target.value)} className={inputCls} placeholder="08x-xxx-xxxx" />
        </label>
        <label className={labelCls}>
          <span className={labelText}>วันเริ่มทำงาน</span>
          <input type="date" value={form.hired_at ?? ""} onChange={(e) => set("hired_at", e.target.value)} className={inputCls} />
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          บันทึก
        </Button>
      </div>
    </form>
  );
}

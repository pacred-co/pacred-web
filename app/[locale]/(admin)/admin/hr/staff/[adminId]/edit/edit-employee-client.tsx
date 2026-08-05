"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Save, Loader2, User, Phone, Image as ImageIcon } from "lucide-react";
import { saveEmployee } from "@/actions/admin/hr-staff";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { StaffDetail } from "@/lib/admin/hr-staff";

const TYPE_OPTS = [
  ["1", "พนักงานประจำ"], ["2", "ทดลองงาน"], ["3", "เด็กฝึกงาน"], ["4", "สหกิจศึกษา"],
  ["5", "พาร์ทเนอร์"], ["6", "ฟรีแลนซ์"], ["7", "คนในบ้าน"],
] as const;
const SEX_OPTS = [["", "—"], ["1", "ชาย"], ["2", "หญิง"], ["3", "LGBTQ"]] as const;
const SALARY_OPTS = [["1", "รายวัน"], ["2", "รายเดือน"], ["3", "ไม่มีเงินเดือนประจำ"]] as const;

const field = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const lbl = "block text-[11px] font-semibold text-muted mb-0.5";

export function EditEmployeeClient({ detail }: { detail: StaffDetail }) {
  const router = useRouter();
  const { alert, dialogs } = useConfirmDialogs();
  const [saving, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [f, setF] = useState({
    firstName: detail.firstName, lastName: detail.lastName, nickname: detail.nickname,
    phone: detail.phone, photoUrl: detail.photoUrl, sex: detail.sex, birthday: detail.birthday,
    type: detail.type, salaryType: detail.salaryType, salary: detail.salary,
    nationalId: detail.nationalId, isSale: detail.isSale,
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  function onSave() {
    setErr(null);
    if (!f.firstName.trim()) { setErr("กรุณากรอกชื่อ"); return; }
    start(async () => {
      const res = await saveEmployee({
        adminId: detail.adminId,
        firstName: f.firstName, lastName: f.lastName, nickname: f.nickname,
        phone: f.phone, photoUrl: f.photoUrl,
        sex: f.sex as "" | "1" | "2" | "3", birthday: f.birthday,
        type: f.type as "1", salaryType: f.salaryType as "1", salary: f.salary,
        nationalId: f.nationalId, isSale: f.isSale,
      });
      if (!res.ok) { setErr(res.error ?? "บันทึกไม่สำเร็จ"); return; }
      await alert("บันทึกข้อมูลพนักงานเรียบร้อย · ชื่อ/เบอร์/รูป อัปเดตทุกที่แล้ว");
      router.push("/admin/hr/staff");
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {dialogs}

      {/* ── บล็อก 1 · ตัวตน (single-source) ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-3">
        <h2 className="flex items-center gap-1.5 text-sm font-bold"><User className="h-4 w-4 text-primary-600" /> ข้อมูลตัวตน</h2>
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] text-sky-800">
          🔗 ชื่อ · เบอร์ · รูป จะอัปเดต <b>ทุกที่พร้อมกัน</b> — หน้าเว็บ · portal ลูกค้า · หลังบ้าน · แอดมิน (เขียน profiles + tb_admin)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label><span className={lbl}>ชื่อ *</span><input className={field} value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></label>
          <label><span className={lbl}>นามสกุล</span><input className={field} value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></label>
          <label><span className={lbl}>ชื่อเล่น</span><input className={field} value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></label>
          <label><span className={lbl}><Phone className="inline h-3 w-3" /> เบอร์โทร (ลูกค้าเห็น)</span><input className={field} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="0xxxxxxxxx" /></label>
          <label className="sm:col-span-2"><span className={lbl}><ImageIcon className="inline h-3 w-3" /> รูป (URL/path · ลูกค้าเห็น)</span>
            <div className="flex items-center gap-2">
              <input className={field} value={f.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} placeholder="/images/... หรือ https://..." />
              {f.photoUrl && <img src={f.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover border border-border" />}
            </div>
          </label>
          <label><span className={lbl}>เพศ</span><select className={field} value={f.sex} onChange={(e) => set("sex", e.target.value)}>{SEX_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label><span className={lbl}>วันเกิด</span><input type="date" className={field} value={f.birthday} onChange={(e) => set("birthday", e.target.value)} /></label>
        </div>
      </section>

      {/* ── บล็อก 2 · ข้อมูลงาน/HR ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-3">
        <h2 className="text-sm font-bold">ข้อมูลงาน / HR</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label><span className={lbl}>ประเภทการจ้าง</span><select className={field} value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPE_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label><span className={lbl}>ประเภทเงินเดือน</span><select className={field} value={f.salaryType} onChange={(e) => set("salaryType", e.target.value)}>{SALARY_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
          <label><span className={lbl}>เงินเดือน (บาท)</span><input type="number" min={0} className={field + " text-right tabular-nums"} value={f.salary} onChange={(e) => set("salary", e.target.value)} /></label>
          <label><span className={lbl}>เลขบัตรประชาชน</span><input className={field + " tabular-nums"} value={f.nationalId} onChange={(e) => set("nationalId", e.target.value)} maxLength={25} /></label>
          <label className="flex items-center gap-2 sm:col-span-2 text-sm mt-1">
            <input type="checkbox" checked={f.isSale} onChange={(e) => set("isSale", e.target.checked)} />
            เป็นเซล/รับออเดอร์ (ขึ้นเป็นเซลผู้ดูแลให้ลูกค้าเห็น)
          </label>
        </div>
      </section>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {err}</div>}

      <div className="flex items-center gap-2">
        <button type="button" disabled={saving} onClick={onSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึก
        </button>
        <button type="button" disabled={saving} onClick={() => router.push("/admin/hr/staff")} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-alt">ยกเลิก</button>
      </div>
    </div>
  );
}

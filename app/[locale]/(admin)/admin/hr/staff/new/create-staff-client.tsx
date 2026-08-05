"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { createStaffComplete } from "@/actions/admin/hr-staff";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { PositionOption } from "@/lib/admin/hr-org";

// ป้ายประเภทการจ้าง — นิยามในไฟล์ client (ห้าม import จาก hr-staff.ts ที่เป็น
// server-only · จะลากโค้ด server เข้า client bundle → build พัง). ตรงกับ EMPLOYEE_TYPE_LABEL.
const EMPLOYEE_TYPE_LABEL: Record<string, string> = {
  "1": "พนักงานประจำ", "2": "ทดลองงาน", "3": "เด็กฝึกงาน", "4": "สหกิจศึกษา",
  "5": "พาร์ทเนอร์", "6": "ฟรีแลนซ์", "7": "คนในบ้าน",
};

const LBL = "block text-[12px] font-medium text-muted mb-1";
const INP = "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function CreateStaffClient({ positions }: { positions: PositionOption[] }) {
  const router = useRouter();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [saving, startSave] = useTransition();
  const [f, setF] = useState({
    loginId: "", password: "", firstName: "", lastName: "", nickname: "",
    phone: "", email: "", type: "1", isSale: false, orgUnitId: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  const grouped = useMemo(() => {
    const m = new Map<string, PositionOption[]>();
    for (const p of positions) { if (!m.has(p.department)) m.set(p.department, []); m.get(p.department)!.push(p); }
    return [...m.entries()];
  }, [positions]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.loginId.trim() || !f.password || !f.firstName.trim()) {
      await alert("กรอก User ID + รหัสผ่าน + ชื่อ ให้ครบก่อน"); return;
    }
    const posLabel = f.orgUnitId ? positions.find((p) => p.id === f.orgUnitId)?.label : null;
    const ok = await confirm(
      `สร้างพนักงาน "${f.firstName}${f.lastName ? ` ${f.lastName}` : ""}" ?\n\n` +
      `• User ID: ${f.loginId.startsWith("admin_") ? f.loginId : `admin_${f.loginId}`}\n` +
      `• ประเภท: ${EMPLOYEE_TYPE_LABEL[f.type]}${f.isSale ? " · เป็นเซล" : ""}\n` +
      `• ตำแหน่ง: ${posLabel ?? "— ยังไม่จัด —"}\n\n` +
      `ระบบจะสร้างบัญชีล็อกอิน + ข้อมูลพนักงาน + จัดตำแหน่ง (ถ้าเลือก) พร้อมกัน.`,
    );
    if (!ok) return;
    startSave(async () => {
      const res = await createStaffComplete({
        loginId: f.loginId.trim(), password: f.password, firstName: f.firstName.trim(),
        lastName: f.lastName.trim(), nickname: f.nickname.trim(), phone: f.phone.trim(),
        email: f.email.trim(), type: f.type as "1", isSale: f.isSale, orgUnitId: f.orgUnitId || null,
      });
      if (!res.ok) {
        const msg = res.error?.startsWith("phone_exists_customer:")
          ? `เบอร์นี้มีลูกค้าใช้แล้ว (${res.error.split(":")[1]}) — ตรวจก่อน หรือใช้เบอร์อื่น`
          : res.error;
        await alert(`สร้างไม่สำเร็จ: ${msg}`); return;
      }
      await alert("สร้างพนักงานเรียบร้อย ✓ (เติมบัตรปชช./รูป/เงินเดือน ที่หน้าแก้ไขได้)");
      router.push("/admin/hr/staff");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      {dialogs}

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">บัญชีเข้าระบบ</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LBL}>User ID (ไอดีเข้าระบบ) *</label>
            <input value={f.loginId} onChange={set("loginId")} placeholder="เช่น somchai" className={INP} />
            <p className="mt-1 text-[11px] text-muted">ระบบเติม <code>admin_</code> ให้อัตโนมัติ</p>
          </div>
          <div>
            <label className={LBL}>รหัสผ่านเริ่มต้น *</label>
            <input type="text" value={f.password} onChange={set("password")} placeholder="อย่างน้อย 6 ตัว" className={INP} />
            <p className="mt-1 text-[11px] text-muted">แจ้งพนักงานให้เปลี่ยนเองภายหลัง</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">ข้อมูลพนักงาน</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={LBL}>ชื่อ *</label><input value={f.firstName} onChange={set("firstName")} className={INP} /></div>
          <div><label className={LBL}>นามสกุล</label><input value={f.lastName} onChange={set("lastName")} className={INP} /></div>
          <div><label className={LBL}>ชื่อเล่น</label><input value={f.nickname} onChange={set("nickname")} className={INP} /></div>
          <div><label className={LBL}>เบอร์โทร</label><input value={f.phone} onChange={set("phone")} placeholder="0xxxxxxxxx" className={INP} /></div>
          <div><label className={LBL}>อีเมล (ถ้ามี)</label><input value={f.email} onChange={set("email")} className={INP} /></div>
          <div>
            <label className={LBL}>ประเภทการจ้าง</label>
            <select value={f.type} onChange={set("type")} className={INP}>
              {Object.entries(EMPLOYEE_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isSale} onChange={set("isSale")} className="h-4 w-4 rounded border-border" />
          เป็นเซล (ขึ้นเป็นผู้ดูแลลูกค้า · ชื่อ/เบอร์/รูป โชว์ให้ลูกค้าเห็น)
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">ตำแหน่งในผัง <span className="font-normal text-muted">(ไม่บังคับ · จัดทีหลังได้)</span></h2>
        <select value={f.orgUnitId} onChange={set("orgUnitId")} className={INP}>
          <option value="">— ยังไม่จัด —</option>
          {grouped.map(([dept, opts]) => (
            <optgroup key={dept} label={dept}>
              {opts.map((p) => <option key={p.id} value={p.id}>{p.label}{p.isHead ? " (หัวหน้า)" : ""}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="text-[11px] text-muted">ตำแหน่ง Driver / Warehouse / Sales / Accounting / Pricing จะได้สิทธิ์ระบบตรงตามตำแหน่งอัตโนมัติ</p>
      </section>

      <button type="submit" disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} สร้างพนักงาน
      </button>
    </form>
  );
}

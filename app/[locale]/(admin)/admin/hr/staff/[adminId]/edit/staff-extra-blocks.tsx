"use client";

import { useState, useTransition } from "react";
import { MapPin, GraduationCap, Plus, Trash2, Loader2 } from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import {
  addStaffAddress, removeStaffAddress,
  addStaffEducation, removeStaffEducation,
} from "@/actions/admin/hr-staff-extra";
import type { StaffAddressRow, StaffEducationRow } from "@/lib/admin/hr-staff-extra";

/**
 * บล็อก "ที่อยู่" + "การศึกษา" ในฟอร์มแก้พนักงาน (owner 4a · faithful PCS HR).
 * child records หลาย row ต่อคน · เพิ่ม/ลบ ผ่าน server action (มี confirm ก่อนลบ §0f).
 * local state seed จาก props → อัปเดตทันทีหลังเพิ่ม/ลบ (revalidatePath รีเฟรชฝั่ง server ด้วย).
 */

const field = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const lbl = "block text-[11px] font-semibold text-muted mb-0.5";

const EDU_LEVELS = ["ประถม", "มัธยม", "ปวช", "ปวส", "ปริญญาตรี", "ปริญญาโท", "ปริญญาเอก"] as const;

export function StaffExtraBlocks({
  adminId, addresses, education,
}: {
  adminId: string;
  addresses: StaffAddressRow[];
  education: StaffEducationRow[];
}) {
  const { confirm, alert, dialogs } = useConfirmDialogs();

  return (
    <>
      {dialogs}
      <AddressBlock adminId={adminId} initial={addresses} confirm={confirm} alert={alert} />
      <EducationBlock adminId={adminId} initial={education} confirm={confirm} alert={alert} />
    </>
  );
}

type Confirm = (msg: string) => Promise<boolean>;
type Alert = (msg: string) => Promise<boolean>;

// ── ที่อยู่ ─────────────────────────────────────────────────────────
function AddressBlock({
  adminId, initial, confirm, alert,
}: { adminId: string; initial: StaffAddressRow[]; confirm: Confirm; alert: Alert }) {
  const [rows, setRows] = useState<StaffAddressRow[]>(initial);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const empty = { label: "", address: "", subdistrict: "", district: "", province: "", zipcode: "" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function onAdd() {
    setErr(null);
    if (!f.address.trim()) { setErr("กรุณากรอกที่อยู่"); return; }
    start(async () => {
      const res = await addStaffAddress({ adminId, ...f });
      if (!res.ok) { setErr(res.error ?? "เพิ่มไม่สำเร็จ"); return; }
      if (res.data) setRows((p) => [...p, res.data!]);
      setF(empty);
    });
  }

  function onRemove(r: StaffAddressRow) {
    void (async () => {
      const ok = await confirm(`ลบที่อยู่นี้ ?\n\n${r.address}${r.province ? ` · ${r.province}` : ""}`);
      if (!ok) return;
      start(async () => {
        const res = await removeStaffAddress({ adminId, id: r.id });
        if (!res.ok) { await alert(`ลบไม่สำเร็จ: ${res.error ?? "unknown"}`); return; }
        setRows((p) => p.filter((x) => x.id !== r.id));
      });
    })();
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-bold"><MapPin className="h-4 w-4 text-primary-600" /> ที่อยู่ ({rows.length})</h2>

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-alt/40 px-3 py-2">
              <div className="text-[13px] leading-relaxed">
                {r.label && <span className="mr-1 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">{r.label}</span>}
                <span className="font-medium text-foreground">{r.address}</span>
                {(r.subdistrict || r.district || r.province || r.zipcode) && (
                  <div className="text-[12px] text-muted">
                    {[r.subdistrict, r.district, r.province, r.zipcode].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button type="button" disabled={busy} onClick={() => onRemove(r)} title="ลบที่อยู่"
                className="shrink-0 rounded-lg border border-border p-1.5 text-muted hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted">ยังไม่มีที่อยู่ — เพิ่มด้านล่าง</p>
      )}

      {/* ── ฟอร์มเพิ่มที่อยู่ ── */}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label><span className={lbl}>ป้ายกำกับ (บ้าน/ที่ทำงาน)</span><input className={field} value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="บ้าน" /></label>
          <label><span className={lbl}>รหัสไปรษณีย์</span><input className={field + " tabular-nums"} value={f.zipcode} onChange={(e) => set("zipcode", e.target.value)} maxLength={10} /></label>
          <label className="sm:col-span-2"><span className={lbl}>ที่อยู่ (บ้านเลขที่/หมู่/ซอย/ถนน) *</span><input className={field} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
          <label><span className={lbl}>ตำบล/แขวง</span><input className={field} value={f.subdistrict} onChange={(e) => set("subdistrict", e.target.value)} /></label>
          <label><span className={lbl}>อำเภอ/เขต</span><input className={field} value={f.district} onChange={(e) => set("district", e.target.value)} /></label>
          <label className="sm:col-span-2"><span className={lbl}>จังหวัด</span><input className={field} value={f.province} onChange={(e) => set("province", e.target.value)} /></label>
        </div>
        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] text-red-700">⚠ {err}</div>}
        <button type="button" disabled={busy} onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} เพิ่มที่อยู่
        </button>
      </div>
    </section>
  );
}

// ── การศึกษา ────────────────────────────────────────────────────────
function EducationBlock({
  adminId, initial, confirm, alert,
}: { adminId: string; initial: StaffEducationRow[]; confirm: Confirm; alert: Alert }) {
  const [rows, setRows] = useState<StaffEducationRow[]>(initial);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const empty = { level: "", institution: "", major: "", graduationYear: "" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  function onAdd() {
    setErr(null);
    if (!f.institution.trim()) { setErr("กรุณากรอกสถาบัน"); return; }
    start(async () => {
      const res = await addStaffEducation({ adminId, ...f });
      if (!res.ok) { setErr(res.error ?? "เพิ่มไม่สำเร็จ"); return; }
      if (res.data) setRows((p) => [...p, res.data!]);
      setF(empty);
    });
  }

  function onRemove(r: StaffEducationRow) {
    void (async () => {
      const ok = await confirm(`ลบประวัติการศึกษานี้ ?\n\n${[r.level, r.institution].filter(Boolean).join(" · ")}`);
      if (!ok) return;
      start(async () => {
        const res = await removeStaffEducation({ adminId, id: r.id });
        if (!res.ok) { await alert(`ลบไม่สำเร็จ: ${res.error ?? "unknown"}`); return; }
        setRows((p) => p.filter((x) => x.id !== r.id));
      });
    })();
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 space-y-3">
      <h2 className="flex items-center gap-1.5 text-sm font-bold"><GraduationCap className="h-4 w-4 text-primary-600" /> การศึกษา ({rows.length})</h2>

      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-alt/40 px-3 py-2">
              <div className="text-[13px] leading-relaxed">
                {r.level && <span className="mr-1 rounded bg-purple-100 px-1.5 py-0.5 text-[11px] font-medium text-purple-700">{r.level}</span>}
                <span className="font-medium text-foreground">{r.institution}</span>
                {(r.major || r.graduationYear) && (
                  <div className="text-[12px] text-muted">
                    {[r.major, r.graduationYear && `จบปี ${r.graduationYear}`].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>
              <button type="button" disabled={busy} onClick={() => onRemove(r)} title="ลบประวัติการศึกษา"
                className="shrink-0 rounded-lg border border-border p-1.5 text-muted hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted">ยังไม่มีประวัติการศึกษา — เพิ่มด้านล่าง</p>
      )}

      {/* ── ฟอร์มเพิ่มการศึกษา ── */}
      <div className="rounded-lg border border-dashed border-border p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <label><span className={lbl}>ระดับการศึกษา</span>
            <select className={field} value={f.level} onChange={(e) => set("level", e.target.value)}>
              <option value="">—</option>
              {EDU_LEVELS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label><span className={lbl}>ปีที่จบ</span><input className={field + " tabular-nums"} value={f.graduationYear} onChange={(e) => set("graduationYear", e.target.value)} placeholder="2565" maxLength={10} /></label>
          <label className="sm:col-span-2"><span className={lbl}>สถาบัน *</span><input className={field} value={f.institution} onChange={(e) => set("institution", e.target.value)} /></label>
          <label className="sm:col-span-2"><span className={lbl}>สาขา/วิชาเอก</span><input className={field} value={f.major} onChange={(e) => set("major", e.target.value)} /></label>
        </div>
        {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] text-red-700">⚠ {err}</div>}
        <button type="button" disabled={busy} onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} เพิ่มการศึกษา
        </button>
      </div>
    </section>
  );
}

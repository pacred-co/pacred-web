"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { CalendarCheck, CalendarClock, CheckCircle2, XCircle, Loader2, Plus, ShieldCheck, Crown } from "lucide-react";
import { useConfirmDialogs, PacredDialog, DialogFooter } from "@/components/ui/pacred-dialog";
import { formatThaiDate, formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { createLeaveRequest, hrApproveLeave, ceoApproveLeave, rejectLeave } from "@/actions/admin/hr-leave";
import type { LeaveRow, LeaveStatus } from "@/lib/admin/hr-leave";

type StaffOption = { adminId: string; name: string; nickname: string | null };

const LEAVE_TYPES = ["ลากิจ", "ลาป่วย", "ลาพักร้อน", "อื่นๆ"] as const;

// สถานะ 2 ชั้น — ป้ายอ่านง่าย + next-action ที่พนักงานต้องทำ (§0g)
const STATUS_META: Record<LeaveStatus, { label: string; pill: string }> = {
  pending:     { label: "รอ HR อนุมัติ",  pill: "bg-amber-100 text-amber-700" },
  hr_approved: { label: "รอ CEO อนุมัติ", pill: "bg-sky-100 text-sky-700" },
  approved:    { label: "อนุมัติแล้ว",     pill: "bg-emerald-100 text-emerald-700" },
  rejected:    { label: "ปฏิเสธแล้ว",      pill: "bg-red-100 text-red-700" },
};

export function LeaveClient({
  rows, staffOptions, canCeoApprove,
}: {
  rows: LeaveRow[];
  staffOptions: StaffOption[];
  canCeoApprove: boolean;
}) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [saving, startSave] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── ฟอร์มยื่นลา ──
  const [adminLoginId, setAdminLoginId] = useState("");
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPES)[number]>("ลากิจ");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  // ── modal ปฏิเสธ (ต้องการเหตุผล) ──
  const rejectRef = useRef<HTMLDialogElement>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const stats = useMemo(() => ({
    pending: rows.filter((r) => r.status === "pending").length,
    hrApproved: rows.filter((r) => r.status === "hr_approved").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  }), [rows]);

  function onSubmitLeave() {
    if (!adminLoginId) { void alert("เลือกพนักงานผู้ยื่นลาก่อน"); return; }
    if (!startDate || !endDate) { void alert("เลือกวันเริ่ม-สิ้นสุดก่อน"); return; }
    if (endDate < startDate) { void alert("วันสิ้นสุดต้องไม่ก่อนวันเริ่ม"); return; }
    startSave(async () => {
      const staff = staffOptions.find((s) => s.adminId === adminLoginId);
      const ok = await confirm(`ยื่นใบลา "${leaveType}" ให้ "${staff?.name ?? adminLoginId}"\nช่วง ${startDate} → ${endDate} ?`);
      if (!ok) return;
      const res = await createLeaveRequest({ adminLoginId, leaveType, startDate, endDate, reason });
      if (!res.ok) { await alert(`ยื่นลาไม่สำเร็จ: ${res.error ?? "unknown"}`); return; }
      setAdminLoginId(""); setStartDate(""); setEndDate(""); setReason(""); setLeaveType("ลากิจ");
    });
  }

  function onHrApprove(r: LeaveRow) {
    startSave(async () => {
      const ok = await confirm(`อนุมัติชั้น HR ให้ใบลาของ "${r.staffName}" (${r.startDate} → ${r.endDate}) ?\n\nจะส่งต่อให้ CEO อนุมัติปิดท้าย.`);
      if (!ok) return;
      setBusyId(r.id);
      const res = await hrApproveLeave({ id: r.id });
      setBusyId(null);
      if (!res.ok) await alert(`อนุมัติไม่สำเร็จ: ${res.error ?? "unknown"}`);
    });
  }

  function onCeoApprove(r: LeaveRow) {
    startSave(async () => {
      const ok = await confirm(`อนุมัติปิดท้าย (CEO) ให้ใบลาของ "${r.staffName}" (${r.startDate} → ${r.endDate}) ?\n\nอนุมัติแล้วจะปิดคำขอนี้.`);
      if (!ok) return;
      setBusyId(r.id);
      const res = await ceoApproveLeave({ id: r.id });
      setBusyId(null);
      if (!res.ok) await alert(`อนุมัติไม่สำเร็จ: ${res.error ?? "unknown"}`);
    });
  }

  function openReject(r: LeaveRow) {
    setRejectTarget(r);
    setRejectReason("");
    rejectRef.current?.showModal();
  }
  function submitReject() {
    const target = rejectTarget;
    if (!target) return;
    startSave(async () => {
      setBusyId(target.id);
      const res = await rejectLeave({ id: target.id, reason: rejectReason });
      setBusyId(null);
      rejectRef.current?.close();
      setRejectTarget(null);
      if (!res.ok) await alert(`ปฏิเสธไม่สำเร็จ: ${res.error ?? "unknown"}`);
    });
  }

  return (
    <div className="space-y-4">
      {dialogs}

      {/* สรุปสถานะ (§0g) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<CalendarClock className="h-4 w-4 text-amber-600" />} label="รอ HR" value={stats.pending} tone="amber" />
        <Stat icon={<ShieldCheck className="h-4 w-4 text-sky-600" />} label="รอ CEO" value={stats.hrApproved} tone="sky" />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="อนุมัติแล้ว" value={stats.approved} tone="emerald" />
        <Stat icon={<XCircle className="h-4 w-4 text-red-600" />} label="ปฏิเสธ" value={stats.rejected} tone="red" />
      </div>

      {/* ฟอร์มยื่นลา */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Plus className="h-4 w-4 text-primary-600" /> ยื่นใบลา</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-[11px] text-muted lg:col-span-1">
            <span className="mb-1 block">พนักงาน</span>
            <select value={adminLoginId} onChange={(e) => setAdminLoginId(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50">
              <option value="">— เลือกพนักงาน —</option>
              {staffOptions.map((s) => (
                <option key={s.adminId} value={s.adminId}>{s.name}{s.nickname ? ` (${s.nickname})` : ""}</option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            <span className="mb-1 block">ประเภทการลา</span>
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as (typeof LEAVE_TYPES)[number])}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50">
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="text-[11px] text-muted">
            <span className="mb-1 block">วันเริ่ม</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
          </label>
          <label className="text-[11px] text-muted">
            <span className="mb-1 block">วันสิ้นสุด</span>
            <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
          </label>
          <label className="text-[11px] text-muted lg:col-span-1 sm:col-span-2">
            <span className="mb-1 block">เหตุผล (ถ้ามี)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ธุระส่วนตัว"
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onSubmitLeave} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
            {saving && !busyId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} ยื่นลา
          </button>
        </div>
      </div>

      {/* ตารางคำขอลา */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-alt/60 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">พนักงาน</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2">ช่วงวันลา</th>
              <th className="px-3 py-2 text-center">วัน</th>
              <th className="px-3 py-2">เหตุผล</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2 w-64">การอนุมัติ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const busy = saving && busyId === r.id;
              const meta = STATUS_META[r.status];
              return (
                <tr key={r.id} className="border-t border-border/50 hover:bg-surface-alt/30 align-top">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-foreground">{r.staffName}</div>
                    <div className="text-[11px] text-muted font-mono">{r.adminLoginId}</div>
                    <div className="text-[11px] text-muted">ยื่น {formatThaiDateTime(r.createdAt)}</div>
                  </td>
                  <td className="px-3 py-2 text-[13px]">{r.leaveType ?? "—"}</td>
                  <td className="px-3 py-2 text-[13px] whitespace-nowrap">
                    {formatThaiDate(r.startDate)} <span className="text-muted">→</span> {formatThaiDate(r.endDate)}
                  </td>
                  <td className="px-3 py-2 text-center text-[13px] tabular-nums">{r.days ?? "—"}</td>
                  <td className="px-3 py-2 text-[12px] text-muted max-w-[200px]">
                    {r.reason || "—"}
                    {r.status === "rejected" && r.rejectReason && (
                      <div className="mt-0.5 text-[11px] text-red-600">เหตุผลปฏิเสธ: {r.rejectReason}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>{meta.label}</span>
                    {r.status === "hr_approved" && (
                      <div className="mt-0.5 text-[10.5px] text-muted">HR อนุมัติ {formatThaiDateTime(r.hrApprovedAt)}</div>
                    )}
                    {r.status === "approved" && (
                      <div className="mt-0.5 text-[10.5px] text-muted">CEO อนุมัติ {formatThaiDateTime(r.ceoApprovedAt)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.status === "pending" && (
                        <button type="button" disabled={busy} onClick={() => onHrApprove(r)}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                          <ShieldCheck className="h-3.5 w-3.5" /> HR อนุมัติ
                        </button>
                      )}
                      {r.status === "hr_approved" && (
                        canCeoApprove ? (
                          <button type="button" disabled={busy} onClick={() => onCeoApprove(r)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                            <Crown className="h-3.5 w-3.5" /> CEO อนุมัติ
                          </button>
                        ) : (
                          <span className="text-[11px] text-muted">รอ CEO (super) อนุมัติ</span>
                        )
                      )}
                      {(r.status === "pending" || r.status === "hr_approved") && (
                        <button type="button" disabled={busy} onClick={() => openReject(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                          <XCircle className="h-3.5 w-3.5" /> ปฏิเสธ
                        </button>
                      )}
                      {(r.status === "approved" || r.status === "rejected") && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted">
                          {r.status === "approved" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                          ปิดคำขอแล้ว
                        </span>
                      )}
                      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-muted">ยังไม่มีคำขอลา — ยื่นใบลาจากฟอร์มด้านบน</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* modal ปฏิเสธ (§0f · ต้องกดยืนยัน + ใส่เหตุผลได้) */}
      <PacredDialog dialogRef={rejectRef} title="ปฏิเสธคำขอลา" onClose={() => setRejectTarget(null)}>
        <form onSubmit={(e) => { e.preventDefault(); submitReject(); }}>
          {rejectTarget && (
            <p className="text-sm text-gray-700">
              ปฏิเสธใบลาของ <b>{rejectTarget.staffName}</b> ({formatThaiDate(rejectTarget.startDate)} → {formatThaiDate(rejectTarget.endDate)})
            </p>
          )}
          <label className="mt-3 block text-[12px] text-gray-600">
            <span className="mb-1 block">เหตุผลที่ปฏิเสธ (ถ้ามี)</span>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              placeholder="เช่น ช่วงนี้งานเยอะ ขอเลื่อนวันลา"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-red-400/50" />
          </label>
          <DialogFooter
            onCancel={() => { rejectRef.current?.close(); setRejectTarget(null); }}
            pending={saving}
            submitLabel="ยืนยันปฏิเสธ"
            pendingLabel="กำลังปฏิเสธ…"
            destructive
          />
        </form>
      </PacredDialog>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "amber" | "sky" | "emerald" | "red" }) {
  const ring = tone === "emerald" ? "border-emerald-200 bg-emerald-50/40"
    : tone === "red" ? "border-red-200 bg-red-50/40"
    : tone === "sky" ? "border-sky-200 bg-sky-50/40"
    : "border-amber-200 bg-amber-50/40";
  return (
    <div className={`rounded-xl border ${ring} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}

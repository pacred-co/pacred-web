"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Users, CheckCircle2, CircleSlash, Loader2 } from "lucide-react";
import { assignStaffToPosition } from "@/actions/admin/hr-staff";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import type { StaffRow } from "@/lib/admin/hr-staff";
import type { PositionOption } from "@/lib/admin/hr-org";

const TYPE_TONE: Record<string, string> = {
  "1": "bg-emerald-100 text-emerald-700", "2": "bg-amber-100 text-amber-700",
  "3": "bg-sky-100 text-sky-700", "4": "bg-sky-100 text-sky-700",
  "5": "bg-purple-100 text-purple-700", "6": "bg-slate-100 text-slate-600",
  "7": "bg-slate-100 text-slate-600",
};

export function StaffAssignClient({ rows, positions }: { rows: StaffRow[]; positions: PositionOption[] }) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [search, setSearch] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [saving, startSave] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const stats = useMemo(() => ({
    total: rows.length,
    assigned: rows.filter((r) => r.orgUnitId).length,
    unassigned: rows.filter((r) => !r.orgUnitId).length,
  }), [rows]);

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyUnassigned && r.orgUnitId) return false;
      if (!t) return true;
      return r.name.toLowerCase().includes(t) || (r.nickname ?? "").toLowerCase().includes(t) ||
        r.adminId.toLowerCase().includes(t) || (r.positionName ?? "").toLowerCase().includes(t);
    });
  }, [rows, search, onlyUnassigned]);

  // จัดกลุ่ม option ตามแผนกไว้ทำ <optgroup>
  const grouped = useMemo(() => {
    const m = new Map<string, PositionOption[]>();
    for (const p of positions) { if (!m.has(p.department)) m.set(p.department, []); m.get(p.department)!.push(p); }
    return [...m.entries()];
  }, [positions]);

  async function onAssign(r: StaffRow, orgUnitId: string | null) {
    if (orgUnitId === r.orgUnitId) return;
    const label = orgUnitId ? positions.find((p) => p.id === orgUnitId)?.label ?? "ตำแหน่ง" : null;
    const ok = await confirm(
      orgUnitId
        ? `ย้าย "${r.name}${r.nickname ? ` (${r.nickname})` : ""}" เข้าตำแหน่ง "${label}" ?`
        : `ปลด "${r.name}" ออกจากตำแหน่ง "${r.positionName}" ?`,
    );
    if (!ok) return;
    setBusyId(r.adminId);
    startSave(async () => {
      const res = await assignStaffToPosition({ adminId: r.adminId, orgUnitId });
      setBusyId(null);
      if (!res.ok) { await alert(`บันทึกไม่สำเร็จ: ${res.error ?? "unknown"}`); return; }
      // server revalidatePath จะรีเฟรชรายการ + ผังเอง
    });
  }

  return (
    <div className="space-y-4">
      {dialogs}

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Users className="h-4 w-4" />} label="พนักงาน active" value={stats.total} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="จัดตำแหน่งแล้ว" value={stats.assigned} tone="emerald" />
        <Stat icon={<CircleSlash className="h-4 w-4 text-red-600" />} label="ยังไม่จัดตำแหน่ง" value={stats.unassigned} tone="red" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อ / ชื่อเล่น / รหัส / ตำแหน่ง…"
            className="w-72 rounded-lg border border-border bg-white dark:bg-surface pl-8 pr-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
        </div>
        <button type="button" onClick={() => setOnlyUnassigned((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${onlyUnassigned ? "border-red-400 bg-red-50 text-red-700" : "border-border hover:bg-surface-alt"}`}>
          <CircleSlash className="h-3.5 w-3.5" /> เฉพาะที่ยังไม่จัด ({stats.unassigned})
        </button>
        <span className="ml-auto text-[11px] text-muted">{visible.length.toLocaleString("th-TH")} คน</span>
      </div>

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-alt/60 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">พนักงาน</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2">ตำแหน่งในผัง</th>
              <th className="px-3 py-2 w-72">จัดเข้าตำแหน่ง</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.adminId} className={`border-t border-border/50 hover:bg-surface-alt/30 ${!r.orgUnitId ? "bg-red-50/40" : ""}`}>
                <td className="px-3 py-2">
                  <div className="font-semibold text-foreground">{r.name}{r.nickname && <span className="ml-1 text-muted font-normal">({r.nickname})</span>}</div>
                  <div className="text-[11px] text-muted font-mono">{r.adminId}{r.isSale && <span className="ml-1 rounded bg-primary-100 px-1 text-primary-700">เซล</span>}</div>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_TONE[r.type] ?? "bg-slate-100 text-slate-600"}`}>{r.typeLabel}</span>
                </td>
                <td className="px-3 py-2">
                  {r.positionName ? (
                    <span className="text-[13px]"><span className="text-muted">{r.departmentName} · </span><b>{r.positionName}</b></span>
                  ) : (
                    <span className="text-[12px] font-semibold text-red-600">— ยังไม่จัด —</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={r.orgUnitId ?? ""}
                      disabled={saving && busyId === r.adminId}
                      onChange={(e) => onAssign(r, e.target.value || null)}
                      className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50"
                    >
                      <option value="">— ยังไม่จัด —</option>
                      {grouped.map(([dept, opts]) => (
                        <optgroup key={dept} label={dept}>
                          {opts.map((p) => <option key={p.id} value={p.id}>{p.label}{p.isHead ? " (หัวหน้า)" : ""}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    {saving && busyId === r.adminId && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-xs text-muted">ไม่พบพนักงานตามเงื่อนไข</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "emerald" | "red" }) {
  const ring = tone === "emerald" ? "border-emerald-200 bg-emerald-50/40" : tone === "red" ? "border-red-200 bg-red-50/40" : "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-xl border ${ring} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}

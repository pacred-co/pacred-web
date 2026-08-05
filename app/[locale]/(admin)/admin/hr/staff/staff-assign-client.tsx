"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, Users, CheckCircle2, CircleSlash, Loader2, Pencil, Shield, Lock, LockOpen, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { assignStaffToPosition, setStaffEmployment } from "@/actions/admin/hr-staff";
import { adminChangeRole } from "@/actions/admin/admins";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { ASSIGNABLE_ROLES, ROLE_LABELS, type AdminRoleEnum } from "@/lib/validators/admin-form";
import type { StaffRow } from "@/lib/admin/hr-staff";
import type { PositionOption } from "@/lib/admin/hr-org";

const TYPE_TONE: Record<string, string> = {
  "1": "bg-emerald-100 text-emerald-700", "2": "bg-amber-100 text-amber-700",
  "3": "bg-sky-100 text-sky-700", "4": "bg-sky-100 text-sky-700",
  "5": "bg-purple-100 text-purple-700", "6": "bg-slate-100 text-slate-600",
  "7": "bg-slate-100 text-slate-600",
};

const roleLabel = (r: string | null) => (r ? (ROLE_LABELS[r as AdminRoleEnum] ?? r) : "—");

export function StaffAssignClient({
  rows, positions, canManageRoles,
}: {
  rows: StaffRow[];
  positions: PositionOption[];
  canManageRoles: boolean;
}) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [tab, setTab] = useState<"active" | "resigned">("active");
  const [search, setSearch] = useState("");
  const [onlyUnassigned, setOnlyUnassigned] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [saving, startSave] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeRows = useMemo(() => rows.filter((r) => r.isActive), [rows]);
  const resignedRows = useMemo(() => rows.filter((r) => !r.isActive), [rows]);
  const pool = tab === "active" ? activeRows : resignedRows;

  const stats = useMemo(() => ({
    total: activeRows.length,
    assigned: activeRows.filter((r) => r.orgUnitId).length,
    unassigned: activeRows.filter((r) => !r.orgUnitId).length,
    incomplete: activeRows.filter((r) => !r.isDataComplete).length,
    resigned: resignedRows.length,
  }), [activeRows, resignedRows]);

  const visible = useMemo(() => {
    const t = search.trim().toLowerCase();
    return pool.filter((r) => {
      if (tab === "active" && onlyUnassigned && r.orgUnitId) return false;
      if (tab === "active" && onlyIncomplete && r.isDataComplete) return false;
      if (!t) return true;
      return r.name.toLowerCase().includes(t) || (r.nickname ?? "").toLowerCase().includes(t) ||
        r.adminId.toLowerCase().includes(t) || (r.positionName ?? "").toLowerCase().includes(t) ||
        r.roles.some((role) => roleLabel(role).toLowerCase().includes(t));
    });
  }, [pool, tab, search, onlyUnassigned, onlyIncomplete]);

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
    });
  }

  async function onRoleChange(r: StaffRow, newRole: string) {
    if (newRole === (r.primaryRole ?? "")) return;
    const ok = await confirm(
      `เปลี่ยนสิทธิ์ระบบของ "${r.name}"\nจาก "${roleLabel(r.primaryRole)}" → "${roleLabel(newRole)}" ?\n\n` +
      `ระบบจะให้สิทธิ์ใหม่ + ปิดสิทธิ์เดิม (history ไม่ลบ · audit-log).`,
    );
    if (!ok) return;
    setBusyId(r.adminId);
    startSave(async () => {
      const res = await adminChangeRole({
        profile_id: r.profileId,
        old_role: (r.primaryRole ?? "ops") as AdminRoleEnum,
        new_role: newRole as AdminRoleEnum,
      });
      setBusyId(null);
      if (!res.ok) { await alert(`เปลี่ยนสิทธิ์ไม่สำเร็จ: ${res.error ?? "unknown"}`); return; }
    });
  }

  async function onToggleEmployment(r: StaffRow) {
    const next = !r.isActive;
    const ok = await confirm(
      next
        ? `เปิดพนักงาน "${r.name}" กลับมาทำงาน ?\n\nจะปลดล็อกให้ล็อกอิน + กลับเข้าระบบได้ทันที (ทุกชั้น).`
        : `ล็อกพนักงาน "${r.name}" (ออกจากงาน) ?\n\nจะกันล็อกอิน + ปิดสิทธิ์ทุกชั้นทันที · เปิดกลับได้ทุกเมื่อ.`,
    );
    if (!ok) return;
    setBusyId(r.adminId);
    startSave(async () => {
      const res = await setStaffEmployment({ adminId: r.adminId, active: next });
      setBusyId(null);
      if (!res.ok) { await alert(`ทำรายการไม่สำเร็จ: ${res.error ?? "unknown"}`); return; }
    });
  }

  return (
    <div className="space-y-4">
      {dialogs}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat icon={<Users className="h-4 w-4" />} label="พนักงาน active" value={stats.total} />
        <Stat icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label="จัดตำแหน่งแล้ว" value={stats.assigned} tone="emerald" />
        <Stat icon={<CircleSlash className="h-4 w-4 text-red-600" />} label="ยังไม่จัดตำแหน่ง" value={stats.unassigned} tone="red" />
        <Stat icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} label="ข้อมูลไม่ครบ" value={stats.incomplete} tone="amber" />
        <Stat icon={<Lock className="h-4 w-4 text-slate-500" />} label="ลาออก / ล็อก" value={stats.resigned} />
      </div>

      {/* tabs ทำงาน / ลาออก */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabBtn active={tab === "active"} onClick={() => setTab("active")}>ทำงานอยู่ ({activeRows.length})</TabBtn>
        <TabBtn active={tab === "resigned"} onClick={() => setTab("resigned")}>ลาออก · ล็อก ({resignedRows.length})</TabBtn>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา ชื่อ / ชื่อเล่น / รหัส / ตำแหน่ง / สิทธิ์…"
            className="w-72 rounded-lg border border-border bg-white dark:bg-surface pl-8 pr-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50" />
        </div>
        {tab === "active" && (
          <button type="button" onClick={() => setOnlyUnassigned((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${onlyUnassigned ? "border-red-400 bg-red-50 text-red-700" : "border-border hover:bg-surface-alt"}`}>
            <CircleSlash className="h-3.5 w-3.5" /> เฉพาะที่ยังไม่จัด ({stats.unassigned})
          </button>
        )}
        {tab === "active" && (
          <button type="button" onClick={() => setOnlyIncomplete((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs ${onlyIncomplete ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border hover:bg-surface-alt"}`}>
            <AlertTriangle className="h-3.5 w-3.5" /> ข้อมูลไม่ครบ ({stats.incomplete})
          </button>
        )}
        <span className="ml-auto text-[11px] text-muted">{visible.length.toLocaleString("th-TH")} คน</span>
      </div>

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface-alt/60 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">พนักงาน</th>
              <th className="px-3 py-2">ประเภท</th>
              <th className="px-3 py-2">ตำแหน่งในผัง</th>
              {tab === "active" && <th className="px-3 py-2 w-64">จัดเข้าตำแหน่ง</th>}
              <th className="px-3 py-2 w-52">สิทธิ์ระบบ (role)</th>
              <th className="px-3 py-2">สถานะ</th>
              <th className="px-3 py-2">แก้ไข</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const busy = saving && busyId === r.adminId;
              return (
              <tr key={r.adminId} className={`border-t border-border/50 hover:bg-surface-alt/30 ${!r.isActive ? "bg-slate-50/60" : !r.orgUnitId ? "bg-red-50/40" : ""}`}>
                <td className="px-3 py-2">
                  <div className="font-semibold text-foreground">{r.name}{r.nickname && <span className="ml-1 text-muted font-normal">({r.nickname})</span>}</div>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
                    <span className="font-mono">{r.memberCode ?? r.adminId}</span>
                    {r.isSale && <span className="rounded bg-primary-100 px-1 text-primary-700">เซล</span>}
                    {!r.hasHrRecord && <span className="rounded bg-amber-100 px-1 text-amber-700" title="มีในระบบ login แต่ยังไม่มีข้อมูล HR (tb_admin) — เติมทีหลัง">⚠ ไม่มี HR</span>}
                    {r.hasHrRecord && !r.isDataComplete && <span className="rounded bg-amber-100 px-1 text-amber-700" title={`ยังไม่ครบ: ${r.missingFields.join(", ")}`}>⚠ ข้อมูลไม่ครบ</span>}
                  </div>
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
                {tab === "active" && (
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <select
                        value={r.orgUnitId ?? ""}
                        disabled={busy}
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
                    </div>
                  </td>
                )}
                {/* สิทธิ์ระบบ (RBAC) */}
                <td className="px-3 py-2">
                  {canManageRoles && r.isActive ? (
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <select
                        value={r.primaryRole ?? ""}
                        disabled={busy}
                        onChange={(e) => onRoleChange(r, e.target.value)}
                        className="w-full rounded-lg border border-border bg-white dark:bg-surface px-2 py-1 text-[11px] focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-50"
                      >
                        {r.primaryRole == null && <option value="">— ไม่มีสิทธิ์ —</option>}
                        {Array.from(new Set<string>([...ASSIGNABLE_ROLES, ...(r.primaryRole ? [r.primaryRole] : [])])).map((role) => (
                          <option key={role} value={role}>{roleLabel(role)}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {r.roles.length ? r.roles.map((role) => (
                        <span key={role} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{roleLabel(role)}</span>
                      )) : <span className="text-[11px] text-muted">—</span>}
                    </div>
                  )}
                </td>
                {/* สถานะ + ล็อก/ปลดล็อก */}
                <td className="px-3 py-2">
                  {r.isActive ? (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">ทำงานอยู่</span>
                      {canManageRoles && (
                        <button type="button" disabled={busy} onClick={() => onToggleEmployment(r)}
                          title="ล็อก (ออกจากงาน)" className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px] text-muted hover:border-red-300 hover:text-red-600 disabled:opacity-50">
                          <Lock className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600">ลาออก / ล็อก</span>
                      {canManageRoles && (
                        <button type="button" disabled={busy} onClick={() => onToggleEmployment(r)}
                          className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                          <LockOpen className="h-3 w-3" /> เปิดกลับ
                        </button>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/admin/hr/staff/${r.adminId}/edit`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-surface-alt hover:border-primary-300">
                      <Pencil className="h-3 w-3" /> {r.hasHrRecord ? "แก้ไข" : "เติม HR"}
                    </Link>
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
                  </div>
                </td>
              </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-muted">ไม่พบพนักงานตามเงื่อนไข</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-primary-600 text-primary-700" : "border-transparent text-muted hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "emerald" | "red" | "amber" }) {
  const ring = tone === "emerald" ? "border-emerald-200 bg-emerald-50/40" : tone === "red" ? "border-red-200 bg-red-50/40" : tone === "amber" ? "border-amber-200 bg-amber-50/40" : "border-border bg-white dark:bg-surface";
  return (
    <div className={`rounded-xl border ${ring} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-xl font-bold tabular-nums">{value.toLocaleString("th-TH")}</div>
    </div>
  );
}

"use client";

/**
 * Positions manager (owner ปอน 2026-06-27). Create / edit / activate-deactivate
 * ตำแหน่ง. Each position = name + department + workspace_role (the menu template).
 * Confirm-before-mutate on every write (§0f).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { confirm, alert } from "@/components/ui/confirm";
import { createPosition, updatePosition, setPositionActive } from "@/actions/admin/positions";
import { DEPARTMENTS, departmentLabel, departmentDefaultWorkspace } from "@/lib/admin/departments";
import { ADMIN_ROLES, ROLE_LABELS, type AdminRoleEnum } from "@/lib/validators/admin-form";
import { menuForStaffer } from "@/lib/admin/sidebar-menu";

// Sentinel for "สร้าง role ใหม่ อิงแผนก" — resolves to the department's base
// workspace at submit time (departmentDefaultWorkspace · owner ปอน 2026-06-27).
const DEPT_BASE = "__dept_base__";
function resolveWorkspace(value: string, deptKey: string): AdminRoleEnum | null {
  if (value === DEPT_BASE) return (departmentDefaultWorkspace(deptKey) as AdminRoleEnum | null);
  return value ? (value as AdminRoleEnum) : null;
}

type PositionRow = {
  id: string;
  name_th: string;
  department: string;
  workspace_role: AdminRoleEnum;
  is_active: boolean;
};

// Workspace templates a position can use = every role EXCEPT the pure money
// tiers (ultra/normies make no sense as a menu; `super` = the full menu, kept
// for IT/HR-style positions).
const WORKSPACE_OPTIONS = ADMIN_ROLES.filter((r) => r !== "ultra" && r !== "normies") as AdminRoleEnum[];

const inputCls =
  "w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200 disabled:opacity-60";

export function PositionsManager({ positions }: { positions: PositionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const tNav = useTranslations("pcsAdminNav");

  // Preview: the top-level menu labels a position's workspace_role shows — so the
  // owner can see what each ตำแหน่ง gets without logging in as that staffer (ปอน
  // 2026-06-28). menuForStaffer([], role) = the scoped menu (roles=[] → not god).
  function workspaceMenu(role: AdminRoleEnum): string[] {
    return menuForStaffer([], role)
      .flatMap((s) => s.items)
      .map((it) => { try { return tNav(it.labelKey); } catch { return it.labelKey; } });
  }

  // ── add form ──
  const [name, setName] = useState("");
  const [dept, setDept] = useState("");
  const [workspace, setWorkspace] = useState<string>("");   // AdminRoleEnum | DEPT_BASE | ""

  // ── inline edit ──
  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eDept, setEDept] = useState("");
  const [eWorkspace, setEWorkspace] = useState<string>("ops");  // AdminRoleEnum | DEPT_BASE

  const grouped = useMemo(() => {
    return DEPARTMENTS.map((d) => ({
      dept: d,
      rows: positions.filter((p) => p.department === d.key),
    })).filter((g) => g.rows.length > 0);
  }, [positions]);
  // positions whose department isn't one of the 6 known keys (legacy) — show last.
  const orphan = positions.filter((p) => !DEPARTMENTS.some((d) => d.key === p.department));

  function onAdd() {
    const ws = resolveWorkspace(workspace, dept);
    if (!name.trim() || !dept || !ws) {
      void alert("กรอกชื่อตำแหน่ง + เลือกแผนก + เลือก workspace ให้ครบ", { title: "ข้อมูลไม่ครบ" });
      return;
    }
    startTransition(async () => {
      const ok = await confirm(
        `เพิ่มตำแหน่ง "${name.trim()}"\nแผนก: ${departmentLabel(dept)}\nworkspace: ${ROLE_LABELS[ws]}`,
        { title: "เพิ่มตำแหน่ง", confirmLabel: "เพิ่ม" },
      );
      if (!ok) return;
      const res = await createPosition({ name_th: name.trim(), department: dept as never, workspace_role: ws });
      if (!res.ok) { await alert(res.error, { title: "เพิ่มไม่สำเร็จ" }); return; }
      setName(""); setDept(""); setWorkspace("");
      router.refresh();
    });
  }

  function startEdit(p: PositionRow) {
    setEditId(p.id); setEName(p.name_th); setEDept(p.department); setEWorkspace(p.workspace_role);
  }

  function onSaveEdit(id: string) {
    const ws = resolveWorkspace(eWorkspace, eDept);
    if (!eName.trim() || !eDept || !ws) { void alert("กรอกชื่อ + แผนก + workspace ให้ครบ", { title: "ข้อมูลไม่ครบ" }); return; }
    startTransition(async () => {
      const ok = await confirm(`บันทึกการแก้ไขตำแหน่ง "${eName.trim()}" ?`, { title: "แก้ไขตำแหน่ง", confirmLabel: "บันทึก" });
      if (!ok) return;
      const res = await updatePosition({ id, name_th: eName.trim(), department: eDept as never, workspace_role: ws });
      if (!res.ok) { await alert(res.error, { title: "บันทึกไม่สำเร็จ" }); return; }
      setEditId(null);
      router.refresh();
    });
  }

  function onToggleActive(p: PositionRow) {
    startTransition(async () => {
      const next = !p.is_active;
      const ok = await confirm(
        next ? `เปิดใช้ตำแหน่ง "${p.name_th}" กลับ ?`
             : `ปิดตำแหน่ง "${p.name_th}" ?\n\nจะไม่ขึ้นในตัวเลือกตอนสร้างพนักงาน · พนักงานที่ถืออยู่ไม่กระทบ.`,
        { title: next ? "เปิดตำแหน่ง" : "ปิดตำแหน่ง", confirmLabel: next ? "เปิด" : "ปิด" },
      );
      if (!ok) return;
      const res = await setPositionActive({ id: p.id, is_active: next });
      if (!res.ok) { await alert(res.error, { title: "ทำรายการไม่สำเร็จ" }); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Add form ── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-foreground">➕ เพิ่มตำแหน่งใหม่</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">ชื่อตำแหน่ง</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
              placeholder="เช่น หัวหน้าเซลล์" disabled={pending} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">แผนก</label>
            <select value={dept} onChange={(e) => setDept(e.target.value)} disabled={pending} className={inputCls}>
              <option value="">— เลือกแผนก —</option>
              {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.labelTh}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">workspace (ชุดเมนูที่เห็น)</label>
            <select value={workspace} onChange={(e) => setWorkspace(e.target.value)} disabled={pending} className={inputCls}>
              <option value="">— เลือก workspace —</option>
              {dept && <option value={DEPT_BASE}>🆕 สร้างใหม่อิงแผนก ({ROLE_LABELS[(departmentDefaultWorkspace(dept) ?? "ops") as AdminRoleEnum]})</option>}
              {WORKSPACE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onAdd} disabled={pending}
            className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50">
            {pending ? "กำลังบันทึก…" : "เพิ่มตำแหน่ง"}
          </button>
        </div>
      </section>

      {/* ── List grouped by department ── */}
      {[...grouped, ...(orphan.length ? [{ dept: { key: "_legacy", labelTh: "อื่นๆ (legacy)", defaultWorkspace: "ops" as AdminRoleEnum }, rows: orphan }] : [])].map((g) => (
        <section key={g.dept.key} className="rounded-2xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="border-b border-border bg-surface-alt px-4 py-2.5 text-sm font-semibold text-foreground">
            {g.dept.labelTh} <span className="text-xs font-normal text-muted">· {g.rows.length} ตำแหน่ง</span>
          </div>
          <div className="divide-y divide-border">
            {g.rows.map((p) => editId === p.id ? (
              <div key={p.id} className="grid gap-2 md:grid-cols-4 items-end px-4 py-3 bg-amber-50/40">
                <input value={eName} onChange={(e) => setEName(e.target.value)} maxLength={120} disabled={pending} className={inputCls} />
                <select value={eDept} onChange={(e) => setEDept(e.target.value)} disabled={pending} className={inputCls}>
                  {DEPARTMENTS.map((d) => <option key={d.key} value={d.key}>{d.labelTh}</option>)}
                </select>
                <select value={eWorkspace} onChange={(e) => setEWorkspace(e.target.value)} disabled={pending} className={inputCls}>
                  {eDept && <option value={DEPT_BASE}>🆕 สร้างใหม่อิงแผนก ({ROLE_LABELS[(departmentDefaultWorkspace(eDept) ?? "ops") as AdminRoleEnum]})</option>}
                  {WORKSPACE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <div className="flex gap-2">
                  <button type="button" onClick={() => onSaveEdit(p.id)} disabled={pending}
                    className="rounded-lg bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600 disabled:opacity-50">บันทึก</button>
                  <button type="button" onClick={() => setEditId(null)} disabled={pending}
                    className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-alt">ยกเลิก</button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className={`font-medium ${p.is_active ? "text-foreground" : "text-muted line-through"}`}>{p.name_th}</span>
                <span className="text-xs text-muted">workspace: <span className="font-mono">{p.workspace_role}</span></span>
                {!p.is_active && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-muted">ปิดอยู่</span>}
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => startEdit(p)} disabled={pending}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50">แก้ไข</button>
                  <button type="button" onClick={() => onToggleActive(p)} disabled={pending}
                    className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${p.is_active ? "border-rose-200 text-rose-700 hover:bg-rose-50" : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"}`}>
                    {p.is_active ? "ปิด" : "เปิด"}
                  </button>
                </div>
                <div className="basis-full text-[11px] text-muted">
                  <span className="font-medium text-foreground/60">เห็นเมนู:</span>{" "}
                  {workspaceMenu(p.workspace_role).slice(0, 12).join(" · ") || "—"}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

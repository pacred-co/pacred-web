"use client";

/**
 * Settings (owner brief §3) — CRUD for every dropdown group. Nothing hardcoded:
 * adding an option here makes it appear in the content form immediately. A
 * setting that's in use can't be deleted — deactivate instead (data never lost).
 */
import { useState } from "react";
import { ChevronUp, ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { SETTING_GROUPS, type SettingGroup, type SettingItem } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { btnGhost, btnPrimary, cx, Field, inputCls, Modal, SectionCard, useConfirm } from "./ui";

type FormState = { name: string; color: string; description: string; meta: Record<string, unknown> };

function ItemForm({ group, editing, onClose }: { group: SettingGroup; editing: SettingItem | null; onClose: () => void }) {
  const { addSetting, updateSetting } = usePlanner();
  const [f, setF] = useState<FormState>({
    name: editing?.name ?? "",
    color: editing?.color ?? "#6366f1",
    description: editing?.description ?? "",
    meta: { ...(editing?.meta ?? {}) },
  });
  const [err, setErr] = useState("");
  const setMeta = (k: string, v: unknown) => setF((p) => ({ ...p, meta: { ...p.meta, [k]: v } }));

  const save = () => {
    if (!f.name.trim()) {
      setErr("กรุณากรอกชื่อ");
      return;
    }
    const payload = { name: f.name.trim(), color: f.color, description: f.description.trim() || undefined, meta: Object.keys(f.meta).length ? f.meta : undefined };
    if (editing) updateSetting(editing.id, payload);
    else addSetting(group, { ...payload, name: payload.name });
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "แก้ไขตัวเลือก" : "เพิ่มตัวเลือกใหม่"}
      size="sm"
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>ยกเลิก</button>
          <button type="button" className={btnPrimary} onClick={save}>บันทึก</button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="ชื่อ" required hint={err}>
          <input className={cx(inputCls, err && "border-red-400")} value={f.name} onChange={(e) => { setF((p) => ({ ...p, name: e.target.value })); setErr(""); }} autoFocus />
        </Field>
        <Field label="สี">
          <div className="flex items-center gap-2">
            <input type="color" className="h-9 w-12 cursor-pointer rounded border border-border" value={f.color} onChange={(e) => setF((p) => ({ ...p, color: e.target.value }))} />
            <input className={cx(inputCls, "w-28 font-mono")} value={f.color} onChange={(e) => setF((p) => ({ ...p, color: e.target.value }))} />
          </div>
        </Field>
        <Field label="คำอธิบาย">
          <input className={inputCls} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} />
        </Field>

        {group === "status" && (
          <div className="space-y-1.5 rounded-lg border border-border p-2.5">
            <p className="text-[12px] font-semibold text-foreground">ตัวเลือกสถานะ</p>
            {([["isDone", "ถือว่าเสร็จแล้ว"], ["inCalendar", "แสดงในปฏิทิน"], ["inKanban", "แสดงใน Kanban"]] as [string, string][]).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[12px] text-foreground">
                <input type="checkbox" checked={f.meta[k] !== false && (k === "inKanban" || k === "inCalendar" ? f.meta[k] !== false : !!f.meta[k])} onChange={(e) => setMeta(k, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>
        )}
        {group === "owner" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="ตำแหน่ง"><input className={inputCls} value={(f.meta.position as string) ?? ""} onChange={(e) => setMeta("position", e.target.value)} /></Field>
            <Field label="ทีม"><input className={inputCls} value={(f.meta.team as string) ?? ""} onChange={(e) => setMeta("team", e.target.value)} /></Field>
          </div>
        )}
        {group === "campaign" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="เป้าหมาย" className="col-span-2"><input className={inputCls} value={(f.meta.goal as string) ?? ""} onChange={(e) => setMeta("goal", e.target.value)} /></Field>
            <Field label="เริ่ม"><input type="date" className={inputCls} value={(f.meta.startDate as string) ?? ""} onChange={(e) => setMeta("startDate", e.target.value)} /></Field>
            <Field label="จบ"><input type="date" className={inputCls} value={(f.meta.endDate as string) ?? ""} onChange={(e) => setMeta("endDate", e.target.value)} /></Field>
            <Field label="งบประมาณ (฿)"><input type="number" className={inputCls} value={(f.meta.budget as number) ?? ""} onChange={(e) => setMeta("budget", e.target.value === "" ? undefined : Number(e.target.value))} /></Field>
            <Field label="สถานะ"><input className={inputCls} value={(f.meta.status as string) ?? ""} onChange={(e) => setMeta("status", e.target.value)} placeholder="active / paused / done" /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function SettingsPage({ initialGroup = "platform" }: { initialGroup?: SettingGroup }) {
  const { allByGroup, toggleSetting, deleteSetting, isSettingInUse, updateSetting, resetAll } = usePlanner();
  const confirm = useConfirm();
  const [group, setGroup] = useState<SettingGroup>(initialGroup);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SettingItem | null>(null);

  const items = allByGroup(group);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (it: SettingItem) => { setEditing(it); setFormOpen(true); };

  const move = (it: SettingItem, dir: -1 | 1) => {
    const idx = items.findIndex((x) => x.id === it.id);
    const swap = items[idx + dir];
    if (!swap) return;
    updateSetting(it.id, { order: swap.order });
    updateSetting(swap.id, { order: it.order });
  };

  const onDelete = async (it: SettingItem) => {
    if (isSettingInUse(it.id)) {
      const ok = await confirm({ title: "ตัวเลือกนี้ถูกใช้งานอยู่", message: `"${it.name}" มีคอนเทนต์ใช้อยู่ — ลบไม่ได้ (กันข้อมูลเก่าหาย) จะปิดใช้งานแทนไหม?`, confirmText: "ปิดใช้งาน" });
      if (ok && it.isActive) toggleSetting(it.id);
      return;
    }
    if (await confirm({ title: "ลบตัวเลือก", message: `ลบ "${it.name}" ถาวร?`, danger: true, confirmText: "ลบ" })) deleteSetting(it.id);
  };

  const onReset = async () => {
    if (await confirm({ title: "รีเซ็ตข้อมูลทั้งหมด", message: "ล้างคอนเทนต์ + การตั้งค่าทั้งหมด กลับเป็นค่าเริ่มต้น (mock)? ย้อนกลับไม่ได้", danger: true, confirmText: "รีเซ็ต" })) resetAll();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      {/* Group nav */}
      <aside className="space-y-1">
        {SETTING_GROUPS.map((g) => (
          <button key={g.group} type="button" onClick={() => setGroup(g.group)}
            className={cx("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition", group === g.group ? "bg-primary-600 font-semibold text-white" : "text-foreground hover:bg-primary-50")}>
            <span>{g.labelTh}</span>
            <span className={cx("rounded-full px-1.5 text-[11px]", group === g.group ? "bg-white/20" : "bg-muted/15 text-muted")}>{allByGroup(g.group).length}</span>
          </button>
        ))}
        <button type="button" onClick={onReset} className={cx(btnGhost, "mt-3 w-full text-red-600 hover:bg-red-50")}>
          <RotateCcw className="h-4 w-4" /> รีเซ็ตข้อมูลทั้งหมด
        </button>
      </aside>

      {/* Items */}
      <SectionCard
        title={SETTING_GROUPS.find((g) => g.group === group)?.labelTh}
        actions={<button type="button" className={btnPrimary} onClick={openAdd}><Plus className="h-4 w-4" /> เพิ่มตัวเลือก</button>}
      >
        {items.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-muted">ยังไม่มีตัวเลือก — กด “เพิ่มตัวเลือก”</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((it, i) => (
              <li key={it.id} className={cx("flex items-center gap-2 py-2", !it.isActive && "opacity-50")}>
                <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: it.color || "#94a3b8" }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-foreground">{it.name} {!it.isActive && <span className="text-[11px] text-muted">(ปิดใช้งาน)</span>}</p>
                  {it.description && <p className="truncate text-[11px] text-muted">{it.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button className="rounded p-1 text-muted hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(it, -1)} title="เลื่อนขึ้น"><ChevronUp className="h-4 w-4" /></button>
                  <button className="rounded p-1 text-muted hover:bg-primary-50 hover:text-primary-700 disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(it, 1)} title="เลื่อนลง"><ChevronDown className="h-4 w-4" /></button>
                  <label className="mx-1 inline-flex cursor-pointer items-center" title={it.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}>
                    <input type="checkbox" className="peer sr-only" checked={it.isActive} onChange={() => toggleSetting(it.id)} />
                    <span className="h-5 w-9 rounded-full bg-muted/30 p-0.5 transition peer-checked:bg-primary-600">
                      <span className={cx("block h-4 w-4 rounded-full bg-white transition", it.isActive && "translate-x-4")} />
                    </span>
                  </label>
                  <button className="rounded p-1 text-muted hover:bg-primary-50 hover:text-primary-700" onClick={() => openEdit(it)} title="แก้ไข"><Pencil className="h-4 w-4" /></button>
                  <button className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(it)} title="ลบ"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {formOpen && <ItemForm group={group} editing={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

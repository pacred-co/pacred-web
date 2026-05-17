"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateWorkItem } from "@/actions/admin/work-items";
import {
  WORK_ENTITY_TYPES,
  WORK_ENTITY_LABEL,
  WORK_TYPES,
  WORK_TYPE_LABEL,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABEL,
  WORK_ASSIGNABLE_ROLES,
  WORK_ROLE_LABEL,
  type WorkEntityType,
  type WorkType,
  type WorkPriority,
  type WorkAssignableRole,
} from "@/lib/validators/work-item";

type AdminOption = { profile_id: string; name: string };

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/**
 * 0080 — collapsible "create a board entry" panel on /admin/board.
 * Manual creation: most work_items are opened by the additive
 * ensureWorkItemForEntity() hook, but staff can also raise a card by
 * hand (a hand-off that has no domain status-change behind it).
 */
export function CreateWorkItemPanel({ adminOptions }: { adminOptions: AdminOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [entityType, setEntityType] = useState<WorkEntityType>("forwarder");
  const [entityRef, setEntityRef]   = useState("");
  const [type, setType]             = useState<WorkType>("general");
  const [title, setTitle]           = useState("");
  const [note, setNote]             = useState("");
  const [role, setRole]             = useState<WorkAssignableRole>("ops");
  const [person, setPerson]         = useState("");
  const [priority, setPriority]     = useState<WorkPriority>("normal");
  const [dueAt, setDueAt]           = useState("");

  function reset() {
    setEntityRef(""); setTitle(""); setNote(""); setPerson(""); setDueAt("");
    setType("general"); setPriority("normal"); setRole("ops");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!entityRef.trim()) { setErr("กรุณาระบุรหัสงานต้นทาง (entity ref)"); return; }
    if (!title.trim())     { setErr("กรุณาระบุหัวข้องาน"); return; }

    startTransition(async () => {
      const res = await adminCreateWorkItem({
        entity_type:   entityType,
        entity_ref:    entityRef.trim(),
        type,
        title:         title.trim(),
        note:          note.trim() || undefined,
        assigned_role: role,
        assigned_to:   person || undefined,
        priority,
        due_at:        dueAt || undefined,
      });
      if (res.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-dashed border-primary-300 bg-primary-50/40 dark:bg-primary-950/20 px-4 py-2.5 text-sm font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 transition-colors"
      >
        + เพิ่มงานเข้ากระดาน
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-sm">เพิ่มงานใหม่เข้ากระดาน</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          ✕ ปิด
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{err}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">งานต้นทาง (ประเภท)<span className="text-red-600 ml-0.5">*</span></span>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value as WorkEntityType)} className={inputCls}>
            {WORK_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{WORK_ENTITY_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">รหัสงานต้นทาง<span className="text-red-600 ml-0.5">*</span></span>
          <input
            value={entityRef}
            onChange={(e) => setEntityRef(e.target.value)}
            className={`${inputCls} font-mono`}
            required
            placeholder="f_no / h_no / รหัสตู้ / uuid"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">หัวข้องาน<span className="text-red-600 ml-0.5">*</span></span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputCls}
          required
          maxLength={200}
          placeholder="เช่น ตรวจสลิปโอนเงินลูกค้า / ออกใบกำกับภาษีตู้ GZE..."
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ประเภทงาน</span>
          <select value={type} onChange={(e) => setType(e.target.value as WorkType)} className={inputCls}>
            {WORK_TYPES.map((t) => (
              <option key={t} value={t}>{WORK_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ความสำคัญ</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as WorkPriority)} className={inputCls}>
            {WORK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{WORK_PRIORITY_LABEL[p]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">มอบหมายให้แผนก<span className="text-red-600 ml-0.5">*</span></span>
          <select value={role} onChange={(e) => setRole(e.target.value as WorkAssignableRole)} className={inputCls}>
            {WORK_ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{WORK_ROLE_LABEL[r]}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">มอบหมายให้บุคคล (ไม่บังคับ)</span>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={inputCls}>
            <option value="">— ทั้งแผนก —</option>
            {adminOptions.map((a) => (
              <option key={a.profile_id} value={a.profile_id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">กำหนดเสร็จ (SLA — ไม่บังคับ)</span>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ (ไม่บังคับ)</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
          maxLength={2000}
          placeholder="รายละเอียดเพิ่มเติม / สิ่งที่ต้องส่งต่อ"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 text-white font-bold text-sm px-6 py-2.5 shadow-md hover:bg-primary-700 transition-all disabled:opacity-50"
      >
        {pending ? "กำลังเพิ่ม..." : "เพิ่มงานเข้ากระดาน"}
      </button>
    </form>
  );
}

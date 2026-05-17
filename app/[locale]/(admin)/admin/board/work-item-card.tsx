"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  adminAdvanceWorkItem,
  adminAssignWorkItem,
  adminSetWorkItemPriority,
} from "@/actions/admin/work-items";
import {
  WORK_STATUS_LABEL,
  WORK_STATUS_TRANSITIONS,
  WORK_TYPE_LABEL,
  WORK_ENTITY_LABEL,
  WORK_PRIORITIES,
  WORK_PRIORITY_LABEL,
  WORK_ASSIGNABLE_ROLES,
  WORK_ROLE_LABEL,
  type WorkStatus,
  type WorkType,
  type WorkEntityType,
  type WorkPriority,
  type WorkAssignableRole,
} from "@/lib/validators/work-item";

export type BoardItem = {
  id:            string;
  entity_type:   string;
  entity_ref:    string;
  type:          string;
  title:         string;
  note:          string | null;
  status:        WorkStatus;
  priority:      string;
  assigned_role: string;
  assigned_to:   string | null;
  assignee_name: string | null;
  due_at:        string | null;
  domain_href:   string;
  overdue:       boolean;
};

type AdminOption = { profile_id: string; name: string };

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high:   "bg-orange-500",
  normal: "bg-blue-400",
  low:    "bg-gray-300",
};

const selectCls =
  "rounded-md border border-border bg-white dark:bg-surface px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary-500/50";

export function WorkItemCard({
  item,
  adminOptions,
}: {
  item: BoardItem;
  adminOptions: AdminOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [editAssign, setEditAssign] = useState(false);
  const [role, setRole] = useState<WorkAssignableRole>(item.assigned_role as WorkAssignableRole);
  const [person, setPerson] = useState<string>(item.assigned_to ?? "");

  const nextStatuses = WORK_STATUS_TRANSITIONS[item.status] ?? [];

  function advance(to: WorkStatus) {
    setErr(null);
    startTransition(async () => {
      const res = await adminAdvanceWorkItem({ id: item.id, from: item.status, to });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  function saveAssign() {
    setErr(null);
    startTransition(async () => {
      const res = await adminAssignWorkItem({
        id: item.id,
        assigned_role: role,
        assigned_to: person || undefined,
      });
      if (res.ok) {
        setEditAssign(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function changePriority(p: WorkPriority) {
    setErr(null);
    startTransition(async () => {
      const res = await adminSetWorkItemPriority({ id: item.id, priority: p });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  const entityLabel = WORK_ENTITY_LABEL[item.entity_type as WorkEntityType] ?? item.entity_type;
  const typeLabel   = WORK_TYPE_LABEL[item.type as WorkType] ?? item.type;

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-surface p-3 shadow-sm space-y-2 ${
        item.overdue ? "border-red-300 ring-1 ring-red-200" : "border-border"
      }`}
    >
      {/* Top row: priority dot + type + entity */}
      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        <span
          className={`inline-block w-2 h-2 rounded-full ${PRIORITY_DOT[item.priority] ?? "bg-gray-300"}`}
          title={`ความสำคัญ: ${WORK_PRIORITY_LABEL[item.priority as WorkPriority] ?? item.priority}`}
        />
        <span className="rounded bg-surface-alt px-1.5 py-0.5 font-medium text-muted">{typeLabel}</span>
        <span className="rounded bg-primary-50 dark:bg-primary-950/40 px-1.5 py-0.5 font-medium text-primary-700 dark:text-primary-300">
          {entityLabel}
        </span>
        {item.overdue && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 font-bold text-red-700">⏰ เกินกำหนด</span>
        )}
      </div>

      {/* Title → domain detail page */}
      <Link
        href={item.domain_href}
        className="block text-sm font-semibold leading-snug hover:text-primary-600 transition-colors"
      >
        {item.title}
      </Link>

      {/* Domain ref + due date */}
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span className="font-mono">{item.entity_ref}</span>
        {item.due_at && (
          <span className={item.overdue ? "text-red-600 font-semibold" : ""}>
            ครบกำหนด {new Date(item.due_at).toLocaleDateString("th-TH", { day: "2-digit", month: "short" })}
          </span>
        )}
      </div>

      {item.note && (
        <p className="text-[11px] text-foreground/70 italic border-l-2 border-border pl-2">{item.note}</p>
      )}

      {/* Assignment row */}
      {editAssign ? (
        <div className="space-y-1.5 rounded-lg bg-surface-alt/50 p-2">
          <select value={role} onChange={(e) => setRole(e.target.value as WorkAssignableRole)} className={`${selectCls} w-full`}>
            {WORK_ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{WORK_ROLE_LABEL[r]}</option>
            ))}
          </select>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={`${selectCls} w-full`}>
            <option value="">— ทั้งแผนก (ไม่ระบุคน) —</option>
            {adminOptions.map((a) => (
              <option key={a.profile_id} value={a.profile_id}>{a.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={saveAssign}
              disabled={pending}
              className="flex-1 rounded-md bg-primary-600 text-white text-[11px] font-bold py-1 hover:bg-primary-700 disabled:opacity-50"
            >
              บันทึก
            </button>
            <button
              type="button"
              onClick={() => setEditAssign(false)}
              disabled={pending}
              className="rounded-md border border-border text-[11px] px-2 py-1 hover:bg-surface-alt"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted">
            👤 {WORK_ROLE_LABEL[item.assigned_role as WorkAssignableRole] ?? item.assigned_role}
            {item.assignee_name && <span className="text-foreground font-medium"> · {item.assignee_name}</span>}
          </span>
          {item.status !== "done" && item.status !== "cancelled" && (
            <button
              type="button"
              onClick={() => setEditAssign(true)}
              className="text-primary-600 hover:underline"
            >
              มอบหมาย
            </button>
          )}
        </div>
      )}

      {err && <p className="text-[10px] text-red-700">เกิดข้อผิดพลาด: {err}</p>}

      {/* Status advance + priority */}
      {nextStatuses.length > 0 && (
        <div className="pt-1 border-t border-border/60 space-y-1.5">
          <div className="flex flex-wrap gap-1">
            {nextStatuses.map((to) => (
              <button
                key={to}
                type="button"
                onClick={() => advance(to)}
                disabled={pending}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  to === "cancelled"
                    ? "border border-border text-muted hover:bg-surface-alt"
                    : "bg-primary-50 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 hover:bg-primary-100"
                }`}
              >
                → {WORK_STATUS_LABEL[to]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-muted">
            ความสำคัญ:
            <select
              value={item.priority}
              onChange={(e) => changePriority(e.target.value as WorkPriority)}
              disabled={pending}
              className={selectCls}
            >
              {WORK_PRIORITIES.map((p) => (
                <option key={p} value={p}>{WORK_PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

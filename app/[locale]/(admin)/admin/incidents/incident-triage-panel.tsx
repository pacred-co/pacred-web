"use client";

/**
 * IO-1 — incident triage action panel (design doc §6.5).
 *
 * The per-incident action row on /admin/incidents. Renders only the
 * lifecycle buttons legal from the incident's CURRENT status (the
 * INCIDENT_STATUS_TRANSITIONS whitelist), so a dev can never attempt
 * an illegal hop from the UI. Each button calls the matching Server
 * Action in actions/admin/incidents.ts.
 *
 * Page-level RBAC has already established the viewer is super/ops
 * before this is rendered; the actions self-gate again with withAdmin.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  acknowledgeIncident,
  markIncidentInProgress,
  resolveIncident,
  ignoreIncident,
  spawnFixWorkItem,
} from "@/actions/admin/incidents";
import {
  INCIDENT_STATUS_TRANSITIONS,
  type IncidentStatus,
} from "@/lib/validators/platform-incident";

type Props = {
  id:          string;
  status:      IncidentStatus;
  hasWorkItem: boolean;
};

const BTN_BASE =
  "min-h-[40px] rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50";

export function IncidentTriagePanel({ id, status, hasWorkItem }: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  const legal = INCIDENT_STATUS_TRANSITIONS[status] ?? [];

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(`✓ ${label}`);
        router.refresh();
      } else {
        setMsg(`✗ ${res.error ?? "เกิดข้อผิดพลาด"}`);
      }
    });
  }

  function handleResolve() {
    const note = window.prompt("บันทึกสิ่งที่แก้ไข (จำเป็น):");
    if (note == null) return;                // cancelled
    if (note.trim().length === 0) {
      setMsg("✗ ต้องระบุสิ่งที่แก้ไข");
      return;
    }
    run("ปิดงาน — แก้ไขแล้ว", () => resolveIncident({ id, note: note.trim() }));
  }

  function handleIgnore() {
    if (!window.confirm("ปิด incident นี้แบบ 'ไม่ใช่บั๊ก'?")) return;
    const note = window.prompt("เหตุผล (ไม่บังคับ):") ?? "";
    run("ปิดงาน — ไม่ใช่บั๊ก", () => ignoreIncident({ id, note }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {legal.includes("acknowledged") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("รับเรื่องแล้ว", () => acknowledgeIncident({ id }))}
          className={`${BTN_BASE} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}
        >
          รับเรื่อง
        </button>
      )}

      {legal.includes("in_progress") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("กำลังแก้ไข", () => markIncidentInProgress({ id }))}
          className={`${BTN_BASE} border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100`}
        >
          เริ่มแก้ไข
        </button>
      )}

      {legal.includes("resolved") && (
        <button
          type="button"
          disabled={pending}
          onClick={handleResolve}
          className={`${BTN_BASE} border border-green-300 bg-green-50 text-green-800 hover:bg-green-100`}
        >
          ปิด — แก้ไขแล้ว
        </button>
      )}

      {legal.includes("ignored") && (
        <button
          type="button"
          disabled={pending}
          onClick={handleIgnore}
          className={`${BTN_BASE} border border-border bg-surface-alt text-muted hover:bg-surface-alt/70`}
        >
          ปิด — ไม่ใช่บั๊ก
        </button>
      )}

      {legal.includes("open") && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run("เปิดใหม่", () => acknowledgeIncident({ id }))}
          className={`${BTN_BASE} border border-border bg-white text-foreground hover:bg-surface-alt`}
        >
          เปิดใหม่ (รับเรื่อง)
        </button>
      )}

      {/* Spawn a fix work_item — the §2.7 bridge. Available once triaged. */}
      {!hasWorkItem && (status === "acknowledged" || status === "in_progress") && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run("สร้าง work item แล้ว", async () => {
              const res = await spawnFixWorkItem({ id });
              return { ok: res.ok, error: res.ok ? undefined : res.error };
            })
          }
          className={`${BTN_BASE} border border-primary-300 bg-primary-50 text-primary-700 hover:bg-primary-100`}
        >
          + สร้าง work item
        </button>
      )}

      {pending && <span className="text-[10px] text-muted">กำลังบันทึก…</span>}
      {!pending && msg && <span className="text-[10px] text-muted">{msg}</span>}
    </div>
  );
}

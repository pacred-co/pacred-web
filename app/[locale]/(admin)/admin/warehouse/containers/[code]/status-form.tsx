"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetContainerStatus } from "@/actions/admin/warehouse";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const STATUS_FLOW = [
  { value: "packing",    label: "กำลังบรรจุ" },
  { value: "sealed",     label: "ปิดตู้แล้ว" },
  { value: "in_transit", label: "กำลังเดินทาง" },
  { value: "arrived",    label: "ถึงปลายทาง" },
  { value: "unloading",  label: "กำลังขนลง" },
  { value: "closed",     label: "ปิดงาน" },
] as const;

type StatusValue = (typeof STATUS_FLOW)[number]["value"];

export function ContainerStatusForm({
  containerId,
  currentStatus,
}: {
  containerId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(currentStatus);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const currentIdx = STATUS_FLOW.findIndex((s) => s.value === status);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;

  function setTo(value: StatusValue) {
    setMsg(null); setErr(null);
    startTransition(async () => {
      const res = await adminSetContainerStatus({
        container_id: containerId,
        status:       value,
        note:         note.trim() || undefined,
      });
      if (res.ok) {
        setStatus(value);
        setNote("");
        setMsg(`สถานะตู้เปลี่ยนเป็น "${STATUS_FLOW.find((s) => s.value === value)?.label ?? value}"`);
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else setErr(res.error);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-sm">เปลี่ยนสถานะตู้</h3>

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      {/* Status flow pill row + next button */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {STATUS_FLOW.map((s, i) => {
            const isCurrent = s.value === status;
            const isPast    = i < currentIdx;
            return (
              <span
                key={s.value}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  isCurrent
                    ? "bg-primary-500 text-white border-primary-500"
                    : isPast
                      ? "bg-surface-alt text-muted border-border line-through"
                      : "text-muted border-border"
                }`}
              >
                {s.label}
              </span>
            );
          })}
        </div>
        {nextStatus && (
          <button
            type="button"
            onClick={() => setTo(nextStatus.value)}
            disabled={pending}
            className="rounded-lg bg-primary-500 text-white px-3 py-1.5 text-xs font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            → {nextStatus.label}
          </button>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">เปลี่ยนตรง</span>
        <select
          value={status}
          onChange={(e) => setTo(e.target.value as StatusValue)}
          className={inputCls}
          disabled={pending}
        >
          {STATUS_FLOW.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">หมายเหตุ (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
          placeholder="เช่น รอเรือมาถึงท่า / ปัญหาศุลกากร"
          disabled={pending}
        />
        <span className="text-[11px] text-muted">หมายเหตุจะถูกบันทึกใน container_status_history</span>
      </label>
    </div>
  );
}

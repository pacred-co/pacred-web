"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSetContainerCloseAt } from "@/actions/admin/warehouse";

// V-C3 — inline editor for cargo_containers.close_at on the container
// detail sidebar. Empty submit clears (NULL in DB).

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/** ISO timestamp → "YYYY-MM-DDTHH:mm" suitable for <input type="datetime-local"> */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CloseAtForm({
  containerId,
  currentCloseAt,
}: {
  containerId:    string;
  currentCloseAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(isoToLocalInput(currentCloseAt));
  const [err, setErr]     = useState<string | null>(null);
  const [msg, setMsg]     = useState<string | null>(null);

  const currentInputForm = isoToLocalInput(currentCloseAt);
  const dirty            = draft !== currentInputForm;
  const isClosed         = currentCloseAt != null && new Date(currentCloseAt).getTime() < Date.now();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const value = draft ? new Date(draft).toISOString() : "";
    startTransition(async () => {
      const res = await adminSetContainerCloseAt({
        container_id: containerId,
        close_at:     value,
      });
      if (res.ok) {
        setMsg(value ? "✓ ตั้งเวลาตัดตู้แล้ว" : "✓ ล้างเวลาตัดตู้แล้ว (ไม่จำกัด)");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">⏰ ตัดตู้ (close_at)</h3>
        {isClosed && (
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
            ปิดรับแล้ว
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted">
        หลังเวลานี้ ระบบจะปฏิเสธการเพิ่ม shipment ใหม่เข้าตู้นี้
      </p>

      <label className="block space-y-1">
        <span className="text-xs font-medium">วันเวลา (เวลาท้องถิ่นในเครื่อง)</span>
        <input
          type="datetime-local"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className={inputCls}
          disabled={pending}
        />
      </label>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !dirty}
          className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        {(draft || currentInputForm) && (
          <button
            type="button"
            onClick={() => setDraft("")}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            ล้างค่า
          </button>
        )}
      </div>
    </form>
  );
}

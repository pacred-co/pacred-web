"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { logLeadCall } from "@/actions/admin/leads";
import type { LeadCallStatus } from "@/actions/admin/leads-types";

// Thai labels for the 5 call-outcome states (CEO §6).
const STATUS_LABEL: Record<LeadCallStatus, string> = {
  called: "ติดต่อแล้ว",
  no_answer: "ไม่รับสาย",
  closed: "ปิดการขาย",
  callback: "นัดโทรกลับ",
  not_interested: "ไม่สนใจ",
};

const STATUS_BADGE: Record<LeadCallStatus, string> = {
  called: "bg-blue-100 text-blue-700",
  no_answer: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
  callback: "bg-purple-100 text-purple-700",
  not_interested: "bg-gray-200 text-gray-600",
};

/** Status pill rendered in the table for the lead's current call-state. */
export function CallStatusBadge({ status }: { status: LeadCallStatus | null }) {
  if (!status) {
    return <span className="text-xs text-muted">ยังไม่ติดต่อ</span>;
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const QUICK: { value: LeadCallStatus; label: string }[] = [
  { value: "called", label: "ติดต่อแล้ว" },
  { value: "no_answer", label: "ไม่รับ" },
  { value: "callback", label: "โทรกลับ" },
  { value: "closed", label: "ปิดการขาย" },
  { value: "not_interested", label: "ไม่สนใจ" },
];

/**
 * Per-row quick-action: log a call outcome (+ optional note) against a lead.
 * Refreshes the queue on success so the new call-state shows immediately.
 */
export function LeadCallAction({ userid }: { userid: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function log(status: LeadCallStatus) {
    setErr(null);
    startTransition(async () => {
      const res = await logLeadCall({ userid, status, note: note.trim() || undefined });
      if (res.ok) {
        setDone(true);
        setOpen(false);
        setNote("");
        router.refresh();
        // brief confirmation flash
        setTimeout(() => setDone(false), 1500);
      } else {
        setErr(res.error ?? "เกิดข้อผิดพลาด");
      }
    });
  }

  return (
    <div className="space-y-1">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100 min-h-[44px] sm:min-h-0 sm:py-1"
        >
          {done ? "✓ บันทึกแล้ว" : "📞 บันทึกผลโทร"}
        </button>
      ) : (
        <div className="space-y-1.5 rounded-lg border border-border bg-white dark:bg-surface p-2 min-w-[180px]">
          <div className="flex flex-wrap gap-1">
            {QUICK.map((s) => (
              <button
                key={s.value}
                type="button"
                disabled={pending}
                onClick={() => log(s.value)}
                className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-surface-alt disabled:opacity-50 min-h-[40px] sm:min-h-0 sm:py-1"
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="โน้ต (ถ้ามี)"
            className="w-full rounded-md border border-border px-2 py-1.5 text-xs"
          />
          {err && <div className="text-[10px] text-red-700">{err}</div>}
          <button
            type="button"
            onClick={() => { setOpen(false); setErr(null); }}
            className="text-[10px] text-muted hover:underline"
          >
            ยกเลิก
          </button>
        </div>
      )}
    </div>
  );
}

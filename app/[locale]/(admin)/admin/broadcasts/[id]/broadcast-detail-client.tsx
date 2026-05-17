"use client";

/**
 * V-G3 — admin client for broadcast status flips.
 *
 * Status transitions:
 *   draft     → send-now (immediate fan-out) · schedule (set scheduled_for) · cancel
 *   scheduled → send-now (override) · cancel
 *   sending   → read-only (in-flight)
 *   sent      → read-only (terminal)
 *   cancelled → read-only (terminal)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminScheduleBroadcast, adminSendBroadcastNow, adminCancelBroadcast,
} from "@/actions/admin/broadcasts";
import { type BroadcastStatus } from "@/lib/validators/broadcast";

type Props = {
  id:     string;
  status: BroadcastStatus;
};

function plusHoursIso(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hours);
  // Trim ms for input[type=datetime-local] friendliness.
  return d.toISOString().slice(0, 16);
}

export function BroadcastDetailClient({ id, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt,   setScheduleAt]   = useState(plusHoursIso(1));

  const [showCancel,    setShowCancel]    = useState(false);
  const [cancelReason,  setCancelReason]  = useState("");

  const [showConfirmSend, setShowConfirmSend] = useState(false);

  function call(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error ?? "unknown"));
    });
  }

  // Terminal states — read-only.
  if (status === "sent" || status === "cancelled" || status === "sending") {
    return (
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 text-xs text-muted italic">
        สถานะ <strong>{status}</strong> — read-only
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-3">
      <h2 className="font-bold text-sm">การดำเนินการ</h2>

      <div className="flex flex-wrap gap-2">
        {!showConfirmSend && !showSchedule && !showCancel && (
          <>
            <button
              type="button"
              onClick={() => setShowConfirmSend(true)}
              disabled={pending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
            >
              📨 ส่งทันที
            </button>
            {status === "draft" && (
              <button
                type="button"
                onClick={() => setShowSchedule(true)}
                disabled={pending}
                className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm hover:bg-amber-50 disabled:opacity-50"
              >
                ⏰ กำหนดเวลา
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCancel(true)}
              disabled={pending}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              ✗ ยกเลิก
            </button>
          </>
        )}

        {showConfirmSend && (
          <div className="rounded-lg border border-primary-300 bg-white p-4 space-y-3 w-full">
            <p className="text-sm font-bold text-primary-900">⚠️ ยืนยันส่งทันที?</p>
            <p className="text-xs text-muted">
              ระบบจะสร้าง notification ใน `notifications` table สำหรับลูกค้าทุกคนในกลุ่มเป้าหมาย —
              <strong> ยกเลิกไม่ได้หลังส่ง</strong> (จะต้องสร้าง broadcast ใหม่เพื่อบอกว่า &quot;ผิดพลาด&quot;)
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => call(() => adminSendBroadcastNow({ id }))}
                disabled={pending}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {pending ? "กำลังส่ง..." : "✓ ส่งเลย"}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmSend(false)}
                disabled={pending}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {showSchedule && (
          <div className="rounded-lg border border-amber-300 bg-white p-4 space-y-3 w-full">
            <p className="text-sm font-bold text-amber-900">⏰ กำหนดเวลาส่ง</p>
            <p className="text-xs text-muted">
              ⚠️ V1 ยังไม่มี cron — ตอนนี้ admin ต้องเข้ามา &quot;ส่งทันที&quot; ตามเวลาที่กำหนดเอง.
              V-G3.1 จะมี cron auto-fire.
            </p>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  // Convert datetime-local to ISO with timezone.
                  const iso = new Date(scheduleAt).toISOString();
                  call(() => adminScheduleBroadcast({ id, scheduled_for: iso }));
                }}
                disabled={pending || !scheduleAt}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                ✓ ตั้งเวลา
              </button>
              <button
                type="button"
                onClick={() => setShowSchedule(false)}
                disabled={pending}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {showCancel && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 space-y-2 w-full">
            <p className="text-sm font-bold text-red-900">เหตุผลที่ยกเลิก (≥3 ตัวอักษร)</p>
            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={500}
              placeholder="เช่น เนื้อหาผิด, ลูกค้าผิดกลุ่ม, เลื่อนสงกรานต์..."
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => call(() => adminCancelBroadcast({ id, cancelled_reason: cancelReason }))}
                disabled={pending || cancelReason.trim().length < 3}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                ✓ ยกเลิก broadcast
              </button>
              <button
                type="button"
                onClick={() => { setShowCancel(false); setCancelReason(""); }}
                disabled={pending}
                className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt disabled:opacity-50"
              >
                ปิด
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed"))    return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("audience_resolve_failed")) return `หา audience ไม่สำเร็จ: ${code}`;
  if (code.startsWith("lock_failed"))      return `ล็อก status ไม่สำเร็จ: ${code}`;
  if (code.startsWith("bad_status"))       return `สถานะไม่ถูกต้อง: ${code}`;
  if (code.startsWith("cannot_cancel_status")) return `ยกเลิกไม่ได้ (${code})`;
  switch (code) {
    case "not_found":  return "ไม่พบ broadcast";
    default:           return code;
  }
}

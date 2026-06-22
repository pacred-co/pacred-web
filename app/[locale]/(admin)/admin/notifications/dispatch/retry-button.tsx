"use client";

import { useState, useTransition } from "react";
import { confirm } from "@/components/ui/confirm";
import { retryNotificationDispatch } from "@/actions/admin/notifications";

/**
 * Client-side retry button for a failed/timed-out notification dispatch.
 *
 * Calls the `retryNotificationDispatch` Server Action which resets the
 * row so the dispatch cron re-attempts on its next tick (~2 min).
 *
 * Confirms before firing (a stray click could re-queue a perma-failed
 * row that's permafailed for a real reason — e.g. revoked token).
 */
export function RetryDispatchButton({ notificationId }: { notificationId: string }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    | { kind: "ok" }
    | { kind: "err"; msg: string }
    | null
  >(null);

  const handleClick = async () => {
    if (!(await confirm("ส่งใหม่? cron จะลองส่งซ้ำในรอบถัดไป (~2 นาที)."))) return;
    startTransition(async () => {
      const res = await retryNotificationDispatch(notificationId);
      if (res.ok) setFeedback({ kind: "ok" });
      else        setFeedback({ kind: "err", msg: res.error });
    });
  };

  if (feedback?.kind === "ok") {
    return (
      <span className="shrink-0 rounded-lg bg-green-100 text-green-700 px-2.5 py-1 text-[11px] font-medium">
        ✓ retry queued
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-[11px] font-medium hover:bg-amber-100 disabled:opacity-50"
      >
        {pending ? "..." : "↻ retry"}
      </button>
      {feedback?.kind === "err" && (
        <span className="text-[11px] text-red-600 font-mono">{feedback.msg}</span>
      )}
    </div>
  );
}

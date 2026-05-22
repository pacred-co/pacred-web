"use client";

/**
 * Action buttons for one driver-work card. Mobile-first — buttons are
 * full-width on small screens, side-by-side from sm: up. Tap targets are
 * ≥ 44px (per docs/mobile-first-playbook.md).
 *
 * The "ส่งไม่ได้" path opens a tiny inline prompt() for the reason —
 * a richer modal lives behind Wave 11 (when we also wire photo upload).
 */

import { useState, useTransition } from "react";
import {
  markDriverItemLoaded,
  markDriverItemDelivered,
  markDriverItemFailed,
} from "@/actions/admin/driver-work";

type Props = {
  itemId:   number;
  /** legacy fdistatus value — '' / '1' / '2' / '3' */
  status:   string;
};

export function DriverItemActionButtons({ itemId, status }: Props) {
  const [pending, start] = useTransition();
  const [err, setErr]    = useState<string | null>(null);

  const showLoad    = status === "";        // not yet loaded
  const showDeliver = status === "1";       // loaded, can be delivered
  const showFail    = status === "" || status === "1"; // can fail any pre-delivery state

  function runLoad() {
    setErr(null);
    start(async () => {
      const res = await markDriverItemLoaded(itemId);
      if (!res.ok) setErr(res.error);
    });
  }
  function runDeliver() {
    setErr(null);
    start(async () => {
      const res = await markDriverItemDelivered(itemId);
      if (!res.ok) setErr(res.error);
    });
  }
  function runFail() {
    setErr(null);
    // Lightweight inline prompt — Wave 11 swaps for a proper modal.
    const reason = typeof window !== "undefined"
      ? window.prompt("เหตุผลที่ส่งไม่ได้?")
      : null;
    if (!reason || !reason.trim()) return;
    start(async () => {
      const res = await markDriverItemFailed({ itemId, reason: reason.trim() });
      if (!res.ok) setErr(res.error);
    });
  }

  // Already terminal (delivered or failed) — show nothing actionable.
  if (status === "2" || status === "3") return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        {showLoad && (
          <button
            type="button"
            onClick={runLoad}
            disabled={pending}
            className="flex-1 rounded-xl bg-blue-600 text-white font-semibold text-base px-4 py-3 min-h-[48px] hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60"
          >
            📦 ขึ้นรถ
          </button>
        )}
        {showDeliver && (
          <button
            type="button"
            onClick={runDeliver}
            disabled={pending}
            className="flex-1 rounded-xl bg-green-600 text-white font-semibold text-base px-4 py-3 min-h-[48px] hover:bg-green-700 active:bg-green-800 disabled:opacity-60"
          >
            ✅ ส่งสำเร็จ
          </button>
        )}
        {showFail && (
          <button
            type="button"
            onClick={runFail}
            disabled={pending}
            className="rounded-xl border border-red-300 bg-white text-red-700 font-semibold text-base px-4 py-3 min-h-[48px] hover:bg-red-50 active:bg-red-100 disabled:opacity-60"
          >
            ⚠️ ส่งไม่ได้
          </button>
        )}
      </div>
      {err && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5">
          {err}
        </p>
      )}
    </div>
  );
}

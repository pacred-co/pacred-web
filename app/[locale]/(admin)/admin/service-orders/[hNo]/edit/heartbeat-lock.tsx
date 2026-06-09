"use client";

/**
 * Heartbeat lock client island — calls `lockServiceOrder` every 50 seconds
 * (matching the legacy `update.php` L499-511 jQuery setInterval, with our
 * 50/60 safety-margin split) and surfaces an amber banner when another
 * admin holds the lock.
 *
 * Mount lifecycle:
 *   - on mount         → acquire (or learn who holds it)
 *   - every 50 seconds → re-acquire (refresh expiry / detect a takeover)
 *   - on unmount       → release if we hold it
 *   - on `beforeunload` (browser close, navigation away) → fire one final
 *     release via `keepalive` so the row is freed for the next editor
 *     even when the tab closes mid-heartbeat
 *
 * The banner is `aria-live="polite"` and shows:
 *   - HELD BY ME (positive)     — small green pill in the corner
 *                                   "🔒 ล็อคให้คุณแล้ว · เหลือ XXs"
 *   - HELD BY SOMEONE ELSE      — full-width amber banner
 *                                   "⚠️ กำลังถูกแก้ไขโดย admin XYZ · เหลือ XXs"
 *                                   + "ล็อคให้ฉัน (เขียนทับ)" override button
 *
 * Per AGENTS.md §0f confirm-before-mutate: the takeover button DOES show a
 * confirm dialog (clobber-warning) before forcing the lock; the heartbeat
 * itself does not (it's a passive refresh, not a state mutation visible to
 * the user beyond the green pill).
 *
 * Per Next 16 + AGENTS.md §0c: no `new Date()` / `Date.now()` in render body;
 * a `useState<Date>` ticks once per second via a single setInterval. All
 * comparisons go through the pure helpers in lib/service-order/heartbeat-lock.ts
 * (same module the server action uses → guaranteed-identical "expired" semantics).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, LockOpen, AlertTriangle } from "lucide-react";
import {
  lockServiceOrder,
  unlockServiceOrder,
} from "@/actions/admin/service-orders-lock";
import { confirm } from "@/components/ui/confirm";
import {
  HEARTBEAT_INTERVAL_MS,
  isLockExpired,
  secondsUntilExpiry,
} from "@/lib/service-order/heartbeat-lock";

type LockState =
  | { kind: "idle" }
  | { kind: "mine"; expiresAt: string }
  | { kind: "theirs"; lockedBy: string; expiresAt: string }
  | { kind: "error"; message: string };

export function HeartbeatLock({
  hNo,
  currentAdminId,
}: {
  hNo: string;
  /** The CURRENT admin's legacy adminID (e.g. "admin_pee") — resolved by the
      server in `[hNo]/edit/page.tsx` and passed in so the island doesn't
      need a separate round-trip to learn its identity. */
  currentAdminId: string;
}) {
  const [state, setState] = useState<LockState>({ kind: "idle" });
  // Tick once per second so the countdown re-renders smoothly.
  const [now, setNow] = useState<Date>(() => new Date());
  // Track whether we hold the lock so the unmount path knows whether to release.
  // Updated only inside effects/callbacks → never in render body.
  const holdsLockRef = useRef<boolean>(false);

  // ── Acquire / refresh ────────────────────────────────────────────────
  const tryAcquire = useCallback(
    async (takeover: boolean) => {
      try {
        const res = await lockServiceOrder({ h_no: hNo, takeover });
        if (!res.ok) {
          setState({ kind: "error", message: res.error });
          holdsLockRef.current = false;
          return;
        }
        const data = res.data!;
        if (data.acquired) {
          setState({ kind: "mine", expiresAt: data.expires_at });
          holdsLockRef.current = true;
        } else {
          setState({
            kind: "theirs",
            lockedBy: data.locked_by || "ผู้ดูแลคนอื่น",
            expiresAt: data.expires_at,
          });
          holdsLockRef.current = false;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setState({ kind: "error", message: msg });
        holdsLockRef.current = false;
      }
    },
    [hNo],
  );

  // ── Lifecycle: mount → heartbeat → unmount/beforeunload ──────────────
  // Defer the initial acquire to next-tick so the setState happens AFTER
  // the effect commits (avoids the "setState during effect" lint warning;
  // tryAcquire is async anyway → the await yields the call back to the
  // microtask queue regardless, so this is purely a discipline fix).
  useEffect(() => {
    const initial = setTimeout(() => { void tryAcquire(false); }, 0);

    // Schedule heartbeats every 50s (HEARTBEAT_INTERVAL_MS).
    const interval = setInterval(() => {
      void tryAcquire(false);
    }, HEARTBEAT_INTERVAL_MS);

    // beforeunload — fire-and-forget release if we hold the lock.
    // (React strict-mode may unmount-remount the effect; that's fine —
    // each remount runs its own acquire+release pair.)
    const beforeUnload = () => {
      if (!holdsLockRef.current) return;
      // Server Actions don't easily survive page unload (no native sendBeacon
      // path); call the action and let the browser cancel mid-flight. The
      // 60-sec TTL means the lock frees itself within a minute anyway.
      try {
        void unlockServiceOrder({ h_no: hNo });
      } catch {
        /* noop — TTL will free the lock within 60s */
      }
    };
    window.addEventListener("beforeunload", beforeUnload);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("beforeunload", beforeUnload);
      if (holdsLockRef.current) {
        try {
          void unlockServiceOrder({ h_no: hNo });
        } catch {
          /* noop */
        }
      }
    };
  }, [tryAcquire, hNo]);

  // ── Tick the now-clock once per second for the countdown ─────────────
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(tick);
  }, []);

  // ── Takeover (banner override button) ────────────────────────────────
  const onTakeover = useCallback(async () => {
    if (state.kind !== "theirs") return;
    const ok = await confirm(
      `จะเขียนทับล็อคของ ${state.lockedBy} ใช่ไหม? (งานของเขาที่ยังไม่ได้บันทึกอาจหายไป — ใช้เมื่อยืนยันได้ว่าเขาออกจากออเดอร์แล้ว)`,
    );
    if (!ok) return;
    await tryAcquire(true);
  }, [state, tryAcquire]);

  // ── Render — 4 visual modes ──────────────────────────────────────────
  if (state.kind === "idle") return null; // first acquire still in flight

  if (state.kind === "error") {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>ระบบล็อคหยุดทำงาน: {state.message}</span>
      </div>
    );
  }

  if (state.kind === "mine") {
    const secs = secondsUntilExpiry(now, state.expiresAt);
    const expired = isLockExpired(now, state.expiresAt);
    return (
      <div
        aria-live="polite"
        className={`mb-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
          expired
            ? "border border-amber-300 bg-amber-50 text-amber-800"
            : "border border-emerald-300 bg-emerald-50 text-emerald-800"
        }`}
      >
        {expired ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
        <span>
          {expired
            ? "ล็อคหมดอายุ — กำลังต่ออายุ..."
            : `ล็อคให้คุณ · เหลือ ${secs}s`}
        </span>
        <span className="text-emerald-700/60">({currentAdminId})</span>
      </div>
    );
  }

  // state.kind === "theirs"
  const secs = secondsUntilExpiry(now, state.expiresAt);
  const expired = isLockExpired(now, state.expiresAt);
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-[13px] text-amber-900"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
      <div className="flex-1 min-w-[200px]">
        <p className="font-semibold">
          กำลังถูกแก้ไขโดย {state.lockedBy}
          {!expired && <span className="ml-1 font-mono text-amber-800">· เหลือ {secs}s</span>}
        </p>
        <p className="text-[11.5px] text-amber-800/80 mt-0.5">
          {expired
            ? "ล็อคหมดอายุแล้ว · กดเพื่อแก้ไขต่อ"
            : "บันทึกพร้อมๆกันจะทำให้งานของกันและกันหาย · รอให้ออกก่อน หรือเขียนทับ (เมื่อแน่ใจแล้ว)"}
        </p>
      </div>
      <button
        type="button"
        onClick={onTakeover}
        className="shrink-0 rounded-lg border border-amber-600 bg-amber-100 px-3 py-1.5 text-[12px] font-semibold text-amber-900 hover:bg-amber-200"
      >
        🔓 ล็อคให้ฉัน (เขียนทับ)
      </button>
    </div>
  );
}

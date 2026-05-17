"use client";

/**
 * G-4 · Impersonation countdown — shows "เหลือ ~N นาที" inside the banner.
 *
 * Lives in its own client child because Server Components can't call
 * `Date.now()` during render (React 19 purity rule). Ticks once per
 * minute so the displayed value drifts at most ~60 seconds from real
 * time. Hidden on small screens to keep the banner compact.
 *
 * Implementation note: we use `useSyncExternalStore` to subscribe to a
 * minute-tick clock — this pattern is the canonical "render the current
 * time without setState-in-effect or hydration mismatch" recipe.
 *   - SSR snapshot returns `null` (renders no-time placeholder)
 *   - client snapshot returns the real Date.now() and re-renders on tick
 */

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  const t = setInterval(onChange, 60_000);
  return () => clearInterval(t);
}

function clientSnapshot(): number {
  return Date.now();
}

function serverSnapshot(): null {
  return null;
}

export function ImpersonationCountdown({ expiresAt }: { expiresAt: string }) {
  // useSyncExternalStore takes server snapshot to keep hydration stable.
  // First client render also returns the server snapshot (null) to match;
  // then subscribe() fires, the store re-reads via clientSnapshot(), and
  // we re-render with the real time.
  const now = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  if (now === null) {
    return (
      <span className="hidden sm:inline text-xs opacity-90">
        · เขียนข้อมูลไม่ได้
      </span>
    );
  }

  const expMs = Date.parse(expiresAt);
  const remainingMin = Math.max(0, Math.round((expMs - now) / 60_000));

  return (
    <span className="hidden sm:inline text-xs opacity-90">
      · เหลือ ~{remainingMin} นาที · เขียนข้อมูลไม่ได้
    </span>
  );
}

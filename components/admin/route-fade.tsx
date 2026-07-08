"use client";

import { usePathname } from "@/i18n/navigation";

/**
 * Route-keyed content fade (2026-07-08 motion system). Re-keying a wrapper div
 * on `usePathname()` replays the `app-fade-in` keyframe every SPA navigation,
 * so switching admin tabs/routes fades the new content in. Pure presentation —
 * no data/behavior change. Honours prefers-reduced-motion via globals.css.
 */
export function RouteFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-fade-in">
      {children}
    </div>
  );
}

"use client";

import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ variant = "default" }: { variant?: "default" | "on-primary" }) {
  // `resolvedTheme` is the actually-painted value and matches the
  // head-script on first render, so the first click always flips for real
  // (no double-click). No `mounted` guard needed — server and client both
  // start light, so there is no theme mismatch to defer past.
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const styles =
    variant === "on-primary"
      ? "border-white/30 text-white hover:bg-white/20"
      : "border-border bg-surface hover:bg-surface-alt";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      suppressHydrationWarning
      aria-label="Toggle theme"
      className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${styles}`}
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}

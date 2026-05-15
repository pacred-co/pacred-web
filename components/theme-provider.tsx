"use client";

/**
 * Custom theme provider — replaces next-themes to avoid React 19's
 * "script tag inside component" warning.
 *
 * ── Product decision (เดฟ, 2026-05-16): ALWAYS-LIGHT-ON-OPEN ──────────
 * The site must open in the light (white) theme on every fresh page load
 * — no OS `prefers-color-scheme` detection, no cross-session persistence.
 * The head-script (THEME_INIT_SCRIPT) unconditionally paints `light`
 * before first paint, and this provider starts in `light` to match it
 * exactly (no head-script ↔ React desync → no double-click on the toggle).
 *
 * Users CAN still switch to dark within a session via <ThemeToggle/>;
 * the choice lives in React state and survives soft navigations, but a
 * hard reload resets to light. This keeps the first impression
 * consistent regardless of the visitor's OS dark-mode setting.
 *
 *   const { theme, resolvedTheme, setTheme } = useTheme();
 *   setTheme("dark" | "light" | "system");
 *
 * `resolvedTheme` is the computed value (never "system"); read it when
 * you need to know what is actually painted.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
};

const Ctx = createContext<ThemeContextValue | null>(null);

function resolveTheme(t: Theme): ResolvedTheme {
  if (t !== "system") return t;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.remove("light", "dark");
  el.classList.add(resolved);
  el.style.colorScheme = resolved;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  // Start exactly where the head-script left things: light. Server and
  // client first render therefore agree — no flash, no desync, and the
  // <ThemeToggle/> reads the true state on its very first click.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(defaultTheme),
  );

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // Follow OS theme changes only while the user has explicitly opted into
  // "system" (not the default path — kept for API completeness).
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function handler(e: MediaQueryListEvent) {
      const next: ResolvedTheme = e.matches ? "dark" : "light";
      setResolvedTheme(next);
      applyTheme(next);
    }
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <Ctx.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Match next-themes's permissive behaviour — return a no-op shape
    // so consumers (e.g. ThemeToggle in error states) don't crash.
    return {
      theme: "light",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return ctx;
}

/**
 * Stringified head-script that runs synchronously before React hydrates.
 * Unconditionally paints the LIGHT theme so the site always opens white,
 * regardless of OS dark-mode or any prior in-session toggle. Keep in sync
 * with the ThemeProvider default ("light") — both must agree or the
 * toggle's first click becomes a no-op.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var d=document.documentElement;d.classList.remove('dark');d.classList.add('light');d.style.colorScheme='light';}catch(e){}})();`;

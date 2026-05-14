"use client";

/**
 * Custom theme provider — replaces next-themes to avoid React 19's
 * "script tag inside component" warning.
 *
 * The actual theme-detection script lives in <head> of the Server
 * Component RootLayout (app/layout.tsx) — it runs synchronously on
 * initial page load and adds the right class before paint, eliminating
 * FOUC. This provider just manages React state for in-app toggling +
 * exposes the same minimal API the codebase used from next-themes:
 *
 *   const { theme, setTheme } = useTheme();
 *   setTheme("dark" | "light" | "system");
 *
 * If you need the resolved (computed) theme value (when theme = "system"),
 * read `resolvedTheme` instead of `theme`.
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

const STORAGE_KEY = "pacred-theme";
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
  defaultTheme = "system",
}: {
  children: ReactNode;
  defaultTheme?: Theme;
}) {
  // Initial state matches what the head-script applied — read it back
  // from documentElement so React doesn't fight the pre-paint result.
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  // Hydrate once on mount: read localStorage, sync state with what's
  // already painted by THEME_INIT_SCRIPT, attach listeners.
  // The setState-in-effect pattern is intentional here — we must defer
  // localStorage read to after hydration to avoid SSR/CSR mismatch.
  useEffect(() => {
    let stored: Theme | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {
      /* localStorage blocked (private mode) — fall back to default */
    }
    const next = stored ?? defaultTheme;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(next);
    setResolvedTheme(resolveTheme(next));
    // Don't re-apply class — head-script already did it. Avoids flash.
  }, [defaultTheme]);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* swallow */
    }
    setThemeState(t);
    const resolved = resolveTheme(t);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  // Follow OS theme changes when user has chosen "system"
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
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return ctx;
}

/**
 * Stringified head-script that runs synchronously before React hydrates.
 * Pre-paints the theme class so there is no flash of wrong theme. Keep
 * the storage key in sync with STORAGE_KEY above.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k)||'system';if(s==='system'){s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(s);document.documentElement.style.colorScheme=s;}catch(e){}})();`;

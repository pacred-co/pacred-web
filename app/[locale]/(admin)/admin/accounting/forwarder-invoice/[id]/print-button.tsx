"use client";

/**
 * PrintButton — client wrapper that calls window.print(). Used by the
 * invoice detail page so the server component can render most of the
 * markup statically.
 *
 * Agent F3 · E2E LOOP FIX batch (2026-05-29).
 */

import type { ReactNode } from "react";

export default function PrintButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
    >
      {children}
    </button>
  );
}

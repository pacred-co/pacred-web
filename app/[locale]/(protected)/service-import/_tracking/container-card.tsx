"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Collapsible container card — matches ปอน's 2026-05-28 mockup. Header
 * (icon · container no + size · route · 4 metrics · collapse button)
 * stays visible; items grid below toggles open/closed.
 *
 * Header and items are passed in as children so the Server Component
 * builds the markup; this file is only the open/close interactivity.
 */
export function ContainerCard({
  header,
  items,
  defaultOpen = true,
}: {
  header: ReactNode;
  items: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className="mx-2 md:mx-4 mb-4 border border-border rounded-2xl bg-white dark:bg-surface shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left hover:bg-surface-alt/40 transition-colors"
      >
        <div className="flex items-center gap-3 md:gap-5 px-4 md:px-6 py-4 md:py-5">
          <div className="flex-1 min-w-0">{header}</div>
          <span className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-surface-alt grid place-items-center text-red-600 shrink-0">
            {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </span>
        </div>
      </button>
      {open && <div className="px-3 md:px-5 pb-4 md:pb-6">{items}</div>}
    </article>
  );
}

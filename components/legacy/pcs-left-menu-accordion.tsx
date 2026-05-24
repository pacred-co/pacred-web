"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Legacy PCS Cargo customer-portal — a single accordion section in the left
 * sidebar (top-level icon-row that expands into a sub-list of `<Link>`s).
 * The legacy markup used a jQuery `.has-sub` accordion; here we replace
 * that with a tiny `useState` toggle + a rotating chevron. The parent passes
 * the already-built sub-link list as `children`, so the Server-Component
 * `<Link>` tree (with the next-intl `Link` + correct hrefs) is unaffected.
 *
 * The icon image keeps `className="pcs-icon"` so the grayscale→color
 * `legacy-overrides.css` filter still latches on hover/active.
 */
export function PcsLeftMenuAccordion({
  icon,
  label,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: string;
  label: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`nav-item ${open ? "open" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-gray-50 active:bg-gray-100"
      >
        <img src={icon} alt="" className="pcs-icon h-6 w-6" />
        <span>{label}</span>
        {badge}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? <div className="py-1">{children}</div> : null}
    </div>
  );
}

"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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

/**
 * 2nd-level accordion — nests inside a `PcsLeftMenuAccordion` sub-list.
 * Matches the visual weight of `SubLink` (pl-12, text-[13px], muted) but is
 * a clickable toggle that reveals deeper `SubSubLink` children. The
 * chevron-right rotates 90° to point down when open.
 *
 * Per ปอน 2026-05-28 — used for "บริการฝากนำเข้า → LCL / FCL → รถ/เรือ/แอร์".
 */
export function PcsLeftMenuSubAccordion({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 pl-12 pr-4 py-2 text-left text-[13px] text-muted hover:text-foreground hover:bg-gray-50"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 opacity-60 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        />
        <span className="flex-1">{label}</span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}

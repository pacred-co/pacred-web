"use client";

/* eslint-disable @next/next/no-img-element */
import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Accordion GROUP — shares "which section is open" across all top-level sidebar
 * accordions so only ONE is open at a time (owner 2026-06-05: opening a new
 * section auto-collapses the previous one — "กดอันใหม่ ดรอปดาวน์เก่าเก็บเอง · ไม่รกเกะกะตา").
 *
 * The provider is a tiny client component; the server-rendered <nav> tree is
 * passed through as `children`, and each <PcsLeftMenuAccordion> (client) reads
 * this context. With no provider present the accordion falls back to its own
 * local state (backward-compatible).
 */
type AccordionGroupCtx = {
  openId: string | null;
  toggle: (id: string) => void;
};
const AccordionGroup = createContext<AccordionGroupCtx | null>(null);

export function PcsLeftMenuAccordionGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  return (
    <AccordionGroup.Provider value={{ openId, toggle }}>
      {children}
    </AccordionGroup.Provider>
  );
}

/**
 * Legacy PCS Cargo customer-portal — a single accordion section in the left
 * sidebar (top-level icon-row that expands into a sub-list of `<Link>`s).
 * The legacy markup used a jQuery `.has-sub` accordion; here we replace
 * that with a `useState`/group toggle + a rotating chevron. The parent passes
 * the already-built sub-link list as `children`, so the Server-Component
 * `<Link>` tree (with the next-intl `Link` + correct hrefs) is unaffected.
 *
 * Open/close animates smoothly via a CSS grid `0fr → 1fr` row transition (no
 * fixed max-height — it adapts to any sub-list length). Inside an
 * `AccordionGroup` only one section is open at a time. The icon image keeps
 * `className="pcs-icon"` so the grayscale→color `legacy-overrides.css` filter
 * still latches on hover/active.
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
  const group = useContext(AccordionGroup);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  // The label is unique across the menu → use it as the group id.
  const open = group ? group.openId === label : localOpen;
  const handleToggle = () => (group ? group.toggle(label) : setLocalOpen((v) => !v));

  return (
    <div className={`nav-item ${open ? "open" : ""}`}>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-gray-50 active:bg-gray-100"
      >
        <img src={icon} alt="" className="pcs-icon h-6 w-6" />
        <span>{label}</span>
        {badge}
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {/* grid 0fr→1fr = smooth height animation without knowing content height */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden" aria-hidden={!open}>
          <div className="py-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * 2nd-level accordion — nests inside a `PcsLeftMenuAccordion` sub-list.
 * Matches the visual weight of `SubLink` (pl-12, text-[13px], muted) but is
 * a clickable toggle that reveals deeper `SubSubLink` children. The
 * chevron-right rotates 90° to point down when open; the reveal uses the same
 * smooth grid `0fr → 1fr` transition.
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
          className={`h-3.5 w-3.5 opacity-60 transition-transform duration-300 ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        />
        <span className="flex-1">{label}</span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden" aria-hidden={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}

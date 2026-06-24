"use client";

import { useEffect, useState, type MouseEvent } from "react";

/**
 * Trip.com-style sticky section tabs with scroll-spy. Sticks below the top of the
 * viewport as the case page scrolls; the active tab follows the section in view
 * (IntersectionObserver). Clicking smooth-scrolls to the anchor. Pure client nav —
 * the target sections carry `id` + `scroll-mt-*` in the page.
 */
export function CaseTabs({ tabs }: { tabs: { id: string; label: string }[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const els = tabs
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [tabs]);

  const go = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    // clear the 2-layer sticky header (navbar 56 + search 85 = 141) + this tab bar (~48)
    const y = el.getBoundingClientRect().top + window.scrollY - 195;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActive(id);
  };

  return (
    <nav className="sticky top-[124px] z-20 mb-7 border-b border-border bg-white/95 backdrop-blur dark:bg-surface/95 md:top-[141px]">
      <div className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            onClick={(e) => go(e, t.id)}
            className={`whitespace-nowrap border-b-2 px-3.5 py-3 text-[13.5px] font-black transition ${
              active === t.id
                ? "border-primary-600 text-primary-700 dark:text-primary-300"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

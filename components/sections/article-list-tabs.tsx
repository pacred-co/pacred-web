import { Link } from "@/i18n/navigation";
import { BookOpen, Newspaper, Briefcase } from "lucide-react";

/**
 * Tab strip rendered above the article listing on `/knowledge`, `/news`, and
 * `/our-work` (owner 2026-06-23 added ผลงานของเรา). Active state is passed in by
 * the page itself — all routes are server-rendered so we don't need
 * `usePathname()`.
 *
 * Visual: pill row, primary-red fill for the active tab + outline for the
 * others; aligns left on desktop, centred on mobile to balance the narrow
 * viewport.
 */
export function ArticleListTabs({
  active,
  className = "",
}: {
  active: "knowledge" | "news" | "our-work";
  className?: string;
}) {
  const tabs = [
    {
      id: "knowledge" as const,
      href: "/knowledge",
      label: "สาระน่ารู้",
      icon: BookOpen,
    },
    {
      id: "news" as const,
      href: "/news",
      label: "ข่าวสาร Pacred",
      icon: Newspaper,
    },
    {
      id: "our-work" as const,
      href: "/our-work",
      label: "ผลงานของเรา",
      icon: Briefcase,
    },
  ];

  return (
    <div
      className={`inline-flex items-center gap-1.5 p-1 rounded-full border border-border bg-white/85 dark:bg-surface/85 backdrop-blur-sm shadow-[0_4px_14px_rgba(15,23,42,0.06)] ${className}`}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "inline-flex items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full text-[12.5px] md:text-[13.5px] font-black transition-all duration-300",
              isActive
                ? "bg-primary-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.30)]"
                : "text-muted hover:text-primary-700 hover:bg-primary-50/60 dark:hover:bg-primary-900/20",
            ].join(" ")}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

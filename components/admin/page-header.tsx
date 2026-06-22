import type React from "react";

/**
 * PageHeader — the ONE consistent page-title hierarchy for admin surfaces
 * (owner 2026-06-22 · §0h "สวมวิญญาณปราชญ์ UXUI · h1-h5 · เล่นสี เล่นขนาด · แพทเทินเดียวกัน
 * ทั้งระบบ"). Encodes the visual hierarchy so every page reads the same:
 *   eyebrow (ADMIN · section · small caps red) → big bold H1 → muted subtitle,
 *   with optional status badges beside the title + an actions slot on the right.
 *
 * Use this instead of ad-hoc `<p>ADMIN</p><h1 class="text-xl">` markup so the
 * title size/weight/colour never drifts page-to-page.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
  className = "",
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600">{eyebrow}</p>
        ) : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground leading-tight">{title}</h1>
          {badges}
        </div>
        {subtitle ? <p className="mt-1.5 text-sm text-muted leading-snug">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}

/**
 * SectionHeading — a consistent in-page section title (the H2/H3 tier). Bigger +
 * bolder than the old `text-sm font-bold` section labels so the eye finds a
 * section boundary at a glance (§0h hierarchy).
 */
export function SectionHeading({
  children,
  icon,
  level = 2,
  className = "",
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  level?: 2 | 3;
  className?: string;
}) {
  const size = level === 2 ? "text-lg" : "text-base";
  return (
    <h2 className={`flex items-center gap-2 ${size} font-bold text-foreground ${className}`}>
      {icon ? <span className="shrink-0 text-primary-600">{icon}</span> : null}
      {children}
    </h2>
  );
}

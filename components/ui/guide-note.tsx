/**
 * GuideNote — the in-system guide "framed box" (owner 2026-06-25).
 *
 * The companion to <Explain> (the hover ⓘ). Where <Explain> is an on-demand
 * hover hint on a single term, <GuideNote> is an always-visible contextual
 * callout that teaches the reader — customer OR staff — what they're looking at
 * and what to do, right where they are. It generalises the amber note pattern
 * already used by MarginAdvisoryNote + the wallet-negative card into ONE
 * reusable, consistent primitive with intent-coded variants.
 *
 * Server-component compatible (no client state). Renders nothing if no body.
 *
 *   <GuideNote variant="info" title="ค่าหัก ณ ที่จ่าย 1%">
 *     ลูกค้านิติบุคคลหักภาษีไว้ 1% ...
 *   </GuideNote>
 *
 *   <GuideNote variant="tip">เคล็ดลับ: กด “เลือกทั้งหมด” เพื่อ ...</GuideNote>
 *
 * Variants:
 *   info  (blue)    — neutral explanation / context
 *   tip   (emerald) — a helpful shortcut / best practice
 *   warn  (amber)   — heads-up / needs attention (non-blocking)
 *   note  (slate)   — quiet aside / footnote
 */
import type { ReactNode } from "react";

type Variant = "info" | "tip" | "warn" | "note";

const STYLES: Record<Variant, { box: string; icon: string; defaultIcon: string }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900",         icon: "text-sky-500",     defaultIcon: "💡" },
  tip:  { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "text-emerald-500", defaultIcon: "✅" },
  warn: { box: "border-amber-300 bg-amber-50 text-amber-900",   icon: "text-amber-600",   defaultIcon: "⚠️" },
  note: { box: "border-border bg-surface-alt/50 text-muted",    icon: "text-muted",       defaultIcon: "📌" },
};

export function GuideNote({
  variant = "info",
  title,
  children,
  icon,
  className = "",
}: {
  variant?:  Variant;
  /** Optional bold lead line. */
  title?:    ReactNode;
  /** The explanation body. If empty/falsy, the note renders nothing. */
  children?: ReactNode;
  /** Override the leading icon (emoji or node). Pass null to hide it. */
  icon?:     ReactNode | null;
  className?: string;
}) {
  if (!children && !title) return null;
  const s = STYLES[variant];
  const lead = icon === null ? null : (icon ?? s.defaultIcon);
  return (
    <div
      role="note"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px] leading-snug ${s.box} ${className}`}
    >
      {lead != null && <span className={`select-none shrink-0 ${s.icon}`} aria-hidden>{lead}</span>}
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}

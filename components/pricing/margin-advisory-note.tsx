import { getMarginAdvisory, type MarginAdvisoryOpts } from "@/lib/pricing/margin-advisory";

/**
 * MarginAdvisoryNote — renders the SOFT per-container profit advisory.
 *
 * Renders nothing when the profit is within the soft cap. When it's over, it
 * shows a small amber, gentle, NON-BLOCKING note. The owner's rule: never a
 * gate — just a kind nudge to keep per-container profit customer-fair.
 *
 * Server Component (no client state). Drop it next to wherever a single
 * container/job profit is shown to staff (forwarder detail, container view,
 * freight quote pricing, etc.).
 */
export function MarginAdvisoryNote({
  profitThb,
  capThb,
  unit,
  className = "",
}: {
  profitThb: number;
  className?: string;
} & MarginAdvisoryOpts) {
  const advisory = getMarginAdvisory(profitThb, { capThb, unit });
  if (advisory.level === "ok" || !advisory.message) return null;

  return (
    <div
      role="note"
      className={
        "mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 " +
        "px-3 py-2 text-[13px] leading-snug text-amber-800 " +
        className
      }
    >
      <span className="select-none">⚠️</span>
      <span>{advisory.message}</span>
    </div>
  );
}

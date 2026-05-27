/**
 * AccountingSegmentPills — Cargo / Freight switch for the accounting hub.
 *
 * 2026-05-21 night (ภูม brief): mirror the /admin/forwarders pattern —
 * Cargo / Freight split moved out of the sidebar dropdown into an
 * iOS-style segmented control inside the page header. Sidebar
 * `ระบบบัญชี` is now a single leaf landing on Cargo by default; users
 * click the pill to flip to Freight without leaving the page header.
 *
 * Why a tiny shared component: the cargo + freight accounting hub pages
 * are sister surfaces with identical header chrome — duplicating the
 * pill markup would invite drift.
 */

import { Link } from "@/i18n/navigation";

type Side = "cargo" | "freight";

// react-hooks/static-components: declare Pill at module level (not inside the
// parent component's render) — React 19 lint flags inline component decls.
function Pill({ side, label, active }: { side: Side; label: string; active: Side }) {
  const isActive = active === side;
  const href = side === "cargo" ? "/admin/accounting/cargo" : "/admin/accounting/freight";
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-xs font-medium whitespace-nowrap transition ${
        isActive
          ? "bg-primary-500 text-white shadow"
          : "text-foreground hover:bg-surface-alt"
      }`}
    >
      {label}
    </Link>
  );
}

export function AccountingSegmentPills({ active }: { active: Side }) {
  return (
    <div className="inline-flex rounded-full border border-border bg-white p-0.5 shadow-sm">
      <Pill side="cargo" label="Cargo" active={active} />
      <Pill side="freight" label="Freight" active={active} />
    </div>
  );
}

"use client";

/**
 * Small client island so the list/header can stay a Server Component.
 * `window.print()` requires the browser — no server equivalent — and
 * a client form/onClick is the lightest way to bridge.
 *
 * The actual print styling (hide nav/filter, show only table) lives in
 * `app/globals.css` under `@media print`. This button only triggers
 * the browser dialog.
 */

export function PrintReportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium hover:bg-surface-alt dark:bg-surface"
    >
      🖨 พิมพ์รายงาน
    </button>
  );
}

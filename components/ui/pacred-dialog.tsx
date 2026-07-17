"use client";

/**
 * Pacred admin dialog kit — shared native `<dialog>` helpers.
 *
 * Extracted from `app/[locale]/(admin)/admin/admins/[id]/admin-profile-client.tsx`
 * (Wave 21 · Task #128 · commit `003439b`) on 2026-05-27 because the same
 * Tailwind-on-native-dialog pattern is needed in at least three places:
 *
 *   1. admin-profile-client.tsx — 5 form modals + 2 confirm dialogs
 *   2. organization-email/client.tsx — "เพิ่มใหม่" + "คำอธิบายระบบ" modals
 *      (data-toggle="modal" from Bootstrap left dangling after Wave 21
 *      dropped jQuery — buttons render but produce no modal)
 *   3. barcode/driver/import/import-scanner-panel.tsx — "คำแนะนำ" modal
 *      (same dangling-Bootstrap issue)
 *
 * Inlining the pattern three times = three slightly-different forks that
 * drift. One shared module = one source of truth + future modals get the
 * idiom for free.
 *
 * Pattern reference: AGENTS.md §0a (Pacred Tailwind > Bootstrap verbatim).
 * Sibling reference: `forwarders/warehouse-history/warehouse-history-relink-modal.tsx`
 * is an older inline implementation of the same shape — not yet migrated.
 */

import { useRef, useState, type RefObject, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────────────────────
// PacredDialog — the standard modal shell
// ──────────────────────────────────────────────────────────────
// Native `<dialog>` element opened via ref.current.showModal() / closed
// via ref.current.close(). Backdrop click does NOT close, Esc does NOT close
// (owner directive 2026-07-05) — close ONLY via the explicit ✕ in the header
// or a cancel/save button in the footer. Tailwind chrome (rounded · border ·
// shadow · backdrop:bg-black/40 · max-h-[90vh] · overflow-y-auto in body).

export function PacredDialog({
  dialogRef,
  title,
  size = "md",
  children,
  onClose,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  /** `md` = ~560px (default form modals) · `lg` = ~960px (multi-column edit) ·
   * `xl` = ~1140px (document-style modals, e.g. the invoice/ใบแจ้งหนี้ pay modal) */
  size?: "md" | "lg" | "xl";
  children: ReactNode;
  onClose?: () => void;
}) {
  const t = useTranslations("pacredDialog");
  // Owner directive 2026-07-05: modals must NOT close on outside/backdrop click
  // or on ESC — the user resolves via the explicit ✕ / cancel / save buttons.

  const widthClass =
    size === "xl"
      ? "w-[min(1140px,96vw)]"
      : size === "lg"
        ? "w-[min(960px,95vw)]"
        : "w-[min(560px,95vw)]";

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => e.preventDefault()}
      onClose={onClose}
      // `m-auto` restores the native modal centering that Tailwind v4 Preflight
      // kills (its `*{margin:0}` clobbers the UA `dialog{margin:auto}` → the
      // modal pins top-left). With inset:0 + fit-content height + margin:auto
      // the top-layer dialog centers both axes. (verified live 2026-07-06)
      className={`animate-fade-in m-auto rounded-lg p-0 border border-gray-200 shadow-xl backdrop:bg-black/40 max-h-[90vh] ${widthClass}`}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => {
            dialogRef.current?.close();
            onClose?.();
          }}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <line x1={18} y1={6} x2={6} y2={18} />
            <line x1={6} y1={6} x2={18} y2={18} />
          </svg>
        </button>
      </div>
      <div className="overflow-y-auto max-h-[calc(90vh-3.5rem)] px-5 py-4 text-left">
        {children}
      </div>
    </dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// DialogFooter — standard cancel + submit row
// ──────────────────────────────────────────────────────────────

export function DialogFooter({
  onCancel,
  pending,
  submitLabel,
  pendingLabel,
  destructive = false,
}: {
  onCancel: () => void;
  pending: boolean;
  submitLabel?: string;
  pendingLabel?: string;
  /** Red submit button for delete/destructive flows. */
  destructive?: boolean;
}) {
  const t = useTranslations("pacredDialog");
  const resolvedSubmitLabel = submitLabel ?? t("save");
  const resolvedPendingLabel = pendingLabel ?? t("saving");
  const submitClass = destructive
    ? "rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
    : "rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300";

  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {t("cancel")}
      </button>
      <button
        type="submit"
        disabled={pending}
        className={submitClass}
      >
        {pending ? resolvedPendingLabel : resolvedSubmitLabel}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// useConfirmDialogs — async confirm / alert replacing window.* popups
// ──────────────────────────────────────────────────────────────
// Imperative API; renders a single shared dialog the hook owns so call
// sites stay flat:
//
//   const { confirm, alert, dialogs } = useConfirmDialogs();
//   <button onClick={async () => {
//     if (await confirm("ต้องการลบรายการนี้?")) { ... }
//   }} />
//   {dialogs}  {/* mount near component root */}

type ConfirmState = {
  open: boolean;
  message: string;
  kind: "confirm" | "alert";
} | null;

export function useConfirmDialogs() {
  const t = useTranslations("pacredDialog");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<ConfirmState>(null);
  // The pending resolver lives in a REF (not state) so close()/onClose can
  // ALWAYS settle the promise. A caller that opens the dialog from inside a
  // startTransition() gets its setState deferred → `state` stayed null → the
  // old `state.resolve(ok)` was a no-op → the promise never resolved → the
  // caller's button spun forever. The ref is immune to that deferral.
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  function open(message: string, kind: "confirm" | "alert"): Promise<boolean> {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      // flushSync forces the message to COMMIT synchronously even when open()
      // is called inside a transition — otherwise the <dialog> renders with a
      // blank message until the (deferred) transition commits. The dialog
      // element is always mounted, so its ref is attached and showModal() works.
      flushSync(() => setState({ open: true, message, kind }));
      dialogRef.current?.showModal();
    });
  }
  function close(ok: boolean) {
    resolveRef.current?.(ok);
    resolveRef.current = null;
    dialogRef.current?.close();
    setState(null);
  }

  const dialogs = (
    <dialog
      ref={dialogRef}
      // Owner directive 2026-07-05: no backdrop-click close, no ESC close —
      // the user resolves via the explicit cancel / confirm buttons below.
      onCancel={(e) => e.preventDefault()}
      onClose={() => {
        resolveRef.current?.(false);
        resolveRef.current = null;
        setState(null);
      }}
      className="animate-fade-in m-auto rounded-lg p-0 border border-gray-200 shadow-xl backdrop:bg-black/40 w-[min(420px,95vw)]"
    >
      <div className="px-5 py-4">
        <p className="text-sm text-gray-800 whitespace-pre-line">{state?.message ?? ""}</p>
        <div className="mt-5 flex justify-end gap-2">
          {state?.kind === "confirm" && (
            <button
              type="button"
              onClick={() => close(false)}
              className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("cancel")}
            </button>
          )}
          <button
            type="button"
            onClick={() => close(true)}
            className={
              state?.kind === "confirm"
                ? "rounded-md bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
                : "rounded-md bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700"
            }
          >
            {state?.kind === "confirm" ? t("confirm") : t("ok")}
          </button>
        </div>
      </div>
    </dialog>
  );

  return {
    confirm: (message: string) => open(message, "confirm"),
    alert:   (message: string) => open(message, "alert"),
    dialogs,
  };
}

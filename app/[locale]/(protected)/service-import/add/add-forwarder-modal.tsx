"use client";

/**
 * The list-view "เพิ่มรายการนำเข้า" entry — a Tailwind modal that reuses the
 * exact same form body as the full-page /service-import/add screen.
 *
 * Legacy PCS Cargo (`member/forwarder.php`) opened this add flow as an
 * auto-toggled Bootstrap-4 modal (`#add-forwarder`, `data-toggle="modal"`).
 * The (protected) layout dropped Bootstrap CSS (ปอน 2026-05-24), so that
 * markup rendered unstyled — this rebuilds it as our own React-state modal
 * (no jQuery / no BS JS) following AGENTS.md §0a (copy the workflow, polish
 * the look) and the mobile-first mandate: a bottom-sheet on phones, a centred
 * card on `sm+`.
 *
 * The trigger is the green pill on the list header; the body is
 * <ServiceImportAddForm> (owns submit + footer) wrapping the shared
 * <ServiceImportAddFields>. Address options are resolved server-side by the
 * list page and handed down as props — this component never touches the DB.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import { ServiceImportAddForm } from "./service-import-add-form";
import {
  ServiceImportAddFields,
  type AddrOption,
} from "./service-import-add-fields";

export function AddForwarderModal({
  mainAddr,
  others,
}: {
  mainAddr: AddrOption | null;
  others: AddrOption[];
}) {
  const [open, setOpen] = useState(false);

  // Lock body scroll + wire Escape-to-close while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 self-stretch justify-center rounded-full bg-emerald-600 pl-1.5 pr-4 py-1.5 text-sm font-bold text-white shadow-md shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.98] md:self-auto md:justify-start"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
          <Plus className="h-4 w-4" strokeWidth={3} />
        </span>
        <span>เพิ่มรายการนำเข้า</span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
            {/* Backdrop */}
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-black/50"
            />

            {/* Panel — bottom-sheet on mobile, centred card on sm+ */}
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-forwarder-title"
              className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-2xl sm:max-w-3xl sm:rounded-2xl"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
                <h2
                  id="add-forwarder-title"
                  className="text-base font-bold text-foreground sm:text-lg"
                >
                  สร้างออเดอร์ฝากนำเข้าสินค้า
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="ปิด"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="overflow-y-auto px-4 py-3 sm:px-5">
                <ServiceImportAddForm
                  onCancel={() => setOpen(false)}
                  onSuccess={() => setOpen(false)}
                >
                  <ServiceImportAddFields
                    mainAddr={mainAddr}
                    others={others}
                    compact
                  />
                </ServiceImportAddForm>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

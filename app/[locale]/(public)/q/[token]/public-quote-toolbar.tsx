"use client";

/**
 * PublicQuoteToolbar (owner ภูม 2026-06-22) — the floating control on the
 * login-free public quotation page (`/q/[token]`). The ใบเสนอราคา twin of the
 * receipt page's PublicReceiptToolbar.
 *
 * Actions:
 *   - พิมพ์ / บันทึก PDF — opens the SAME tuned A4 print HTML the admin tool uses
 *     (buildPrintHtml) in a new window, which yields a faithful vector PDF via
 *     the browser's "Save as PDF". A caption tells the user which destination.
 *
 * The whole bar is `print:hidden` — it never appears in the printout. Tap targets
 * ≥44px, text ≥16px on mobile. Nothing here MUTATES data (viewing only), so
 * AGENTS §0f confirm-before-mutate does not apply.
 */

import { useState, useCallback } from "react";
import { Printer, X, FileText } from "lucide-react";
import { buildPrintHtml, type QuoteModel } from "@/components/quote/quote-paper";

export default function PublicQuoteToolbar({ model }: { model: QuoteModel }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const printQuote = useCallback(() => {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      setMsg("เบราว์เซอร์บล็อก popup — อนุญาต popup แล้วลองใหม่");
      return;
    }
    setMsg(null);
    w.document.write(buildPrintHtml(model));
    w.document.close();
    w.focus();
  }, [model]);

  return (
    <div className="no-print print:hidden">
      {/* Backdrop (mobile) — tap to close */}
      {open && (
        <button
          type="button"
          aria-label="ปิด"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent"
        />
      )}

      {/* Action panel */}
      {open && (
        <div
          role="dialog"
          aria-label="จัดการเอกสาร"
          className="fixed z-50 bottom-[64px] left-0 right-0 mx-auto w-full max-w-md rounded-t-2xl border border-border bg-white p-3 shadow-2xl sm:bottom-20 sm:left-auto sm:right-4 sm:w-72 sm:rounded-2xl dark:bg-surface"
        >
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-base font-semibold text-foreground">จัดการเอกสาร</span>
            <button
              type="button"
              aria-label="ปิด"
              onClick={() => setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={printQuote}
              className="flex min-h-[44px] flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-3 text-base text-foreground">
                <Printer className="h-5 w-5 text-primary-600" />
                พิมพ์ / บันทึก PDF
              </span>
              <span className="pl-8 text-xs leading-snug text-muted">
                เลือกปลายทาง “บันทึกเป็น PDF” เพื่อดาวน์โหลดเป็นไฟล์
              </span>
            </button>
          </div>

          {msg && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {msg}
            </div>
          )}
        </div>
      )}

      {/* Desktop FAB */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-4 z-50 hidden min-h-[44px] items-center gap-2 rounded-full bg-primary-600 px-5 py-3 text-base font-semibold text-white shadow-lg hover:bg-primary-700 sm:inline-flex"
      >
        <FileText className="h-5 w-5" />
        จัดการเอกสาร
      </button>

      {/* Mobile bottom bar */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed inset-x-0 bottom-0 z-50 flex min-h-[56px] items-center justify-center gap-2 border-t border-primary-700 bg-primary-600 px-4 py-3 text-base font-semibold text-white shadow-[0_-2px_12px_rgba(0,0,0,0.12)] sm:hidden"
      >
        <FileText className="h-5 w-5" />
        จัดการเอกสาร
      </button>
    </div>
  );
}

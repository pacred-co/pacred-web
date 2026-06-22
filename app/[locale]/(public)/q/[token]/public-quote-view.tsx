"use client";

/**
 * Client render of a shared quotation (`/q/[token]`). Decodes the stateless
 * token → the SAME buildQuoteModel + QuoteCard the admin editor uses (imported
 * from the quote tab), so the customer sees a byte-faithful copy of what the
 * rep built. A toolbar lets them print / save a PDF (reuses buildPrintHtml).
 */

import { useMemo } from "react";
import { Printer, FileWarning } from "lucide-react";
import { decodeQuoteState } from "@/lib/quote/quote-share";
import {
  buildQuoteModel,
  buildPrintHtml,
  QuoteCard,
} from "@/app/[locale]/(admin)/admin/customers/[id]/quote-tab";

export function PublicQuoteView({ token }: { token: string }) {
  const inputs = useMemo(() => decodeQuoteState(token), [token]);
  const model = useMemo(() => (inputs ? buildQuoteModel(inputs) : null), [inputs]);

  if (!model) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-2">
          <FileWarning className="mx-auto h-8 w-8 text-amber-500" />
          <h1 className="text-lg font-bold text-amber-900">ลิงก์ใบเสนอราคาไม่ถูกต้อง</h1>
          <p className="text-sm text-amber-800">ลิงก์อาจเสียหายหรือไม่สมบูรณ์ — กรุณาขอลิงก์ใหม่จากเจ้าหน้าที่</p>
        </div>
      </main>
    );
  }

  const m = model;
  function printQuote() {
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(buildPrintHtml(m));
    w.document.close();
    w.focus();
  }

  return (
    <main className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-3xl px-2 py-4 sm:px-4 space-y-3">
        <div className="flex items-center justify-between gap-2 print:hidden">
          <p className="text-xs text-muted">ใบเสนอราคาจาก Pacred — เลขที่ {m.refNo}</p>
          <button
            type="button"
            onClick={printQuote}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 text-white px-3 py-1.5 text-[12px] font-semibold hover:bg-primary-700"
          >
            <Printer className="w-3.5 h-3.5" /> พิมพ์ / บันทึก PDF
          </button>
        </div>
        <QuoteCard model={m} />
      </div>
    </main>
  );
}

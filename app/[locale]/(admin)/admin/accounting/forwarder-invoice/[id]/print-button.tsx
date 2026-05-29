"use client";

/**
 * PrintButton — client wrapper that stamps tb_receipt.statusprint=1 + calls
 * window.print(). Mirrors legacy `printReceipt.php` behaviour: the act of
 * opening the print view itself counted as "printed" in PHP because the page
 * ran the UPDATE on load. We split it: viewing is fine; pressing PRINT marks.
 *
 * Wave 29 P0 #3 · faithful printReceipt port (2026-05-29).
 */

import { useState, type ReactNode } from "react";
import { adminMarkReceiptPrinted } from "@/actions/admin/forwarder-invoice";

export default function PrintButton({
  receiptId,
  children,
}: {
  receiptId: number;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      // Best-effort stamp — never block the print on a stamp failure.
      // Legacy PHP did the UPDATE inline; we await it so the audit row
      // exists by the time the print dialog opens.
      const r = await adminMarkReceiptPrinted({ receiptId });
      if (!r.ok) {
        console.warn(`[markReceiptPrinted] failed: ${r.error}`);
      }
    } catch (e) {
      console.warn(`[markReceiptPrinted] threw`, e);
    } finally {
      // Print regardless — staff workflow expects the print dialog to open.
      window.print();
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-wait"
    >
      {children}
    </button>
  );
}

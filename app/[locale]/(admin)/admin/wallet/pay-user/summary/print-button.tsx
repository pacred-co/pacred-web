"use client";

/**
 * Tiny client island just for the "พิมพ์ / บันทึก PDF" button on the
 * ใบสรุปรายการที่ต้องชำระเงิน (payment-summary sheet). The summary page itself
 * is a Server Component (heavy data fetch) — only the print-trigger needs
 * client-side `window.print()`.
 */

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700"
    >
      🖨 พิมพ์ / บันทึก PDF
    </button>
  );
}

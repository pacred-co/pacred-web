"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markReceiptPrinted } from "@/actions/freight";

/**
 * "พิมพ์แล้ว" button for the freight invoice + receipt-print pages.
 *
 * Wires the deferred legacy mutation:
 *   member/printReceiptF.php L58 · member/invoiceF.php L58
 *   UPDATE tb_receipt SET statusPrint='1', adminIDprint='ลูกค้า',
 *                         rDatePrint=NOW() WHERE rID=…
 * via the Server Action `actions/freight.ts::markReceiptPrinted`.
 *
 * The legacy ran the UPDATE on every render of the print page; we run it
 * only when the customer explicitly confirms they printed (clicking
 * window.print() does NOT prove a successful print — printers can fail —
 * so a dedicated confirmation button matches what legacy effectively
 * meant: "I saw + saved this receipt"). Sits next to the PrintButton
 * inside the `.no-print` floating bar.
 */
export function MarkReceiptPrintedButton({ rIds }: { rIds: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    if (pending || done) return;
    setErr(null);
    startTransition(async () => {
      const res = await markReceiptPrinted({ rIds });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending || done}
        className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {done ? "✓ บันทึกแล้ว" : pending ? "กำลังบันทึก..." : "พิมพ์แล้ว"}
      </button>
      {err ? (
        <span className="text-[11px] text-red-600 bg-white/80 px-1 rounded">
          {err}
        </span>
      ) : null}
    </div>
  );
}

"use client";

// ── List-row "ยกเลิก" client island (เดฟ 2026-06-04) ──────────────────
// Replaces the DEAD <button> that sat in the /service-order Server Component
// (rendered but no handler → clicking did nothing). Mirrors the proven
// detail-page pattern ([hNo]/cancel-button.tsx) but keeps the list's
// rose-pill styling. Calls the faithful cancelServiceOrder action
// (tb_header_order hStatus→'6', guard <3, ownership-gated, no comms fired).
// On success → router.refresh() so the row flips to "ยกเลิกออเดอร์" in place.

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { cancelServiceOrder } from "@/actions/service-order";

export function CancelOrderButton({ hNo }: { hNo: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCancel() {
    if (!confirm(`ยืนยันยกเลิกออเดอร์ ${hNo}?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelServiceOrder(hNo);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? "ยกเลิกไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11.5px] font-bold px-2.5 py-1 hover:bg-rose-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <XCircle className="w-3 h-3" strokeWidth={2.2} />
        {pending ? "กำลังยกเลิก…" : "ยกเลิก"}
      </button>
      {error && <span className="text-[10.5px] text-rose-700 max-w-[160px] text-right">{error}</span>}
    </div>
  );
}

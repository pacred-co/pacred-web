"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Undo2, Loader2 } from "lucide-react";
import { adminSetPcsContainerPaymentPaid } from "@/actions/admin/pcs-container-payments";
import { PCS_CNT_STATUS } from "./constants";

/**
 * D1 Phase B — flip a tb_cnt row's `cntstatus` (1 unpaid ↔ 2 paid).
 * This is the legacy "ตู้ status" — paid/unpaid, NOT a logistics enum.
 * Used in the ledger list row and the detail page.
 */
export function PcsPaymentRowControls({
  paymentId,
  currentStatus,
}: {
  paymentId: number;
  currentStatus: string;
}) {
  const t = useTranslations("pcsContainer");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const isPaid = currentStatus === PCS_CNT_STATUS.PAID;

  function flip(paid: boolean) {
    setErr(null);
    startTransition(async () => {
      const res = await adminSetPcsContainerPaymentPaid({ id: paymentId, paid });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      {isPaid ? (
        <button
          type="button"
          onClick={() => flip(false)}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-alt disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
          {t("markUnpaid")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => flip(true)}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {t("markPaid")}
        </button>
      )}
      {err && <p className="text-[11px] text-red-700">{err}</p>}
    </div>
  );
}

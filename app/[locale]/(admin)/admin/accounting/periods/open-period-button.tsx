"use client";

/**
 * V-E9 — tiny "เปิดงวด" button. Click → seeds an accounting_periods
 * row in 'open' state for the given yyyymm.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminOpenAccountingPeriod } from "@/actions/admin/accounting-periods";

export function OpenPeriodButton({ period_yyyymm }: { period_yyyymm: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    setErr(null);
    startTransition(async () => {
      const res = await adminOpenAccountingPeriod({ period_yyyymm });
      if (res.ok) router.refresh();
      else        setErr(res.error ?? "unknown");
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-lg border border-primary-300 bg-primary-50 px-2 py-1 text-[11px] font-bold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
      >
        {pending ? "..." : "เปิดงวด"}
      </button>
      {err && <span className="text-[11px] text-red-700">{err}</span>}
    </span>
  );
}

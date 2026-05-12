"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateSalesPayout } from "@/actions/admin/sales-payouts";

export function SalesPayoutActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function set(newStatus: "approved" | "paid" | "rejected") {
    setErr(null);
    if (newStatus === "rejected" && !reason.trim()) {
      setErr("กรุณาระบุเหตุผล");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateSalesPayout({
        id, status: newStatus,
        rejection_reason: newStatus === "rejected" ? reason : undefined,
      });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  if (status === "paid" || status === "rejected") return null;

  return (
    <div className="space-y-1">
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      {status === "pending" && (
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เหตุผลถ้าปฏิเสธ"
          className="w-full text-[10px] rounded border border-border px-1 py-0.5"
        />
      )}
      <div className="flex flex-wrap gap-1">
        {status === "pending" && (
          <>
            <Button size="sm" variant="outline" type="button" onClick={() => set("approved")} disabled={pending}>อนุมัติ</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => set("rejected")} disabled={pending}>ปฏิเสธ</Button>
          </>
        )}
        {(status === "pending" || status === "approved") && (
          <Button size="sm" type="button" onClick={() => set("paid")} disabled={pending}>โอนแล้ว</Button>
        )}
      </div>
    </div>
  );
}

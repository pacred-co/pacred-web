"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateYuanPayment } from "@/actions/admin/yuan-payments";

export function YuanPaymentActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function set(newStatus: "processing" | "completed" | "failed" | "refunded") {
    setErr(null);
    startTransition(async () => {
      const res = await adminUpdateYuanPayment({ id, status: newStatus });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  return (
    <div className="space-y-1">
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      <div className="flex flex-wrap gap-1">
        {status === "pending" && (
          <>
            <Button size="sm" variant="outline" type="button" onClick={() => set("processing")} disabled={pending}>เริ่มโอน</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => set("failed")} disabled={pending}>ปฏิเสธ</Button>
          </>
        )}
        {status === "processing" && (
          <>
            <Button size="sm" type="button" onClick={() => set("completed")} disabled={pending}>โอนสำเร็จ</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => set("failed")} disabled={pending}>ล้มเหลว</Button>
          </>
        )}
        {(status === "completed" || status === "failed") && (
          <Button size="sm" variant="outline" type="button" onClick={() => set("refunded")} disabled={pending}>คืนเงิน</Button>
        )}
      </div>
    </div>
  );
}

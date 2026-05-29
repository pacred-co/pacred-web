"use client";

/**
 * Batch-level ops actions (ops/super only) — currently delete-batch.
 * Visible only when batch fdstatus='1' AND zero items delivered yet.
 *
 * Faithful port of "ลบรายการ" / "ยกเลิกรอบ" button on legacy
 * forwarder-driver.php list (line 337) + detail page.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteDriverBatch } from "@/actions/admin/driver-batches";

export function BatchActions({ batchId }: { batchId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleDelete() {
    const ok = window.confirm(`ลบรอบ #${batchId} นี้? — ใช้ได้เฉพาะรอบที่ยังไม่มีรายการส่งสำเร็จ`);
    if (!ok) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteDriverBatch({ batchId });
      if (res.ok) {
        router.push("/admin/drivers");
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="inline-flex items-center gap-2">
      {err && <span className="text-xs text-rose-700">{err}</span>}
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1.5 text-xs font-medium hover:bg-rose-100 disabled:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
        {pending ? "กำลังลบ..." : "ยกเลิกรอบ"}
      </button>
    </div>
  );
}

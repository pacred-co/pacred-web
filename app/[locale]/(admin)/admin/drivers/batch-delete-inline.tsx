"use client";

/**
 * Inline "ลบรอบ" button for the driver LIST page (one per OPEN batch row).
 * Legacy `forwarder-driver.php` allows deleting a run straight from the list;
 * we previously only had it on the detail page. Same guard as the detail
 * toolbar — `deleteDriverBatch` refuses if any item is already delivered (shows
 * the error). Confirm before mutate (§0f).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { deleteDriverBatch } from "@/actions/admin/driver-batches";

export function BatchDeleteInline({ batchId }: { batchId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm(`ลบรอบ #${batchId}? — ใช้ได้เฉพาะรอบที่ยังไม่มีรายการส่งสำเร็จ`);
          if (!ok) return;
          setErr(null);
          startTransition(async () => {
            const res = await deleteDriverBatch({ batchId });
            if (res.ok) router.refresh();
            else setErr(res.error ?? "ลบไม่สำเร็จ");
          });
        }}
        className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-600 px-2 py-0.5 text-[11px] hover:bg-rose-100 disabled:opacity-60"
        title="ยกเลิก/ลบรอบจัดส่งนี้"
      >
        <Trash2 className="h-3 w-3" /> {pending ? "..." : "ลบ"}
      </button>
      {err && <span className="text-[11px] text-rose-700">{err}</span>}
    </span>
  );
}

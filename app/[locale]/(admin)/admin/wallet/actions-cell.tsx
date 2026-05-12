"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateWalletTransaction } from "@/actions/admin/wallet";

export function WalletTxActions({ id, status, kind }: { id: string; status: string; kind: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function set(newStatus: "completed" | "failed" | "cancelled") {
    setErr(null);
    if ((newStatus === "failed" || newStatus === "cancelled") && !note.trim()) {
      setErr("กรุณาระบุเหตุผลใน note");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateWalletTransaction({ id, status: newStatus, note: note || undefined });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  if (status !== "pending") return null;
  const label = kind === "deposit" ? "เติม" : kind === "withdraw" ? "ถอน" : kind;

  return (
    <div className="space-y-1">
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ (เหตุผลถ้าปฏิเสธ)"
        className="w-full text-[10px] rounded border border-border px-1 py-0.5"
      />
      <div className="flex gap-1">
        <Button size="sm" type="button" onClick={() => set("completed")} disabled={pending}>
          อนุมัติ ({label})
        </Button>
        <Button size="sm" variant="outline" type="button" onClick={() => set("cancelled")} disabled={pending}>
          ยกเลิก
        </Button>
      </div>
    </div>
  );
}

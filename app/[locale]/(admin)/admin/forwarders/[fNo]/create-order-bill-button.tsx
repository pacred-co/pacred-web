"use client";

/**
 * <CreateOrderBillButton> — per-order "สร้างใบวางบิล" (owner 2026-06-22). Shown on
 * the forwarder detail when the order is at รอชำระเงิน/เตรียมส่ง (fstatus 5/6) so the
 * admin can mint the bill + send to collect right after pricing. Calls
 * createForwarderOrderBill(fId) which derives the whole tracking group server-side
 * + reuses the proven billing-run engine. confirm() runs OUTSIDE startTransition.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { createForwarderOrderBill } from "@/actions/admin/billing-run";

export function CreateOrderBillButton({ fId, fstatus }: { fId: number; fstatus: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cur = String(fstatus ?? "").trim();
  if (cur !== "5" && cur !== "6") return null; // billable only at รอชำระเงิน/เตรียมส่ง

  async function onClick() {
    setMsg(null);
    const ok = await confirm(
      `สร้างใบวางบิลสำหรับออเดอร์ #${fId} เพื่อส่งเก็บเงินลูกค้า?\n\n` +
        `(ระบบจะออกเลขใบวางบิล + รวมยอดทุกแทรคกิงของออเดอร์นี้)`,
      { title: "สร้างใบวางบิล", confirmLabel: "สร้างบิล", cancelLabel: "ยกเลิก" },
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await createForwarderOrderBill(fId);
      if (!res.ok) { setMsg({ ok: false, text: res.error ?? "สร้างใบวางบิลไม่สำเร็จ" }); return; }
      setMsg({ ok: true, text: `✓ สร้างใบวางบิลแล้ว เลขที่ ${res.data?.docNo ?? ""} — ส่งเก็บเงินลูกค้าได้เลย` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Receipt className="h-4 w-4" />
        {pending ? "กำลังสร้างบิล..." : "🧾 สร้างใบวางบิล (เก็บเงินลูกค้า)"}
      </button>
      {msg && (
        <div className={`rounded-md border px-3 py-2 text-xs ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}

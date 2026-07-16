"use client";

/**
 * F1 — "ย้อนการชำระ + ถอยสถานะ" button (owner 2026-07-15 · PR178 · "สถานะไม่ยอมถอย").
 *
 * Un-settles ONE settled ฝากนำเข้า pay so the order returns to รอชำระเงิน and can
 * be re-collected. Calls the money-safe adminReverseForwarderPayment (pay-user.ts):
 * atomic un-settle of the tb_wallet_hs pay + wallet refund IF it was wallet-funded
 * + forwarder revert 6→5. §0f: confirm BEFORE mutate (never a silent one-click
 * un-collect). Shown only on settled ฝากนำเข้า rows in the pay-user history.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Undo2 } from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminReverseForwarderPayment } from "@/actions/admin/pay-user";

export function PayUserReverseButton({ fid }: { fid: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function onClick() {
    const ok = await confirm(
      `ย้อนการชำระออเดอร์ฝากนำเข้า #${fid}?\n\n` +
        `• ยกเลิกการตัดจ่าย (สถานะการชำระ → ไม่สำเร็จ)\n` +
        `• ถอยสถานะออเดอร์กลับเป็น "รอชำระเงิน"\n` +
        `• คืนเงินเข้ากระเป๋าลูกค้า เฉพาะกรณีที่ตัดจากกระเป๋า (สลิปโอนตรงธนาคารจะไม่คืน)\n` +
        `• ยกเลิกใบเสร็จที่ออกให้ออเดอร์นี้ (เฉพาะใบที่ออกให้ออเดอร์นี้ใบเดียว)\n\n` +
        `ทำแล้วออเดอร์จะกลับมาเรียกเก็บเงินได้ใหม่`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminReverseForwarderPayment({ fid, reason: `ย้อนการชำระ #${fid} (จากหน้าจ่ายเงินแทนลูกค้า)` });
      if (!res.ok) {
        await alert(`ย้อนการชำระไม่สำเร็จ: ${res.error}`);
        return;
      }
      const d = res.data!;
      setDone(true);
      await alert(
        `ย้อนการชำระ #${fid} สำเร็จ\n` +
          (d.refunded > 0 ? `• คืนเงินเข้ากระเป๋า ฿${d.refunded.toLocaleString("th-TH", { minimumFractionDigits: 2 })}\n` : `• ไม่มีการคืนเงิน (โอนตรงธนาคาร)\n`) +
          (d.forwarderReverted ? `• สถานะออเดอร์ถอยเป็น "รอชำระเงิน" แล้ว\n` : `• ออเดอร์อยู่สถานะรอชำระอยู่แล้ว\n`) +
          (d.receiptVoided ? `• ยกเลิกใบเสร็จ ${d.receiptVoided} แล้ว` : `• ไม่มีใบเสร็จให้ยกเลิก (หรือเป็นใบร่วมหลายออเดอร์)`),
      );
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending || done}
        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        title="ย้อนการชำระ + ถอยสถานะ"
      >
        <Undo2 className="h-3 w-3" />
        {pending ? "กำลังย้อน…" : done ? "ย้อนแล้ว" : "ย้อนการชำระ"}
      </button>
      {dialogs}
    </>
  );
}

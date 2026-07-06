"use client";

/**
 * <WarehouseHandoffButton> — พี่ป๊อป spec (2026-07-06 · TASK #4).
 *
 * The "แจ้งส่งต่องานบัญชี (ยิงครบแล้ว)" button on the container detail page.
 * Warehouse presses this once every box is scanned in (ยิงครบ) to hand the
 * container off to accounting.
 *
 * STATUS-ONLY: the underlying action notifies accounting + audit-logs — it
 * never flips fstatus and never touches money (see report-cnt-handoff.ts).
 *
 * §0f — confirm-before-mutate. The button spins while the action runs and
 * shows a persistent "✓ แจ้งบัญชีแล้ว" chip on success (idempotent to re-send
 * if warehouse needs to re-notify after a gap fill).
 */

import { useState, useTransition } from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { submitWarehouseAccountingHandoff } from "@/actions/admin/report-cnt-handoff";

export function WarehouseHandoffButton({
  fCabinetNumber,
  isComplete,
}: {
  fCabinetNumber: string;
  /** true when every box is scanned in (ยิงครบ) — drives the warning copy. */
  isComplete: boolean;
}) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function onClick() {
    startTransition(async () => {
      const warn = isComplete
        ? ""
        : "\n\n⚠️ ตู้นี้ยังยิงรับไม่ครบ — แน่ใจว่าจะส่งต่องานบัญชีเลยหรือไม่?";
      const ok = await confirm(
        `แจ้งส่งต่องานบัญชีสำหรับตู้ ${fCabinetNumber}?\n\nบัญชีจะได้รับแจ้งเตือนให้ตรวจตู้ + วางบิล` +
          `\n(ไม่เปลี่ยนสถานะตู้ · ไม่กระทบยอดเงิน)${warn}`,
      );
      if (!ok) return;
      const res = await submitWarehouseAccountingHandoff({ fcabinetnumber: fCabinetNumber });
      if (res.ok) {
        setDone(true);
      } else {
        await alert(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          done
            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : "border-sky-500 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-60"
        }`}
        title="แจ้งบัญชีว่าคลังยิงรับครบแล้ว — บัญชีตรวจตู้ + วางบิล (ไม่เปลี่ยนสถานะ · ไม่กระทบเงิน)"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {done ? "✓ แจ้งบัญชีแล้ว (แจ้งซ้ำได้)" : "แจ้งส่งต่องานบัญชี"}
      </button>
      {dialogs}
    </>
  );
}

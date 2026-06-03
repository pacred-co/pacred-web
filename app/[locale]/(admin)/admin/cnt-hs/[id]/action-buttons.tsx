"use client";

/**
 * /admin/cnt-hs/[id] approve/reject buttons (Wave 10 · 2026-05-23).
 *
 * Lives in a client component because the buttons need confirm dialog +
 * pending UI. Server actions live in actions/admin/cnt-hs.ts.
 */

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { confirm, alert } from "@/components/ui/confirm";
import { adminApproveCntHs, adminRejectCntHs } from "@/actions/admin/cnt-hs";

export function CntActionButtons({ cntId }: { cntId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function handleApprove() {
    if (!(await confirm(`อนุมัติการเบิกเงินค่าตู้ #${cntId}?\n(จะเปลี่ยนสถานะเป็น "จ่ายแล้ว" — ไม่สามารถ undo ผ่านหน้านี้)`))) return;
    start(async () => {
      const res = await adminApproveCntHs(cntId);
      if (!res.ok) {
        await alert(`Approve failed: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  async function handleReject() {
    if (!(await confirm(`ปฏิเสธการเบิกเงินค่าตู้ #${cntId}?\n(จะเปลี่ยนสถานะเป็น "ปฏิเสธ" — ไม่สามารถ undo ผ่านหน้านี้)`))) return;
    start(async () => {
      const res = await adminRejectCntHs(cntId);
      if (!res.ok) {
        await alert(`Reject failed: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        type="button"
        disabled={pending}
        onClick={handleApprove}
        className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก…" : "✅ อนุมัติ (จ่ายแล้ว)"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleReject}
        className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {pending ? "…" : "❌ ปฏิเสธ"}
      </button>
    </div>
  );
}

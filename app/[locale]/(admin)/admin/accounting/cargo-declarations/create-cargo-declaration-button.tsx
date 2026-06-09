"use client";

/**
 * <CreateCargoDeclarationButton> — confirm-before-mutate button that creates a
 * draft consolidated customs declaration (ใบขนรวม) for a CARGO import-forwarder,
 * seeding lines from the captured per-line declared/cost (mig 0158).
 *
 * P3 of the tax-invoice platform. CAPTURE/SURFACE ONLY — creating the draft
 * touches no money, no order status, no comms. On success it navigates to the
 * cargo declaration detail page.
 *
 * Confirm-before-mutate (AGENTS.md §0f) via the repo's shared `useConfirmDialogs`.
 */

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { FilePlus2 } from "lucide-react";
import { createCargoDeclaration } from "@/actions/admin/cargo-declarations";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

export function CreateCargoDeclarationButton({
  forwarderId,
  label = "สร้างใบขนรวม",
}: {
  forwarderId: number;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  async function onClick() {
    const ok = await confirm(
      "สร้างใบขนรวม (ร่าง) ของออเดอร์ฝากนำเข้านี้?\n" +
        "ระบบจะดึงรายการสินค้า + ตั้งมูลค่าสำแดงเริ่มต้นจากต้นทุน (Docs ปรับลดได้ภายหลัง).\n" +
        "⚠️ ภายในเท่านั้น — ไม่กระทบเงิน · ไม่เปลี่ยนสถานะ · ไม่แจ้งเตือนลูกค้า",
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await createCargoDeclaration({ forwarderId });
      if (res.ok && res.data) {
        router.push(`/admin/accounting/cargo-declarations/${res.data.id}`);
      } else {
        await alert(`สร้างไม่สำเร็จ: ${res.ok ? "ไม่ทราบสาเหตุ" : res.error}`);
      }
    });
  }

  return (
    <>
      {dialogs}
      <button
        type="button"
        disabled={pending}
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        <FilePlus2 className="h-3.5 w-3.5" />
        {pending ? "กำลังสร้าง…" : label}
      </button>
    </>
  );
}

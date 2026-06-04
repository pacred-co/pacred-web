"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminUpdateShopPayout } from "@/actions/admin/shop-payouts";
import { confirm } from "@/components/ui/confirm";

/**
 * Per-row action buttons for /admin/shop-payouts — Sprint-3 P2.3.
 *
 * Two terminal transitions for the foundation:
 *   completed → ยอดถูกหักจากลูกค้าทันที (trigger)
 *   cancelled → คืน "available" ของลูกค้า (pending sum drops)
 *
 * Hides itself for already-final rows (completed/cancelled/failed).
 */
export function ShopPayoutActions({
  id,
  status,
}: {
  id:     string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr]       = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [slipUrl, setSlipUrl] = useState("");

  function set(newStatus: "completed" | "cancelled") {
    setErr(null);
    if (newStatus === "cancelled" && !reason.trim()) {
      setErr("กรุณาระบุเหตุผล");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateShopPayout({
        id,
        status:           newStatus,
        rejection_reason: newStatus === "cancelled" ? reason.trim() : undefined,
        slip_url:         newStatus === "completed" && slipUrl.trim() ? slipUrl.trim() : undefined,
      });
      if (res.ok) {
        router.refresh();
      } else {
        const fallback: Record<string, string> = {
          row_not_found:                "ไม่พบรายการ",
          rejection_reason_required:    "กรุณาระบุเหตุผลการปฏิเสธ",
          kind_not_admin_actionable:    "ประเภทรายการนี้แอดมินไม่สามารถจัดการได้",
          already_completed:            "รายการนี้โอนเงินไปแล้ว",
          already_cancelled:            "รายการนี้ถูกปฏิเสธไปแล้ว",
          already_failed:               "รายการนี้สถานะล้มเหลว — ดำเนินการต่อไม่ได้",
        };
        setErr(fallback[res.error] ?? res.error);
      }
    });
  }

  if (status === "completed" || status === "cancelled" || status === "failed") return null;

  return (
    <div className="space-y-1">
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เหตุผลถ้าปฏิเสธ"
        className="w-full text-[10px] rounded border border-border px-1 py-0.5"
      />
      <input
        value={slipUrl}
        onChange={(e) => setSlipUrl(e.target.value)}
        placeholder="URL สลิป (ถ้าโอนแล้ว)"
        className="w-full text-[10px] rounded border border-border px-1 py-0.5"
      />
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          type="button"
          onClick={async () => { if (await confirm("ยืนยันบันทึกว่าโอนเงินแล้ว? (ทำเครื่องหมายจ่ายเสร็จ — มีผลกับ wallet)")) set("completed"); }}
          disabled={pending}
        >
          โอนแล้ว
        </Button>
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={async () => { if (await confirm("ยืนยันปฏิเสธรายการจ่ายเงินนี้?")) set("cancelled"); }}
          disabled={pending}
        >
          ปฏิเสธ
        </Button>
      </div>
    </div>
  );
}

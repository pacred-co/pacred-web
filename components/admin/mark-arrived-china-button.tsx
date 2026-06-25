"use client";

/**
 * <MarkArrivedChinaButton> — single-order manual "ถึงโกดังจีน" (hstatus 4 → 40).
 *
 * owner 2026-06-25 (status-sync · PR018): a ฝากสั่งซื้อ order whose goods reached the
 * China warehouse normally auto-advances 4 → 40 (advanceLinkedShopOrder / MOMO sync),
 * but when the shop→warehouse tracking is an SF-Express number that never matches a
 * MOMO momo_tracking_no, the auto-sync can't fire → the order is stuck at "รอร้านจีน
 * จัดส่ง (4)". Staff can already do this from the list bulk; this gives a 1-click
 * per-order escape on the edit page. Reuses the money-safe bulkUpdateShopOrderStatus
 * (writes ONLY hstatus + stamp · §0f confirm).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkUpdateShopOrderStatus } from "@/actions/admin/service-orders-bulk";
import { confirm } from "@/components/ui/confirm";

export function MarkArrivedChinaButton({ hno }: { hno: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setErr(null);
    const ok = await confirm(
      `ทำเครื่องหมาย "ถึงโกดังจีน" ให้ออเดอร์ ${hno}?\n\n` +
        `ใช้เมื่อสินค้าถึงโกดังจีนแล้ว แต่สถานะไม่ขยับเอง ` +
        `(เช่น เลขแทรกกิ้ง SF Express ไม่แมตช์กับ MOMO).\n` +
        `เปลี่ยนสถานะเท่านั้น — ไม่แตะเงิน.`,
    );
    if (!ok) return;
    start(async () => {
      const res = await bulkUpdateShopOrderStatus([hno], "40");
      if (!res.ok) {
        setErr(res.error ?? "อัปเดตสถานะไม่สำเร็จ");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
      <p className="mb-1.5 text-sm font-semibold text-sky-800">สถานะไม่ขยับเป็น “ถึงโกดังจีน”?</p>
      <p className="mb-2 text-[11px] text-sky-700/80">
        ถ้าสินค้าถึงโกดังจีนแล้วแต่ระบบไม่อัปเดตเอง (แทรกกิ้ง SF ไม่แมตช์ MOMO) กดปุ่มนี้เพื่อทำเครื่องหมายเอง — เปลี่ยนสถานะอย่างเดียว ไม่กระทบเงิน.
      </p>
      {err && <div className="mb-2 rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">⚠ {err}</div>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก..." : "🏬 ทำเครื่องหมาย ถึงโกดังจีน"}
      </button>
    </div>
  );
}

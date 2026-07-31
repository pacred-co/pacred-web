"use client";

/**
 * ปุ่ม "ส่งไม่ได้" ทั้งจุดส่ง (ภูม 2026-07-31) — คู่กับ ถ่ายขึ้นรถ/ถ่ายส่ง บนหน้า
 * detail (ยุบ flow จาก /admin/drivers/work มาไว้หน้าเดียว). กดแล้วถามเหตุผล →
 * adminMarkStopFailed มาร์คทุกรายการในจุดที่ "ยังไม่ส่งสำเร็จ" เป็น "ส่งไม่ได้"
 * (fdistatus '3' + fdinote) → แถว '3' วนกลับเข้าคิวมอบงานเอง (self-heal).
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { AlertTriangle } from "lucide-react";
import { prompt } from "@/components/ui/confirm";
import { adminMarkStopFailed } from "@/actions/admin/driver-work";

export function DriverStopFailButton({
  itemIds,
  gradient = false,
  disabled = false,
}: {
  /** tb_forwarder_driver_item.id(s) ของจุดส่งนี้ (action ข้ามรายการที่ส่งสำเร็จแล้วเอง) */
  itemIds: number[];
  /** ปุ่มเต็มความกว้าง (แถวปุ่มมือถือ) · default = pill เล็ก (เดสก์ท็อป) */
  gradient?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setErr(null);
    const reason = await prompt("เหตุผลที่ส่งไม่ได้? (เช่น ลูกค้าไม่อยู่ / ไม่รับสาย / ที่อยู่ผิด)");
    if (!reason || !reason.trim()) return;
    start(async () => {
      const res = await adminMarkStopFailed({ itemIds, reason: reason.trim() });
      if (!res.ok) {
        setErr(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className={gradient ? "w-full" : "inline-block"}>
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        className={
          gradient
            ? "inline-flex w-full items-center justify-center gap-1 rounded-full border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 whitespace-nowrap hover:bg-red-50 disabled:opacity-50"
            : "inline-flex items-center justify-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
        }
      >
        <AlertTriangle className={gradient ? "h-3.5 w-3.5" : "h-3 w-3"} /> {pending ? "กำลังบันทึก…" : "ส่งไม่ได้"}
      </button>
      {err && <p className="mt-1 rounded border border-red-200 bg-red-50 px-1.5 py-1 text-[11px] text-red-700">⚠ {err}</p>}
    </div>
  );
}

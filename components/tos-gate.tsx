"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptCurrentTos } from "@/actions/tos";
import { CURRENT_TOS_VERSION } from "@/lib/tos";

/**
 * Blocking modal shown when the signed-in user hasn't accepted the
 * current TOS version. Rendered by the (protected) layout — refuses
 * to dismiss until the user clicks accept.
 */
export function TosGate() {
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onAccept() {
    if (!agreed) return;
    setError(null);
    startTransition(async () => {
      const res = await acceptCurrentTos();
      if (!res.ok) setError(res.error);
      // success → revalidatePath on layout removes this component
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="max-w-2xl w-full max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-surface shadow-2xl">
        <div className="p-6 sm:p-8 space-y-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-500">
              เงื่อนไขการใช้บริการ
            </p>
            <h2 className="mt-1 text-2xl font-bold text-foreground">
              ยอมรับเงื่อนไขก่อนใช้งาน
            </h2>
            <p className="mt-1 text-xs text-muted">
              เวอร์ชัน {CURRENT_TOS_VERSION}
            </p>
          </div>

          <div className="rounded-lg border border-border bg-surface-alt/30 p-4 text-sm leading-relaxed max-h-60 overflow-y-auto">
            <p className="font-semibold mb-2">เงื่อนไขการให้บริการของ Pacred</p>
            <p className="text-muted">
              การใช้บริการของ Pacred (นำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน) หมายถึง
              คุณยอมรับเงื่อนไขดังต่อไปนี้:
            </p>
            <ol className="mt-3 list-decimal pl-5 space-y-2 text-muted">
              <li>ข้อมูลที่ลงทะเบียนเป็นข้อมูลจริง — กรณีพบว่าข้อมูลเป็นเท็จ บริษัทมีสิทธิ์ระงับบัญชี</li>
              <li>การชำระเงินผ่านระบบ ต้องแนบหลักฐานโอนภายในระยะเวลาที่กำหนด</li>
              <li>สินค้าที่ผิดกฎหมาย / ละเมิดลิขสิทธิ์ / อันตราย บริษัทขอสงวนสิทธิ์ในการปฏิเสธการนำเข้า</li>
              <li>การคืนเงิน / คืนสินค้า เป็นไปตามนโยบายของบริษัท</li>
              <li>บริษัทขอสงวนสิทธิ์ในการแก้ไขเงื่อนไข — เวอร์ชันใหม่จะแจ้งให้ทราบและขอให้ยอมรับใหม่</li>
            </ol>
            <p className="mt-3 text-xs text-muted/80">
              อ่านฉบับเต็มได้ที่{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:underline">
                /terms
              </a>
              {" "}— ฉบับเต็มจะอัพโหลดในเฟส H (rebrand)
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-foreground">
              ฉันได้อ่านและยอมรับ <strong>เงื่อนไขการใช้บริการ</strong> และ <strong>นโยบายความเป็นส่วนตัว</strong> ของ Pacred
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              เกิดข้อผิดพลาด: {error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={onAccept}
              disabled={!agreed || pending}
            >
              {pending ? "กำลังบันทึก..." : "ยอมรับและเริ่มใช้งาน"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

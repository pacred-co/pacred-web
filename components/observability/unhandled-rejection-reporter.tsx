"use client";

/**
 * ดัก promise ที่ reject แล้วไม่มีใครรับ → ส่งเข้าคิว incidents.
 *
 * 🔴 เหตุที่ต้องมี (PR106 · 2026-07-27): ลูกค้าแนบสลิปแล้ว "กดยืนยันไม่ได้" —
 * กดปุ่มแล้ว **ไม่มีอะไรเกิดขึ้นเลย** ไม่มี error บนจอ และ **ไม่มีใบใน /admin/incidents**
 * ให้เราตามด้วย. ราก: ทุกปุ่มจ่ายเงินฝั่งลูกค้า dispatch server action ใน
 * `startTransition(async () => { const res = await action(); … })` **ไม่มี try/catch** →
 * ถ้า action reject (ดีพลอยทับ action id เก่า · เน็ตหลุดกลางทาง · เซิร์ฟเวอร์ 500)
 * จะกลายเป็น unhandled rejection ซึ่ง **error boundary ของ React จับไม่ได้**
 * (boundary จับเฉพาะ error ตอน render) → เงียบสนิททั้งฝั่งลูกค้าและฝั่งเรา.
 *
 * ตัวนี้เป็น **ตาข่ายชั้นสุดท้าย** ของทั้งแพลตฟอร์ม: call site ควรจับ error เองและ
 * แสดงข้อความไทยที่บอกทางออก (ดู `describeActionDispatchError`) — แต่ถ้าหลุดมาถึงตรงนี้
 * อย่างน้อยเรา "เห็น" มัน ไม่ใช่รู้ตอนลูกค้าโทรมาบ่น.
 *
 * ไม่แสดงอะไรบนจอ (ไม่ขัดจังหวะผู้ใช้) · `reportClientIncident` กรอง abort/chunk-load
 * และข้าม non-production ให้แล้ว · mount ครั้งเดียวที่ locale layout.
 */

import { useEffect } from "react";
import { reportClientIncident } from "@/lib/observability/client-report";

export function UnhandledRejectionReporter() {
  useEffect(() => {
    function onRejection(event: PromiseRejectionEvent) {
      const reason: unknown = event.reason;
      const error =
        reason instanceof Error
          ? reason
          : new Error(
              typeof reason === "string" ? reason : `Unhandled rejection: ${String(reason)}`,
            );
      void reportClientIncident(error);
    }
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  return null;
}

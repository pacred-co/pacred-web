"use client";

/**
 * หัวการ์ด "รายการสินค้า" + ปุ่ม ย่อ/กาง ทุกร้าน.
 *
 * owner 2026-07-24 (จาก /admin/service-orders/P22453 — ออเดอร์เดียว 25 ร้าน 300+ รายการ):
 * *"ดูสิว่ามัน เยอะลายตาขนาดไหนครับ · ทำเครื่องหมายให้คนรู้ว่าสามารถกดเพื่อย่อร้านค้าได้"*
 *
 * ไม่เปลี่ยนค่าเริ่มต้น (ยังกางหมดเหมือนเดิม — คนที่ชินอยู่แล้วไม่สะดุด) แต่ให้ปุ่ม
 * ย่อทีเดียวจบ แล้วค่อยกางเฉพาะร้านที่จะทำงาน. คุมผ่าน `<details open>` ตรงๆ
 * (native · ไม่มี state ซ้อน จึงไม่มีทาง desync กับสิ่งที่ตาเห็น — ผู้ใช้กดย่อเองทีละร้าน
 * แล้วกดปุ่มนี้ ก็ยังสั่งได้ทั้งหมดถูกต้อง).
 */

import { useRef, useState } from "react";

export function ShopCollapseAll({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [allOpen, setAllOpen] = useState(true);

  const setAll = (open: boolean) => {
    ref.current?.querySelectorAll<HTMLDetailsElement>("details[data-shop-group]").forEach((d) => {
      d.open = open;
    });
    setAllOpen(open);
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {title}
        <button
          type="button"
          onClick={() => setAll(!allOpen)}
          className="rounded-lg border border-primary-300 px-2.5 py-1 text-[11px] font-bold text-primary-700 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300"
        >
          {allOpen ? "⌃ ย่อทุกร้าน" : "⌄ กางทุกร้าน"}
        </button>
      </div>
      <div ref={ref} className="space-y-4">
        {children}
      </div>
    </>
  );
}

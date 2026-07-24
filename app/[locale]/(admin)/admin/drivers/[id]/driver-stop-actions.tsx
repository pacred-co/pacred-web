"use client";

/**
 * แถวปุ่ม 3 อันใต้การ์ดจุดส่ง (การ์ดคนขับมือถือ · ปอน 2026-07-24) เรียงแถวเดียว:
 *   1) พิมพ์ใบส่งสินค้า  2) พิมพ์สติกเกอร์  3) เพิ่มเติม (กางตารางออเดอร์)
 *
 * "เพิ่มเติม" เดิมเป็น <summary> ใน <details> ซึ่งต้องเป็นลูกตรงของ <details> ถึง
 * toggle ได้ → เอามาเรียงแถวเดียวกับปุ่มพิมพ์ตรงๆ ไม่ได้. เลยเปลี่ยนเป็นปุ่ม + state
 * (client) แทน · ตารางออเดอร์ (children) กางอยู่ใต้แถวปุ่ม.
 */

import { useState, type ReactNode } from "react";
import { Printer, Tag, ChevronDown } from "lucide-react";

// ปุ่มบาง (owner 2026-07-24 "บางลง · แบบในภาพ") — pill เตี้ยลง py-1.5 · ไอคอนเล็ก h-3.5
const BTN =
  "inline-flex items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[11px] " +
  "font-semibold text-white shadow-sm text-center leading-tight active:scale-95 transition";

export function DriverStopActions({
  slipHref,
  stickersHref,
  children,
}: {
  slipHref: string;
  stickersHref: string;
  /** ตารางออเดอร์ที่กางเมื่อกด "เพิ่มเติม" */
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <a
          href={slipHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN} bg-gradient-to-r from-[#A01824] to-[#C82333] hover:from-[#87141E] hover:to-[#B21F2D]`}
        >
          <Printer className="h-3.5 w-3.5 shrink-0" /> ใบส่งสินค้า
        </a>
        <a
          href={stickersHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BTN} bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600`}
        >
          <Tag className="h-3.5 w-3.5 shrink-0" /> สติกเกอร์
        </a>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`${BTN} bg-gradient-to-r from-slate-600 to-slate-500 hover:from-slate-700 hover:to-slate-600`}
        >
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`} />
          เพิ่มเติม
        </button>
      </div>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </>
  );
}

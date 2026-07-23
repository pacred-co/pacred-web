"use client";

/**
 * ช่องวันที่ วว/ดด/ปปปป + ปฏิทินให้กดเลือก (owner พี่ป๊อป 2026-07-23).
 *
 * ปัญหาที่แก้: `<input type="date">` เปิดปฏิทินได้ก็จริง แต่ "รูปแบบที่แสดง" ยึด
 * ภาษาของ browser/OS — เครื่องภาษาอังกฤษขึ้นเป็น 04/24/2026 (ดด/วว) ซึ่งคนไทย
 * อ่านเป็น 4 เม.ย. และบังคับด้วย HTML/CSS ไม่ได้.
 *
 * วิธี: ช่องที่ "เห็น" เป็น text แสดง วว/ดด/ปปปป (และเป็นตัวที่ส่งค่าเข้าฟอร์ม)
 * ส่วนปฏิทินคือ `<input type="date">` ที่ซ่อนไว้ เรียกด้วย `showPicker()` ตอนผู้ใช้
 * กด — เลือกวันแล้วแปลงกลับมาใส่ช่อง text ให้เอง. ได้ทั้งรูปแบบไทย + ปฏิทิน.
 *
 * ทนทาน (ไม่พึ่ง JS ก็ยังทำงาน):
 *   • ไม่มี JS / browser ไม่รองรับ showPicker → ยังพิมพ์เองได้ตามปกติ ฟอร์มยังส่งได้
 *     (ปุ่มปฏิทินจะถูกซ่อนเมื่อ browser ไม่รองรับ — ไม่มีปุ่มกดแล้วไม่เกิดอะไร)
 *   • ค่าที่ส่งเข้าฟอร์มคือข้อความในช่อง — ฝั่ง server ใช้ `anyDateToIso` ซึ่งรับ
 *     ทั้ง วว/ดด/ปปปป และ ISO และ "ปฏิเสธ" วันที่ไม่มีจริง (31/02) ไม่ปัดเป็นวันอื่น
 */

import { useEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { ddmmyyyyToIso, isoToDdmmyyyy } from "@/lib/utils/thai-datetime";

export function ThaiDateField({
  id,
  name,
  defaultValueIso,
  ariaLabel,
}: {
  id?: string;
  /** ชื่อฟิลด์ที่ส่งเข้าฟอร์ม (ค่าที่ส่ง = ข้อความ วว/ดด/ปปปป). */
  name: string;
  /** ค่าเริ่มต้นเป็น ISO (YYYY-MM-DD) — แปลงเป็น วว/ดด/ปปปป ให้อัตโนมัติ. */
  defaultValueIso?: string | null;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(() => isoToDdmmyyyy(defaultValueIso));
  const dateRef = useRef<HTMLInputElement>(null);
  // เช็คตอน mount ว่า browser เปิดปฏิทินเองได้ไหม — ถ้าไม่ได้ ซ่อนปุ่มทิ้ง
  // (ปุ่มที่กดแล้วไม่เกิดอะไร แย่กว่าไม่มีปุ่ม)
  const [canPick, setCanPick] = useState(false);
  useEffect(() => {
    setCanPick(typeof dateRef.current?.showPicker === "function");
  }, []);

  function openPicker() {
    const el = dateRef.current;
    if (!el || typeof el.showPicker !== "function") return;
    // ให้ปฏิทินเปิดค้างที่วันที่ที่กรอกไว้อยู่ (ถ้ากรอกไว้ถูกต้อง)
    el.value = ddmmyyyyToIso(text) ?? "";
    try {
      el.showPicker();
    } catch {
      // Safari เก่า / ไม่ได้มาจากการกดของผู้ใช้ → ปล่อยให้พิมพ์เอง
    }
  }

  return (
    <span className="relative inline-flex items-center">
      <input
        id={id}
        type="text"
        name={name}
        value={text}
        onChange={(e) => setText(e.target.value)}
        // กดที่ช่อง = เปิดปฏิทิน (ตามที่ owner ขอ) แต่ยังพิมพ์ทับได้ตามปกติ
        onClick={openPicker}
        placeholder="วว/ดด/ปปปป"
        inputMode="numeric"
        maxLength={10}
        autoComplete="off"
        pattern="\d{1,2}/\d{1,2}/\d{4}"
        title="รูปแบบ วว/ดด/ปปปป เช่น 24/04/2026"
        aria-label={ariaLabel}
        className={`w-[8.5rem] rounded-lg border border-border bg-white py-2 pl-2.5 text-sm min-h-[38px] tabular-nums ${
          canPick ? "pr-8 cursor-pointer" : "pr-2.5"
        }`}
      />

      {canPick && (
        <button
          type="button"
          onClick={openPicker}
          tabIndex={-1}
          aria-label="เปิดปฏิทินเลือกวันที่"
          className="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-primary-600 hover:bg-primary-50"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      )}

      {/* ปฏิทินตัวจริง — ซ่อนสายตาแต่ยังอยู่ใน layout flow ให้ popup วางตำแหน่งถูก.
          ไม่มี `name` → ไม่ถูกส่งเข้าฟอร์ม (ตัวที่ส่งคือช่อง text ด้านบน). */}
      <input
        ref={dateRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const next = isoToDdmmyyyy(e.target.value);
          if (next) setText(next);
        }}
        className="pointer-events-none absolute bottom-0 left-2 h-0 w-0 opacity-0"
      />
    </span>
  );
}

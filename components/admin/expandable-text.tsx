"use client";

/**
 * <ExpandableText> — ข้อความยาวจำกัดไว้ N บรรทัด (default 2) · ถ้าเกินจะขึ้น "…"
 * ท้าย + ปุ่ม "เพิ่มเติม" กดแล้วกางเต็ม (กดซ้ำ "ย่อ" กลับ). ปุ่มจะโชว์เฉพาะตอนที่
 * ข้อความล้นจริง (วัดด้วย scrollHeight > clientHeight) — ข้อความสั้นที่พอดีอยู่แล้ว
 * ไม่มีปุ่มมากวนตา (ปอน 2026-07-24 · การ์ดที่อยู่จัดส่งของคนขับบนมือถือ).
 *
 * รับ children เป็น ReactNode (รองรับที่อยู่ที่มี <span> ไฮไลต์อำเภอข้างใน).
 * clamp ใช้คลาส line-clamp-2 คงที่ (Tailwind purge คลาส dynamic ไม่ได้ · ตอนนี้
 * ต้องการแค่ 2 บรรทัดตามที่ owner สั่ง).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ExpandableText({
  children,
  className,
  moreLabel = "เพิ่มเติม",
  lessLabel = "ย่อ",
}: {
  children: ReactNode;
  className?: string;
  moreLabel?: string;
  lessLabel?: string;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

  // วัดว่าล้นไหม "ตอนถูก clamp" เท่านั้น (ตอนกางเต็ม scrollHeight==clientHeight
  // จะอ่านว่าไม่ล้น) — จึงวัดเฉพาะตอน !expanded และเก็บค่าไว้ให้ปุ่มคงอยู่.
  useEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [children, expanded]);

  return (
    <div className="relative">
      <p ref={ref} className={`${className ?? ""} ${expanded ? "" : "line-clamp-2"}`}>
        {children}
        {/* กางแล้ว: "ย่อ" ต่อท้ายข้อความ inline (บรรทัดสุดท้าย) */}
        {expanded && overflowing && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="ml-1 align-baseline text-[11px] font-semibold text-primary-600 hover:underline"
          >
            {lessLabel}
          </button>
        )}
      </p>
      {/* ยังไม่กาง + ล้น: "เพิ่มเติม" ทับมุมขวาล่างของบรรทัดที่ 2 (inline · ไม่ตกบรรทัด 3)
          — ไล่เฉดขาว (การ์ดพื้นขาว) ให้ตัวหนังสือใต้ปุ่มค่อยๆ จางไม่ทับกันมั่ว. */}
      {!expanded && overflowing && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute bottom-0 right-0 bg-gradient-to-l from-white from-70% to-transparent pl-8 text-[11px] font-semibold text-primary-600 hover:underline"
        >
          …{moreLabel}
        </button>
      )}
    </div>
  );
}

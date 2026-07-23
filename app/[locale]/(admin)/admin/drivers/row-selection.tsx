"use client";

/**
 * ช่องติ๊กเลือกแถว บน /admin/drivers (owner พี่ป๊อป 2026-07-23).
 *
 * แทนคอลัมน์ ID เดิม — ตรงกับ legacy PCS ที่คอลัมน์แรกของตารางเป็น checkbox
 * (หัวตาราง = ติ๊กทั้งหมด · แต่ละแถว = ติ๊กทีละอัน).
 *
 * ⚠️ ตอนนี้ "ติ๊กได้เฉยๆ" ตามที่ owner สั่ง — ยังไม่มีปุ่ม/การกระทำหมู่ผูกไว้
 * (ไม่ลบ · ไม่พิมพ์ · ไม่เปลี่ยนสถานะ) ตัวเลือกที่ติ๊กไว้อยู่ในหน่วยความจำหน้าจอ
 * เท่านั้น รีเฟรชแล้วหาย. เมื่อจะต่อ action ให้ใช้ `useDriverSelection().selected`
 * ซึ่งคืน id ของรอบที่ติ๊กไว้ — และอย่าลืม §0f (ต้องมี confirm ก่อนทำอะไรจริง).
 *
 * ทำไมต้องเป็น client component: ตารางถูก render ฝั่ง server (server component)
 * แต่การติ๊กเป็น state ฝั่ง browser. Provider ตัวนี้รับตารางที่ server render มา
 * เป็น `children` ได้ตามปกติ — ไม่ต้องแปลงทั้งตารางเป็น client.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type SelectionCtx = {
  selected: Set<number>;
  toggle: (id: number) => void;
  toggleAll: (ids: number[]) => void;
};

const Ctx = createContext<SelectionCtx | null>(null);

/** อ่านรายการที่ติ๊กไว้ (ใช้ตอนต่อ action ในอนาคต). */
export function useDriverSelection(): SelectionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDriverSelection ต้องอยู่ภายใน <DriverSelectionProvider>");
  return ctx;
}

export function DriverSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const value = useMemo<SelectionCtx>(
    () => ({
      selected,
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      // ติ๊กทั้งหมด = ถ้าครบทุกแถวบนหน้านี้อยู่แล้ว → เอาออกทั้งหมด, ไม่งั้น → ติ๊กให้ครบ
      toggleAll: (ids) =>
        setSelected((prev) => {
          const allOn = ids.length > 0 && ids.every((id) => prev.has(id));
          return allOn ? new Set() : new Set(ids);
        }),
    }),
    [selected],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const BOX =
  "h-4 w-4 cursor-pointer rounded border-border accent-primary-600 align-middle disabled:cursor-not-allowed disabled:opacity-40";

/** ช่องติ๊กบนหัวตาราง — ติ๊ก/เอาออก ทุกแถวในหน้านี้. */
export function SelectAllBox({ ids }: { ids: number[] }) {
  const { selected, toggleAll } = useDriverSelection();
  const onCount = ids.filter((id) => selected.has(id)).length;
  const allOn = ids.length > 0 && onCount === ids.length;

  return (
    <input
      type="checkbox"
      className={BOX}
      checked={allOn}
      disabled={ids.length === 0}
      // บางส่วน = ขีดกลาง (เหมือน legacy) — ref callback เพราะ `indeterminate`
      // ตั้งผ่าน attribute ไม่ได้ ต้องเซ็ตบน DOM node
      ref={(el) => {
        if (el) el.indeterminate = onCount > 0 && !allOn;
      }}
      onChange={() => toggleAll(ids)}
      aria-label={allOn ? "เอาการเลือกออกทั้งหมด" : "เลือกทั้งหมดในหน้านี้"}
    />
  );
}

/** ช่องติ๊กประจำแถว. */
export function RowBox({ id }: { id: number }) {
  const { selected, toggle } = useDriverSelection();
  return (
    <input
      type="checkbox"
      className={BOX}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label={`เลือกรอบ #${id}`}
    />
  );
}

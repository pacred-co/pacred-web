/**
 * โครงกลางของ "หน้าตรวจสลิป" — ทุกบริการต้องใช้ตัวนี้ตัวเดียว.
 *
 * owner 2026-07-24 (verbatim): *"หน้าตรวจสลิปเรา ต้องห้ามเป็นแบบอื่นแล้วนะ ต้องตรวจ
 * ด้วยแพทเทินเดียวที่เราทำกันไว้เท่านั้นนะครับ ไม่ว่าจะบริการอะไร ก็ต้องวนมาเจอ
 * ตรวจสลิปแบบเดียวกัน แล้วไปออกเอกสารเหมือนกันทั้งหมดครับ"*
 *
 * ── ทำไมต้องมี ───────────────────────────────────────────────────────────
 * 3 เลนเขียนหน้าตรวจสลิปแยกกัน 2,026 บรรทัด แชร์กันแค่ 2 component เล็ก:
 *   ฝากนำเข้า/กระเป๋า  `wallet/[id]/edit-form.tsx`            (997)
 *   ฝากโอนหยวน         `yuan-payments/[id]/verify-flow.tsx`   (372)
 *   ใบวางบิล           `billing-run/[id]/billing-run-verify-flow.tsx` (657)
 * แต่ละตัวก๊อป className + คำ + โครง 2 ขั้นของตัวเอง → drift ได้ทุกเมื่อ
 * (รอบก่อนต้องไล่ตาม "ให้ className เหมือน wallet เป๊ะ" ด้วยมือ = สัญญาที่ไม่มีใครตรวจ).
 * เอาโครงมาไว้ที่เดียว → **แก้ที่นี่ = ขึ้นทุกเลนพร้อมกัน · เพี้ยนกันไม่ได้เชิงโครงสร้าง**
 *
 * ── สิ่งที่ตัวนี้เป็นเจ้าของ (ห้ามก๊อปไปเขียนเอง) ─────────────────────────
 *   • ลำดับ 2 ขั้น: ขั้นที่ 1 ตรวจสลิป → ขั้นที่ 2 อนุมัติ + ออกเอกสาร
 *   • สี/กรอบ/ขนาดตัวอักษรของแถบขั้น (ฟ้า = กำลังตรวจ · เขียว = ผ่านแล้วรออนุมัติ)
 *   • ที่วางเนื้อหาเฉพาะเลน (children) + ที่วางปุ่ม (actions)
 * ตัวนี้ **ไม่มี logic เงิน** — action ของแต่ละเลนยังเป็นของเลนนั้นเหมือนเดิมทุกตัว
 * (UI-only · args ไม่ถูกแตะ) เลนไหนคิดเงินยังไงก็ยังเหมือนเดิมเป๊ะ.
 */

import type { ReactNode } from "react";

export type SlipVerifyStepNo = 1 | 2;

/** ป้ายมาตรฐานของแต่ละขั้น — เลนเติมส่วนขยายต่อท้ายได้ แต่หัวต้องเหมือนกัน. */
export const SLIP_STEP_TITLE: Record<SlipVerifyStepNo, string> = {
  1: "ขั้นที่ 1 · ตรวจสลิป",
  2: "ขั้นที่ 2 · อนุมัติ + ตัดจ่าย (รอบ 2)",
};

/**
 * แถบขั้นของหน้าตรวจสลิป.
 *
 * @param step     1 = กำลังตรวจ (ฟ้า) · 2 = ผ่านรอบ 1 แล้ว รออนุมัติ (เขียว)
 * @param titleSuffix ต่อท้ายหัวข้อมาตรฐาน เช่น " · วันโอน · รายการซ้ำ"
 * @param subtitle คำอธิบายสั้นๆ ว่าขั้นนี้ต้องทำอะไร (self-explaining · §0g)
 * @param actions  ปุ่มของขั้นนั้น (ของแต่ละเลน)
 */
export function SlipVerifyStep({
  step,
  titleSuffix,
  subtitle,
  titleRight,
  children,
  actions,
}: {
  step: SlipVerifyStepNo;
  titleSuffix?: string;
  subtitle?: ReactNode;
  /** ป้ายมุมขวาของหัวข้อ เช่น "✓ ตรวจสลิป รอบ 1 แล้ว" */
  titleRight?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const isStep1 = step === 1;
  const shell = isStep1
    ? "border-sky-300 bg-sky-50/60 dark:bg-sky-50/5"
    : "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-50/5";
  const titleTone = isStep1
    ? "text-sky-900 dark:text-foreground"
    : "text-emerald-900 dark:text-foreground";
  const subTone = isStep1 ? "text-sky-800 dark:text-muted" : "text-emerald-800 dark:text-muted";

  return (
    <div className={`space-y-2 rounded-xl border p-3 ${shell}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm font-semibold ${titleTone}`}>
          {SLIP_STEP_TITLE[step]}
          {titleSuffix ?? ""}
        </p>
        {titleRight}
      </div>
      {subtitle ? <div className={`text-[11px] ${subTone}`}>{subtitle}</div> : null}
      {children}
      {actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
    </div>
  );
}

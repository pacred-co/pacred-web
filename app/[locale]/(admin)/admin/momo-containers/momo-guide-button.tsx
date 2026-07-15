"use client";

/**
 * "ⓘ คำอธิบายระบบ" — ปุ่ม + modal คู่มือใช้งานหน้า /admin/momo-containers (ภูม 2026-07-14).
 * รูปแบบเดียวกับหน้ายิงรับเข้าโกดัง (/admin/barcode/driver/import): กดปุ่ม → เด้ง modal
 * ขั้นตอนใช้งานเป็นข้อๆ → ปุ่ม "เข้าใจแล้ว" ปิด. เป็น onboarding ให้คนที่มาดึงข้อมูลเข้าต่อ
 * (owner ภูม: "อนาคตอาจไม่ใช่ภูมิที่ดึงข้อมูล คนอื่นมาทำต่อจะได้เข้าใจ").
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

export function MomoGuideButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
        <Info className="h-3.5 w-3.5" /> คำอธิบายระบบ
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)} role="button" tabIndex={-1}>
          <div className="flex w-full max-w-3xl max-h-[85vh] flex-col rounded-2xl bg-white dark:bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="flex items-center gap-2 text-base font-bold"><Info className="h-5 w-5 text-emerald-600" /> วิธีใช้งานระบบตรวจข้อมูล + นำเข้าระบบ MOMO</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-surface-alt" title="ปิด"><X className="h-4 w-4" /></button>
            </div>

            <ol className="flex-1 space-y-3 overflow-auto px-6 py-5 text-xs leading-relaxed text-foreground/90 [&>li]:list-decimal [&>li]:ml-4 marker:font-bold marker:text-emerald-600">
              <li>
                <strong>หน้านี้ทำอะไร:</strong> รวมข้อมูลจาก <strong>MOMO API</strong> + <strong>packing list (แต้ม)</strong> +
                <strong> MOMO Live</strong> มาเป็น &quot;รายแทรคกิ้งลูกค้า&quot; (1 แถว = 1 แทรค) → ตรวจ/แก้ให้ถูก →
                กด &quot;นำเข้าระบบ&quot; เพื่อสร้างรายการบิล (tb_forwarder).
              </li>
              <li>
                <strong>แท็บด้านบน:</strong> 🟡 ยังไม่เข้าระบบ = รอนำเข้า · ✅ เข้าระบบแล้ว · ❗ ไม่ตรง (Packing/Live) =
                ข้อมูล API ไม่ตรงกับ packing/Live (ต้องตรวจ) · ทั้งหมด. ตัวเลข = จำนวนรายการ.
              </li>
              <li>
                <strong>คอลัมน์สำคัญ:</strong> <strong>Code</strong> = PR ลูกค้า · <strong>Tracking</strong> = เลขแทรค ·
                <strong> Total Wt / Total Vol</strong> = น้ำหนัก/คิวรวม (<strong className="text-rose-600">ค่าที่ใช้คิดเงิน</strong>) ·
                <strong> W/L/H</strong> = ขนาดกล่อง · <strong>Status</strong> = สถานะ MOMO.
              </li>
              <li>
                <strong>เทียบ 3 ทาง</strong> (ใต้ Total Wt/Vol): บรรทัดบน = MOMO API ·{" "}
                <strong className="text-emerald-700">📦</strong> = packing list ·{" "}
                <strong className="text-sky-700">🟢</strong> = MOMO Live · <strong className="text-emerald-600">✓</strong> ตรง ·{" "}
                <strong className="text-rose-600">⚠</strong> ไม่ตรง (รวมดูที่แท็บ ❗ ไม่ตรง).
              </li>
              <li>
                <strong>ตรวจ PR ให้ถูก:</strong> คลิกรูปป้ายเพื่อดู PR บนกล่อง · ป้าย <span className="font-semibold text-emerald-700">พบในระบบ</span> = PR ใช้ได้ ·{" "}
                <span className="font-semibold text-red-700">ไม่มีในระบบ</span> = ต้องแก้ PR ก่อน (ข้อ 6).
              </li>
              <li>
                <strong>แก้ข้อมูลที่ MOMO ส่งผิด:</strong> คลิกค่าที่มีดินสอ <span className="text-amber-600">✎</span> เพื่อแก้ได้ทันที —
                <strong> น้ำหนัก · คิว · จำนวน · ขนาด W/L/H · PR</strong> (พิมพ์เช่น <code>PR545</code>) → กด Enter หรือ ✓ บันทึก.
                ⚠️ แก้ได้เฉพาะแถว <strong>&quot;ยังไม่เข้าระบบ&quot;</strong> เท่านั้น (เข้าระบบแล้ว = แก้ไม่ได้ เพื่อกันบิลเพี้ยน).
              </li>
              <li>
                <strong>ข้อมูลขาด? กด 🔄 ดึง Live เดี๋ยวนี้:</strong> จะพรีวิวรายการที่ยังไม่ครบ → ยืนยัน → MOMO เว็บเติม
                น้ำหนัก/คิว/เลขตู้ ที่ยังว่างให้อัตโนมัติ (ไม่ทับค่าที่มีอยู่ · ข้ามรายการที่วางบิลแล้ว).
              </li>
              <li>
                <strong>นำเข้าระบบ:</strong> ติ๊ก ☑ หน้ารายการที่ตรวจแล้ว (ติ๊กหัวตาราง = เลือกทั้งหน้า) → กดปุ่ม
                <strong> &quot;นำเข้าระบบ&quot;</strong> → พรีวิวข้อมูลครบ ตรวจอีกที → ยืนยัน. รายการจะกลายเป็น
                <strong> เข้าระบบแล้ว</strong> + มีลิงก์ไปใบนำเข้า (#เลข).
              </li>
              <li>
                <strong>พัสดุขาด</strong> (ถ้ามี · แถบแดงใต้ตาราง): พัสดุที่ packing มีแต่ MOMO API ไม่ส่ง → กด
                <strong> &quot;ดึงเข้าระบบ&quot;</strong> ระบบสร้างบิลให้ (กันซ้ำ + คิดราคาอัตโนมัติ).
              </li>
              <li>
                <strong>เครื่องมือ:</strong> ช่องค้นหา (แทรค/PR/เลขตู้) · <strong>⇅</strong> คลิกหัวคอลัมน์ = เรียง ·
                <strong> ⋮⋮</strong> ลากหัวคอลัมน์ = ย้ายตำแหน่ง · <strong>↺ คอลัมน์</strong> = รีเซ็ต ·
                <strong> Copy / Excel</strong> = ส่งออก · คลิก <strong>Container Name</strong> = ดูรายละเอียดทั้งตู้.
              </li>
            </ol>

            <div className="flex justify-end border-t border-border px-6 py-4">
              <button type="button" onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2 text-sm font-bold text-white hover:bg-primary-700">
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

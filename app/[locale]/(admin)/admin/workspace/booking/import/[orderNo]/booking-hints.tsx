"use client";

/**
 * Tooltip อธิบายฟิลด์เงื่อนไขงาน (owner ปอน 2026-07-10).
 *   เอาเมาส์ชี้ ⓘ ข้างชื่อฟิลด์ → ขึ้นคำอธิบายว่าอันนั้นคืออะไร
 *   (บางอันมีรูป ตู้/รถ/เรือ/แอร์ + ความจุ ตัน/CBM ให้เห็นภาพ).
 * pure-CSS group-hover (ไม่มี JS · แบบเดียวกับ components/ui/tooltip.tsx <Explain>).
 * align: ฟิลด์ฝั่งซ้าย=เปิดขวา · ฝั่งขวา=เปิดซ้าย · กลาง=จัดกลาง → กัน tooltip ล้นขอบ/ล้นจอ.
 */

import type { ReactNode } from "react";
import { Info } from "lucide-react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/** ⓘ ข้างชื่อฟิลด์ + popover เนื้อหา (รูป/ตาราง/ข้อความ) เวลา hover/focus. */
export function FieldHint({ content, align = "left" }: { content: ReactNode; align?: "left" | "center" | "right" }) {
  const pos = align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0";
  return (
    <span className="relative inline-flex items-center group align-middle">
      <span tabIndex={0} role="button" aria-label="ดูคำอธิบาย"
        className="ml-1 inline-flex shrink-0 cursor-help rounded-full text-[#9aa0a8] hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-300">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span role="tooltip"
        className={cx(
          "pointer-events-none absolute top-full z-50 mt-1.5 w-[17rem] max-w-[calc(100vw-1.5rem)] rounded-xl border border-[#e5e7eb] bg-white p-3 text-left text-[12px] font-normal leading-snug text-[#1f2937] opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          pos,
        )}>
        {content}
      </span>
    </span>
  );
}

/** แถวรูปเล็ก + ข้อความ (compact · ไม่สูงเกิน). */
function ImgRow({ src, alt, title, desc }: { src: string; alt: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="h-11 w-16 shrink-0 rounded-md border border-[#eceef1] object-cover" />
      <div className="min-w-0">
        <p className="font-bold text-[#1f2937]">{title}</p>
        <p className="text-[11px] leading-snug text-[#6f7278]">{desc}</p>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <p className="mt-0.5 leading-snug"><b className="text-[#1f2937]">{k}</b> <span className="text-[#6f7278]">— {v}</span></p>;
}

// ── การขนส่ง (รถ/เรือ/แอร์) + รูปเล็ก + ระยะเวลา ────────────────────────
export const TRANSPORT_HINT = (
  <div>
    <p className="mb-1.5 font-bold text-[#1f2937]">การขนส่ง — เลือกโหมด</p>
    <div className="space-y-2">
      <ImgRow src="/images/bannerdesktop/truckdesktop01.png" alt="ทางรถ" title="🚚 ทางรถ" desc="~5-7 วัน · เร็ว-ราคากลาง · นิยม cargo" />
      <ImgRow src="/images/bannerdesktop/bannershipdesktop01.png" alt="ทางเรือ" title="🚢 ทางเรือ" desc="~15-20 วัน · ถูกสุด · ของหนัก/ไม่รีบ" />
      <ImgRow src="/images/hero-section/banner/airbanner.png" alt="ทางอากาศ" title="✈️ ทางอากาศ" desc="1-3 วัน · เร็วสุด/แพง · คิดตาม กก." />
    </div>
  </div>
);

// ── ประเภท / ขนาดตู้ (LCL/FCL) + ตารางความจุ + รูป ─────────────────────
export const LOADTYPE_HINT = (
  <div>
    <p className="mb-1.5 font-bold text-[#1f2937]">ประเภท / ขนาดตู้</p>
    <div className="mb-2 overflow-hidden rounded-md border border-[#eceef1]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/promotion/fclimportchinman.png" alt="ตู้คอนเทนเนอร์" loading="lazy" className="h-14 w-full object-cover" />
    </div>
    <Line k="LCL (รวมตู้)" v="แชร์ตู้ · คิดตามปริมาตร/น้ำหนัก · ของไม่เต็มตู้" />
    <Line k="FCL (เต็มตู้)" v="เหมาทั้งตู้ · จ่ายเป็นตู้ · ของเยอะ/ไม่ปนเจ้าอื่น" />
    <div className="mt-2 overflow-hidden rounded-md border border-[#eceef1]">
      <table className="w-full text-[11px]">
        <thead className="bg-[#f6f7fa] text-[#6f7278]"><tr><th className="px-2 py-1 text-left font-semibold">ตู้</th><th className="px-2 py-1 text-right font-semibold">น้ำหนัก*</th><th className="px-2 py-1 text-right font-semibold">ปริมาตร*</th></tr></thead>
        <tbody className="text-[#1f2937]">
          <tr className="border-t border-[#eceef1]"><td className="px-2 py-1">20&#39;</td><td className="px-2 py-1 text-right">~28 ตัน</td><td className="px-2 py-1 text-right">~28 CBM</td></tr>
          <tr className="border-t border-[#eceef1]"><td className="px-2 py-1">40&#39; HC</td><td className="px-2 py-1 text-right">~28 ตัน</td><td className="px-2 py-1 text-right">~76 CBM</td></tr>
          <tr className="border-t border-[#eceef1]"><td className="px-2 py-1">2 × 40&#39;</td><td className="px-2 py-1 text-right">~56 ตัน</td><td className="px-2 py-1 text-right">~152 CBM</td></tr>
        </tbody>
      </table>
    </div>
    <p className="mt-1 text-[10px] text-[#9aa0a8]">* โดยประมาณ · ขึ้นกับชนิดสินค้า/การจัดเรียง</p>
  </div>
);

// ── TERM (Incoterm) ───────────────────────────────────────────────────
export const TERM_HINT = (
  <div>
    <p className="mb-1 font-bold text-[#1f2937]">TERM (Incoterm) — ใครจ่ายถึงไหน</p>
    <Line k="EXW" v="หน้าโรงงานผู้ขาย — ผู้ซื้อจัดการขนส่ง + ภาษีเองหมด" />
    <Line k="FOB" v="ผู้ขายส่งขึ้นยานพาหนะต้นทาง + พิธีการส่งออก — ผู้ซื้อจ่ายค่าระวาง + ปลายทาง + อากร" />
    <Line k="CIF" v="ผู้ขายจ่ายค่าระวาง + ประกัน ถึงท่าปลายทาง — ผู้ซื้อจ่ายอากร + ในประเทศ" />
    <Line k="DDP" v="ส่งถึงมือ จ่ายอากร + ภาษีปลายทางครบ — จบที่เดียว (= แพ็กเกจ cargo)" />
  </div>
);

// ── ENTER (การยื่นใบขน) ───────────────────────────────────────────────
export const ENTER_HINT = (
  <div>
    <p className="mb-1 font-bold text-[#1f2937]">ENTER — ประเภทการยื่นใบขน</p>
    <Line k="Normal" v="นำเข้าปกติ" />
    <Line k="Change Status" v="เปลี่ยนสถานะใบขน" />
    <Line k="Document Amend" v="แก้ไขเอกสารใบขน" />
    <Line k="Direct" v="นำเข้าตรง (ชื่อลูกค้าเอง)" />
    <Line k="Indirect" v="นำเข้าผ่านตัวแทน/ชื่อบริษัท" />
  </div>
);

// ── ประเภทสินค้า ──────────────────────────────────────────────────────
export const PRODUCT_HINT = (
  <div>
    <p className="mb-1 font-bold text-[#1f2937]">ประเภทสินค้า — เอกสาร/ใบอนุญาต</p>
    <Line k="ทั่วไป" v="ไม่ต้องขออนุญาตพิเศษ" />
    <Line k="มอก." v="ต้องมีใบรับรอง มอก. (ของเล่น/เครื่องใช้ไฟฟ้า)" />
    <Line k="อย." v="ต้องขออนุญาต อย. (อาหาร/ยา/เครื่องสำอาง)" />
    <Line k="ลิขสิทธิ์" v="แบรนด์/ลิขสิทธิ์ — เรทพิเศษ + ต้องมีเอกสารสิทธิ์" />
  </div>
);

// ── SPECIAL (บริการเสริม) ─────────────────────────────────────────────
export const SPECIAL_HINT = (
  <div>
    <p className="mb-1 font-bold text-[#1f2937]">บริการเสริม (เลือกได้หลายอย่าง)</p>
    <Line k="License" v="ขอใบอนุญาตนำเข้า (สินค้าควบคุม)" />
    <Line k="Manpower" v="จ้างแรงงานขน/แพ็คเพิ่ม" />
    <Line k="Local Transport" v="ค่าขนส่งในประเทศปลายทาง (ส่งถึงที่)" />
    <Line k="Overtime" v="ทำงานนอกเวลา/เร่งด่วน" />
    <Line k="เปิดใบขน" v="บริการเปิดใบขนสินค้าแยก (ออกใบขนอย่างเดียว)" />
    <Line k="ใบขนพ่วง" v="เปิดใบขนพ่วง — พ่วงกับใบขนอีกใบ (นำเข้าในชื่อ/ใบอนุญาตของอีกเจ้า)" />
  </div>
);

// ── เอกสาร (doc mode) — ตัวเลือกขึ้นกับ TERM (owner พี่ป๊อป) ────────────
export const DOCMODE_HINT = (
  <div>
    <p className="mb-1 font-bold text-[#1f2937]">เอกสารที่ออกให้ลูกค้า</p>
    <Line k="ไม่รับเอกสาร" v="DDP เหมาภาษี = นำเข้าชื่อชิปปิ้ง (ลูกค้าไม่ได้เอกสาร · ราคารวมภาษีแล้ว) · หรือลูกค้าไม่ต้องการเอกสาร" />
    <Line k="ใบขน (ชื่อลูกค้า)" v="ออกใบขนสินค้าในชื่อลูกค้า" />
    <Line k="ใบกำกับเต็ม" v="ใบกำกับภาษีเต็มรูปแบบ (VAT 7%) — เฉพาะ EXW/FOB/CIF (นำเข้าชื่อลูกค้า) · DDP เหมาภาษี ไม่มี" />
    <p className="mt-1.5 text-[10px] text-[#9aa0a8]">* ฝากโอน/ฝากสั่ง (บริการแยก) มีครบ 3: ไม่รับเอกสาร / ใบขน / ใบกำกับเต็ม</p>
  </div>
);

// ── ข้อความสั้น ───────────────────────────────────────────────────────
export const POL_HINT = <div><b className="text-[#1f2937]">ต้นทาง (POL)</b><p className="mt-0.5 text-[#6f7278]">ท่า/เมืองที่ของออกเดินทาง (Port of Loading) — จิ้มเลือกประเทศ + พอร์ท</p></div>;
export const POD_HINT = <div><b className="text-[#1f2937]">ปลายทาง (POD)</b><p className="mt-0.5 text-[#6f7278]">ท่า/เมืองที่ของไปถึง (Port of Discharge)</p></div>;
export const COMMODITY_HINT = <div><b className="text-[#1f2937]">สินค้า</b><p className="mt-0.5 text-[#6f7278]">ชื่อสินค้าที่นำเข้า — ใช้ทำเอกสาร + ระบุพิกัดศุลกากร (HS)</p></div>;
export const CARRIER_HINT = <div><b className="text-[#1f2937]">สายขนส่ง</b><p className="mt-0.5 text-[#6f7278]">สายเรือ / สายการบิน / สายรถ ที่ใช้ขนส่ง (เปลี่ยนตามโหมดที่เลือก)</p></div>;
export const WEIGHT_HINT = <div><b className="text-[#1f2937]">น้ำหนัก (กก.)</b><p className="mt-0.5 text-[#6f7278]">น้ำหนักรวมโดยประมาณ — ใช้ประเมินราคา + เลือกรถลาก/ขนาดตู้</p></div>;
export const AGENT_HINT = <div><b className="text-[#1f2937]">เอเจนต์</b><p className="mt-0.5 text-[#6f7278]">ตัวแทน/พาร์ทเนอร์ที่ดำเนินการขนส่งให้ (เช่น Pacred, TTP)</p></div>;

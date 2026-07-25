"use client";

/**
 * การ์ดจุดส่งบนมือถือ (ปอน 2026-07-24) — เลย์เอาต์ตามภาพที่ owner ส่ง:
 *   หัวการ์ด = (○ ติ๊ก) จำนวนรายการ + แท็กขนส่ง/สถานะ (badge มนๆ pill · บังคับแถวเดียว)
 *   ตัว      = รูป | รหัส+ชื่อ(บรรทัดเดียว) + ที่อยู่ย่อ(อำเภอ จังหวัด ไปรษณีย์) + กล่อง/กก./คิว + ปุ่ม ›
 *   ท้าย     = ถ่ายส่ง · แผนที่ · โทร
 *   กด ›     = กางรายละเอียดทั้งหมด (ที่อยู่เต็ม + ตารางออเดอร์ + พิมพ์ใบส่ง/สติกเกอร์)
 *
 * ติ๊กวงกลม = ทำเครื่องหมาย "จัดการจุดนี้แล้ว" → ทั้งการ์ดเป็นเขียว ตัวอักษรขาว.
 * ⚠️ ตอนนี้เป็นสถานะ "มองเห็น" ฝั่งเบราว์เซอร์อย่างเดียว (รีเฟรชแล้วรีเซ็ต) — ยังไม่
 * บันทึกลง DB / ไม่เปลี่ยนสถานะจัดส่งจริง. ระบายสีทีละ element (ไม่ใช่ override เหมา
 * ทั้งกล่อง) เพื่อไม่ให้สีขาวรั่วเข้าไปในโมดัลถ่ายรูปที่ซ้อนอยู่ในการ์ด.
 */

import { useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { Check, Phone, MapPin, ChevronRight, Printer, Tag, Camera } from "lucide-react";
import { DriverPhotoEditDialog } from "./driver-photo-edit-dialog";
import { PinLocationButton } from "./pin-location-button";

export type DriverStopCardItem = {
  id: number;
  refCode: string;
  tracking: string;
  boxes: number;
  cbm: number;
  weight: number;
};

export function DriverStopCard({
  userId,
  badges,
  customerName,
  placeholder,
  district,
  province,
  zip,
  fullAddress,
  boxes,
  weight,
  cbm,
  phones,
  mapHref,
  hasPin,
  heroPhoto,
  editableIds,
  hasPhoto,
  slipHref,
  stickersHref,
  items,
}: {
  userId: string | null;
  /** แท็กขนส่ง + สถานะ (+ ส่งไม่ได้) render จาก server — คงสีเดิม ไม่ผูกกับ done */
  badges: ReactNode;
  customerName: string;
  placeholder: boolean;
  district: string;
  province: string;
  zip: string;
  fullAddress: string;
  boxes: number;
  weight: number;
  cbm: number;
  phones: string[];
  mapHref: string;
  hasPin: boolean;
  heroPhoto: string | null;
  editableIds: number[];
  hasPhoto: boolean;
  slipHref: string;
  stickersHref: string;
  items: DriverStopCardItem[];
}) {
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);

  const phone = phones[0] ?? null;
  const addrFace = [district, province, zip].filter(Boolean).join(" ");

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm space-y-3 ${
        done ? "border-emerald-600 bg-emerald-600" : "border-border bg-white"
      }`}
    >
      {/* หัวการ์ด — ติ๊กวงกลม + จำนวนรายการ + แท็ก · บรรทัดเดียวทั้งหมด (owner 2026-07-24 · ไม่ wrap) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setDone((v) => !v)}
          aria-pressed={done}
          aria-label={done ? "ยกเลิกเครื่องหมายจัดการแล้ว" : "ทำเครื่องหมายว่าจัดการแล้ว"}
          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
            done
              ? "border-white bg-white text-emerald-600"
              : "border-slate-400 text-transparent hover:border-emerald-500 hover:text-emerald-400"
          }`}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
        {/* จำนวนรายการในจุดนี้ (แทนรหัสลูกค้า · owner 2026-07-24) */}
        <span className={`shrink-0 text-sm font-bold ${done ? "text-white" : "text-foreground"}`}>
          {items.length} รายการ
        </span>
        {/* แท็กขนส่ง+สถานะ บังคับอยู่แถวเดียวกัน ไม่แตกบรรทัด (owner 2026-07-24) */}
        <div className="flex shrink-0 items-center gap-1.5">{badges}</div>
      </div>

      {/* ตัวการ์ด — รูป | ข้อมูล + ปุ่ม › */}
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          {heroPhoto ? (
            <a href={heroPhoto} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroPhoto}
                alt="รูปส่งสินค้า"
                className="h-24 w-full rounded-lg border border-border object-cover"
              />
            </a>
          ) : (
            <div
              className={`flex h-24 w-full items-center justify-center rounded-lg border border-dashed ${
                done ? "border-white/40 text-white/70" : "border-border text-muted"
              }`}
            >
              <Camera className="h-6 w-6" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* รหัสลูกค้า + ชื่อ บรรทัดเดียว (owner 2026-07-24 "รหัสอยู่แถวเดียวกับชื่อ") — ชื่อยาวตัด … */}
          <div className="flex items-baseline gap-1.5">
            {userId && (
              <span className={`shrink-0 font-mono text-sm font-bold ${done ? "text-white" : "text-primary-600"}`}>
                {userId}
              </span>
            )}
            <span className={`min-w-0 truncate text-sm font-bold ${done ? "text-white" : "text-foreground"}`}>
              {customerName}
            </span>
          </div>
          {/* ที่อยู่ย่อ = อำเภอ จังหวัด ไปรษณีย์ (owner "เอาอันที่ไฮไลต์") */}
          {placeholder ? (
            <p
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
                done ? "bg-white/15 text-white" : "border border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              ⚠️ ยังไม่ระบุที่อยู่จัดส่ง
            </p>
          ) : (
            <div className={`flex items-start gap-1 text-xs leading-snug ${done ? "text-white" : "text-foreground/80"}`}>
              {/* ไอคอนปักหมุด (ใหญ่+แดง) กดแล้วเปิด popup ปักหมุดที่อยู่ (owner 2026-07-24) */}
              <PinLocationButton
                iconOnly
                fids={items.map((it) => it.id)}
                addressText={fullAddress}
                hasPin={hasPin}
                className="mt-0.5 shrink-0 text-red-600 hover:text-red-700"
              />
              <span>{addrFace || "—"}</span>
            </div>
          )}
          {/* กล่อง · กก. · คิว (รวมทั้งจุด) — บรรทัดเดียว ตัวบาง · ดันชิดล่าง = พอดีขอบล่างรูป (owner 2026-07-24) */}
          <p className={`mt-auto whitespace-nowrap text-[11px] font-normal ${done ? "text-white" : "text-foreground"}`}>
            {boxes} กล่อง <span className={done ? "text-white/60" : "text-muted"}>•</span> {weight.toFixed(2)} KG{" "}
            <span className={done ? "text-white/60" : "text-muted"}>•</span> {cbm.toFixed(3)} CBM
          </p>
        </div>

        {/* ปุ่ม › ข้างขวา — กางรายละเอียด (owner 2026-07-24 · ไม่มี badge/ขอบ) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "ซ่อนรายละเอียด" : "ดูรายละเอียดทั้งหมด"}
          className={`flex shrink-0 items-center justify-center px-1 transition ${
            done ? "text-white/80 hover:text-white" : "text-muted hover:text-foreground"
          }`}
        >
          <ChevronRight className={`h-6 w-6 transition ${open ? "rotate-90" : ""}`} />
        </button>
      </div>

      {/* ท้ายการ์ด — ถ่ายส่ง · แผนที่ · โทร (owner 2026-07-24 · เรียงตามนี้ · ปุ่มกลมมน rounded-full) */}
      <div className="grid grid-cols-3 gap-2">
        {editableIds.length > 0 ? (
          <DriverPhotoEditDialog itemIds={editableIds} hasPhoto={hasPhoto} gradient />
        ) : (
          <span
            className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1.5 text-xs font-semibold ${
              done ? "border-white/40 bg-white/15 text-white" : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            <Check className="h-3.5 w-3.5" /> ส่งครบแล้ว
          </span>
        )}
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1.5 text-xs font-semibold ${
            done
              ? "border-white/40 bg-white/15 text-white"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          <MapPin className="h-3.5 w-3.5" /> แผนที่
        </a>
        {phone ? (
          <a
            href={`tel:${phone}`}
            className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1.5 text-xs font-semibold ${
              done ? "border-white/40 bg-white/15 text-white" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
          >
            <Phone className="h-3.5 w-3.5" /> โทร
          </a>
        ) : (
          <span
            className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-2 py-1.5 text-xs font-semibold opacity-50 ${
              done ? "border-white/40 text-white" : "border-border text-muted"
            }`}
          >
            <Phone className="h-3.5 w-3.5" /> โทร
          </span>
        )}
      </div>

      {/* ดร็อปดาวน์ — รายละเอียดทั้งหมด (ที่อยู่เต็ม + ตารางออเดอร์ + พิมพ์) */}
      {open && (
        <div
          className={`space-y-2 rounded-lg border p-2 ${
            done ? "border-white/30 bg-white/5" : "border-border bg-surface-alt/40"
          }`}
        >
          {!placeholder && (
            <p className={`text-[11px] leading-relaxed ${done ? "text-white" : "text-foreground/80"}`}>
              <span className={done ? "text-white/70" : "text-muted"}>ที่อยู่: </span>
              {fullAddress || "—"}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className={done ? "text-white/80" : "text-muted"}>
                <tr className="text-left">
                  <th className="px-1.5 py-1 font-semibold">ออเดอร์</th>
                  <th className="px-1.5 py-1 font-semibold">แทรคกิ้ง</th>
                  <th className="px-1.5 py-1 text-right font-semibold">กล่อง</th>
                  <th className="px-1.5 py-1 text-right font-semibold">CBM</th>
                  <th className="px-1.5 py-1 text-right font-semibold">KG</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className={`border-t ${done ? "border-white/25" : "border-border"}`}>
                    <td className="px-1.5 py-1">
                      <Link
                        href={`/admin/forwarders/${it.id}`}
                        className={`font-mono ${done ? "text-white underline" : "text-primary-600"}`}
                      >
                        {it.refCode}
                      </Link>
                    </td>
                    <td className={`px-1.5 py-1 font-mono break-all ${done ? "text-white" : ""}`}>{it.tracking}</td>
                    <td className={`px-1.5 py-1 text-right ${done ? "text-white" : ""}`}>{it.boxes}</td>
                    <td className={`px-1.5 py-1 text-right ${done ? "text-white" : ""}`}>{it.cbm.toFixed(5)}</td>
                    <td className={`px-1.5 py-1 text-right ${done ? "text-white" : ""}`}>{it.weight.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={slipHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-[#A01824] to-[#C82333] px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-[#87141E] hover:to-[#B21F2D]"
            >
              <Printer className="h-3.5 w-3.5 shrink-0" /> ใบส่งสินค้า
            </a>
            <a
              href={stickersHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-gradient-to-r from-sky-600 to-sky-500 px-2 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:from-sky-700 hover:to-sky-600"
            >
              <Tag className="h-3.5 w-3.5 shrink-0" /> สติกเกอร์
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

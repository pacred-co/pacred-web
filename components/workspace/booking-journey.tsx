"use client";

/**
 * BookingJourney — status stepper ของใบ Booking (owner ปอน 2026-07-13).
 *
 * แนวคิด: มี 9 ขั้นมาตรฐานของ freight (โรงงาน→ต้นทาง→ส่งออก→ท่าต้นทาง→ขนส่งหลัก→
 *   ท่าปลายทาง→นำเข้า→ปลายทาง→ผู้ซื้อ) · รูปไอคอนอยู่ที่ /images/status/*.png (mode-aware
 *   สำหรับท่า+ขนส่งหลัก: pol{sea|air|truck} · {sea|air|truck} · pod{sea|air|truck}).
 *
 * "สถานะที่โชว์ในใบ booking ขึ้นกับ TERM กับ ขนส่ง" — ตาม Incoterms chart ของ Pacred (นำเข้า):
 *   Pacred ทำจากขั้น 1 → "จุดส่งมอบ" ของแต่ละ term · ที่เหลือ = ลูกค้า/ปลายทาง.
 *   EXW→ขั้น1 · FOB→1-4 · CIF→1-6 · DDP→1-9 (Door to Door) · term อื่น = ครบวงจร.
 *   bookingStages(term, mode) คืน "เฉพาะช่วงที่ Pacred รับผิดชอบ" (รูป mode-aware).
 *
 * แต่ละสถานะหลัก "กดย่อยได้" → โชว์ process ย่อยของ loop งานนั้น (SubProcessTimeline).
 *   ⚠️ SUB = ร่าง placeholder · owner เติม/แก้ได้.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Mode = "sea" | "air" | "truck";

function normalizeMode(raw: string): Mode {
  const s = (raw || "").toUpperCase();
  if (s.includes("AIR")) return "air";
  if (s.includes("TRUCK") || s.includes("รถ")) return "truck";
  return "sea";
}

type StageDef = {
  key: string;
  img: (m: Mode) => string;
  th: (m: Mode) => string;
  en: (m: Mode) => string;
  subs: string[]; // process ย่อยของ loop งาน (placeholder · owner แก้ได้)
};

// 9 ขั้นมาตรฐาน (index 0..8) — ป้ายตรงตาม Incoterms chart ของ Pacred (นำเข้า)
const STAGES: StageDef[] = [
  { key: "seller",      img: () => "factory",   th: () => "ผู้ขาย / โรงงาน",     en: () => "Seller / Factory",         subs: ["รับบรีฟ / ให้คำปรึกษา", "ประเมินเงื่อนไข + วางแผน", "ยืนยันงาน / นัดรับของ"] },
  { key: "originTrans", img: () => "transport", th: () => "ขนส่งในประเทศต้นทาง", en: () => "Transport to Origin",      subs: ["จัดรถไปรับที่โรงงาน", "ขนถึงโกดัง / ท่าต้นทาง", "ตรวจนับ + ชั่งน้ำหนัก"] },
  { key: "exportCus",   img: () => "customs",   th: () => "พิธีการส่งออก",        en: () => "Export Customs",           subs: ["เตรียมเอกสารส่งออก", "ยื่นใบขนขาออก", "ตรวจปล่อยขาออก"] },
  { key: "pol",         img: (m) => `pol${m}`,  th: (m) => (m === "air" ? "โหลดขึ้นเครื่อง (ต้นทาง)" : m === "truck" ? "ขึ้นรถ (ต้นทาง)" : "ยกตู้ขึ้นเรือ (ต้นทาง)"), en: () => "Loading Port", subs: ["จองระวาง / สายเรือ-สายการบิน", "บรรจุ / โหลดขึ้นพาหนะ", "ออก B/L - AWB"] },
  { key: "mainCarry",   img: (m) => m,          th: (m) => (m === "air" ? "ขนส่งทางอากาศ" : m === "truck" ? "ขนส่งทางรถ" : "ขนส่งทางทะเล"), en: () => "Main Carriage", subs: ["ออกจากต้นทาง (ETD)", "ระหว่างขนส่ง + ประกัน", "ถึงปลายทาง (ETA)"] },
  { key: "pod",         img: (m) => `pod${m}`,  th: (m) => (m === "air" ? "ลงจากเครื่อง (ปลายทาง)" : m === "truck" ? "ลงรถ (ปลายทาง)" : "ยกตู้ลงจากเรือ (ปลายทาง)"), en: () => "Destination Port", subs: ["พาหนะเทียบท่า", "ขนถ่ายลงจากพาหนะ", "รอตรวจปล่อย"] },
  { key: "importCus",   img: () => "customs",   th: () => "พิธีการนำเข้า",         en: () => "Import Customs",           subs: ["ยื่นใบขนขาเข้า", "ชำระอากร / ภาษี", "ตรวจปล่อยสินค้า"] },
  { key: "destTrans",   img: () => "transport", th: () => "ขนส่งในประเทศปลายทาง", en: () => "Transport to Destination", subs: ["จัดรถส่งปลายทาง", "ระหว่างจัดส่ง", "ถึงปลายทาง"] },
  { key: "buyer",       img: () => "warehouse", th: () => "ส่งถึงปลายทาง",         en: () => "Delivery to Door",         subs: ["จัดส่งถึงมือลูกค้า", "เซ็นรับ / ถ่ายรูปหลักฐาน", "ปิดงาน (Door to Door)"] },
];

// TERM → index ขั้น "สุดท้าย" ที่ Pacred รับผิดชอบ (Incoterms chart Pacred · นำเข้า)
// Pacred ทำจากขั้น 1 → จุดส่งมอบของ term นั้น · ที่เหลือ = ลูกค้า/ปลายทาง
const TERM_END: Record<string, number> = {
  EXW: 0, // Pacred = ผู้ขาย/โรงงาน (รับบรีฟ/ให้คำปรึกษา · ถ้าลูกค้าต้องการ)
  FOB: 3, // Pacred = 1-4 (ถึงยกตู้ขึ้นเรือ ต้นทาง)
  CIF: 5, // Pacred = 1-6 (ถึงยกตู้ลงจากเรือ ปลายทาง)
  DDP: 8, // Pacred = 1-9 (Door to Door · ครบวงจร)
};

export type BookingStage = { key: string; img: string; th: string; en: string; subs: string[] };

/** ช่วง stage ที่ Pacred รับผิดชอบ ตาม term (ขั้น 1 → จุดส่งมอบ) + รูป mode-aware */
export function bookingStages(term: string, modeRaw: string): BookingStage[] {
  const mode = normalizeMode(modeRaw);
  const t = (term || "").toUpperCase().trim();
  const end = t in TERM_END ? TERM_END[t] : 8; // term อื่น = Pacred ดูแลครบวงจร (Door to Door)
  return STAGES.slice(0, end + 1).map((s) => ({ key: s.key, img: s.img(mode), th: s.th(mode), en: s.en(mode), subs: s.subs }));
}

/**
 * แผงย่อย (process ย่อย) แบบ timeline แนวตั้ง — ใช้ร่วมกันหลาย stepper.
 * โผล่ตอนกดสถานะหลัก → โชว์ขั้นตอนย่อยของ loop งานนั้น.
 */
export function SubProcessTimeline({ title, subs, icon }: { title: string; subs: string[]; icon?: ReactNode }) {
  return (
    <ol className="relative pl-1">
      {/* main node = จุดที่เส้นลงมาจากสถานะหลัก (เชื่อมต่อ ไม่ใช่กล่องแยก) */}
      <li className="flex gap-3 pb-2.5">
        <div className="flex w-8 flex-col items-center">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-600 text-white shadow-sm">
            {icon ?? <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
          <span className="min-h-[14px] w-0.5 flex-1 bg-primary-300 dark:bg-primary-500/40" />
        </div>
        <span className="pt-1.5 text-xs font-bold text-primary-700 dark:text-primary-300">{title}</span>
      </li>

      {subs.length === 0 ? (
        <li className="pl-11 text-[11px] text-muted">— ยังไม่ได้กำหนดขั้นตอนย่อย —</li>
      ) : (
        subs.map((s, i) => (
          <li key={i} className="flex gap-3 pb-2.5 last:pb-0">
            <div className="flex w-8 flex-col items-center">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-primary-300 bg-white text-[10px] font-bold text-primary-700 dark:border-primary-500/40 dark:bg-surface dark:text-primary-300">{i + 1}</span>
              {i < subs.length - 1 && <span className="min-h-[10px] w-0.5 flex-1 bg-primary-200 dark:bg-primary-500/30" />}
            </div>
            <span className="pt-0.5 text-xs leading-snug text-foreground">{s}</span>
          </li>
        ))
      )}
    </ol>
  );
}

/**
 * @param progress 0..1 — ความคืบหน้าเข้าไปในช่วง stage (0 = เพิ่งเริ่ม · 1 = ถึงปลายทาง)
 * @param compact  ย่อไอคอน/label (ใช้ในการ์ดย่อ)
 * แต่ละสถานะหลัก กดได้ → ขยายโชว์ process ย่อย (SubProcessTimeline) ข้างล่าง.
 */
export function BookingJourney({ term, mode, progress = 0, compact = false }: { term: string; mode: string; progress?: number; compact?: boolean }) {
  const stages = bookingStages(term, mode);
  const p = Math.max(0, Math.min(1, progress));
  const current = stages.length <= 1 ? 0 : Math.round(p * (stages.length - 1));
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const open = openIdx !== null && openIdx < stages.length ? stages[openIdx] : null;
  // ดร็อปดาวน์ให้ตกลงมา "ใต้จุดที่กด" — clamp ไม่ให้เลยขอบ (จุดขวาสุด = ชิดขอบพอดี ไม่ทะลุ)
  const openLeft = openIdx === null ? undefined : `clamp(0px, calc(${((openIdx + 0.5) / stages.length) * 100}% - 1.25rem), calc(100% - 240px))`;

  return (
    <div>
      <ol className={`flex items-start overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${compact ? "gap-0.5 pb-0.5" : "gap-1 pb-1"}`}>
        {stages.map((s, i) => {
          const done = i <= current;
          const active = openIdx === i;
          return (
            <li key={`${s.key}-${i}`} className={`flex flex-1 flex-col items-center text-center ${compact ? "min-w-[58px]" : "min-w-[84px]"}`}>
              <div className="flex w-full items-center">
                <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : i <= current ? "bg-primary-500" : "bg-border"}`} />
                <button type="button" onClick={() => setOpenIdx(active ? null : i)} aria-label={s.th} title="กดดูขั้นตอนย่อย"
                  className={`grid shrink-0 cursor-pointer place-items-center transition-all ${compact ? "h-9 w-9" : "h-14 w-14"} ${done ? "" : "opacity-40 grayscale"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/images/status/${s.img}.png`} alt={s.th} className={`object-contain ${compact ? "h-8 w-8" : "h-12 w-12"}`} />
                </button>
                <span className={`h-0.5 flex-1 ${i === stages.length - 1 ? "opacity-0" : i < current ? "bg-primary-500" : "bg-border"}`} />
              </div>
              <button
                type="button"
                onClick={() => setOpenIdx(active ? null : i)}
                aria-expanded={active}
                className={`group mt-1 flex flex-col items-center rounded-lg px-1 py-0.5 transition-colors hover:bg-primary-50 dark:hover:bg-primary-500/10 ${active ? "bg-primary-50 dark:bg-primary-500/10" : ""}`}
                title="กดดูขั้นตอนย่อย"
              >
                <span className={`font-semibold leading-tight ${compact ? "text-[10px]" : "text-[11px]"} ${done ? "text-foreground" : "text-muted"}`}>{s.th}</span>
                {!compact && <span className="mt-0.5 hidden text-[10px] leading-tight text-muted sm:block">{s.en}</span>}
                <ChevronDown className={`mt-0.5 h-3 w-3 text-muted transition-transform ${active ? "rotate-180 text-primary-600" : ""}`} />
              </button>
            </li>
          );
        })}
      </ol>

      {open && (
        <div className="mt-2 w-[240px] max-w-full" style={{ marginInlineStart: openLeft }}>
          <SubProcessTimeline
            title={open.th}
            subs={open.subs}
            icon={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/images/status/${open.img}.png`} alt="" className="h-6 w-6 object-contain" />
            }
          />
        </div>
      )}
    </div>
  );
}

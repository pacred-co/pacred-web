/**
 * BookingJourney — status stepper ของใบ Booking (owner ปอน 2026-07-13).
 *
 * แนวคิด: มี 9 ขั้นมาตรฐานของ freight (โรงงาน→ต้นทาง→ส่งออก→ท่าต้นทาง→ขนส่งหลัก→
 *   ท่าปลายทาง→นำเข้า→ปลายทาง→ผู้ซื้อ) · รูปไอคอนอยู่ที่ /images/status/*.png (mode-aware
 *   สำหรับท่า+ขนส่งหลัก: pol{sea|air|truck} · {sea|air|truck} · pod{sea|air|truck}).
 *
 * "สถานะที่โชว์ในใบ booking ขึ้นกับ TERM กับ ขนส่ง" — Incoterms กำหนดว่า Pacred (ฝั่งผู้ซื้อ/
 *   นำเข้าไทย) รับช่วงงานตั้งแต่ขั้นไหน → bookingStages(term, mode) คืน "ช่วงที่ Pacred ทำ".
 *   กฎพิเศษ owner: CIF + air = เริ่มที่ "พิธีการนำเข้า" (Pacred มารับเคลียร์ต่อจากคนอื่น).
 *   ⚠️ ตาราง TERM_START = ร่างแรกจาก Incoterms chart · owner ปรับได้ตามจริง.
 */

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
};

// 9 ขั้นมาตรฐาน (index 0..8)
const STAGES: StageDef[] = [
  { key: "seller",      img: () => "factory",   th: () => "ผู้ขาย / โรงงาน",   en: () => "Seller / Factory" },
  { key: "originTrans", img: () => "transport", th: () => "ขนส่งไปต้นทาง",     en: () => "Transport to Origin" },
  { key: "exportCus",   img: () => "customs",   th: () => "พิธีการส่งออก",      en: () => "Export Customs" },
  { key: "pol",         img: (m) => `pol${m}`,  th: () => "ท่าต้นทาง",          en: () => "Loading Port" },
  { key: "mainCarry",   img: (m) => m,          th: (m) => (m === "air" ? "ขนส่งทางอากาศ" : m === "truck" ? "ขนส่งทางรถ" : "ขนส่งทางทะเล"), en: () => "Main Carriage" },
  { key: "pod",         img: (m) => `pod${m}`,  th: () => "ท่าปลายทาง",         en: () => "Destination Port" },
  { key: "importCus",   img: () => "customs",   th: () => "พิธีการนำเข้า",       en: () => "Import Customs" },
  { key: "destTrans",   img: () => "transport", th: () => "ขนส่งไปปลายทาง",    en: () => "Transport to Destination" },
  { key: "buyer",       img: () => "warehouse", th: () => "ปลายทาง / ผู้ซื้อ",   en: () => "Buyer's Premises" },
];

// TERM → index ขั้นแรกที่ Pacred (ฝั่งผู้ซื้อ/นำเข้า) เริ่มรับผิดชอบ (จาก Incoterms chart)
const TERM_START: Record<string, number> = {
  EXW: 1, // ไปรับที่โรงงาน → ส่งถึงมือ (Pacred ทำเกือบทั้งเส้น)
  FCA: 3, // ผู้ขายเคลียร์ส่งออก+ส่งถึงจุดรับ → Pacred จากท่าต้นทาง
  FAS: 3, // ผู้ขายส่งถึงข้างเรือ → Pacred จากท่าต้นทาง
  FOB: 4, // ผู้ขายโหลดขึ้นเรือ → Pacred จากขนส่งหลัก
  CFR: 5, // ผู้ขายจ่ายเฟรทถึงท่าปลายทาง → Pacred จากท่าปลายทาง
  CIF: 5, // ผู้ขายเฟรท+ประกันถึงท่าปลายทาง → Pacred จากท่าปลายทาง
  CPT: 5,
  CIP: 5,
  DAP: 6, // ผู้ขายส่งถึงปลายทาง (ยังไม่เคลียร์นำเข้า) → Pacred นำเข้า+ส่งต่อ
  DPU: 7, // ผู้ขายส่งถึง+ลงของที่ปลายทาง → Pacred ส่งต่อ
  DDP: 8, // ผู้ขายทำครบรวมอากร → Pacred แค่รับปลายทาง
};

export type BookingStage = { key: string; img: string; th: string; en: string };

/** ช่วง stage ที่ Pacred รับผิดชอบ ตาม term + ขนส่ง */
export function bookingStages(term: string, modeRaw: string): BookingStage[] {
  const mode = normalizeMode(modeRaw);
  const t = (term || "").toUpperCase().trim();
  let start = t in TERM_START ? TERM_START[t] : 1;
  // owner rule: CIF + air = Pacred มารับ "เคลียร์" ต่อ (ข้ามท่าปลายทาง เริ่มพิธีการนำเข้า)
  if (t === "CIF" && mode === "air") start = 6;
  return STAGES.slice(start).map((s) => ({ key: s.key, img: s.img(mode), th: s.th(mode), en: s.en(mode) }));
}

/**
 * @param progress 0..1 — ความคืบหน้าเข้าไปในช่วง stage (0 = เพิ่งเริ่ม · 1 = ถึงปลายทาง)
 */
export function BookingJourney({ term, mode, progress = 0 }: { term: string; mode: string; progress?: number }) {
  const stages = bookingStages(term, mode);
  const p = Math.max(0, Math.min(1, progress));
  const current = stages.length <= 1 ? 0 : Math.round(p * (stages.length - 1));

  return (
    <ol className="flex items-start gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {stages.map((s, i) => {
        const done = i <= current;
        return (
          <li key={`${s.key}-${i}`} className="flex min-w-[84px] flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : i <= current ? "bg-primary-500" : "bg-border"}`} />
              <span className={`grid h-14 w-14 shrink-0 place-items-center transition-all ${done ? "" : "opacity-40 grayscale"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/images/status/${s.img}.png`} alt={s.th} className="h-12 w-12 object-contain" />
              </span>
              <span className={`h-0.5 flex-1 ${i === stages.length - 1 ? "opacity-0" : i < current ? "bg-primary-500" : "bg-border"}`} />
            </div>
            <span className={`mt-1.5 text-[11px] font-semibold leading-tight ${done ? "text-foreground" : "text-muted"}`}>{s.th}</span>
            <span className="mt-0.5 hidden text-[10px] leading-tight text-muted sm:block">{s.en}</span>
          </li>
        );
      })}
    </ol>
  );
}

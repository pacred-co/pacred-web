"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { X, Phone, Check } from "lucide-react";
import { LINE_OA } from "@/components/seo/site";
import { trackCtaClick } from "@/lib/analytics";

// Was hardcoded to `https://lin.ee/r3b1BuOC` (PCS Cargo legacy clearance
// short URL — different from the main `Yg3fU0I`). Standardised to the
// canonical Pacred OA so analytics + branding align across all entry
// CTAs. If the legacy r3b1BuOC was a separate clearance sub-channel
// the owner wants to keep, swap back here.
const LINE_URL = LINE_OA.shortUrl;

// 2 sales (เมย์ · แนท) + 2 customer-service (วิน · พลอย). วิน + พลอย are CS,
// not sales — per owner directive 2026-05-29 (apply site-wide).
const SALES = [
  { name: "เมย์", slogan: "นำเข้า-ส่งออก ครบวงจร ปรึกษาฟรี ปิดดีลให้จบในที่เดียว", phone: "066-125-3006", image: "/images/Character_Icon/may.png",    useContain: false, alt: "ฝ่ายขายเมย์ Pacred",      button: "ทักเมย์เลย" },
  { name: "แนท",  slogan: "นำเข้าสั่งซื้อจีน ทุกแพลตฟอร์ม ครบจบในที่เดียว",       phone: "066-131-0253", image: "/images/pacred-logo-red.png",      useContain: true,  alt: "ฝ่ายขายแนท Pacred",      button: "ทักแนทเลย"  },
  { name: "วิน",  slogan: "ดูแลทุกขั้นตอน ตอบทุกคำถาม ตลอดการใช้บริการ",          phone: "062-603-0456", image: "/images/Character_Icon/win01.png", useContain: false, alt: "ทีมดูแลลูกค้าวิน Pacred",  button: "ทักวินเลย"  },
  { name: "พลอย", slogan: "พร้อมช่วยเหลือ ดูแลคุณทุกเรื่องนำเข้า-ส่งออก เร็ว ใส่ใจ", phone: "062-603-4456", image: "/images/Character_Icon/ploy01.png", useContain: false, alt: "ทีมดูแลลูกค้าพลอย Pacred", button: "ทักพลอยเลย" },
];

const FEATURES = [
  "ทั่วไป มอก. เกษตร ประมง",
  "จะด่านไหนก็เคลียร์ได้หมด",
  "เปลี่ยนผู้ดูแลได้ตลอด 24 ชม.",
];

const STROKE_LG: CSSProperties = {
  WebkitTextStroke: "2.6px rgba(0,0,0,0.82)",
  paintOrder: "stroke fill",
  textShadow: "0 3px 0 rgba(0,0,0,0.72), 0 5px 7px rgba(0,0,0,0.32)",
};

const STROKE_LG_MOBILE: CSSProperties = {
  WebkitTextStroke: "1.6px rgba(0,0,0,0.88)",
  paintOrder: "stroke fill",
  textShadow: "0 2px 0 rgba(0,0,0,0.78), 0 4px 6px rgba(0,0,0,0.35)",
};

const STROKE_SM: CSSProperties = {
  WebkitTextStroke: "1.2px rgba(0,0,0,0.78)",
  paintOrder: "stroke fill",
  textShadow: "0 2px 0 rgba(0,0,0,0.62), 0 3px 5px rgba(0,0,0,0.25)",
};

const STROKE_SM_MOBILE: CSSProperties = {
  WebkitTextStroke: "1.2px rgba(0,0,0,0.88)",
  paintOrder: "stroke fill",
  textShadow: "0 2px 0 rgba(0,0,0,0.72), 0 3px 5px rgba(0,0,0,0.32)",
};

const FEATURE_TEXT_SHADOW = "1px 1px 0 rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.28)";

export function ClearanceBanner() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="py-3 md:py-5">
        <div className="mx-auto w-full max-w-[1140px] px-[10px]">

          {/* Banner card */}
          <div className="relative w-full aspect-[1080/220] md:aspect-auto md:min-h-[220px] rounded-[14px] md:rounded-[28px] overflow-hidden bg-[#d60000] shadow-[0_14px_34px_rgba(0,0,0,0.08)] group">

            {/* Background — responsive picture */}
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ติดต่อ Pacred ทาง LINE"
              onClick={() => trackCtaClick("banner_line", "home_clearance_banner", { surface: "banner_image" })}
              className="absolute inset-0 z-[1] block"
            >
              <Image
                src="/images/banner/clearancebanboym.png"
                alt="ชิปปิ้งเคลียร์สินค้าพิธีการศุลกากร Pacred"
                fill
                sizes="(max-width: 768px) 100vw, 1140px"
                className="object-contain md:object-cover md:object-center transition-transform duration-700 group-hover:scale-[1.035]"
                priority
              />
            </a>

            {/* Dark gradient overlay — desktop only (mobile uses full image) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[2] hidden md:block"
              style={{
                background:
                  "linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.50) 45%, rgba(0,0,0,0.15) 75%, rgba(0,0,0,0) 100%)",
              }}
            />

            {/* Content overlay — desktop only (mobile shows pure image) */}
            <div className="relative z-[3] hidden md:flex md:min-h-[220px] md:w-[68%] flex-col justify-center md:px-[34px] md:py-[28px]">

              {/* Title — outlined cartoon stroke */}
              <h2 className="m-0 mb-1.5 md:mb-[9px] flex flex-col gap-[1px] md:gap-[2px] text-white leading-[1.02] tracking-[-0.04em] whitespace-nowrap font-black">
                {/* Mobile title */}
                <span
                  className="block md:hidden text-white font-black leading-[1.02] whitespace-nowrap text-[17px] sm:text-[19px]"
                  style={STROKE_LG_MOBILE}
                >
                  ชิปปิ้งเคลียร์สินค้าติดด่าน
                </span>
                <span
                  className="block md:hidden text-white font-extrabold leading-[1.12] tracking-[-0.025em] whitespace-nowrap text-[12px] sm:text-[13px]"
                  style={STROKE_SM_MOBILE}
                >
                  เคลียร์จบปลดแน่ Pacred จัดให้
                </span>

                {/* Desktop title */}
                <span
                  className="hidden md:block text-white font-black leading-[1.02] whitespace-nowrap text-[clamp(28px,3.15vw,44px)]"
                  style={STROKE_LG}
                >
                  ชิปปิ้งเคลียร์สินค้าติดด่าน
                </span>
                <span
                  className="hidden md:block text-white font-extrabold leading-[1.12] tracking-[-0.025em] whitespace-nowrap text-[clamp(15px,1.55vw,23px)]"
                  style={STROKE_SM}
                >
                  เคลียร์จบปลดแน่ Pacred จัดให้
                </span>
              </h2>

              {/* Features — desktop only */}
              <div className="hidden md:flex flex-wrap gap-x-4 gap-y-2 mb-[14px]">
                {FEATURES.map((f) => (
                  <div
                    key={f}
                    className="flex items-center gap-[7px] text-white text-[13px] font-extrabold leading-[1.25]"
                    style={{ textShadow: FEATURE_TEXT_SHADOW }}
                  >
                    <Check
                      className="w-4 h-4 shrink-0"
                      strokeWidth={3}
                      style={{ filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))" }}
                    />
                    {f}
                  </div>
                ))}
              </div>

              {/* Contact phone */}
              <a
                href="tel:0626034456"
                onClick={() => trackCtaClick("banner_phone", "home_clearance_banner", { surface: "inline_phone" })}
                className="inline-flex items-center gap-1.5 text-white text-[11px] md:text-[13px] font-extrabold leading-[1.25] mb-2 md:mb-3 hover:text-yellow-200 transition-colors w-fit"
                style={{ textShadow: FEATURE_TEXT_SHADOW }}
              >
                <Phone
                  className="w-3 h-3 md:w-4 md:h-4 shrink-0"
                  strokeWidth={3}
                  style={{ filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.55))" }}
                />
                ติดต่อ: 062-603-4456
              </a>

              {/* Price + Buttons */}
              <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                {/* Price callout pill */}
                <div className="relative inline-flex items-center gap-2 md:gap-2.5 bg-white rounded-[10px] md:rounded-[12px] px-2.5 py-1.5 md:px-3.5 md:py-2 shadow-[0_8px_18px_rgba(0,0,0,0.22)] border border-white">
                  {/* Yellow corner accent */}
                  <span aria-hidden className="absolute -top-1 -left-1 w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-yellow-300 shadow-[0_2px_4px_rgba(0,0,0,0.2)]" />
                  <div className="flex flex-col leading-none">
                    <span className="text-[9px] md:text-[10px] font-bold text-gray-500 uppercase tracking-wider leading-none">เริ่มต้น</span>
                    <div className="flex items-baseline gap-0.5 mt-0.5 leading-none">
                      <span className="text-[20px] md:text-[28px] font-black text-[#dc2626] tracking-tight leading-none tabular-nums">2,800</span>
                      <span className="text-[10px] md:text-[12px] font-bold text-gray-600">บาท</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 md:flex md:items-center gap-2 md:gap-3 flex-1 md:flex-initial max-w-[220px] md:max-w-none">
                <button
                  type="button"
                  onClick={() => {
                    trackCtaClick("banner_select_sales", "home_clearance_banner", { surface: "primary_cta" });
                    setOpen(true);
                  }}
                  suppressHydrationWarning
                  className="inline-flex items-center justify-center gap-[7px] h-[30px] md:h-[42px] px-2 md:px-5 rounded-[9px] md:rounded-[11px] text-[10px] md:text-[14px] font-black text-white cursor-pointer border-0 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{
                    background: "linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)",
                    boxShadow: "0 8px 18px rgba(185,28,28,0.25)",
                  }}
                >
                  <svg className="w-[14px] h-[14px] md:w-[18px] md:h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  เลือกทีมงาน
                </button>

                <a
                  href={LINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackCtaClick("banner_line", "home_clearance_banner", { surface: "secondary_cta" })}
                  className="inline-flex items-center justify-center gap-[7px] h-[30px] md:h-[42px] px-2 md:px-5 rounded-[9px] md:rounded-[11px] text-[10px] md:text-[14px] font-black text-[#06C755] bg-white border border-white/70 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{ boxShadow: "0 8px 18px rgba(0,0,0,0.14)" }}
                >
                  <svg className="w-[14px] h-[14px] md:w-[18px] md:h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  ทักไลน์เลย
                </a>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-5"
          style={{ background: "rgba(17,24,39,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-[24px] w-full max-w-[900px] max-h-[90vh] overflow-y-auto relative px-[18px] py-[30px] md:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.2)]">

            {/* Close */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="ปิด"
              className="absolute top-5 right-5 w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-500 flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="text-center mb-7">
              <h3 className="text-[22px] md:text-[28px] font-black text-[#111827]">เลือกทีมงานที่ต้องการติดต่อ</h3>
              <p className="text-[14px] md:text-[15px] text-gray-500 mt-1">ทีมขายและทีมดูแลลูกค้าพร้อมให้คำปรึกษาและดูแลทุกขั้นตอน</p>
            </div>

            {/* Sales grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {SALES.map((card) => (
                <div
                  key={card.name}
                  className="relative flex flex-col items-center text-center rounded-[20px] px-4 py-5 border border-gray-100 shadow-[0_4px_15px_rgba(0,0,0,0.04)] overflow-hidden"
                >
                  {/* Red header strip */}
                  <div className="absolute top-0 left-0 right-0 h-[70px] bg-gradient-to-br from-red-600 to-red-800 z-0" />

                  {/* Avatar */}
                  <div className="relative z-[1] w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-[0_6px_15px_rgba(0,0,0,0.1)] bg-white mt-[10px] mb-3">
                    <Image src={card.image} alt={card.alt} fill className={card.useContain ? "object-contain p-3" : "object-cover"} />
                  </div>

                  <p className="relative z-[1] text-[18px] font-black text-[#111827] mb-1">{card.name}</p>
                  <p className="text-[12px] text-gray-500 leading-[1.4] mb-3 line-clamp-2 min-h-[34px]">{card.slogan}</p>

                  <a
                    href={`tel:${card.phone.replace(/-/g, "")}`}
                    className="inline-flex items-center gap-1.5 text-[13px] text-red-600 font-bold bg-red-50 border border-red-200 rounded-full px-3 py-1 mb-3 hover:bg-red-100 transition-colors"
                  >
                    <Phone className="w-[14px] h-[14px]" />
                    {card.phone}
                  </a>

                  <a
                    href={LINE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full flex items-center justify-center gap-1.5 min-h-[38px] rounded-[10px] bg-gray-100 text-[#111827] text-[13px] font-bold mt-auto hover:bg-red-600 hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 3c-4.97 0-9 3.185-9 7.108 0 2.115 1.155 4.025 3.09 5.303-.234.996-1.127 2.378-1.218 2.518-.088.183.056.36.24.316.593-.14 2.875-.726 4.35-1.928 1.48.566 3.14.898 4.908.898 4.97 0 9-3.184 9-7.107S16.97 3 12 3z" />
                    </svg>
                    {card.button}
                  </a>
                </div>
              ))}
            </div>

          </div>
        </div>
      )}
    </>
  );
}

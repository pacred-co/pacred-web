"use client";

import { useState } from "react";
import Image from "next/image";
import { X, Phone, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";

const LINE_URL = "https://lin.ee/Yg3fU0I";

const SALES = [
  { name: "แบม",  slogan: "ตู้เล็ก ตู้ใหญ่จะตู้ไหน ก็พร้อมปิดให้ได้หมด", phone: "066-125-3007", image: "/images/theme/2026/salebam.png",  alt: "เซลล์แบม",  button: "ทักแบมเลย" },
  { name: "ยีนส์", slogan: "ของไม่ค้าง ด่านไม่ติด การันตีถึงมือแน่นอน",   phone: "066-090-1217", image: "/images/theme/2026/salejean.png", alt: "เซลล์ยีนส์", button: "ทักยีนส์เลย" },
  { name: "พลอย", slogan: "จะ Port ไหน Term ไหน ก็พร้อมลุย",              phone: "062-719-1998", image: "/images/theme/2026/saleploy.png", alt: "เซลล์พลอย", button: "ทักพลอยเลย" },
];

const FEATURES = [
  "ดูแลตั้งแต่สั่งซื้อจนถึงนำเข้า",
  "โปร่งใส ตรวจสอบได้ทุกขั้นตอน",
];

export function PurchaseBanner() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="bg-background py-5">
        <div className="mx-auto w-full max-w-[1140px] px-[10px]">

          {/* Banner card */}
          <div className="relative w-full min-h-[220px] md:min-h-[220px] rounded-[28px] overflow-hidden bg-[#06c755] shadow-[0_14px_34px_rgba(0,0,0,0.08)] group">

            {/* Background — desktop */}
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ติดต่อ Pacred ทาง LINE"
              className="absolute inset-0 z-[1] block"
            >
              <Image
                src="/images/banner/popimportbo.png"
                alt="Order Worldwide Pacred Shipping"
                fill
                className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.035] hidden md:block"
                priority
              />
              <Image
                src="/images/banner/clearancebanboym.png"
                alt="Order Worldwide Pacred Shipping"
                fill
                className="object-cover object-center block md:hidden"
                priority
              />
            </a>

            {/* Content overlay */}
            <div className="relative z-[3] min-h-[220px] md:min-h-[220px] w-[72%] md:w-[64%] flex flex-col justify-center px-[14px] py-[16px] md:px-[34px] md:py-[32px]">

              <h2 className="text-[20px] md:text-[clamp(30px,3.1vw,44px)] font-black text-white leading-[1.15] tracking-[-0.04em] mb-[8px] md:mb-[10px]"
                style={{ textShadow: "0 3px 12px rgba(0,0,0,0.16)" }}>
                สั่งซื้อทั่วโลก{" "}
                <span className="text-white">Pดิวะ !</span>{" "}
                ที่ไหนก็สั่งได้
              </h2>

              {/* Features — desktop only */}
              <div className="hidden md:flex flex-wrap gap-x-4 gap-y-2 mb-[14px]">
                {FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-[7px] text-white text-[13px] font-bold"
                    style={{ textShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                    <Check className="w-4 h-4 shrink-0" strokeWidth={3} />
                    {f}
                  </div>
                ))}
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-[7px] h-[34px] md:h-[42px] px-4 md:px-5 rounded-[9px] md:rounded-[11px] text-[11.5px] md:text-[14px] font-black text-white cursor-pointer border-0 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{ background: "linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)", boxShadow: "0 8px 18px rgba(185,28,28,0.25)" }}
                >
                  <svg className="w-[14px] h-[14px] md:w-[18px] md:h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  เลือกเซลล์
                </button>

                <Link
                  href="/register"
                  className="inline-flex items-center gap-[7px] h-[34px] md:h-[42px] px-4 md:px-5 rounded-[9px] md:rounded-[11px] text-[11.5px] md:text-[14px] font-black text-[#06C755] bg-white border border-white/70 transition-all duration-300 hover:-translate-y-0.5 whitespace-nowrap"
                  style={{ boxShadow: "0 8px 18px rgba(0,0,0,0.14)" }}
                >
                  <svg className="w-[14px] h-[14px] md:w-[18px] md:h-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" />
                  </svg>
                  สมัครเลย
                </Link>
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
              <h3 className="text-[22px] md:text-[28px] font-black text-[#111827]">เลือกเซลล์ที่ต้องการติดต่อ</h3>
              <p className="text-[14px] md:text-[15px] text-gray-500 mt-1">ทีมงานมืออาชีพพร้อมให้คำปรึกษาและดูแลทุกขั้นตอน</p>
            </div>

            {/* Sales grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              {SALES.map((card) => (
                <div
                  key={card.name}
                  className="relative flex flex-col items-center text-center rounded-[20px] px-4 py-5 border border-gray-100 shadow-[0_4px_15px_rgba(0,0,0,0.04)] overflow-hidden"
                >
                  {/* Red header strip */}
                  <div className="absolute top-0 left-0 right-0 h-[70px] bg-gradient-to-br from-red-600 to-red-800 z-0" />

                  {/* Avatar */}
                  <div className="relative z-[1] w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-[0_6px_15px_rgba(0,0,0,0.1)] bg-gray-50 mt-[10px] mb-3">
                    <Image src={card.image} alt={card.alt} fill className="object-cover" />
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

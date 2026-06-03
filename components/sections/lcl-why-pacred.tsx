import {
  Award,
  Boxes,
  Warehouse,
  BadgePercent,
  ShieldCheck,
  Truck,
  Wallet,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { CertsSlideshow } from "@/components/sections/certs-slideshow";

type WhyItem = { icon: LucideIcon; title: string; desc: string };

// Merged from LCL REASONS[] + WHY[] — the reasons to pick Pacred for LCL.
const WHY: WhyItem[] = [
  { icon: Boxes,       title: "Order เล็กก็เริ่มได้",        desc: "ไม่ต้องเหมาตู้ทั้งใบ — เริ่มจาก 1-2 กล่องก็ส่งได้ จ่ายตาม CBM/KG ที่ใช้จริง คุ้มสุดสำหรับ SME / มือใหม่" },
  { icon: Warehouse,   title: "โกดังจีนเอง 3 จุดหลัก",       desc: "กวางโจว · เซินเจิ้น · อี้อู — รับของจากซัพพลายเออร์ฟรี ตรวจ-นับ-แพ็ค ก่อนรวมส่ง พักของฟรี 14 วัน" },
  { icon: BadgePercent, title: "Form E ทุก order — ลดภาษี",  desc: "ขอ Form E จากซัพพลายเออร์จีนให้ · ใช้สิทธิ FTA ASEAN-China ลดภาษีนำเข้าบางสินค้าเหลือ 0%" },
  { icon: ShieldCheck, title: "ตรวจสินค้าก่อนรวมตู้",        desc: "นับชิ้น · ตรวจสภาพ · ถ่ายรูป · ห่อกันกระแทก — แจ้งสถานะให้ลูกค้ารับทราบก่อนออกจากจีน" },
  { icon: Wallet,      title: "จ่ายตามที่ใช้จริง",            desc: "คิดตาม CBM หรือ KG ที่สูงกว่า — ไม่ต้องจ่ายค่าตู้เต็ม โปร่งใส quote Total Landed Cost ก่อนยืนยัน" },
  { icon: Receipt,     title: "ออกใบกำกับภาษีครบ",            desc: "ภพ.20 + ใบเสร็จครบ ใช้ลดหย่อนนิติบุคคล ถูกกฎหมาย ตรวจสอบได้" },
  { icon: Truck,       title: "Door-to-Door ครบทั้งสาย",     desc: "รับของในจีน → รวมตู้ → ขนส่งทางเรือ → เคลียร์ภาษี → ส่งถึงประตูในไทย ไม่ต้องประสาน vendor หลายเจ้า" },
  { icon: Award,       title: "ประสบการณ์ 15+ ปี",           desc: "ทีมหน้างานจริงทั้งจีน + ไทย · shipping license ในไทย · ทีมล่ามจีนช่วยปิดดีลโรงงาน · ติดตามสถานะ real-time" },
];

/**
 * LCL "Why Pacred" — mirrors the customs landing block:
 * eyebrow + h2 + p + <CertsSlideshow /> + a primary-tinted why-list card.
 */
export function LclWhyPacred() {
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Award className="w-3.5 h-3.5" strokeWidth={2.6} />
          WHY LCL WITH PACRED · 15+ YEARS
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          ทำไม <span className="text-primary-600">นำเข้า LCL ต้องเลือก Pacred Shipping</span>
        </h2>
        <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
          บริการครบจบที่เดียว ราคาบอกตรง คุยง่าย — ทีมหน้างานจริงทั้งจีนและไทยที่อยู่กับลูกค้ามากว่า 15 ปี มีโกดังเองในจีน
        </p>

        <div className="mt-6 md:mt-8 flex flex-col gap-6 md:gap-8 items-stretch">
          <CertsSlideshow />

          {/* Why Pacred — primary-tinted list card, same frame as the hero */}
          <div>
            <h3 className="text-[22px] md:text-[30px] font-black text-[#111827] dark:text-white leading-[1.25] mb-3 md:mb-4 tracking-tight">
              นำเข้า LCL ต้อง <span className="text-primary-600">Pacred Shipping</span>
              <span className="block mt-1.5 md:mt-2 text-[17px] md:text-[20px] font-bold text-foreground/85 leading-snug">
                เริ่มง่าย <span className="text-primary-600">จ่ายตามที่ใช้ · ราคาชัด · Door-to-Door 100%</span>
              </span>
            </h3>
            <div className="rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-800/60 bg-gradient-to-br from-primary-50/60 via-white to-primary-50/30 dark:from-primary-900/15 dark:via-surface dark:to-primary-900/10 p-4 md:p-6 shadow-[0_8px_22px_rgba(179,0,0,0.06)]">
              <ul className="flex flex-col gap-y-2.5 md:gap-y-3 text-[13px] md:text-[15px] leading-[1.55] text-foreground/90">
                {WHY.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.title} className="flex items-start gap-2.5 md:gap-3">
                      <span className="inline-flex w-6 h-6 md:w-7 md:h-7 shrink-0 mt-0.5 items-center justify-center rounded-lg bg-primary-100 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300">
                        <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.6} />
                      </span>
                      <span>
                        <strong className="font-black text-[#111827] dark:text-white">{item.title}</strong>
                        <span className="text-muted"> — {item.desc}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

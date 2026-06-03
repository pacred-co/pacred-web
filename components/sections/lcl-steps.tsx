import {
  ListChecks,
  ArrowRight,
  MessageCircle,
  Warehouse,
  PackageSearch,
  Ship,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

type Step = { num: string; icon: LucideIcon; title: string; desc: string };

// Step 02 (ส่งของถึงโกดังจีน) is the LINE-tap step — the whole card
// becomes a clickable CTA into the LINE OA, like customs step 02.
const STEPS: Step[] = [
  { num: "01", icon: MessageCircle,  title: "แจ้งสเปก + ปริมาณ",   desc: "ประเภทสินค้า · น้ำหนัก/CBM · ปลายทาง — ทีม quote ให้ก่อน" },
  { num: "02", icon: Warehouse,      title: "ส่งของถึงโกดังจีน",   desc: "Pacred รับที่กวางโจว/เซินเจิ้น/อี้อู — หรือซัพพลายเออร์ส่งเข้าโกดังเอง" },
  { num: "03", icon: PackageSearch,  title: "ตรวจ-แพ็ค-รวมตู้",   desc: "ตรวจสภาพ · ห่อกันกระแทก · รวมส่งกับลูกค้ารายอื่น" },
  { num: "04", icon: Ship,           title: "ขนส่งทางเรือ",        desc: "Sea Freight LCL ถึง Port ไทย (คลองเตย/แหลมฉบัง)" },
  { num: "05", icon: Stamp,          title: "เคลียร์ + ส่งต่อ",    desc: "เคลียร์ภาษี + ส่งถึงประตู Door-to-Door ทั่วประเทศ" },
];

/**
 * LCL "5 STEPS" — mirrors the customs landing process block:
 * eyebrow + h2 + p + horizontal-scroll-on-mobile / grid-on-desktop
 * step cards with a big number + red-gradient icon pill. Step 02 is the
 * LINE-CTA card (whole card → LINE).
 */
export function LclSteps() {
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <ListChecks className="w-3.5 h-3.5" strokeWidth={2.6} />
          5 STEPS · LCL จีน-ไทย ครบจบใน 5 ขั้น
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          ส่ง LCL ง่าย ๆ — <span className="text-primary-600">ครบจบใน 5 ขั้นตอน</span>
        </h2>
        <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
          ทักมาก่อนได้เลย — quote ฟรี ไม่ต้องเดาเอง ทีมแจ้งที่อยู่โกดังจีน รับของ รวมตู้ เคลียร์ภาษี ส่งถึงประตู จบในคุยเดียว
        </p>

        <div className="mt-6 md:mt-8 flex overflow-x-auto gap-3 -mx-4 px-4 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 lg:grid-cols-5 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:snap-none">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            const isLast = idx === STEPS.length - 1;
            const isLineCta = s.num === "02";
            const cardClass = "relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/40 dark:from-surface dark:to-primary-900/10 p-4 md:p-5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(179,0,0,0.12)] transition-all duration-300";
            const cardInner = (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[34px] md:text-[40px] font-black text-primary-200/70 dark:text-primary-900/70 leading-none tracking-tight">
                    {s.num}
                  </span>
                  <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                    <Icon className="w-5 h-5 md:w-6 md:h-6 text-white" strokeWidth={2.4} />
                  </span>
                </div>
                <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                  {s.desc}
                </p>
              </>
            );
            return (
              <div key={s.num} className="relative shrink-0 w-[70%] sm:w-[260px] snap-start md:w-auto md:shrink">
                {isLineCta ? (
                  <TrackedExternalLink
                    href="/line"
                    cta="line_step_card"
                    surface="lcl_steps"
                    className={`${cardClass} block cursor-pointer hover:border-primary-400`}
                  >
                    {cardInner}
                  </TrackedExternalLink>
                ) : (
                  <div className={cardClass}>{cardInner}</div>
                )}
                {!isLast && (
                  <span aria-hidden className="hidden lg:flex pointer-events-none absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-6 rounded-full bg-white dark:bg-surface border border-primary-200 dark:border-primary-900 items-center justify-center text-primary-500 shadow-[0_3px_8px_rgba(179,0,0,0.10)]">
                    <ArrowRight className="w-3 h-3" strokeWidth={3} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

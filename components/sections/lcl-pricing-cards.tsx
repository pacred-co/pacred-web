import { CheckCircle2, ArrowRight, Award, Tag } from "lucide-react";
import { Link } from "@/i18n/navigation";

// Pricing by CBM range — indicative LCL Sea Freight rates (จีน → Port ไทย).
const PRICING = [
  {
    tier: "Starter",
    range: "1-3 CBM",
    price: "$180/CBM",
    desc: "เหมาะกับมือใหม่ ทดลองตลาด · ไม่กี่กล่องแรก",
    inclusions: ["Origin charges จีน", "Sea Freight LCL", "พักของฟรี 14 วัน"],
    featured: false,
  },
  {
    tier: "Regular",
    range: "3-10 CBM",
    price: "$150/CBM",
    desc: "Order ขนาดกลาง — ยอดนิยมที่สุด · คุ้มที่สุดสำหรับ SME",
    inclusions: ["Origin charges จีน", "Sea Freight LCL", "พักของฟรี 14 วัน", "Cross-dock priority"],
    featured: true,
  },
  {
    tier: "Volume",
    range: "10-15 CBM",
    price: "$130/CBM",
    desc: "Order ใหญ่ใกล้ FCL · ยังคุ้ม LCL ถ้าน้ำหนักไม่เต็มตู้",
    inclusions: ["Origin charges จีน", "Sea Freight LCL", "พักของฟรี 14 วัน", "ส่วนลดตามปริมาณ"],
    featured: false,
  },
];

/**
 * LCL pricing cards — occupies the customs "3 mode cards" slot:
 * eyebrow + h2 (identical customs styling) + 3 CBM-tier price cards.
 */
export function LclPricingCards() {
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
          PRICING · ราคา LCL ตาม CBM
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          ราคา <span className="text-primary-600">LCL จีน-ไทย</span> ตามปริมาณ ยิ่งมากยิ่งถูก<span className="md:hidden"> ไม่บวกแอบ</span>
        </h2>
        <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
          ราคาเฉลี่ย Sea Freight (Origin → Port ไทย) — ทีม quote Total Landed Cost ครบก่อนยืนยันทุกครั้ง ไม่มีค่าใช้จ่ายงอกทีหลัง
        </p>
      </div>

      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5 mt-5 md:mt-7">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
          {PRICING.map((p) => (
            <div
              key={p.tier}
              className={`relative rounded-2xl md:rounded-3xl p-5 md:p-6 transition-all duration-300 ${
                p.featured
                  ? "border-2 border-primary-500 bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-900/30 dark:via-surface dark:to-primary-900/15 shadow-[0_18px_44px_rgba(179,0,0,0.20)] md:-translate-y-2"
                  : "border border-border bg-white dark:bg-surface shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] hover:-translate-y-1"
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 h-7 rounded-full bg-primary-600 text-white text-[11px] font-black tracking-wide shadow-[0_6px_14px_rgba(179,0,0,0.35)]">
                  <Award className="w-3.5 h-3.5" strokeWidth={2.8} />
                  ยอดนิยม
                </span>
              )}
              <div className="text-[13px] md:text-[14px] font-black text-primary-600 tracking-[0.05em] uppercase">
                {p.tier}
              </div>
              <p className="mt-1 text-[12px] md:text-[13px] text-muted font-bold">{p.range}</p>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-[32px] md:text-[42px] font-black text-[#111827] dark:text-white leading-none tracking-tight">
                  {p.price}
                </span>
              </div>
              <p className="mt-2 text-[12px] md:text-[13px] text-muted font-medium leading-snug">{p.desc}</p>

              <ul className="mt-5 space-y-2">
                {p.inclusions.map((inc) => (
                  <li key={inc} className="flex items-start gap-2 text-[12.5px] md:text-[13px] font-medium text-foreground/90">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                    <span>{inc}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                data-cta={`pricing-${p.tier.toLowerCase()}`}
                className={`mt-6 inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl font-black text-[13px] md:text-[14px] transition-colors ${
                  p.featured
                    ? "bg-primary-600 text-white hover:bg-primary-700 shadow-[0_6px_18px_rgba(179,0,0,0.30)]"
                    : "border border-primary-200 text-primary-700 hover:bg-primary-50 dark:border-primary-800 dark:text-primary-300"
                }`}
              >
                ใช้บริการ
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11.5px] md:text-[12.5px] text-muted text-center font-medium">
          * Volume Weight ใช้ 1 CBM ≈ 167 KG — คิดด้านสูงกว่า · เพิ่ม Destination charges + Form E + เคลียร์ภาษีคิดแยก · ราคาเปลี่ยนตามฤดูกาล
        </p>
      </div>
    </section>
  );
}

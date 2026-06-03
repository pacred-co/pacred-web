import { CheckCircle2, ArrowRight, Award, Tag, Anchor, Warehouse } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";
const SURFACE = "lcl_landing_pricing";

/**
 * LCL pricing — occupies the customs "3 mode cards" slot (eyebrow + h2 +
 * cards). Split by WHO HOLDS THE CUSTOMS PAPERWORK (the freight pricing model
 * §1.2 — docs/research/freight-knowledge-2026-06-01/02-pricing-booking-model.md):
 *
 *   • Freight (นำเข้าด้วยชื่อลูกค้า)  → Port-to-Port · real ใบขน + VAT 7% docs
 *   • Cargo   (นำเข้าด้วยชื่อชิปปิ้ง) → โกดังถึงโกดัง · เหมารวมภาษี · ไม่มีเอกสาร
 *
 * Rates follow the home-page BookingCalculator (lib/booking-calculator.ts
 * `calcLCL`): sea freight ฿1,800/CBM (กวางโจว · อี้อู ×1.1) · 1 CBM ≈ 167 KG
 * (คิดด้านสูงกว่า). Cargo = all-in, quoted per product type.
 */
const MODES = [
  {
    key: "freight",
    badge: "Freight · นำเข้าด้วยชื่อลูกค้า",
    scope: "Port to Port — ท่าเรือถึงท่าเรือ",
    ScopeIcon: Anchor,
    price: "฿1,800",
    unit: "/ CBM",
    priceNote: "ค่าระวางเรือ LCL (จีน → ท่าเรือไทย) · เคลียร์/ภาษีในชื่อคุณ คิดตามจริง",
    desc: "นำเข้าในชื่อบริษัทคุณเอง — มีใบขนสินค้า + ใบกำกับภาษี VAT 7% ครบ ขอคืนภาษีได้ เหมาะกับนิติบุคคล / ผู้นำเข้าที่ต้องใช้เอกสาร",
    inclusions: [
      "ใบขนสินค้าขาเข้า — ชื่อลูกค้า",
      "ใบกำกับภาษี VAT 7% ครบ (ขอคืนภาษีได้)",
      "ใช้สิทธิ Form E ลดภาษีนำเข้า",
      "พักของฟรี 14 วันที่โกดังจีน",
    ],
    featured: false,
  },
  {
    key: "cargo",
    badge: "Cargo · นำเข้าด้วยชื่อชิปปิ้ง",
    scope: "โกดังถึงโกดัง — Door to Door",
    ScopeIcon: Warehouse,
    price: "เหมารวมภาษี",
    unit: "",
    priceNote: "ค่าขนส่ง + เคลียร์ + ภาษี จบในราคาเดียว · สอบถามเรทตามชนิดสินค้า",
    desc: "นำเข้าในชื่อชิปปิ้ง — เหมารวมทุกอย่าง ไม่ต้องมีบริษัท/ทะเบียนนำเข้า ไม่ต้องยุ่งเอกสาร ส่งถึงหน้าโกดัง/บ้านคุณ เหมาะกับคนที่อยากได้ของจบ",
    inclusions: [
      "เหมารวมค่าขนส่ง + เคลียร์ + ภาษี",
      "ส่งถึงโกดัง/หน้าร้านทั่วไทย (Door-to-Door)",
      "ไม่ต้องมีบริษัท / ทะเบียนนำเข้า",
      "จ่ายตาม CBM / KG ที่ใช้จริง (1 CBM ≈ 167 KG)",
    ],
    featured: true,
  },
];

export function LclPricingCards() {
  return (
    <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
      <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
        <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
          <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
          PRICING · ราคา LCL แชร์ตู้ จีน-ไทย
        </div>
        <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
          ราคา <span className="text-primary-600">นำเข้าสินค้าจากจีน LCL แชร์ตู้</span> เลือกได้ 2 แบบ
        </h2>
        <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[860px]">
          เลือกตามว่า <strong className="text-foreground font-bold">ใครถือเอกสารนำเข้า</strong> — <strong className="text-primary-600 font-black">Freight</strong> นำเข้าในชื่อคุณ (Port-to-Port มีเอกสารครบ) หรือ <strong className="text-primary-600 font-black">Cargo</strong> นำเข้าในชื่อชิปปิ้ง (โกดังถึงโกดัง เหมารวมภาษี). ทีม quote Total Landed Cost ครบก่อนยืนยันทุกครั้ง
        </p>
      </div>

      <div className="mx-auto w-full max-w-[920px] px-4 md:px-5 mt-6 md:mt-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-5">
          {MODES.map((m) => {
            const ScopeIcon = m.ScopeIcon;
            return (
              <div
                key={m.key}
                className={`relative flex flex-col rounded-2xl md:rounded-3xl p-5 md:p-6 transition-all duration-300 ${
                  m.featured
                    ? "border-2 border-primary-500 bg-gradient-to-br from-primary-50 via-white to-primary-50/40 dark:from-primary-900/30 dark:via-surface dark:to-primary-900/15 shadow-[0_18px_44px_rgba(179,0,0,0.20)] md:-translate-y-2"
                    : "border border-border bg-white dark:bg-surface shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] hover:-translate-y-1"
                }`}
              >
                {m.featured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 h-7 rounded-full bg-primary-600 text-white text-[11px] font-black tracking-wide shadow-[0_6px_14px_rgba(179,0,0,0.35)]">
                    <Award className="w-3.5 h-3.5" strokeWidth={2.8} />
                    ยอดนิยม
                  </span>
                )}

                <div className="text-[13px] md:text-[14px] font-black text-primary-600 tracking-tight">
                  {m.badge}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-[11.5px] md:text-[12.5px] font-bold text-primary-700 dark:text-primary-300">
                  <ScopeIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
                  {m.scope}
                </div>

                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[28px] md:text-[38px] font-black text-[#111827] dark:text-white leading-none tracking-tight">
                    {m.price}
                  </span>
                  {m.unit && (
                    <span className="text-[14px] md:text-[16px] font-bold text-muted">{m.unit}</span>
                  )}
                </div>
                <p className="mt-1.5 text-[11.5px] md:text-[12.5px] text-muted font-semibold leading-snug">
                  {m.priceNote}
                </p>

                <p className="mt-3 text-[12.5px] md:text-[13.5px] text-foreground/85 font-medium leading-relaxed">
                  {m.desc}
                </p>

                <ul className="mt-4 space-y-2">
                  {m.inclusions.map((inc) => (
                    <li key={inc} className="flex items-start gap-2 text-[12.5px] md:text-[13.5px] font-medium text-foreground/90">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                      <span>{inc}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-5 md:pt-6 grid grid-cols-2 gap-2">
                  <Link
                    href="/register"
                    data-cta={`lcl-pricing-${m.key}-register`}
                    className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl bg-primary-600 text-white font-black text-[12.5px] md:text-[13.5px] hover:bg-primary-700 transition-colors shadow-[0_6px_18px_rgba(179,0,0,0.25)]"
                  >
                    ใช้บริการ
                    <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                  </Link>
                  <TrackedExternalLink
                    href={LINE_URL}
                    cta="line_consult"
                    surface={SURFACE}
                    ctaProps={{ position: `pricing_${m.key}` }}
                    className="inline-flex items-center justify-center gap-1.5 h-11 rounded-xl border border-primary-200 text-primary-700 font-black text-[12.5px] md:text-[13.5px] hover:bg-primary-50 transition-colors dark:border-primary-800 dark:text-primary-300"
                  >
                    สอบถามเรท
                  </TrackedExternalLink>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11.5px] md:text-[12.5px] text-muted text-center font-medium">
          * ค่าระวาง LCL อ้างอิงเรทหน้าแรก ฿1,800/CBM (กวางโจว · อี้อู ×1.1) — คิดตาม CBM หรือ KG ที่สูงกว่า (1 CBM ≈ 167 KG) · เพิ่ม Form E + ค่าเคลียร์/ภาษีตามจริง (Freight) หรือเหมารวม (Cargo) · ราคาเปลี่ยนตามฤดูกาล
        </p>
      </div>
    </section>
  );
}

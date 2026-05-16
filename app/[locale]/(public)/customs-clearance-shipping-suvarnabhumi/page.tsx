import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  Award,
  FileCheck2,
  PackageSearch,
  Calculator,
  Stamp,
  Sparkles,
  ArrowRight,
  MessageCircle,
  Phone,
  ListChecks,
  Tag,
  Home,
  ChevronRight,
  MousePointerClick,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { Reviews } from "@/components/sections/reviews";
import { CertsSlideshow } from "@/components/sections/certs-slideshow";
import { CustomsVideoClips } from "@/components/sections/customs-video-clips";
import { CustomsModeCards } from "@/components/sections/customs-mode-cards";
import { KnowledgeNewsBlock } from "@/components/sections/knowledge-news-block";
import { Footer } from "@/components/sections/footer";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema, serviceSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/customs-clearance-shipping-suvarnabhumi";
const NS = "seo.services.customsClearance";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

// ────────────────────────── Content arrays ──────────────────────────

type Step = { num: string; icon: typeof FileCheck2; title: string; desc: string };

const STEPS: Step[] = [
  { num: "01", icon: FileCheck2,    title: "ส่งเอกสารพื้นฐาน",       desc: "Invoice + Packing List (+ AWB / B/L หากมี)" },
  { num: "02", icon: MessageCircle, title: "ทักผ่าน LINE / Email / โทร", desc: "Forward อีเมล DHL/FedEx หรือถ่ายภาพให้ทีมเลย" },
  { num: "03", icon: Calculator,    title: "ประเมินราคา",            desc: "แจ้งค่าบริการ + แนวทางเคลียร์ โปร่งใส 100%" },
  { num: "04", icon: Stamp,         title: "เริ่มเคลียร์",            desc: "ดำเนินการตามขั้นตอนศุลกากรครบทุกขั้น" },
  { num: "05", icon: PackageSearch, title: "ปลดสินค้า + จัดส่งต่อ",   desc: "นัดรับ/จัดส่งทั่วประเทศ Door to Door" },
];

const KEYWORDS = [
  "เคลียร์ของสนามบิน",
  "เร่งด่วน",
  "เปิดตรวจสินค้า",
  "ชิปปิ้งสุวรรณภูมิ",
  "เคลียร์ของสุวรรณภูมิ",
  "เคลียร์ของด่วน 1 ชั่วโมง",
  "ชิปปิ้งดอนเมือง",
  "เคลียร์ของดอนเมือง",
  "ไปรษณีย์หลักสี่",
  "เคลียร์พัสดุติดค้าง",
  "นำเข้าทางไปรษณีย์",
  "พัสดุต่างประเทศติดศุลกากร",
  "ชิปปิ้ง Port",
  "เคลียร์สินค้า Port",
  "LCL · FCL",
  "Sea Freight Import",
  "Port คลองเตย",
  "Port กรุงเทพ",
  "แหลมฉบัง",
  "ลาดกระบัง ICD",
  "โลจิสติกส์คลังสินค้า",
  "เคลียร์ของนำเข้า",
  "ของติดศุลกากร",
  "ติดพิกัด",
  "ติดใบอนุญาต",
  "ติดหน่วยงาน",
  "เคลียร์ของทั่วประเทศ",
  "ด่านชายแดน",
  "มุกดาหาร",
  "ขนส่งข้ามแดน",
  "Truck Transport",
  "หน่วยงานราชการ",
  "ตรวจเอกสารนำเข้า",
  "เตรียมเอกสารศุลกากร",
  "ขั้นตอนนำเข้า",
  "เคลียร์ของด่วน",
  "ปลดสินค้า",
  "เคลียร์จบใน 1 ชั่วโมง",
  "รับของภายใน 1 วัน",
  "ขนส่งต่อเนื่อง",
  "Door to Door Delivery",
];

const LINE_URL = "/line";

export default async function CustomsClearancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel  = typedLocale === "th" ? "บริการ" : "Services";
  const here      = typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs clearance";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "เคลียร์ศุลกากร" : "Customs clearance",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
        ]}
      />
      <NavBar />
      <SearchBar hideOnMobile />
      <main>
        <BookingCalculator landing="customs" />

        {/* Breadcrumb — under booking tabs, links back to home.
            Trailing crumb stays on one line on every viewport: short
            label (no full sentence) + whitespace-nowrap, no truncate
            so the text never shows "...". */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] whitespace-nowrap">
            <li>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors"
              >
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>หน้าแรก</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              เคลียร์ศุลกากร
            </li>
          </ol>
        </nav>

        {/* ═══════ 1. Hero intro ═══════ */}
        <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <h1 className="text-[20px] md:text-[40px] leading-[1.25] md:leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
              <span className="md:block">บริการ <span className="text-primary-600">Customs Clearance</span> เคลียร์ภาษี (สินค้าติดด่าน)</span>{" "}
              <span className="md:block md:mt-1">สุวรรณภูมิ คลองเตย แหลมฉบัง <span className="text-primary-600">| Pacred Shipping</span></span>
            </h1>

            <h2 className="mt-1.5 md:mt-2 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px] md:max-w-none md:whitespace-nowrap">
              เคลียร์สินค้าติดด่านศุลกากรแบบครบวงจร ราคาชัดเจน <span className="text-primary-600/80 font-semibold">เริ่มต้น 2,800 บาท</span> รองรับ Air Freight, Sea Freight, Truck, LCL, FCL และด่านหลักทั่วไทย
            </h2>

            {/* ─── Detailed service list — moved here per ปอน 2026-05-16 ─── */}
            <div className="mt-3 md:mt-4 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug md:whitespace-nowrap">
                <span className="shrink-0">🚨</span>
                <span>บริการชิปปิ้งเคลียร์ของติดด่าน ศุลกากร ครบทุกด่าน ✈️🚢📦</span>
              </h3>

              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed md:whitespace-nowrap">
                สุวรรณภูมิ / ดอนเมือง / ไปรษณีย์หลักสี่ / คลองเตย / แหลมฉบัง / ลาดกระบัง (ICD) / ด่านชายแดน
              </p>

              <ul className="mt-4 md:mt-5 flex flex-col gap-y-3 md:gap-y-3.5 text-[14px] md:text-[16px] leading-[1.55] text-foreground/95">
                {[
                  { emoji: "✈️", text: "เคลียร์สินค้านำเข้า–ส่งออก Air Cargo / Sea Freight / Truck ครบทุกช่องทาง" },
                  { emoji: "📋", text: "ลงทะเบียนผู้นำเข้า–ส่งออก จับคู่ (YY) กรมศุลกากร ภายใน 30 นาที" },
                  { emoji: "📄", text: "ดูแลเอกสารครบ — AWB / B/L / D/O / INVOICE + PACKING / ใบขนสินค้า / ใบเสร็จภาษี / ใบอนุญาตนำเข้า" },
                  { emoji: "🛠️", text: "แก้ปัญหาสินค้าติดด่าน ติดศุลกากร ภาษีเกิน พิกัดศุลกากรไม่ตรง เอกสารไม่ครบ หรือไม่มีใบอนุญาต" },
                  { emoji: "🛡️", text: "เคลียร์ใบอนุญาต อย. / มอก. / สมอ. / กสทช. / กรมเกษตร / กรมประมง / หน่วยงานราชการอื่นๆ" },
                  { emoji: "🎓", text: "ผู้เชี่ยวชาญด้านเคลียร์พิธีการศุลกากร Shipping มากกว่า 15 ปี" },
                  { emoji: "✅", text: "ได้รับใบอนุญาตตัวแทนออกของ (Shipping License) ถูกต้องตามกฎหมาย" },
                  { emoji: "💼", text: "ดูแลครบ ได้ใบขนสินค้า ชำระภาษีและอากรถูกต้อง หมดปัญหา กรมศุล ตำรวจ สรรพากร 100%" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <span className="text-[20px] md:text-[24px] leading-none shrink-0 mt-0.5" aria-hidden>{item.emoji}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </section>

        {/* ═══════ 3 clearance modes — sea/air/truck with carrier logos ═══════
             Per ปอน 2026-05-16: replace 7-port carousel with 3 mode-grouped
             cards (เรือ / แอร์ / รถ) showing carriers (DHL/FedEx/COSCO etc). */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
              PRICING BY PORT · ราคาตามด่าน / Port
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ราคาเริ่มต้น <span className="text-primary-600">แต่ละด่าน · แต่ละ Port</span>
            </h2>
          </div>

          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5 mt-5 md:mt-7">
            <CustomsModeCards />
          </div>
        </section>

        {/* ═══════ 5. How to use — placed right after 3-mode pricing cards
             so users learn the process before seeing the LINE CTA below. */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ListChecks className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · ใช้ง่าย จบใน 1 ชม.
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ใช้บริการง่าย ๆ — <span className="text-primary-600">ครบจบใน 5 ขั้นตอน</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              วางขั้นตอนชัดเจน เริ่มได้ทันที — ไม่ต้องเดา ไม่ต้องวิ่งเอกสารหลายรอบ
            </p>

            <div className="mt-6 md:mt-8 flex overflow-x-auto gap-3 -mx-4 px-4 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 lg:grid-cols-5 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:snap-none">
              {STEPS.map((s, idx) => {
                const Icon = s.icon;
                const isLast = idx === STEPS.length - 1;
                return (
                  <div key={s.num} className="relative shrink-0 w-[70%] sm:w-[260px] snap-start md:w-auto md:shrink">
                    <div className="relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/40 dark:from-surface dark:to-primary-900/10 p-4 md:p-5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(179,0,0,0.12)] transition-all duration-300">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[34px] md:text-[40px] font-black text-primary-200/70 dark:text-primary-900/70 leading-none tracking-tight">
                          {s.num}
                        </span>
                        <span className="inline-flex w-10 h-10 md:w-11 md:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                          <Icon className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.4} />
                        </span>
                      </div>
                      <h3 className="text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                        {s.title}
                      </h3>
                      <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                        {s.desc}
                      </p>
                    </div>
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

        {/* ─── Add-LINE banner — placed after 5 STEPS per ปอน 2026-05-16
             (mode cards → process → LINE conversion CTA funnel). */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="สินค้าติดด่าน? ทักไลน์ Pacred Shipping ปรึกษาฟรี รู้ผลใน 1 ชม."
              className="group block relative max-w-[1100px] mx-auto no-underline"
            >
              <div
                className="relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(6,199,85,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(6,199,85,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #00B900 0%, #06C755 45%, #02A340 100%)" }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 25% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.08]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, white 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                <div className="relative grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[100px] md:min-h-[150px]">
                  <div className="min-w-0 py-3 md:py-3">
                    <p className="hidden md:block text-[44px] font-black text-white leading-[1.05] tracking-tight whitespace-nowrap [text-shadow:0_2px_6px_rgba(1,58,20,0.45)]">
                      สินค้าติดด่าน? ทักไลน์ปรึกษาฟรี รู้ผลใน 1 ชม.
                      <ArrowRight className="inline-block ml-2 w-7 h-7 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>
                    <p className="hidden md:flex mt-2 text-[18px] font-bold text-white/95 items-center gap-3 [text-shadow:0_1px_3px_rgba(1,58,20,0.45)]">
                      <Phone className="w-5 h-5 shrink-0" strokeWidth={2.6} />
                      <span>066-125-3007</span>
                      <span className="text-white/60">·</span>
                      <MessageCircle className="w-5 h-5 shrink-0" strokeWidth={2.6} />
                      <span>ทักไลน์ <span className="font-black">@pacred</span></span>
                    </p>

                    <p className="md:hidden text-[32px] font-black text-white leading-[1.0] tracking-tight [text-shadow:0_2px_6px_rgba(1,58,20,0.45)]">
                      สินค้าติดด่าน?
                    </p>
                    <p className="md:hidden mt-1.5 text-[16px] font-extrabold text-white leading-snug [text-shadow:0_1px_4px_rgba(1,58,20,0.45)]">
                      ทักไลน์ปรึกษาฟรี รู้ผลใน 1 ชม.
                      <ArrowRight className="inline-block ml-1 w-4 h-4 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>
                  </div>

                  <div className="relative w-[96px] md:w-[170px] h-[100px] md:h-[150px] self-stretch shrink-0">
                    <Image
                      src="/images/visit/visit01.png"
                      alt="ทีมเซลล์ Pacred Shipping พร้อมตอบใน 5 นาที"
                      fill
                      sizes="(max-width: 768px) 96px, 170px"
                      className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(1,58,20,0.35)]"
                    />
                  </div>

                  <div className="pointer-events-none absolute top-1 md:top-2 right-1 md:right-3 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                    <span className="text-white text-[11px] md:text-[15px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(1,58,20,0.55)] whitespace-nowrap">
                      คลิ๊กตรงนี้
                    </span>
                    <MousePointerClick className="mt-0.5 w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-[0_1px_2px_rgba(1,58,20,0.5)]" strokeWidth={2.6} />
                  </div>
                </div>
              </div>
            </a>
          </div>
        </section>

        {/* ─── Sales contact (reused from home, with พลอย as the featured customs expert) ─── */}
        <ContactSales featuredName="พลอย" hideAssuranceStrip compact />

        {/* ─── Reviews (reused from home, default to clearance filter) per ปอน 2026-05-16 ─── */}
        <Reviews defaultFilter="clearance" />

        {/* ═══════ 6. Why Pacred ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Award className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · 15+ YEARS
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไมต้อง <span className="text-primary-600">Pacred Shipping</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทีมงานหน้างานจริง ประสบการณ์ 15+ ปี · เคลียร์ทุกด่านในไทย · ราคาโปร่งใส
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-5 md:gap-7 items-start">
              <CertsSlideshow />

              {/* Why Pacred — compact emoji-bullet list per ปอน 2026-05-16 */}
              <div>
                <h3 className="text-[22px] md:text-[30px] font-black text-[#111827] dark:text-white leading-[1.25] mb-3 md:mb-4 tracking-tight">
                  ทำไมต้อง Pacred Shipping
                  <span className="block mt-1.5 md:mt-2 text-[17px] md:text-[20px] font-bold text-foreground/85 leading-snug">
                    เคลียร์ของได้ <span className="text-primary-600">เร็ว · ราคาไม่บวก · ปลอดภัยตามกฎหมาย 100%</span>
                  </span>
                </h3>
                <ul className="flex flex-col gap-y-2.5 md:gap-y-3 text-[13px] md:text-[15px] leading-[1.55] text-foreground/90">
                  {[
                    { emoji: "⚡", title: "เคลียร์ด่วน ภายใน 1 ชั่วโมง", desc: "เอกสารพร้อม ปล่อยสินค้าออกด่วน · ไม่ค้างคืน ลดค่าฝากเก็บ" },
                    { emoji: "💰", title: "ราคาโปร่งใส ไม่มีบวกแอบ", desc: "แจ้งทุกค่าใช้จ่ายเป็นใบเดียว · ภาษี + ค่าพิธีการ + ค่ารถ ครบจบ" },
                    { emoji: "👥", title: "ทีมหน้างานจริง ทุกด่าน", desc: "สุวรรณภูมิ / คลองเตย / แหลมฉบัง / ICD / มุกดาหาร / นครพนม / อรัญ" },
                    { emoji: "🛠️", title: "แก้ปัญหาที่คนอื่นทำไม่ได้", desc: "ติดด่าน · HS Code ไม่ตรง · ภาษีเกิน · ไม่มีใบอนุญาต อย./มอก." },
                    { emoji: "🛡️", title: "มีใบอนุญาตจริง ไม่ใช่นายหน้า", desc: "Shipping License · ทะเบียนกรมศุล · DBD · ภพ.20 ครบตามกฎหมาย" },
                    { emoji: "🎓", title: "ประสบการณ์ 15+ ปี", desc: "เคลียร์มาแล้วทุกประเภทสินค้า · ทุก Term · ทุก Port ในไทย" },
                    { emoji: "📦", title: "รองรับสินค้าควบคุม", desc: "ยา · เครื่องสำอาง · อิเล็กทรอนิกส์ · เครื่องจักร · เคมีภัณฑ์" },
                    { emoji: "📍", title: "Tracking real-time", desc: "อัปเดตสถานะให้ติดตามได้ทุกขั้นตอน · ตอบไว 24 ชม." },
                  ].map((item) => (
                    <li key={item.title} className="flex items-start gap-2.5 md:gap-3">
                      <span className="text-[20px] md:text-[22px] leading-none shrink-0 mt-0.5" aria-hidden>{item.emoji}</span>
                      <span>
                        <strong className="font-black text-[#111827] dark:text-white">{item.title}</strong>
                        <span className="text-muted"> — {item.desc}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>


        {/* ─── Add-LINE banner #2 — duplicate placed after Why Pacred per ปอน 2026-05-16 */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="สินค้าติดด่าน? ทักไลน์ Pacred Shipping ปรึกษาฟรี รู้ผลใน 1 ชม."
              className="group block relative max-w-[1100px] mx-auto no-underline"
            >
              <div
                className="relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(6,199,85,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(6,199,85,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #00B900 0%, #06C755 45%, #02A340 100%)" }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-50 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 25% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.08]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, white 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                <div className="relative grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[100px] md:min-h-[150px]">
                  <div className="min-w-0 py-3 md:py-3">
                    <p className="hidden md:block text-[44px] font-black text-white leading-[1.05] tracking-tight whitespace-nowrap [text-shadow:0_2px_6px_rgba(1,58,20,0.45)]">
                      สินค้าติดด่าน? ทักไลน์ปรึกษาฟรี รู้ผลใน 1 ชม.
                      <ArrowRight className="inline-block ml-2 w-7 h-7 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>
                    <p className="hidden md:flex mt-2 text-[18px] font-bold text-white/95 items-center gap-3 [text-shadow:0_1px_3px_rgba(1,58,20,0.45)]">
                      <Phone className="w-5 h-5 shrink-0" strokeWidth={2.6} />
                      <span>066-125-3007</span>
                      <span className="text-white/60">·</span>
                      <MessageCircle className="w-5 h-5 shrink-0" strokeWidth={2.6} />
                      <span>ทักไลน์ <span className="font-black">@pacred</span></span>
                    </p>

                    <p className="md:hidden text-[32px] font-black text-white leading-[1.0] tracking-tight [text-shadow:0_2px_6px_rgba(1,58,20,0.45)]">
                      สินค้าติดด่าน?
                    </p>
                    <p className="md:hidden mt-1.5 text-[16px] font-extrabold text-white leading-snug [text-shadow:0_1px_4px_rgba(1,58,20,0.45)]">
                      ทักไลน์ปรึกษาฟรี รู้ผลใน 1 ชม.
                      <ArrowRight className="inline-block ml-1 w-4 h-4 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>
                  </div>

                  <div className="relative w-[96px] md:w-[170px] h-[100px] md:h-[150px] self-stretch shrink-0">
                    <Image
                      src="/images/visit/visit01.png"
                      alt="ทีมเซลล์ Pacred Shipping พร้อมตอบใน 5 นาที"
                      fill
                      sizes="(max-width: 768px) 96px, 170px"
                      className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(1,58,20,0.35)]"
                    />
                  </div>

                  <div className="pointer-events-none absolute top-1 md:top-2 right-1 md:right-3 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                    <span className="text-white text-[11px] md:text-[15px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(1,58,20,0.55)] whitespace-nowrap">
                      คลิ๊กตรงนี้
                    </span>
                    <MousePointerClick className="mt-0.5 w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-[0_1px_2px_rgba(1,58,20,0.5)]" strokeWidth={2.6} />
                  </div>
                </div>
              </div>
            </a>
          </div>
        </section>


        {/* ─── Video clips — same layout as home Blog (1 big + 4 side) per ปอน 2026-05-16 */}
        <CustomsVideoClips />

        {/* ═══════ 10. Knowledge + News — shared tab carousel block ═══════
             Replaced the old 27-topic chip grid with the same tab-switcher +
             card carousel used on the home Blog section (per ปอน 2026-05-15
             — match home knowledge style on the customs landing too). */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <KnowledgeNewsBlock />
          </div>
        </section>

        {/* ─── Sales contact #2 — duplicate after Knowledge per ปอน 2026-05-16 */}
        <ContactSales featuredName="พลอย" hideAssuranceStrip compact />

        {/* ─── Pacred guarantee banner — per ปอน 2026-05-16
             "เคลียร์ชิปแน่ แค่ 2,800 บาท ของแท้ต้อง Pacred Shipping" */}
        <section className="relative pt-2 md:pt-4 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            {/* Top eyebrow strip */}
            <div className="rounded-t-2xl border border-b-0 border-primary-200 bg-white px-4 md:px-6 py-2 md:py-2.5 text-center">
              <p className="text-[13px] md:text-[16px] font-black tracking-tight text-primary-700">
                เคลียร์ชิปแน่ แค่ <span className="text-primary-600">2,800 บาท</span> ของแท้ต้อง <span className="text-primary-600">Pacred Shipping</span>
              </p>
            </div>

            {/* Main banner — Pacred red + carriers + price + visit01 photo */}
            <div
              className="relative overflow-hidden border border-t-0 border-primary-200 shadow-[0_18px_38px_-12px_rgba(179,0,0,0.30)]"
              style={{ background: "linear-gradient(135deg, #DC1F1F 0%, #B30000 45%, #7F0000 100%)" }}
            >
              {/* Decorative diagonal sheen */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
                style={{ background: "radial-gradient(circle at 70% 30%, rgba(255,200,100,0.30) 0%, transparent 55%)" }}
              />
              {/* Dot pattern */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, white 1px, transparent 1.4px)",
                  backgroundSize: "20px 20px",
                }}
              />

              <div className="relative grid grid-cols-[1fr_auto_auto] gap-2 md:gap-5 items-end md:items-center px-3 md:px-8 py-3 md:py-6 min-h-[112px] md:min-h-[170px]">
                <div className="min-w-0">
                  {/* Carrier logo strip */}
                  <div className="flex items-center gap-1.5 md:gap-4 mb-2 md:mb-4">
                    {[
                      { name: "FedEx", logo: "/images/partners/fedexpartner.png" },
                      { name: "DHL", logo: "/images/partners/dhlpartner.png" },
                      { name: "TNT", logo: "/images/partners/tntpartner.png" },
                      { name: "UPS", logo: "/images/partners/upspartner.png" },
                    ].map((c) => (
                      <div
                        key={c.name}
                        className="relative h-5 md:h-9 w-[36px] md:w-[68px] bg-white rounded-md flex items-center justify-center p-0.5 md:p-1 shadow-sm shrink-0"
                      >
                        <Image
                          src={c.logo}
                          alt={c.name}
                          fill
                          sizes="(max-width: 768px) 36px, 68px"
                          className="object-contain p-0.5 md:p-1"
                        />
                      </div>
                    ))}
                  </div>

                  <p className="text-[12px] md:text-[17px] font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] leading-snug">
                    เคลียร์พิธีการเร่งด่วน
                  </p>
                </div>

                {/* Price + click badge */}
                <div className="flex flex-col items-center gap-1 md:flex-row md:gap-3 shrink-0">
                  <span className="text-[36px] md:text-[72px] font-black text-yellow-300 leading-none tracking-tight drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]">
                    2,800
                  </span>
                  <span className="-rotate-12 inline-flex items-center gap-1 px-1.5 py-0.5 md:px-3 md:py-1.5 rounded-md bg-yellow-300 text-primary-700 text-[9.5px] md:text-[13px] font-black tracking-tight shadow-[0_4px_12px_rgba(0,0,0,0.25)] whitespace-nowrap">
                    <Sparkles className="w-2.5 h-2.5 md:w-3.5 md:h-3.5" strokeWidth={2.8} />
                    คลิ๊กเลย !
                  </span>
                </div>

                {/* visit01 photo — far right */}
                <div className="relative w-[70px] md:w-[140px] h-[112px] md:h-[170px] shrink-0 -my-3 md:-my-6 -mr-3 md:-mr-8">
                  <Image
                    src="/images/visit/visit01.png"
                    alt="ทีมเซลล์ Pacred Shipping"
                    fill
                    sizes="(max-width: 768px) 70px, 140px"
                    className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.30)]"
                  />
                </div>
              </div>
            </div>

            {/* 2 CTA buttons — always 2-col, side-by-side mobile + desktop */}
            <div className="mt-3 md:mt-4 grid grid-cols-2 gap-2 md:gap-4">
              <Link
                href="/register"
                className="group relative overflow-hidden rounded-2xl border border-primary-200 bg-white shadow-[0_8px_22px_-10px_rgba(179,0,0,0.18)] hover:shadow-[0_14px_30px_-8px_rgba(179,0,0,0.30)] hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-center gap-2 md:gap-4 px-2.5 md:px-5 py-2.5 md:py-4">
                  <span className="inline-flex w-9 h-9 md:w-12 md:h-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[18px] md:text-[26px] font-black shadow-[0_5px_12px_rgba(179,0,0,0.25)]">
                    ✕
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-snug truncate">
                      สมัครสมาชิกฟรี
                    </p>
                    <p className="mt-0.5 text-[10.5px] md:text-[12.5px] font-bold text-primary-600 inline-flex items-center gap-0.5 md:gap-1">
                      <ChevronRight className="w-3 h-3" strokeWidth={3} />
                      คลิ๊กเลย !
                    </p>
                  </div>
                </div>
              </Link>

              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden rounded-2xl border border-green-200 bg-white shadow-[0_8px_22px_-10px_rgba(6,199,85,0.20)] hover:shadow-[0_14px_30px_-8px_rgba(6,199,85,0.35)] hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-center gap-2 md:gap-4 px-2.5 md:px-5 py-2.5 md:py-4">
                  <span
                    className="inline-flex w-9 h-9 md:w-12 md:h-12 shrink-0 items-center justify-center rounded-full text-white text-[18px] md:text-[26px] font-black shadow-[0_5px_12px_rgba(6,199,85,0.30)]"
                    style={{ background: "linear-gradient(135deg, #00B900 0%, #06C755 100%)" }}
                  >
                    ✕
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] md:text-[14.5px] font-black text-[#111827] dark:text-white leading-snug inline-flex items-center gap-1 md:gap-1.5 truncate">
                      <MessageCircle className="w-3 h-3 md:w-4 md:h-4 text-[#06C755] shrink-0" strokeWidth={2.6} />
                      ปรึกษานำเข้าฟรี
                    </p>
                    <p className="mt-0.5 text-[10.5px] md:text-[12.5px] font-bold text-[#06C755] inline-flex items-center gap-0.5 md:gap-1">
                      <ChevronRight className="w-3 h-3" strokeWidth={3} />
                      คลิ๊กเลย !
                    </p>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* ═══════ 11. SEO keyword pills ═══════ */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
              SERVICES TAGS · บริการที่ครอบคลุม
            </div>
            <h2 className="text-[20px] md:text-[28px] leading-[1.2] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
              Pacred ดูแล <span className="text-primary-600">ทุกขอบเขต</span>การนำเข้า-ส่งออก
            </h2>

            <div className="mt-5 md:mt-6 flex flex-wrap gap-1.5 md:gap-2">
              {KEYWORDS.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center px-2.5 md:px-3 h-7 md:h-8 rounded-md bg-primary-50/60 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 text-[11px] md:text-[12px] font-bold text-primary-700 dark:text-primary-300"
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}

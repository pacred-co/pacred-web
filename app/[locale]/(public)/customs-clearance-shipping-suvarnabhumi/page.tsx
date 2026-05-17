import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  Award,
  FileCheck2,
  PackageSearch,
  Calculator,
  Stamp,
  ArrowRight,
  MessageCircle,
  Phone,
  ListChecks,
  Tag,
  Home,
  ChevronRight,
  MousePointerClick,
  CheckCircle2,
  ShieldCheck,
  Briefcase,
  ShieldAlert,
} from "lucide-react";
import { RelatedTagsTabs } from "@/components/sections/related-tags-tabs";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";
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
  { num: "01", icon: FileCheck2,    title: "ส่งเอกสารพื้นฐาน",       desc: "แค่ Invoice กับ Packing List ก็เริ่มได้ มี AWB / B/L แนบมาด้วยจะยิ่งไว" },
  { num: "02", icon: MessageCircle, title: "ทักผ่าน LINE / Email / โทร", desc: "Forward เมลจาก DHL/FedEx มาก็ได้ หรือถ่ายรูปใบส่งของส่งทีมก็ได้" },
  { num: "03", icon: Calculator,    title: "ประเมินราคา",            desc: "เคาะค่าบริการ + วางแผนเคลียร์ให้ฟัง ไม่มีค่าใช้จ่ายแอบซ่อน" },
  { num: "04", icon: Stamp,         title: "เริ่มเคลียร์",            desc: "ทีมเดินเรื่องที่ด่านครบทุกขั้น คุณรอที่ออฟฟิศได้สบายใจ" },
  { num: "05", icon: PackageSearch, title: "ปลดสินค้า + จัดส่งต่อ",   desc: "นัดส่งถึงประตูทั่วไทย หรือมารับเองที่ด่านก็ได้ตามสะดวก" },
];

// Tag groups — each group renders as a sub-section of chips under the
// "บทความที่เกี่ยวข้อง" block. Per ปอน 2026-05-17: split flat KEYWORDS list
// into themed groups (เคลียร์-only on this page; other categories link to
// /knowledge). Order matters — most relevant to customs clearance first.
const TAG_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "เคลียร์ของสนามบิน",
    items: [
      "เคลียร์ของสนามบิน",
      "ชิปปิ้งสุวรรณภูมิ",
      "เคลียร์ของสุวรรณภูมิ",
      "ชิปปิ้งดอนเมือง",
      "เคลียร์ของดอนเมือง",
      "เคลียร์ของด่วน 1 ชั่วโมง",
      "เร่งด่วน",
      "เปิดตรวจสินค้า",
    ],
  },
  {
    title: "เคลียร์ของท่าเรือ / Port",
    items: [
      "ชิปปิ้ง Port",
      "เคลียร์สินค้า Port",
      "Port คลองเตย",
      "Port กรุงเทพ",
      "แหลมฉบัง",
      "ลาดกระบัง ICD",
      "LCL · FCL",
      "Sea Freight Import",
      "โลจิสติกส์คลังสินค้า",
    ],
  },
  {
    title: "เคลียร์พัสดุ / ไปรษณีย์",
    items: [
      "ไปรษณีย์หลักสี่",
      "เคลียร์พัสดุติดค้าง",
      "นำเข้าทางไปรษณีย์",
      "พัสดุต่างประเทศติดศุลกากร",
    ],
  },
  {
    title: "เคลียร์ของด่านชายแดน",
    items: [
      "ด่านชายแดน",
      "มุกดาหาร",
      "ขนส่งข้ามแดน",
      "Truck Transport",
      "เคลียร์ของทั่วประเทศ",
    ],
  },
  {
    title: "ติดด่าน / ติดศุลกากร",
    items: [
      "ของติดศุลกากร",
      "ติดพิกัด",
      "ติดใบอนุญาต",
      "ติดหน่วยงาน",
      "หน่วยงานราชการ",
      "เคลียร์ของนำเข้า",
      "เคลียร์ของด่วน",
    ],
  },
  {
    title: "ขั้นตอน / Door-to-Door",
    items: [
      "ตรวจเอกสารนำเข้า",
      "เตรียมเอกสารศุลกากร",
      "ขั้นตอนนำเข้า",
      "ปลดสินค้า",
      "เคลียร์จบใน 1 ชั่วโมง",
      "รับของภายใน 1 วัน",
      "ขนส่งต่อเนื่อง",
      "Door to Door Delivery",
    ],
  },
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
              รับเคลียร์ทุกเรื่องที่ด่าน — ทั้งภาษีนำเข้า ของติดด่าน และพิธีการศุลกากร <span className="text-primary-600/80 font-semibold">เริ่มเพียง 2,800 บาท</span> ทักไลน์ปรึกษาฟรีตลอด 24 ชม.
            </h2>

            {/* ─── Detailed service list — moved here per ปอน 2026-05-16 ─── */}
            <div className="mt-3 md:mt-4 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug md:whitespace-nowrap">
                <Image
                  src="/images/hero-section/icon-draf/alert.png"
                  alt=""
                  width={28}
                  height={28}
                  aria-hidden
                  className="w-5 h-5 md:w-7 md:h-7 shrink-0 mt-0.5 object-contain"
                />
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  บริการชิปปิ้งเคลียร์ของติดด่าน ศุลกากร ครบทุกด่าน
                  <span className="inline-flex items-center gap-0.5">
                    <Image src="/images/hero-section/icon-draf/plane.png" alt="" width={24} height={24} aria-hidden className="w-5 h-5 md:w-6 md:h-6 object-contain" />
                    <Image src="/images/hero-section/icon-draf/ship.png"  alt="" width={24} height={24} aria-hidden className="w-5 h-5 md:w-6 md:h-6 object-contain" />
                    <Image src="/images/hero-section/icon-draf/box.png"   alt="" width={24} height={24} aria-hidden className="w-5 h-5 md:w-6 md:h-6 object-contain" />
                  </span>
                </span>
              </h3>

              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed md:whitespace-nowrap">
                รับงานทุกด่านในไทย — สุวรรณภูมิ · ดอนเมือง · ไปรษณีย์หลักสี่ · คลองเตย · แหลมฉบัง · ลาดกระบัง (ICD) · ด่านชายแดน
              </p>

              <ul className="mt-4 md:mt-5 flex flex-col gap-y-3 md:gap-y-3.5 text-[14px] md:text-[16px] leading-[1.55] text-foreground/95">
                {[
                  { icon: "/images/hero-section/icon-draf/transfast.png",       text: "รับเคลียร์ทั้งขาเข้า–ขาออก ไม่ว่าจะมาทางอากาศ ทางเรือ หรือทางรถ" },
                  { icon: "/images/hero-section/icon-draf/checklistred.png",    text: "จับคู่ทะเบียนผู้นำเข้า–ส่งออก (YY) ที่กรมศุลฯ ให้ จบไวภายในครึ่งชั่วโมง" },
                  { icon: "/images/hero-section/icon-draf/pcs-forwarder.png",   text: "เอกสารครบมือทุกใบ — AWB, B/L, D/O, Invoice + Packing, ใบขนสินค้า, ใบเสร็จภาษี และใบอนุญาตนำเข้า" },
                  { icon: "/images/hero-section/icon-draf/customclearance.png", text: "เคยติดด่านมาก่อน? เราแก้ให้ตั้งแต่ภาษีเกิน พิกัดผิด เอกสารขาด ไปจนใบอนุญาตยังไม่ครบ" },
                  { icon: "/images/hero-section/icon-draf/customclearance.png", text: "วิ่งใบอนุญาตให้ทุกหน่วย — อย., มอก., สมอ., กสทช., กรมเกษตร, กรมประมง และอื่นๆ" },
                  { icon: "/images/hero-section/icon-draf/pcs-sales.png",       text: "ทีมเดินงานหน้าด่านจริงมามากกว่า 15 ปี รู้จักเจ้าหน้าที่ทุกตัวคน" },
                  { icon: "/images/hero-section/icon-draf/checklistred.png",    text: "มีใบอนุญาตตัวแทนออกของ (Shipping License) ของจริง ไม่ใช่นายหน้าหากิน" },
                  { icon: "/images/hero-section/icon-draf/people.png",          text: "ทุกอย่างถูกกฎหมาย ใบขนพร้อม ภาษีอากรครบ ไม่ต้องกลัวกรมศุล ตำรวจ หรือสรรพากรย้อนหลัง" },
                ].map((item) => (
                  <li key={item.text} className="flex items-start gap-3">
                    <Image src={item.icon} alt="" width={32} height={32} aria-hidden className="w-6 h-6 md:w-8 md:h-8 shrink-0 mt-0.5 object-contain" />
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
              CLEARANCE PRICING · ราคาเคลียร์ของตามด่าน
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ราคา <span className="text-primary-600">เคลียร์ของติดด่าน</span> ทุก Port · ชัดเจน ไม่บวกแอบ
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
              5 STEPS · ติดต่อง่าย เคลียร์ของจบใน 1 ชม.
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เคลียร์ของง่าย ๆ — <span className="text-primary-600">ครบจบใน 5 ขั้นตอน</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ทักมาก่อนได้เลย — ปรึกษาฟรี ไม่ต้องเดาเอง ไม่ต้องวิ่งยื่นเอกสารหลายรอบ ทีมจัดให้จบในคุยเดียว
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
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface="customs_addline_banner"
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

                <div className="relative grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[130px] md:min-h-[170px]">
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
                    <p className="md:hidden mt-1.5 text-[14.5px] font-extrabold text-white leading-snug tracking-tight [text-shadow:0_1px_4px_rgba(1,58,20,0.45)]">
                      ทักไลน์ปรึกษาฟรี รู้ผลใน 1 ชม.
                      <ArrowRight className="inline-block ml-1 w-4 h-4 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>
                  </div>

                  <div className="relative w-[110px] md:w-[180px] h-[130px] md:h-[170px] self-stretch shrink-0">
                    <Image
                      src="/images/visit/visit01.png"
                      alt="ทีมเซลล์ Pacred Shipping พร้อมตอบใน 5 นาที"
                      fill
                      sizes="(max-width: 768px) 110px, 180px"
                      className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(1,58,20,0.35)]"
                    />
                  </div>

                  <div className="pointer-events-none absolute top-1 md:top-2 right-2 md:right-4 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                    <span className="text-white text-[10.5px] md:text-[14px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(1,58,20,0.55)] whitespace-nowrap">
                      คลิ๊กตรงนี้
                    </span>
                    <MousePointerClick className="mt-0.5 w-3.5 h-3.5 md:w-[18px] md:h-[18px] text-white drop-shadow-[0_1px_2px_rgba(1,58,20,0.5)]" strokeWidth={2.6} />
                  </div>
                </div>
              </div>
            </TrackedExternalLink>
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
              WHY CLEAR WITH PACRED · 15+ YEARS
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไม <span className="text-primary-600">เคลียร์ของต้องเลือก Pacred Shipping</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              บริการครบจบที่เดียว ราคาบอกตรง คุยง่าย — ทีมหน้าด่านตัวจริงที่อยู่กับลูกค้ามากว่า 15 ปี รู้จักทุกด่านในไทย
            </p>

            <div className="mt-6 md:mt-8 flex flex-col gap-6 md:gap-8 items-stretch">
              <CertsSlideshow />

              {/* Why Pacred — compact emoji-bullet list per ปอน 2026-05-16 (stacked under collage per ปอน 2026-05-18) */}
              <div>
                <h3 className="text-[22px] md:text-[30px] font-black text-[#111827] dark:text-white leading-[1.25] mb-3 md:mb-4 tracking-tight">
                  เคลียร์ของต้อง <span className="text-primary-600">Pacred Shipping</span>
                  <span className="block mt-1.5 md:mt-2 text-[17px] md:text-[20px] font-bold text-foreground/85 leading-snug">
                    เคลียร์ได้ <span className="text-primary-600">เร็ว · ราคาชัด · ติดต่อง่าย 100%</span>
                  </span>
                </h3>
                <ul className="flex flex-col gap-y-2.5 md:gap-y-3 text-[13px] md:text-[15px] leading-[1.55] text-foreground/90">
                  {[
                    { icon: "/images/hero-section/icon-draf/ptrack.png",          title: "เคลียร์ด่วน ภายใน 1 ชั่วโมง",  desc: "ของได้ออกจากด่านในวันเดียว ไม่ต้องนอนค้างให้เสียค่าฝากเก็บเพิ่ม" },
                    { icon: "/images/hero-section/icon-draf/ongkorn.png",         title: "ราคาโปร่งใส ไม่มีบวกแอบ",   desc: "ภาษี ค่าพิธีการ ค่ารถ — รวบในใบเดียวอ่านเข้าใจง่าย ไม่มีค่าใช้จ่ายงอกทีหลัง" },
                    { icon: "/images/hero-section/icon-draf/people.png",          title: "ทีมหน้างานจริง ทุกด่าน",      desc: "มีคนประจำที่สุวรรณภูมิ คลองเตย แหลมฉบัง ICD มุกดาหาร นครพนม และอรัญฯ" },
                    { icon: "/images/hero-section/icon-draf/customclearance.png", title: "แก้ปัญหาที่คนอื่นทำไม่ได้",   desc: "ของติดด่าน, HS Code ผิด, ภาษีเกินจริง หรือใบอนุญาต อย./มอก. ยังไม่ครบ เราเข้าไปคุยให้" },
                    { icon: "/images/hero-section/icon-draf/checklistred.png",    title: "มีใบอนุญาตจริง ไม่ใช่นายหน้า", desc: "Shipping License, ทะเบียนกรมศุล, DBD และ ภพ.20 ครบทุกใบ ตรวจสอบได้" },
                    { icon: "/images/hero-section/icon-draf/pcs-sales.png",       title: "ประสบการณ์ 15+ ปี",            desc: "ผ่านสินค้าเกือบทุกประเภท ทุก Term และทุก Port ในไทย" },
                    { icon: "/images/hero-section/icon-draf/pcs-forwarder.png",   title: "รองรับสินค้าควบคุม",            desc: "ยา เครื่องสำอาง อิเล็กทรอนิกส์ เครื่องจักร และเคมีภัณฑ์ เอาอยู่หมด" },
                    { icon: "/images/hero-section/icon-draf/pcs-address.png",     title: "Tracking real-time",            desc: "อัปเดตสถานะทุกขั้นตอน ทักทีมได้ตลอด 24 ชม. ไม่ต้องลุ้น" },
                  ].map((item) => (
                    <li key={item.title} className="flex items-start gap-2.5 md:gap-3">
                      <Image src={item.icon} alt="" width={28} height={28} aria-hidden className="w-6 h-6 md:w-7 md:h-7 shrink-0 mt-0.5 object-contain" />
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
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface="customs_addline_banner_2"
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

                <div className="relative grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[130px] md:min-h-[170px]">
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
                    <p className="md:hidden mt-1.5 text-[14.5px] font-extrabold text-white leading-snug tracking-tight [text-shadow:0_1px_4px_rgba(1,58,20,0.45)]">
                      ทักไลน์ปรึกษาฟรี รู้ผลใน 1 ชม.
                      <ArrowRight className="inline-block ml-1 w-4 h-4 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>
                  </div>

                  <div className="relative w-[110px] md:w-[180px] h-[130px] md:h-[170px] self-stretch shrink-0">
                    <Image
                      src="/images/visit/visit01.png"
                      alt="ทีมเซลล์ Pacred Shipping พร้อมตอบใน 5 นาที"
                      fill
                      sizes="(max-width: 768px) 110px, 180px"
                      className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(1,58,20,0.35)]"
                    />
                  </div>

                  <div className="pointer-events-none absolute top-1 md:top-2 right-2 md:right-4 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                    <span className="text-white text-[10.5px] md:text-[14px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(1,58,20,0.55)] whitespace-nowrap">
                      คลิ๊กตรงนี้
                    </span>
                    <MousePointerClick className="mt-0.5 w-3.5 h-3.5 md:w-[18px] md:h-[18px] text-white drop-shadow-[0_1px_2px_rgba(1,58,20,0.5)]" strokeWidth={2.6} />
                  </div>
                </div>
              </div>
            </TrackedExternalLink>
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

        {/* ─── Pacred guarantee banner — per ปอน 2026-05-17 v3
             • SLIM style เหมือน Add-LINE banner สีเขียวข้างบน — แต่ Pacred red theme
             • Headline: "ของติดด่าน? แค่ 2,800 บาท เคลียร์ไวกับ Pacred Shipping"
               - Pacred Shipping = white pill + red text (highlight)
             • Partner logos (FedEx/DHL/TNT/UPS) เป็น sub-strip กดได้แยก
             • visit02 photo ขวา (slim, self-stretch)
             • "คลิ๊กตรงนี้" badge มุมขวาบน (rotate -6deg)
             • ทั้งกล่องกดได้ → LINE (overlay anchor + content pointer-events-none) */}
        <section className="relative pt-2 md:pt-4 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="relative max-w-[1100px] mx-auto group">
              <div
                className="relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(179,0,0,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(179,0,0,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #DC1F1F 0%, #B30000 45%, #7F0000 100%)" }}
              >
                {/* Decorative sheen */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 25% 50%, rgba(255,200,100,0.30) 0%, transparent 55%)" }}
                />
                {/* Dot pattern */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.10]"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle, white 1px, transparent 1.4px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                {/* LINE click overlay — sits behind partner logos (z-10 < logos z-20) */}
                <TrackedExternalLink
                  href={LINE_URL}
                  cta="line_consult"
                  surface="customs_guarantee_banner"
                  aria-label="ทักไลน์ Pacred Shipping ปรึกษาเคลียร์ของฟรี"
                  className="absolute inset-0 z-10"
                >
                  <span className="sr-only">ทักไลน์ Pacred Shipping</span>
                </TrackedExternalLink>

                <div className="relative pointer-events-none grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[150px] md:min-h-[180px]">
                  <div className="min-w-0 py-3 md:py-3">
                    {/* Desktop headline */}
                    <p className="hidden md:flex flex-wrap items-center gap-x-2 gap-y-1 text-[30px] font-black text-white leading-[1.1] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                      <span>ของติดด่าน? แค่ <span className="text-yellow-300">2,800 บาท</span> เคลียร์ไวกับ</span>
                      <span className="inline-block px-4 py-0.5 rounded-full bg-white text-primary-600 text-[26px] font-black tracking-tight shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
                        Pacred Shipping
                      </span>
                      <ArrowRight className="inline-block w-7 h-7 align-[-0.15em] transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                    </p>

                    {/* Mobile headline */}
                    <p className="md:hidden text-[18px] font-black text-white leading-[1.1] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                      ของติดด่าน? แค่ <span className="text-yellow-300">2,800 บาท</span> เคลียร์ไวกับ
                    </p>
                    <p className="md:hidden mt-1 inline-flex items-center gap-1.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full bg-white text-primary-600 text-[14px] font-black tracking-tight shadow-[0_3px_8px_rgba(0,0,0,0.25)]">
                        Pacred Shipping
                      </span>
                      <ArrowRight className="w-4 h-4 text-white transition-transform group-hover:translate-x-1" strokeWidth={2.8} />
                    </p>

                    {/* Partner logos — clickable strip below headline */}
                    <div className="mt-2.5 md:mt-3 flex items-center gap-2 md:gap-3 pointer-events-auto relative z-20">
                      {[
                        { name: "FedEx", logo: "/images/partners/fedexpartner.png", url: "https://www.fedex.com/th-th/home.html" },
                        { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com/th-en/home.html" },
                        { name: "TNT", logo: "/images/partners/tntpartner.png", url: "https://www.tnt.com/express/th_th/site/home.html" },
                        { name: "UPS", logo: "/images/partners/upspartner.png", url: "https://www.ups.com/th/en/Home.page" },
                      ].map((c) => (
                        <a
                          key={c.name}
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          aria-label={c.name}
                          className="relative h-7 md:h-11 w-[46px] md:w-[78px] bg-white rounded-md md:rounded-lg flex items-center justify-center p-1 md:p-1.5 shadow-sm shrink-0 hover:scale-110 hover:shadow-md transition-transform"
                        >
                          <Image
                            src={c.logo}
                            alt={c.name}
                            fill
                            sizes="(max-width: 768px) 46px, 78px"
                            className="object-contain p-0.5 md:p-1"
                          />
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* visit02 photo — square 1:1 source (1080×1080), self-stretch slim.
                      object-contain keeps full body visible, object-bottom anchors
                      to the banner floor so the head clears the top edge.
                      `md:mr-6` shifts the desktop photo left so "คลิ๊กตรงนี้"
                      badge in the top-right corner doesn't overlap the person. */}
                  <div className="relative w-[130px] md:w-[180px] h-[150px] md:h-[180px] self-stretch shrink-0 md:mr-6">
                    <Image
                      src="/images/visit/visit03.png"
                      alt="ทีมเซลล์ Pacred Shipping"
                      fill
                      sizes="(max-width: 768px) 130px, 180px"
                      className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.30)]"
                    />
                  </div>

                  {/* คลิ๊กตรงนี้ corner badge */}
                  <div className="pointer-events-none absolute top-1 md:top-2 right-1 md:right-3 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                    <span className="text-white text-[11px] md:text-[15px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] whitespace-nowrap">
                      คลิ๊กตรงนี้
                    </span>
                    <MousePointerClick className="mt-0.5 w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" strokeWidth={2.6} />
                  </div>
                </div>
              </div>
            </div>

            {/* 2 CTA image banners — สมัคร + ปรึกษาไลน์ (per ปอน 2026-05-18) */}
            <div className="mt-3 md:mt-4 grid grid-cols-2 gap-2 md:gap-4">
              <Link
                href="/register"
                aria-label="สมัครสมาชิกฟรี — คลิ๊กเลย"
                className="group relative block overflow-hidden rounded-2xl hover:-translate-y-0.5 transition-transform duration-300"
              >
                <Image
                  src="/images/cta/samak.png"
                  alt="สมัครสมาชิกฟรี — คลิ๊กเลย"
                  width={534}
                  height={200}
                  sizes="(max-width: 768px) 45vw, 540px"
                  quality={92}
                  className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </Link>

              <TrackedExternalLink
                href={LINE_URL}
                cta="line_consult"
                surface="customs_guarantee_cta"
                aria-label="ปรึกษานำเข้าฟรี ทางไลน์ — คลิ๊กเลย"
                className="group relative block overflow-hidden rounded-2xl hover:-translate-y-0.5 transition-transform duration-300"
              >
                <Image
                  src="/images/cta/pruksa.png"
                  alt="ปรึกษานำเข้าฟรี ทางไลน์ — คลิ๊กเลย"
                  width={534}
                  height={200}
                  sizes="(max-width: 768px) 45vw, 540px"
                  quality={92}
                  className="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.02]"
                />
              </TrackedExternalLink>
            </div>
          </div>
        </section>

        {/* ─── Pacred Shipping detailed services + problem-solving block
             (per ปอน 2026-05-17 v2 — themed to match other sections on this
             page: red-dot/icon eyebrow + 22/34px H2 + flat layout, no card) */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            {/* ── Services intro ── */}
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Briefcase className="w-3.5 h-3.5" strokeWidth={2.6} />
              CLEARANCE EXPERTS · บริการเคลียร์ครบวงจร
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              เปิดประสบการณ์ <span className="text-primary-600">เคลียร์ของและภาษีนำเข้า</span> กับ Pacred Shipping
            </h2>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
              Pacred Shipping ดูแลเรื่องนำเข้า–ส่งออกครบในที่เดียว — ทั้ง <strong className="text-primary-600 font-black">เคลียร์ภาษีนำเข้า</strong> ของติดด่าน และพิธีการศุลกากร ขนทางอากาศหรือทางเรือก็ได้ บอกราคาตรง คุยง่าย ด้วยทีมที่อยู่หน้าด่านจริงมา <strong className="text-primary-600 font-black">15 ปี</strong>
            </p>

            {/* Service bullets — CheckCircle2 + bolded keyword */}
            <ul className="mt-6 md:mt-8 flex flex-col gap-y-3 md:gap-y-3.5">
              {[
                <>ดูแล <strong className="font-black text-foreground">ภาษีศุลกากรพร้อมภาษีสนามบินทั้งสุวรรณภูมิและดอนเมือง</strong> ในใบเดียว</>,
                <>รับเคสติดด่านทุกที่ — <strong className="font-black text-foreground">สนามบิน ท่าเรือคลองเตย ท่าเรือกรุงเทพ</strong> ลามไปท่าอื่นทั่วประเทศ</>,
                <>จองพื้นที่ขนส่งให้ — <strong className="font-black text-foreground">Booking Flights, Air Freight, Sea Freight, Customs Clearance</strong> ครบใน flow เดียว</>,
                <>รับงานจากทุกขนส่งหลัก เช่น <strong className="font-black text-foreground">DHL, FedEx, UPS, TNT, Air Cargo</strong> และอื่นๆ ที่ลูกค้าใช้</>,
                <>วิ่งเรื่องเมื่อสินค้าโดนติดที่หน่วยงานราชการ เช่น <strong className="font-black text-foreground">มอก., สมอ., กสทช., กรมเกษตร, กรมประมง</strong></>,
                <><strong className="font-black text-foreground">หน้าด่านจริง 15+ ปี</strong> ถนัด <strong className="font-black text-foreground">กฎหมายศุลกากร พิกัดอัตรา การใช้สิทธิภาษี และการขอคืนภาษี</strong></>,
                <>เคลียร์ได้ <strong className="font-black text-foreground">ทุกประเภทสินค้า ไม่มีขั้นต่ำ</strong> ขอแค่ถูกกฎหมายเท่านั้น</>,
                <>คุยตรงกับ <strong className="font-black text-foreground">เจ้าหน้าที่กรมศุลฯ</strong> ลดขั้นตอนรอผ่านคนกลาง</>,
                <>อยากเพิ่ม <strong className="font-black text-foreground">ประกันสินค้า</strong>? ทำให้ได้ทุกประเภท บอกทีมตอนปรึกษาได้เลย</>,
              ].map((node, idx) => (
                <li key={idx} className="flex items-start gap-2.5 md:gap-3">
                  <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6 text-primary-600 shrink-0 mt-[3px] md:mt-[4px]" strokeWidth={2.6} />
                  <span className="text-[15px] md:text-[18px] leading-[1.55] text-foreground/95">
                    {node}
                  </span>
                </li>
              ))}
            </ul>

            {/* ── Problems we solve ── */}
            <div className="mt-8 md:mt-12 inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ShieldAlert className="w-3.5 h-3.5" strokeWidth={2.6} />
              CLEARANCE PROBLEMS · ปัญหาเคลียร์ของที่เรารับดูแล
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ปัญหา <span className="text-primary-600">เคลียร์ของติดด่าน</span> ที่เรารับจัดการให้
            </h2>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
              ทุกเคสที่ลูกค้าเจอ — ของติดด่าน ภาษีค้าง พิธีการพัง — ทีม Pacred Shipping ลงไปแก้ที่ต้นเรื่อง ไม่ใช่แค่รับมาแล้วส่งต่อให้คนอื่นทำ
            </p>

            <ul className="mt-6 md:mt-8 flex flex-col gap-y-2.5 md:gap-y-3">
              {[
                <><strong className="font-black text-foreground">พิกัดอัตราศุลกากร</strong> — สินค้าถูกตีพิกัดผิด ทำให้จ่ายภาษีแพงกว่าที่ควร เรารับเข้าไปคุย</>,
                <><strong className="font-black text-foreground">ใบอนุญาตนำเข้า</strong> — เคสที่ต้องขอ มอก., สมอ., กสทช. หรือใบอื่นที่ยังไม่ครบมือ</>,
                <><strong className="font-black text-foreground">เอกสารผิด / เอกสารไม่ครบ</strong> — แก้ Invoice, Packing List, B/L หรือใบใดก็ตามที่ทำให้สินค้าติด</>,
                <>ใช้สิทธิ์ <strong className="font-black text-foreground">ฟอร์มภาษีพิเศษ</strong> เช่น Form E, Form D, Form AI ฯลฯ ช่วยลดต้นทุนภาษีนำเข้า</>,
                <><strong className="font-black text-foreground">ราคาสินค้าโดนตีสูงเกินจริง</strong> หรือเอกสารราคาไม่ตรงกัน เราคุยกับเจ้าหน้าที่ให้</>,
                <>นำเข้า <strong className="font-black text-foreground">สัตว์เลี้ยง</strong> — แมว สุนัข พร้อมขอใบอนุญาตจากกรมปศุสัตว์ให้</>,
                <>นำเข้า <strong className="font-black text-foreground">อาหาร ผลไม้ ของสด</strong> — ผ่านด่านอาหาร–กักกันพืช พร้อมเอกสารครบชุด</>,
                <>นำเข้า <strong className="font-black text-foreground">เสื้อผ้า เครื่องแต่งกาย</strong> — ทั้งล็อตขายและของใช้ส่วนตัวที่สั่งมาเอง</>,
                <>นำเข้า <strong className="font-black text-foreground">เครื่องประดับ ของใช้ส่วนตัว</strong> — ประเมินมูลค่าและทำพิธีการให้เรียบร้อย ไม่มีปัญหาตามมา</>,
                <>เคลียร์ของลงคลังสุวรรณภูมิ — <strong className="font-black text-foreground">DHL, FedEx, UPS, TNT, BFS</strong> และคลังอื่นที่ลูกค้าฝากไว้</>,
              ].map((node, idx) => (
                <li key={idx} className="flex items-start gap-2.5 md:gap-3">
                  <span aria-hidden className="w-2 h-2 md:w-2.5 md:h-2.5 bg-primary-600 mt-[8px] md:mt-[11px] shrink-0 rounded-[2px]" />
                  <span className="text-[15px] md:text-[18px] leading-[1.55] text-foreground/95">
                    {node}
                  </span>
                </li>
              ))}
            </ul>

            {/* ── Closing confidence block — themed card with red gradient ── */}
            <div className="mt-8 md:mt-12 relative overflow-hidden rounded-2xl border border-primary-200 dark:border-primary-900/40 bg-gradient-to-br from-primary-50/70 via-white to-white dark:from-primary-900/15 dark:via-surface dark:to-surface p-5 md:p-7 text-center shadow-[0_8px_24px_rgba(179,0,0,0.08)]">
              <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
                CLEARANCE GUARANTEE · มั่นใจเคลียร์ได้ 100%
              </div>
              <h3 className="text-[20px] md:text-[28px] font-black leading-[1.2] tracking-[-0.03em] text-[#111827] dark:text-white">
                มั่นใจ เคลียร์ของได้แน่ เมื่อเลือก<br className="md:hidden" />
                {" "}<span className="text-primary-600">Pacred Shipping</span>
              </h3>
              <p className="mt-2.5 md:mt-3 text-[14px] md:text-[16px] leading-[1.65] font-medium text-muted max-w-[820px] mx-auto">
                อยู่ข้างคุณทุกขั้นตอน — <strong className="text-primary-600 font-black">บริการครบ ราคาชัด คุยกับทีมง่าย</strong> ของออกจากด่านเร็ว คุ้มค่าจริง ทักไลน์ปรึกษาฟรีตลอด 24 ชม. ทีมตอบไว
              </p>
            </div>
          </div>
        </section>

        {/* ═══════ 11. Related tags + articles (per ปอน 2026-05-17 v3) ═══════
             - Show เคลียร์-tags grouped by sub-category on THIS page
             - Pair with article cards filtered to category="เคลียร์"
             - "ดูบทความทั้งหมด" CTA → /knowledge (other categories live there) */}
        <section className="relative pt-1.5 md:pt-3 pb-1 md:pb-2">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Tag className="w-3.5 h-3.5" strokeWidth={2.6} />
              RELATED TAGS · หัวข้อที่เกี่ยวข้องกับการเคลียร์
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              บริการ <span className="text-primary-600">เคลียร์ของติดด่าน</span> ครอบคลุมทุก Port
            </h2>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[920px]">
              กดแท็กดูบทความเจาะลึก หรืออ่านเรื่องอื่นได้ที่หน้า <Link href="/knowledge" className="text-primary-600 hover:text-primary-700 font-bold underline-offset-4 hover:underline">สาระน่ารู้</Link>
            </p>

            {/* Tabs + content panel — Trip.com style (per ปอน 2026-05-17) */}
            <div className="mt-6 md:mt-8">
              <RelatedTagsTabs groups={TAG_GROUPS} />
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}

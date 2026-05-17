import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  ShoppingBag,
  Languages,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  MessageCircle,
  Phone,
  Home,
  ChevronRight,
  ArrowRight,
  Search,
  PackageCheck,
  Camera,
  HandCoins,
  Truck,
  Sparkles,
  Boxes,
  BadgePercent,
  Users,
  Award,
  Globe2,
  ScanLine,
  CircleDollarSign,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { BookingCalculator } from "@/components/booking/BookingCalculator";
import { ContactSales } from "@/components/sections/contact-sales";
import { PurchaseBanner } from "@/components/sections/purchase-banner";
import { FaqAccordion } from "@/components/sections/faq-accordion";
import { Footer } from "@/components/sections/footer";
import { TrustStatsStrip } from "@/components/sections/trust-stats-strip";
import { Link } from "@/i18n/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import {
  breadcrumbSchema,
  serviceSchema,
  faqPageSchema,
} from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";
import { CONTACT, LINE_OA } from "@/components/seo/site";
import {
  TrackedExternalLink,
  TrackedPhoneLink,
} from "@/components/analytics/tracked-link";

const SURFACE = "china_shopping_landing";

const PATH = "/services/china-shopping";
const NS = "seo.services.chinaShopping";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

const LINE_URL = "/line";
const PHONE_DISPLAY = CONTACT.phoneDisplay;

type Platform = {
  id: "1688" | "taobao" | "tmall" | "alibaba";
  name: string;
  desc: string;
  for: string;
  accent: string;
};

const PLATFORMS: Platform[] = [
  {
    id: "1688",
    name: "1688",
    desc: "ตลาดส่งสำหรับเจ้าของกิจการ · ราคาส่งของจริงจากโรงงานจีน · ต้องสั่งขั้นต่ำตามแต่ละ SKU",
    for: "ผู้ขายปลีก · ผู้ผลิตที่หาวัตถุดิบ · ทำแบรนด์ OEM",
    accent: "from-orange-500 to-rose-600",
  },
  {
    id: "taobao",
    name: "Taobao",
    desc: "ตลาดค้าปลีก C2C ของจีน · ราคาขายปลีก · สั่งทีละชิ้นได้ · สินค้าหลากหลายที่สุด",
    for: "ใช้เอง · เริ่มต้นทดลองตลาด · พรีออเดอร์",
    accent: "from-amber-500 to-orange-600",
  },
  {
    id: "tmall",
    name: "Tmall",
    desc: "แพลตฟอร์มของ Alibaba เน้นแบรนด์-ของแท้-คุณภาพ · สำหรับลูกค้าที่ต้องการความมั่นใจในแหล่งที่มา",
    for: "ขายของแบรนด์ · ของแท้ certificate ครบ",
    accent: "from-red-500 to-pink-600",
  },
  {
    id: "alibaba",
    name: "Alibaba",
    desc: "ตลาด B2B ระดับ international · ส่งออกทั่วโลก · เจรจาราคา + ตรวจ supplier ได้",
    for: "ขายส่ง · ส่งออก · ทำธุรกิจระหว่างประเทศ",
    accent: "from-blue-500 to-indigo-600",
  },
];

const SERVICE_SCOPE = [
  "ทีมล่ามจีนปิดดีลกับโรงงาน-ซัพพลายเออร์ในนามคุณ",
  "ค้นหาสินค้าจาก URL · รูปสินค้า · keyword ภาษาไทย/จีน/อังกฤษ",
  "เช็คราคา · เช็คสต๊อก · เจรจาส่วนลด ก่อนสั่ง",
  "ตรวจสเปก · ตรวจสี · ตรวจขนาด · ตรวจคุณภาพ ก่อนของออกจีน",
  "ถ่ายรูป-วีดิโอสินค้าจริงให้ก่อนชำระเงิน",
  "รับของจากทุกร้านที่โกดังกวางโจว/เซินเจิ้น/อี้อู",
  "รวมส่งทุก order ในรอบเดียว — ค่าขนส่งคุ้มกว่า",
  "ฝากโอนหยวน Alipay/WeChat Pay — ไม่ต้องเปิดบัญชีจีนเอง",
];

const HOW = [
  {
    num: "01",
    icon: Search,
    title: "ส่ง URL / รูปสินค้า",
    desc: "Copy ลิงก์ 1688/Taobao/Tmall มาให้ — หรือถ่ายรูปสินค้าตัวอย่าง ทีม Pacred ช่วยหาให้",
  },
  {
    num: "02",
    icon: Languages,
    title: "ทีมล่ามคุยโรงงาน",
    desc: "เช็คราคา · ต่อรอง · เช็คสต๊อก · ขอตัวอย่าง · ขอ certificate — ในนามคุณ ไม่ต้องคุยจีน",
  },
  {
    num: "03",
    icon: HandCoins,
    title: "ฝากโอนหยวน",
    desc: "Pacred ชำระเงินให้โรงงาน — Alipay/WeChat Pay/Bank Transfer · เรทดี ไม่ต้องเปิดบัญชี",
  },
  {
    num: "04",
    icon: Camera,
    title: "ตรวจรับที่โกดังจีน",
    desc: "รับ-นับ-ตรวจ-ถ่ายรูป ก่อนส่งออก แจ้งสถานะให้คุณทราบทุกขั้น",
  },
  {
    num: "05",
    icon: Truck,
    title: "ส่งถึงไทย Door-to-Door",
    desc: "รวมส่งทุก order ในรอบเดียว เคลียร์ภาษีครบ ส่งถึงประตูคุณทั่วประเทศ",
  },
];

const WHY = [
  {
    icon: Languages,
    title: "ไม่ต้องคุยจีนเอง",
    desc: "ทีมล่ามจีนปิดดีลให้ในนามคุณ — ราคาส่ง · ต่อรองได้",
  },
  {
    icon: ShieldCheck,
    title: "ตรวจของก่อนส่ง",
    desc: "ถ่ายรูป-วีดิโอ-นับชิ้น แจ้งก่อนของออกจีน ไม่เซอร์ไพรส์ตอนถึง",
  },
  {
    icon: HandCoins,
    title: "ฝากโอนหยวนเรทดี",
    desc: "Alipay · WeChat Pay · Bank Transfer — ไม่ต้องเปิดบัญชีจีนเอง",
  },
  {
    icon: Wallet,
    title: "ราคาชัดเจน",
    desc: "ค่าบริการ + ค่าขนส่ง + ภาษี แจ้งครบในใบเดียวก่อนยืนยัน",
  },
  {
    icon: Boxes,
    title: "รวมส่งทุก order",
    desc: "สั่งหลายร้าน รวมส่งรอบเดียวที่โกดังจีน — ค่าขนส่งถูกกว่า",
  },
  {
    icon: BadgePercent,
    title: "ใช้สิทธิ Form E",
    desc: "ลดภาษีนำเข้าผ่าน FTA ASEAN-China · ประหยัดได้สูงสุด",
  },
  {
    icon: Users,
    title: "ทีมประจำคุณ",
    desc: "ผู้ดูแลเฉพาะรายลูกค้า · ไม่ต้องเล่าใหม่ทุกครั้ง",
  },
  {
    icon: Award,
    title: "ประสบการณ์ 15+ ปี",
    desc: "ครอบคลุมเสื้อผ้า · เครื่องสำอาง · อะไหล่ · ของชำ · ของแต่งบ้าน",
  },
];

const PRODUCT_TYPES = [
  { label: "ผลิตภัณฑ์ความงาม", img: "/images/categories/Beauty.png" },
  { label: "เสื้อผ้าแฟชั่นผู้หญิง", img: "/images/categories/Women.png" },
  { label: "เสื้อผ้าแฟชั่นผู้ชาย", img: "/images/categories/Man.png" },
  { label: "กระเป๋าถือ", img: "/images/categories/Bag.png" },
  { label: "รองเท้าผู้หญิง", img: "/images/categories/Womensshoes.png" },
  { label: "รองเท้าผู้ชาย", img: "/images/categories/Mensshoes.png" },
  { label: "เครื่องประดับ", img: "/images/categories/Jewelry.png" },
  { label: "อุปกรณ์อิเล็กทรอนิกส์", img: "/images/categories/Electronics.png" },
  { label: "เครื่องจักร", img: "/images/categories/Machinery.png" },
  { label: "เฟอร์นิเจอร์", img: "/images/categories/Furniture.png" },
  { label: "เครื่องใช้ในบ้าน", img: "/images/categories/Homeappliances.png" },
  { label: "ของเล่น สินค้าแม่และเด็ก", img: "/images/categories/Mom.png" },
];

const FAQ_ITEMS = [
  {
    q: "ฝากสั่งสินค้าจีน Pacred คิดค่าบริการยังไง?",
    a: "ค่าบริการฝากสั่ง = ค่าสินค้า (ราคาที่โรงงาน) + ค่าโอนหยวน (อัตราเรทปัจจุบัน) + ค่าขนส่งจีน-ไทย (ตามน้ำหนัก/CBM) + ค่าภาษีนำเข้า (ตาม HS Code) — ทีมแจ้ง Total Landed Cost ครบในใบเดียวก่อนยืนยัน ไม่มีค่าบริการแฝง",
  },
  {
    q: "ฝากสั่ง 1688 vs Taobao vs Tmall ต่างกันยังไง?",
    a: "1688 = ตลาดส่ง · ราคาส่งจริง · ต้องสั่งขั้นต่ำ · เหมาะกับเจ้าของกิจการ · Taobao = ตลาดปลีก · สั่งทีละชิ้นได้ · สินค้าหลากหลายที่สุด · เหมาะใช้เอง · Tmall = แพลตฟอร์ม Alibaba เน้นแบรนด์-ของแท้-คุณภาพ · สำหรับลูกค้าที่ต้องการความมั่นใจในแหล่งที่มา",
  },
  {
    q: "ขั้นต่ำในการฝากสั่งเท่าไร?",
    a: "ไม่มีขั้นต่ำในการฝากสั่ง — สั่งทีละชิ้นเล็กๆ ก็ทำได้ (Taobao) หรือสั่งจำนวนมากจากโรงงาน 1688 ก็ได้ ทีม Pacred รวมส่งให้ในรอบเดียว ทำให้ค่าขนส่งคุ้มกว่าสั่งแยก",
  },
  {
    q: "ใช้เวลาทั้งหมดกี่วัน?",
    a: "ขึ้นกับวิธีขนส่ง · ทางอากาศ 7-10 วัน (จ่ายเงิน → ของถึงไทย) · ทางเรือ LCL 15-20 วัน · ทางรถ 10-14 วัน รวมเวลาที่โรงงานเตรียมของ + ขนส่งภายในจีน + ขนส่งจีน-ไทย + เคลียร์ภาษี + จัดส่งในประเทศไทย",
  },
  {
    q: "ตรวจสินค้าก่อนส่งทำยังไง?",
    a: "เมื่อของถึงโกดัง Pacred ที่จีน — ทีมจะนับชิ้น · ถ่ายรูป · ทดสอบเปิดเครื่อง (สำหรับอิเล็กทรอนิกส์) · เช็คขนาด-สี-สเปก ตรงตามที่สั่ง ส่งภาพและสถานะให้คุณก่อนยืนยันส่งออก ถ้าสินค้าผิดสเปก ทีมประสานเคลม-เปลี่ยน-คืน ในนามคุณ",
  },
  {
    q: "ฝากโอนหยวนเรทเท่าไร?",
    a: "เรท Pacred อ้างอิงเรทกลาง CNY-THB ของวันนั้น + ค่าบริการโอนเล็กน้อย ดูเรทปัจจุบันได้ที่หน้าหลักของเว็บ หรือทักไลน์ทีม — แจ้งจำนวนเงินที่ต้องโอน + บัญชีปลายทาง (Alipay/WeChat/Bank) แล้วโอนได้ทันที",
  },
  {
    q: "ฝากสั่งของควบคุม เช่น เครื่องสำอาง เข้าได้มั้ย?",
    a: "ได้ — แต่ต้องมีใบอนุญาตจาก อย./มอก./สมอ./กสทช. ก่อนนำเข้า ทีม Pacred ช่วยจัดทำเอกสาร · ประสานหน่วยงาน · ตรวจ HS Code · เตรียมข้อมูลสำหรับยื่นขอใบอนุญาต ใช้เวลาประมาณ 7-30 วัน",
  },
  {
    q: "ออกใบกำกับภาษี (ภพ.20) ได้มั้ย?",
    a: "ได้ — Pacred เป็นบริษัท จดทะเบียน VAT 7% ออกใบกำกับภาษีให้ทุก order ทั้งฝั่ง individual และนิติบุคคล ใบเสร็จและใบกำกับภาษีใช้ลดหย่อนได้",
  },
];

export default async function ChinaShoppingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  const t = await getTranslations({ locale, namespace: NS });
  const homeLabel = typedLocale === "th" ? "หน้าหลัก" : "Home";
  const svcLabel = typedLocale === "th" ? "บริการ" : "Services";
  const here =
    typedLocale === "th" ? "สั่งซื้อสินค้าจากจีน" : "China shopping";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType:
              typedLocale === "th" ? "ฝากสั่งจีน" : "China shop-order",
          }),
          breadcrumbSchema(
            [
              { name: homeLabel, path: "/" },
              { name: svcLabel, path: "/services" },
              { name: here, path: PATH },
            ],
            typedLocale,
          ),
          faqPageSchema(
            FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a })),
          ),
        ]}
      />
      <NavBar />
      <SearchBar />
      <main>
        <BookingCalculator landing="sourcing" />

        {/* ─── Breadcrumb ─── */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px]">
            <li>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors"
              >
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link
                href="/services"
                className="text-muted hover:text-primary-600 transition-colors"
              >
                {svcLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground truncate">
              {here}
            </li>
          </ol>
        </nav>

        {/* ═══════ 1. Hero ═══════ */}
        <section className="relative pt-3 md:pt-5 pb-2 md:pb-4">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ShoppingBag className="w-3.5 h-3.5" strokeWidth={2.6} />
              CHINA SHOPPING · ฝากสั่งซื้อจีน
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">ฝากสั่งซื้อสินค้าจีน</span> 1688 · Taobao · Tmall · Alibaba
              <span className="hidden md:inline"> ฝากโอนหยวนครบจบ</span>
            </h1>

            <h2 className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              บริการฝากสั่งของจีนแบบมืออาชีพ — ทีมล่ามจีนปิดดีลกับโรงงาน · ตรวจสินค้าก่อนส่ง · ฝากโอนหยวน · รวมส่งคุ้ม · ใบกำกับภาษีครบ — <span className="text-primary-600/80 font-bold">ค่าบริการฝากสั่งเริ่ม 3% · เริ่มจาก 0 ก็ทำได้</span>
            </h2>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* LINE attention banner */}
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_cta"
              surface={SURFACE}
              ctaProps={{ position: "hero_banner" }}
              aria-label="ทักไลน์ Pacred — ปรึกษาฝากสั่งจีนฟรี"
              className="group block mt-4 md:mt-6 relative pt-3 md:pt-4 pr-4 md:pr-8 max-w-[1100px] no-underline"
            >
              <span className="absolute top-0 left-3 md:left-5 z-20 inline-flex items-center gap-1.5 bg-slate-900 dark:bg-black text-white text-[11.5px] md:text-[13px] font-bold px-3 md:px-4 py-1.5 md:py-2 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.45)] tracking-tight transition-transform duration-300 group-hover:-translate-y-0.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" />
                </span>
                อยากสั่งของจีน?
              </span>

              <div
                className="relative rounded-2xl text-white shadow-[0_12px_32px_rgba(120,0,0,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(160,0,0,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #5b0c0c 0%, #7a0a0a 45%, #3b0707 100%)" }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-50 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 75% 50%, rgba(253,224,71,0.25) 0%, transparent 55%)" }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.08]"
                  style={{
                    backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                <div className="relative grid grid-cols-[auto_1fr] items-center gap-2 md:gap-5 pl-3 md:pl-6 pr-3 md:pr-6 pt-7 md:pt-7 pb-4 md:pb-5">
                  <div className="leading-none shrink-0">
                    <p className="text-[16px] md:text-[32px] font-black tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]">
                      <span className="text-yellow-300">P</span>
                      <span className="text-white">acred</span>
                    </p>
                    <p className="mt-0.5 text-[7.5px] md:text-[12px] font-bold tracking-[0.30em]">
                      <span className="text-yellow-300">S</span>
                      <span className="text-white">HIPPING</span>
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[12px] md:text-[28px] font-bold text-white leading-snug">
                      ส่ง URL · ส่งรูป · ทีมจัดให้ครบ
                    </p>
                    <p className="hidden md:block mt-1.5 text-[13px] text-white/75 leading-snug">
                      ฝากสั่ง · ฝากโอน · ตรวจของ · รวมส่ง · เคลียร์ภาษี ครบในที่เดียว
                    </p>
                    <p className="mt-1.5 md:mt-2 inline-flex items-center gap-1 text-[10px] md:text-[12px] font-bold tracking-wide">
                      <MessageCircle className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300" strokeWidth={2.6} />
                      <span className="text-yellow-300">ทักไลน์</span>
                      <span className="text-white/85">ปรึกษาฟรี — ตอบไว 5 นาที</span>
                      <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5 text-yellow-300 transition-transform group-hover:translate-x-1" strokeWidth={2.6} />
                    </p>
                  </div>
                </div>
              </div>
            </TrackedExternalLink>

            {/* Service scope card */}
            <div className="mt-5 md:mt-7 rounded-2xl border border-primary-100 dark:border-border bg-white dark:bg-surface p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)] max-w-[1100px]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <span className="shrink-0">🛒</span>
                <span>บริการฝากสั่งจีนครบทุกแพลตฟอร์ม — ส่ง URL · รับของถึงประตู 🇨🇳➡️🇹🇭</span>
              </h3>
              <p className="mt-2 md:mt-3 text-[12.5px] md:text-[15px] font-bold text-foreground/85 leading-relaxed">
                1688 · Taobao · Tmall · Alibaba · JD · Pinduoduo · Xiaomi Youpin
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[12.5px] md:text-[14px] leading-snug text-foreground/85">
                {SERVICE_SCOPE.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2
                      className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600"
                      strokeWidth={2.6}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* Phone + LINE row */}
              <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrackedPhoneLink
                  phone={CONTACT.phone}
                  cta="phone_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-100 hover:border-primary-300 transition-colors dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200"
                >
                  <Phone className="w-4 h-4" strokeWidth={2.6} />
                  โทร {PHONE_DISPLAY}
                </TrackedPhoneLink>
                <TrackedExternalLink
                  href={LINE_OA.shortUrl}
                  cta="line_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[15px] hover:bg-[#05B04C] transition-colors shadow-[0_6px_18px_rgba(6,199,85,0.35)]"
                >
                  <MessageCircle className="w-4 h-4" strokeWidth={2.6} />
                  แอด LINE Pacred
                </TrackedExternalLink>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Sales contact ─── */}
        <ContactSales hideAssuranceStrip />

        {/* ═══════ 2. Platforms ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Globe2 className="w-3.5 h-3.5" strokeWidth={2.6} />
              4 PLATFORMS · ครอบคลุมทุกแพลตฟอร์มจีน
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              สั่งได้ทุกร้านบน <span className="text-primary-600">แพลตฟอร์มจีน</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              เลือกแพลตฟอร์มที่เหมาะกับเป้าหมายของคุณ — ส่ง · ปลีก · แบรนด์ · ส่งออก
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {PLATFORMS.map((p) => (
                <div
                  key={p.id}
                  className="group relative rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_18px_40px_rgba(179,0,0,0.12)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
                >
                  <div className={`relative h-20 bg-gradient-to-br ${p.accent} flex items-center justify-center`}>
                    <span className="text-[26px] md:text-[32px] font-black text-white tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                      {p.name}
                    </span>
                    <span
                      aria-hidden
                      className="absolute inset-0 opacity-[0.10]"
                      style={{
                        backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
                        backgroundSize: "14px 14px",
                      }}
                    />
                  </div>
                  <div className="p-4 md:p-5 space-y-2.5">
                    <p className="text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {p.desc}
                    </p>
                    <div className="pt-1 border-t border-border">
                      <div className="text-[9.5px] md:text-[10px] font-bold text-muted tracking-[0.10em] uppercase mb-1">
                        เหมาะสำหรับ
                      </div>
                      <p className="text-[12px] md:text-[12.5px] font-bold text-foreground/85 leading-snug">
                        {p.for}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ 3. How it works ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ScanLine className="w-3.5 h-3.5" strokeWidth={2.6} />
              HOW IT WORKS · ใช้งานยังไง
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ใช้งาน <span className="text-primary-600">ง่ายๆ ใน 5 ขั้น</span>
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {HOW.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.num}
                    className="relative rounded-2xl border border-border bg-white dark:bg-surface p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_12px_28px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="absolute -top-3 left-4 text-[40px] md:text-[44px] font-black leading-none text-primary-600/10 dark:text-primary-300/15 tracking-tighter">
                      {s.num}
                    </div>
                    <div className="relative inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary-50 text-primary-600 mb-2.5 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" strokeWidth={2.4} />
                    </div>
                    <div className="relative text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white tracking-tight">
                      {s.title}
                    </div>
                    <p className="relative mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {s.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 4. Why Pacred ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · ทำไมต้องเรา
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไมลูกค้า <span className="text-primary-600">10,600+</span> เลือก Pacred
            </h2>

            <div className="mt-6 md:mt-8 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              {WHY.map((w) => {
                const Icon = w.icon;
                return (
                  <div
                    key={w.title}
                    className="rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 hover:border-primary-300 dark:hover:border-primary-800 hover:shadow-[0_12px_28px_rgba(179,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="inline-flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary-50 text-primary-600 mb-2.5 dark:bg-primary-900/30 dark:text-primary-300">
                      <Icon className="w-4.5 h-4.5 md:w-5 md:h-5" strokeWidth={2.4} />
                    </div>
                    <div className="text-[13px] md:text-[15px] font-black text-[#111827] dark:text-white tracking-tight leading-tight">
                      {w.title}
                    </div>
                    <p className="mt-1 text-[11.5px] md:text-[12.5px] leading-[1.55] text-muted font-medium">
                      {w.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════ 5. Product types ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-6 md:pb-8">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <PackageCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
              PRODUCT TYPES · ครบทุกหมวด
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              สั่งได้ทุก <span className="text-primary-600">หมวดสินค้า</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ตั้งแต่เสื้อผ้า · เครื่องสำอาง · เครื่องจักร · เฟอร์นิเจอร์ — เรารับฝากสั่งครบทุกประเภทถูกกฎหมาย
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
              {PRODUCT_TYPES.map((pt) => (
                <div
                  key={pt.label}
                  className="group relative aspect-square rounded-xl overflow-hidden border border-border shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:shadow-[0_14px_28px_rgba(179,0,0,0.12)] hover:-translate-y-0.5 transition-all duration-300"
                >
                  <Image
                    src={pt.img}
                    alt={pt.label}
                    fill
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 180px"
                    className="object-cover transition-transform duration-400 group-hover:scale-[1.08]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2 md:p-2.5">
                    <p className="text-[11px] md:text-[12.5px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
                      {pt.label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════ 6. FAQ ═══════ */}
        <section className="relative pt-12 md:pt-20 pb-12 md:pb-16">
          <div className="mx-auto w-full max-w-[920px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <CircleDollarSign className="w-3.5 h-3.5" strokeWidth={2.6} />
              FAQ · คำถามที่พบบ่อย
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              คำถามที่ <span className="text-primary-600">มือใหม่</span> ถามบ่อย
            </h2>

            <div className="mt-6 md:mt-8">
              <FaqAccordion
                groups={[
                  {
                    id: "china-shopping",
                    label: "ฝากสั่งจีน · พื้นฐาน",
                    items: FAQ_ITEMS,
                  },
                ]}
              />
            </div>
          </div>
        </section>
      </main>
      <PurchaseBanner />
      <Footer />
    </>
  );
}

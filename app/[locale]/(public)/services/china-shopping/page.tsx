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
import { Reviews } from "@/components/sections/reviews";
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

export const dynamic = "force-dynamic";

const SURFACE = "china_shopping_landing";
const PATH = "/services/china-shopping";
const NS = "seo.services.chinaShopping";
const LINE_URL = "/line";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: NS });
}

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
    for: "ผู้ขายปลีก · ผู้ผลิตหาวัตถุดิบ · ทำแบรนด์ OEM",
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
    desc: "แพลตฟอร์ม Alibaba เน้นแบรนด์-ของแท้-คุณภาพ · เหมาะลูกค้าที่ต้องการความมั่นใจในแหล่งที่มา",
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
  "ตรวจสเปก · สี · ขนาด · คุณภาพ ก่อนของออกจีน",
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
    desc: "Copy ลิงก์ 1688/Taobao/Tmall มาให้ — หรือถ่ายรูปสินค้าตัวอย่าง ทีมช่วยหาให้",
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
    desc: "รับ-นับ-ตรวจ-ถ่ายรูป ก่อนส่งออก แจ้งสถานะให้คุณทุกขั้น",
  },
  {
    num: "05",
    icon: Truck,
    title: "ส่งถึงไทย Door-to-Door",
    desc: "รวมส่งทุก order ในรอบเดียว เคลียร์ภาษีครบ ส่งถึงประตูคุณทั่วประเทศ",
  },
];

const WHY = [
  { icon: Languages, title: "ไม่ต้องคุยจีนเอง", desc: "ทีมล่ามจีนปิดดีลให้ในนามคุณ — ราคาส่ง · ต่อรองได้" },
  { icon: ShieldCheck, title: "ตรวจของก่อนส่ง", desc: "ถ่ายรูป-วีดิโอ-นับชิ้น แจ้งก่อนของออกจีน ไม่เซอร์ไพรส์ตอนถึง" },
  { icon: HandCoins, title: "ฝากโอนหยวนเรทดี", desc: "Alipay · WeChat Pay · Bank Transfer — ไม่ต้องเปิดบัญชีจีน" },
  { icon: Wallet, title: "ราคาชัดเจน", desc: "ค่าบริการ + ค่าขนส่ง + ภาษี แจ้งครบในใบเดียวก่อนยืนยัน" },
  { icon: Boxes, title: "รวมส่งทุก order", desc: "สั่งหลายร้าน รวมส่งรอบเดียวที่โกดังจีน — ค่าขนส่งถูกกว่า" },
  { icon: BadgePercent, title: "ใช้สิทธิ Form E", desc: "ลดภาษีนำเข้าผ่าน FTA ASEAN-China · ประหยัดได้สูงสุด" },
  { icon: Users, title: "ทีมประจำคุณ", desc: "ผู้ดูแลเฉพาะรายลูกค้า · ไม่ต้องเล่าใหม่ทุกครั้ง" },
  { icon: Award, title: "ประสบการณ์ 15+ ปี", desc: "ครอบคลุมเสื้อผ้า · เครื่องสำอาง · อะไหล่ · ของชำ · ของแต่งบ้าน" },
];

const PRODUCT_TYPES = [
  { label: "ผลิตภัณฑ์ความงาม", img: "/images/catagory/beaty.png" },
  { label: "เสื้อผ้าแฟชั่นผู้หญิง", img: "/images/catagory/girlfashion.png" },
  { label: "เสื้อผ้าแฟชั่นผู้ชาย", img: "/images/catagory/maleclothes.png" },
  { label: "กระเป๋าถือ", img: "/images/catagory/handbag.png" },
  { label: "รองเท้าผู้หญิง", img: "/images/catagory/girlshoe.png" },
  { label: "รองเท้าผู้ชาย", img: "/images/catagory/shoe.png" },
  { label: "เครื่องประดับ", img: "/images/catagory/necklace.png" },
  { label: "อุปกรณ์อิเล็กทรอนิกส์", img: "/images/catagory/phone.png" },
  { label: "เครื่องจักร", img: "/images/catagory/machine.png" },
  { label: "เฟอร์นิเจอร์", img: "/images/catagory/homeuse.png" },
  { label: "เครื่องใช้ในบ้าน", img: "/images/catagory/homeuse.png" },
  { label: "ของเล่น สินค้าแม่และเด็ก", img: "/images/catagory/kidtoy.png" },
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
    a: "ได้ — Pacred เป็นบริษัทจดทะเบียน VAT 7% ออกใบกำกับภาษีให้ทุก order ทั้งฝั่ง individual และนิติบุคคล ใบเสร็จและใบกำกับภาษีใช้ลดหย่อนได้",
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
  const here = typedLocale === "th" ? "ฝากสั่งซื้อสินค้าจีน" : "China shop-order";

  return (
    <>
      <JsonLd
        data={[
          serviceSchema({
            name: t("title"),
            description: t("description"),
            slug: PATH,
            locale: typedLocale,
            serviceType: typedLocale === "th" ? "ฝากสั่งจีน" : "China shop-order",
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
      <SearchBar hideOnMobile defaultCollapsed />
      <main>
        <BookingCalculator landing="sourcing" />

        {/* ─── Breadcrumb ─── */}
        <nav
          aria-label="Breadcrumb"
          className="mx-auto w-full max-w-[1140px] px-4 md:px-5 pt-3 md:pt-4"
        >
          <ol className="flex items-center gap-1.5 md:gap-2 text-[12.5px] md:text-[14px] whitespace-nowrap">
            <li>
              <Link href="/" className="inline-flex items-center gap-1.5 text-muted hover:text-primary-600 transition-colors">
                <Home className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
                <span>{homeLabel}</span>
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li>
              <Link href="/services" className="text-muted hover:text-primary-600 transition-colors">
                {svcLabel}
              </Link>
            </li>
            <li aria-hidden className="text-gray-300 dark:text-border">
              <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" strokeWidth={2.2} />
            </li>
            <li aria-current="page" className="font-bold text-foreground">
              {here}
            </li>
          </ol>
        </nav>

        {/* ═══════ 1. Hero ═══════ */}
        <section className="relative pt-1 md:pt-2 pb-1 md:pb-2">
          <div className="relative mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ShoppingBag className="w-3.5 h-3.5" strokeWidth={2.6} />
              CHINA SHOP-ORDER · ฝากสั่งซื้อจีน
            </div>
            <h1 className="text-[22px] md:text-[44px] leading-[1.2] font-black tracking-[-0.025em] text-[#111827] dark:text-white max-w-[980px]">
              <span className="text-primary-600">ฝากสั่งซื้อสินค้าจีน</span> 1688 · Taobao · Tmall
              <span className="md:block md:mt-1"> ฝากโอนหยวน · ตรวจของก่อนส่ง · รวมส่งคุ้ม</span>
            </h1>
            <p className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[920px]">
              บริการฝากสั่งของจีนแบบมืออาชีพ — ทีมล่ามจีนปิดดีลกับโรงงาน · ตรวจสินค้าก่อนส่ง · ฝากโอนหยวน · รวมส่งคุ้ม · ใบกำกับภาษีครบ — <span className="text-primary-600/80 font-bold">ค่าบริการฝากสั่งเริ่ม 3% · เริ่มจาก 0 ก็ทำได้</span>
            </p>

            <TrustStatsStrip className="mt-3 md:mt-4" />

            {/* 2 primary CTAs */}
            <div className="mt-4 md:mt-5 grid grid-cols-2 gap-2 md:gap-3 max-w-[560px]">
              <Link
                href="/register"
                aria-label="ใช้บริการฝากสั่งจีน — สมัครสมาชิกฟรี"
                className="inline-flex items-center justify-center gap-2 h-12 md:h-14 rounded-xl bg-primary-600 text-white font-black text-[14px] md:text-[16px] hover:bg-primary-700 hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(179,0,0,0.30)]"
              >
                ใช้บริการ
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.8} />
              </Link>
              <TrackedExternalLink
                href={LINE_URL}
                cta="line_consult"
                surface={SURFACE}
                ctaProps={{ position: "hero_cta" }}
                aria-label="ปรึกษาฝากสั่งจีนฟรี ทางไลน์"
                className="inline-flex items-center justify-center gap-2 h-12 md:h-14 rounded-xl bg-[#06C755] text-white font-black text-[14px] md:text-[16px] hover:bg-[#05B04C] hover:-translate-y-0.5 transition-all shadow-[0_8px_20px_rgba(6,199,85,0.35)]"
              >
                <MessageCircle className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2.6} />
                ปรึกษาฟรี
              </TrackedExternalLink>
            </div>

            {/* Service scope highlights — themed card */}
            <div className="mt-5 md:mt-7 rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-800/60 bg-gradient-to-br from-primary-50/60 via-white to-primary-50/30 dark:from-primary-900/15 dark:via-surface dark:to-primary-900/10 p-4 md:p-6 shadow-[0_8px_22px_rgba(179,0,0,0.06)]">
              <h3 className="flex items-start gap-2 text-[15px] md:text-[20px] font-black text-primary-700 dark:text-primary-300 tracking-tight leading-snug">
                <ShoppingBag className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" strokeWidth={2.6} />
                <span>ฝากสั่งครบทุกแพลตฟอร์ม — ส่ง URL · รับของถึงประตู</span>
              </h3>
              <p className="mt-2 text-[12.5px] md:text-[14px] font-bold text-foreground/85 leading-relaxed">
                1688 · Taobao · Tmall · Alibaba · JD · Pinduoduo · Xiaomi Youpin
              </p>
              <ul className="mt-4 md:mt-5 grid md:grid-cols-2 gap-x-5 md:gap-x-6 gap-y-2 md:gap-y-2.5 text-[13px] md:text-[15px] leading-snug text-foreground/95">
                {SERVICE_SCOPE.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 md:w-[18px] md:h-[18px] mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 md:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrackedPhoneLink
                  phone={CONTACT.phone}
                  cta="phone_cta"
                  surface={SURFACE}
                  ctaProps={{ position: "hero_card" }}
                  className="inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 font-black text-[14px] md:text-[15px] hover:bg-primary-100 hover:border-primary-300 transition-colors dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-200"
                >
                  <Phone className="w-4 h-4" strokeWidth={2.6} />
                  โทร {CONTACT.phoneDisplay}
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

        {/* ═══════ 2. Platforms ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
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

        {/* ─── Sales contact ─── */}
        <ContactSales hideAssuranceStrip compact />

        {/* ═══════ 3. How it works — 5 steps ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ScanLine className="w-3.5 h-3.5" strokeWidth={2.6} />
              5 STEPS · ใช้งานยังไง
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ใช้งาน <span className="text-primary-600">ง่ายๆ ใน 5 ขั้น</span>
            </h2>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              ไม่ต้องคุยจีน ไม่ต้องเปิดบัญชีจีน ทีม Pacred จัดให้ครบจบ
            </p>

            <div className="mt-6 md:mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
              {HOW.map((s) => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.num}
                    className="relative rounded-2xl border border-border bg-gradient-to-br from-white to-primary-50/40 dark:from-surface dark:to-primary-900/10 p-4 md:p-5 shadow-[0_6px_16px_rgba(15,23,42,0.05)] hover:border-primary-300 hover:-translate-y-1 hover:shadow-[0_14px_30px_rgba(179,0,0,0.12)] transition-all duration-300"
                  >
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
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── Reviews — default to import filter ─── */}
        <Reviews defaultFilter="import" />

        {/* ═══════ 4. Why Pacred ═══════ */}
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.6} />
              WHY PACRED · ทำไมต้องเรา
            </div>
            <h2 className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              ทำไมลูกค้า <span className="text-primary-600">10,600+ ราย</span> เลือก Pacred
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
        <section className="relative pt-8 md:pt-14 pb-2 md:pb-4">
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
        <section className="relative pt-8 md:pt-14 pb-6 md:pb-10">
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

        {/* ═══════ 7. Final CTA banner ═══════ */}
        <section className="relative pt-4 md:pt-8 pb-8 md:pb-12">
          <div className="mx-auto w-full max-w-[1140px] px-4 md:px-5">
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface={SURFACE}
              ctaProps={{ position: "final_cta" }}
              aria-label="ปรึกษาฝากสั่งจีนฟรี — ทักไลน์ Pacred Shipping"
              className="group block relative max-w-[1100px] mx-auto no-underline"
            >
              <div
                className="relative overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(179,0,0,0.35)] transition-all duration-300 group-hover:shadow-[0_18px_44px_rgba(179,0,0,0.5)] group-hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #DC1F1F 0%, #B30000 45%, #7F0000 100%)" }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay"
                  style={{ background: "radial-gradient(circle at 25% 50%, rgba(255,200,100,0.30) 0%, transparent 55%)" }}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.10]"
                  style={{
                    backgroundImage: "radial-gradient(circle, white 1px, transparent 1.4px)",
                    backgroundSize: "16px 16px",
                  }}
                />

                <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] items-center gap-3 md:gap-6 px-5 md:px-10 py-6 md:py-8">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 mb-2 text-yellow-300 text-[10.5px] md:text-[12px] font-black tracking-[0.10em] uppercase">
                      <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
                      SHOPPING GUARANTEE
                    </div>
                    <p className="text-[24px] md:text-[40px] font-black text-white leading-[1.05] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                      อยากสั่งจีน? <span className="text-yellow-300">ปรึกษาฟรี</span> ทักไลน์ Pacred
                    </p>
                    <p className="hidden md:block mt-2 text-[14px] font-semibold text-white/90 leading-snug">
                      ส่ง URL · ทีมล่ามจัดให้ครบ · ตรวจของก่อนส่ง · รวมส่งคุ้ม · ตอบใน 5 นาที
                    </p>
                  </div>
                  <span className="inline-flex items-center justify-center gap-2 px-5 md:px-7 py-3 md:py-4 rounded-xl bg-white text-primary-700 font-black text-[15px] md:text-[18px] shadow-[0_8px_20px_rgba(0,0,0,0.25)] group-hover:scale-105 transition-transform whitespace-nowrap">
                    <MessageCircle className="w-5 h-5" strokeWidth={2.6} />
                    ทักไลน์เลย
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" strokeWidth={2.6} />
                  </span>
                </div>
              </div>
            </TrackedExternalLink>
          </div>
        </section>
      </main>
      <PurchaseBanner />
      <Footer />
    </>
  );
}

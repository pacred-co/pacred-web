import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Boxes,
  ShieldCheck,
  ShoppingBag,
  ArrowRight,
  Sparkles,
  Quote,
  MapPin,
} from "lucide-react";
import { HorizontalScroller } from "@/components/sections/horizontal-scroller";

const MARKETPLACES = [
  "1688", "Taobao", "Tmall", "Alibaba", "JD", "Pinduoduo", "AliExpress", "Weidian",
];

const CATEGORIES_TH = [
  "แฟชั่น", "ความงาม", "เครื่องประดับ", "กระเป๋า", "แม่และเด็ก", "สุขภาพ",
  "หมวดกีฬา", "ยานยนต์", "ของแต่งบ้าน", "เครื่องใช้ไฟฟ้า", "กล้องและอุปกรณ์ถ่ายภาพ",
  "ไอที", "โทรศัพท์และอุปกรณ์เสริม", "เครื่องเขียน", "สัตว์เลี้ยง", "อาหารและเครื่องดื่ม",
];

const CATEGORIES_EN = [
  "Fashion", "Beauty", "Jewellery", "Bags", "Mother & Baby", "Health",
  "Sports", "Auto parts", "Home decor", "Appliances", "Cameras & photography",
  "Computing", "Phones & accessories", "Stationery", "Pets", "Food & beverage",
];

const PORTS = [
  "สุวรรณภูมิ", "ดอนเมือง", "Port คลองเตย", "แหลมฉบัง", "ICD ลาดกระบัง",
  "ไปรษณีย์หลักสี่", "มุกดาหาร", "หนองคาย", "อรัญประเทศ", "แม่สาย",
];

const PORTS_EN = [
  "Suvarnabhumi", "Don Mueang", "Klong Toey Port", "Laem Chabang", "ICD Lat Krabang",
  "Lak Si Mail", "Mukdahan", "Nong Khai", "Aranyaprathet", "Mae Sai",
];

const WAREHOUSE_CARDS = [
  {
    cityKey: "warehouseGuangzhouCity",
    enKey:   "warehouseGuangzhouEn",
    descKey: "warehouseGuangzhouDesc",
    href:    "/warehouses/guangzhou",
    image:   "/images/gwanzhou.png",
    flag:    "🇨🇳",
  },
  {
    cityKey: "warehouseYiwuCity",
    enKey:   "warehouseYiwuEn",
    descKey: "warehouseYiwuDesc",
    href:    "/warehouses/yiwu",
    image:   "/images/pacredyiwu.png",
    flag:    "🇨🇳",
  },
  {
    cityKey: "warehouseThailandCity",
    enKey:   "warehouseThailandEn",
    descKey: "warehouseThailandDesc",
    href:    "/warehouses/thailand",
    image:   "/images/warehousethai118/1.png",
    flag:    "🇹🇭",
  },
];

export function HomeArticle({ locale }: { locale: "th" | "en" }) {
  const t = useTranslations("homeArticle");
  const isTh = locale === "th";
  const categories = isTh ? CATEGORIES_TH : CATEGORIES_EN;
  const ports = isTh ? PORTS : PORTS_EN;

  return (
    <section className="relative py-10 md:py-20">
      <div className="mx-auto w-full max-w-[1140px] px-3 md:px-5">

        {/* ── SECTION 1 · Hero article ─────────────────────────── */}
        <header className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 md:gap-10 items-start">
          <div>
            <div className="inline-flex items-center gap-2 mb-2 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.8} />
              {t("eyebrow")}
            </div>
            <h2 className="text-[24px] md:text-[42px] leading-[1.16] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {t("headingPart1")}{" "}
              <span className="text-primary-600">{t("headingHighlight")}</span>{" "}
              {t("headingPart2")}
            </h2>
            <p className="mt-3 md:mt-4 text-[13.5px] md:text-[16px] leading-[1.65] font-medium text-muted max-w-[680px]">
              {t("subheading")}
            </p>

            <div className="mt-5 md:mt-7 space-y-3.5 md:space-y-4 text-[13.5px] md:text-[15px] leading-[1.75] text-foreground/85">
              <p>
                {t("introBody1")}
                <Link href="/services/import-china" className="font-bold text-primary-600 hover:underline underline-offset-4 decoration-2">
                  {t("introImportLink")}
                </Link>
                {t("introBody2")}
                <span className="font-black text-[#111827] dark:text-white">{t("introYears")}</span>
                {t("introBody3")}
                <Link href="/services/china-shopping" className="font-bold text-primary-600 hover:underline underline-offset-4 decoration-2">
                  {t("introShopLink")}
                </Link>{" "}
                {t("introBody4")}
                <span className="font-black text-[#111827] dark:text-white">{t("introMarketplaces")}</span>
                {t("introBody5")}
                <Link href="/payment/alipay" className="font-bold text-primary-600 hover:underline underline-offset-4 decoration-2">
                  {t("introPayLink")}
                </Link>
                {t("introBody6")}
              </p>

              <p>
                {t("p2Body1")}
                <span className="font-black text-[#111827] dark:text-white">{t("p2DoorToDoor")}</span>
                {t("p2Body2")}
                <Link href="/customs-clearance-shipping-suvarnabhumi" className="font-bold text-primary-600 hover:underline underline-offset-4 decoration-2">
                  {t("p2ClearanceLink")}
                </Link>
                {t("p2Body3")}
              </p>

              <p>
                {t("p3Body1")}
                <Link href="/services/export-worldwide" className="font-bold text-primary-600 hover:underline underline-offset-4 decoration-2">
                  {t("p3ExportLink")}
                </Link>
                {t("p3Body2")}
              </p>
            </div>
          </div>

          {/* Office image card */}
          <aside className="lg:sticky lg:top-6 self-start">
            <Link
              href="/about"
              aria-label={isTh ? "เกี่ยวกับ Pacred" : "About Pacred"}
              className="group relative block aspect-[16/10] overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_14px_36px_-10px_rgba(15,23,42,0.18)] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background hover:shadow-[0_22px_50px_-12px_rgba(179,0,0,0.25)] hover:border-primary-300 dark:hover:border-primary-800 transition-all duration-400"
            >
              <Image
                src="/images/pacredoffice.jpg"
                alt={t("officeAlt")}
                fill
                sizes="(max-width: 1024px) 100vw, 480px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                priority={false}
              />
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md border border-border">
                  <MapPin className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.6} />
                  <span className="text-[10.5px] md:text-[11.5px] font-black text-primary-600 tracking-wide">
                    PACRED HQ · THAILAND
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-600 text-white text-[10.5px] md:text-[11.5px] font-black tracking-wide shadow-md opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                  {isTh ? "เกี่ยวกับเรา" : "About us"}
                  <ArrowRight className="w-3 h-3" strokeWidth={3} />
                </span>
              </div>
            </Link>

            {/* Quick stats strip */}
            <div className="mt-3 md:mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-white dark:bg-surface p-3 md:p-4 shadow-[0_6px_18px_rgba(15,23,42,0.06)]">
              <div className="text-center">
                <div className="text-[18px] md:text-[22px] font-black text-primary-600 leading-none">14+</div>
                <div className="mt-1 text-[10px] md:text-[11px] font-bold text-muted tracking-wider uppercase">
                  {isTh ? "ปี" : "Years"}
                </div>
              </div>
              <div className="text-center border-x border-dashed border-border">
                <div className="text-[18px] md:text-[22px] font-black text-primary-600 leading-none">50K+</div>
                <div className="mt-1 text-[10px] md:text-[11px] font-bold text-muted tracking-wider uppercase">
                  {isTh ? "ตู้ที่ดูแล" : "Containers"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[18px] md:text-[22px] font-black text-primary-600 leading-none">100%</div>
                <div className="mt-1 text-[10px] md:text-[11px] font-bold text-muted tracking-wider uppercase">
                  {isTh ? "ถูกกฎหมาย" : "Compliant"}
                </div>
              </div>
            </div>
          </aside>
        </header>

        {/* ── PULL QUOTE ─────────────────────────────────────── */}
        <blockquote className="relative mt-10 md:mt-14 rounded-2xl md:rounded-3xl border border-primary-200 dark:border-primary-900 bg-gradient-to-br from-primary-50/80 via-white to-white dark:from-primary-900/20 dark:via-surface dark:to-surface p-5 md:p-8 shadow-[0_16px_40px_-12px_rgba(179,0,0,0.18)]">
          <Quote className="absolute -top-3 -left-1 md:-top-4 md:-left-2 w-9 h-9 md:w-11 md:h-11 text-primary-600/20 rotate-180" strokeWidth={2.4} />
          <div className="relative">
            <p className="text-[14px] md:text-[18px] leading-[1.65] text-[#111827] dark:text-white">
              <span className="text-muted font-medium">{t("quoteIntro")}{" "}</span>
              <span className="font-black text-primary-700 dark:text-primary-300 text-[16px] md:text-[22px] tracking-[-0.02em]">
                “{t("quoteText")}”
              </span>{" "}
              <span className="text-muted font-medium">{t("quoteOutro")}</span>
            </p>
          </div>
        </blockquote>

        {/* ── SECTION 2 · Marketplaces + Categories ──────────── */}
        <section className="mt-12 md:mt-20" aria-labelledby="article-marketplaces">
          <div className="mb-5 md:mb-7">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ShoppingBag className="w-3.5 h-3.5" strokeWidth={2.6} />
              {t("marketplacesEyebrow")}
            </div>
            <h3 id="article-marketplaces" className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {t("marketplacesHeading")}{" "}
              <span className="text-primary-600">{t("marketplacesHighlight")}</span>{" "}
              {t("marketplacesHeadingSuffix")}
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {t("marketplacesSub")}
            </p>
          </div>

          <HorizontalScroller className="cursor-grab flex gap-2 md:gap-2.5 overflow-x-auto -mx-3 md:-mx-5 px-3 md:px-5 pb-2 md:pb-1 snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black,black_92%,transparent)]">
            {MARKETPLACES.map((name) => (
              <Link
                key={name}
                href="/services/china-shopping"
                className="shrink-0 snap-start inline-flex items-center gap-1.5 px-3 md:px-4 h-9 md:h-10 rounded-full bg-white dark:bg-surface border border-border text-[12.5px] md:text-[13.5px] font-black text-[#111827] dark:text-white whitespace-nowrap hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all duration-300"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 shrink-0" />
                {name}
              </Link>
            ))}
          </HorizontalScroller>

          <div className="mt-7 md:mt-10">
            <h4 className="text-[16px] md:text-[20px] font-black tracking-[-0.025em] text-[#111827] dark:text-white">
              {t("categoriesHeading")}{" "}
              <span className="text-primary-600">{t("categoriesHighlight")}</span>
            </h4>
            <p className="mt-1 text-[12.5px] md:text-[14px] leading-[1.55] text-muted">
              {t("categoriesSub")}
            </p>

            <HorizontalScroller className="cursor-grab mt-3 md:mt-4 flex gap-1.5 md:gap-2 overflow-x-auto -mx-3 md:-mx-5 px-3 md:px-5 pb-2 md:pb-1 snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black,black_92%,transparent)]">
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href="/services/import-china"
                  className="shrink-0 snap-start inline-flex items-center px-2.5 md:px-3 h-7.5 md:h-8 py-1 rounded-md text-[11.5px] md:text-[12.5px] font-bold text-primary-700 dark:text-primary-300 bg-primary-50/70 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-900/40 whitespace-nowrap hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-colors"
                >
                  {cat}
                </Link>
              ))}
            </HorizontalScroller>
          </div>
        </section>

        {/* ── SECTION 4 · Customs ports ──────────────────────── */}
        <section className="mt-12 md:mt-20" aria-labelledby="article-ports">
          <div className="mb-5 md:mb-7">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
              {t("portsEyebrow")}
            </div>
            <h3 id="article-ports" className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {t("portsHeading")}{" "}
              <span className="text-primary-600">{t("portsHighlight")}</span>
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {t("portsSub")}
            </p>
          </div>

          <HorizontalScroller className="cursor-grab flex gap-2 md:gap-2.5 overflow-x-auto -mx-3 md:-mx-5 px-3 md:px-5 pb-2 md:pb-1 snap-x snap-proximity [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black,black_92%,transparent)]">
            {ports.map((port) => (
              <Link
                key={port}
                href="/customs-clearance-shipping-suvarnabhumi"
                className="shrink-0 snap-start inline-flex items-center gap-1.5 px-3 md:px-3.5 h-9 md:h-10 rounded-lg bg-white dark:bg-surface border border-border text-[12px] md:text-[13px] font-black text-[#111827] dark:text-white whitespace-nowrap hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 dark:hover:bg-primary-900/30 transition-all duration-300"
              >
                <MapPin className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.6} />
                {port}
              </Link>
            ))}
          </HorizontalScroller>
        </section>

        {/* ── SECTION 5 · Warehouse cards ────────────────────── */}
        <section className="mt-12 md:mt-20" aria-labelledby="article-warehouses">
          <div className="mb-5 md:mb-7">
            <div className="inline-flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.10em] uppercase">
              <Boxes className="w-3.5 h-3.5" strokeWidth={2.6} />
              {t("warehousesEyebrow")}
            </div>
            <h3 id="article-warehouses" className="text-[22px] md:text-[34px] leading-[1.18] font-black tracking-[-0.035em] text-[#111827] dark:text-white">
              {t("warehousesHeading")}{" "}
              <span className="text-primary-600">{t("warehousesHighlight")}</span>{" "}
              {t("warehousesHeadingSuffix")}
            </h3>
            <p className="mt-2 text-[13px] md:text-[15px] leading-[1.6] font-medium text-muted max-w-[820px]">
              {t("warehousesSub")}
            </p>
          </div>

          <HorizontalScroller className="cursor-grab sm:cursor-default flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-5 overflow-x-auto sm:overflow-x-visible -mx-3 sm:mx-0 px-3 sm:px-0 pb-2 sm:pb-0 snap-x snap-mandatory sm:snap-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {WAREHOUSE_CARDS.map((wh) => (
              <Link
                key={wh.href}
                href={wh.href}
                className="shrink-0 snap-start w-[82%] xs:w-[72%] sm:w-auto group relative flex flex-col rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.15)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400"
              >
                <div className="relative aspect-[5/4] overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
                  <Image
                    src={wh.image}
                    alt={`${t(wh.cityKey)} (${t(wh.enKey)})`}
                    fill
                    sizes="(max-width: 768px) 100vw, 380px"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                  />
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md border border-border">
                    <span className="text-[14px] leading-none">{wh.flag}</span>
                    <span className="text-[10.5px] md:text-[11px] font-black text-primary-600 tracking-wide">
                      {t(wh.enKey).toUpperCase()}
                    </span>
                  </div>
                </div>
                <div className="flex-1 p-4 md:p-5">
                  <h4 className="text-[16px] md:text-[18px] font-black text-[#111827] dark:text-white leading-snug tracking-tight group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">
                    {t(wh.cityKey)}{" "}
                    <span className="font-bold text-muted">({t(wh.enKey)})</span>
                  </h4>
                  <p className="mt-1.5 text-[12.5px] md:text-[13.5px] leading-[1.55] text-muted">
                    {t(wh.descKey)}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11.5px] md:text-[12px] font-black text-primary-600">
                    {isTh ? "ดูที่อยู่โกดัง" : "View warehouse"}
                    <ArrowRight className="h-3 w-3 md:h-3.5 md:w-3.5 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={3} />
                  </span>
                </div>
              </Link>
            ))}
          </HorizontalScroller>

          <div className="mt-5 md:mt-6 flex justify-center sm:justify-start">
            <Link
              href="/warehouses/china"
              className="inline-flex items-center gap-1.5 h-10 md:h-11 px-4 md:px-5 rounded-full bg-white dark:bg-surface text-[#111827] dark:text-white border border-border text-[12.5px] md:text-[13.5px] font-black hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50/40 transition-all duration-300"
            >
              {t("warehouseViewAll")}
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
            </Link>
          </div>
        </section>

      </div>
    </section>
  );
}

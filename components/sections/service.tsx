import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Sparkles,
  Shirt,
  ShoppingBag,
  Footprints,
  Cog,
  Cpu,
  Armchair,
  Camera,
  Baby,
  PawPrint,
  Stethoscope,
  Gem,
  Lamp,
  Smartphone,
  Laptop,
  Utensils,
  Dumbbell,
  Gamepad2,
  Check,
  ShieldCheck,
  Users,
  BadgeCheck,
  Zap,
  Truck,
  MessageSquare,
} from "lucide-react";
import { ServiceCarousel } from "@/components/ui/service-carousel";

export function Service() {
  const t = useTranslations("service");

  const eewuRoute = `${t("warehouseEewu")} → ${t("warehouseTh")}`;
  const gzRoute = `${t("warehouseGz")} → ${t("warehouseTh")}`;
  const productType = t("productType");
  const priceNote = t("priceNote");
  const c7Badges = ["LCL", "Cargo", "รถ", "จีน-ไทย"];
  const c9Badges = ["FCL", "Cargo", "รถ", "40\""];
  const container9Items = [
    { route: "หนานชา → มุกดาหาร", price: "55,000 บาท", type: "FCL 20\"", badges: c9Badges },
    { route: "หนิงโบว → แหลมฉบัง", price: "55,000 บาท", type: "FCL 20\"", badges: c9Badges },
    { route: "หนานชา → มุกดาหาร", price: "75,000 บาท", type: "FCL 40\"", badges: c9Badges },
    { route: "หนิงโบว → แหลมฉบัง", price: "75,000 บาท", type: "FCL 40\"", badges: c9Badges },
  ];
  const c11Badges = ["LCL", "Freight", "รถ", "จีน-ไทย"];
  const portRoute = "พอร์ทจีน → พอร์ทไทย";
  const container11Items = [
    { route: "หนานชา → มุกดาหาร", price: "5,000 / 18 ฿ CBM/KG", type: productType, note: priceNote, badges: c11Badges },
    { route: portRoute, price: "3,000 / 14 ฿ CBM/KG", type: productType, note: priceNote, badges: c11Badges },
    { route: portRoute, price: "4,700 / 14 ฿ CBM/KG", type: productType, note: priceNote, badges: c11Badges },
    { route: portRoute, price: "2,700 / 10 ฿ CBM/KG", type: productType, note: priceNote, badges: c11Badges },
  ];
  const c13Badges = ["FCL", "Cargo", "เรือ", "40\""];
  const container13Items = [
    { route: "หนานชา → มุกดาหาร", price: "55,000 บาท", type: "FCL 20\"", badges: c13Badges },
    { route: "แหลมฉบัง → หนิงโบว", price: "55,000 บาท", type: "FCL 20\"", badges: c13Badges },
    { route: "มุกดาหาร → หนานชา", price: "75,000 บาท", type: "FCL 40\"", badges: c13Badges },
    { route: "แหลมฉบัง → หนิงโบว", price: "75,000 บาท", type: "FCL 40\"", badges: c13Badges },
  ];
  const container7Items = [
    { route: eewuRoute, price: "5,000 / 18 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: eewuRoute, price: "3,000 / 14 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: eewuRoute, price: "4,700 / 14 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: eewuRoute, price: "2,700 / 10 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: gzRoute, price: "5,000 / 18 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: gzRoute, price: "3,000 / 14 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: gzRoute, price: "4,700 / 14 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
    { route: gzRoute, price: "2,700 / 10 ฿ CBM/KG", type: productType, note: priceNote, badges: c7Badges },
  ];

  return (
    <section id="service" className="bg-background py-10">
      <div className="mx-auto w-full max-w-[1140px] px-[10px] flex flex-col gap-4">

        {/* Container 1 — Section heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("sectionBadge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("title")}
          </h2>
        </div>

        {/* Container 2 — 20 product category cards */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="grid grid-cols-10 gap-3">
            {[
              { Icon: Sparkles, label: t("cat1") },
              { Icon: Shirt, label: t("cat2") },
              { Icon: ShoppingBag, label: t("cat3") },
              { Icon: Footprints, label: t("cat4") },
              { Icon: Cog, label: t("cat5") },
              { Icon: Cpu, label: t("cat6") },
              { Icon: Armchair, label: t("cat7") },
              { Icon: Camera, label: t("cat8") },
              { Icon: Baby, label: t("cat9") },
              { Icon: PawPrint, label: t("cat10") },
              { Icon: Stethoscope, label: t("cat11") },
              { Icon: Shirt, label: t("cat12") },
              { Icon: Footprints, label: t("cat13") },
              { Icon: Gem, label: t("cat14") },
              { Icon: Lamp, label: t("cat15") },
              { Icon: Smartphone, label: t("cat16") },
              { Icon: Laptop, label: t("cat17") },
              { Icon: Utensils, label: t("cat18") },
              { Icon: Dumbbell, label: t("cat19") },
              { Icon: Gamepad2, label: t("cat20") },
            ].map(({ Icon, label }, i) => (
              <a
                key={i}
                href="#"
                className="group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-white dark:bg-surface shadow-sm p-2 text-center transition-all duration-200 hover:-translate-y-1 hover:border-primary-500 hover:shadow-lg"
              >
                <Icon className="h-6 w-6 text-primary-600 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-[11px] font-medium leading-tight text-foreground group-hover:text-primary-600">
                  {label}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Container 3 — Banner card */}
        <div className="mx-auto w-full max-w-[1120px] flex justify-center">
          <div className="relative w-[1080px] h-[220px] overflow-hidden rounded-xl border border-border shadow-sm">
            <Image
              src="/images/banner/popimportbo.png"
              alt=""
              fill
              sizes="1080px"
              className="object-cover"
            />
            {/* Overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />

            {/* Content */}
            <div className="relative flex h-full items-center px-10">
              <div className="flex max-w-[640px] flex-col gap-3 text-white">
                <h3 className="text-2xl font-bold leading-tight">
                  {t("banner1Title")}
                </h3>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {[
                    t("banner1Bullet1"),
                    t("banner1Bullet2"),
                    t("banner1Bullet3"),
                    t("banner1Bullet4"),
                  ].map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                  >
                    {t("banner1Cta1")}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-green-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
                  >
                    {t("banner1Cta2")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Container 4 — Import/Export heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("importBadge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("importDesc")}
          </h2>
        </div>

        {/* Container 5 — 5 country link cards */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex gap-4">
            {[
              { label: t("country1"), href: "#" },
              { label: t("country2"), href: "#" },
              { label: t("country3"), href: "#" },
              { label: t("country4"), href: "#" },
              { label: t("country5"), href: "#" },
            ].map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="group flex flex-1 h-[90px] items-center justify-center rounded-xl border border-border bg-white dark:bg-surface shadow-sm px-3 text-center transition-all duration-200 hover:-translate-y-1 hover:border-primary-500 hover:shadow-lg"
              >
                <span className="text-sm font-semibold text-foreground group-hover:text-primary-600">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* Container 6 — LCL heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("lclBadge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("lclTitle")}
          </h2>
        </div>

        {/* Container 7 — Service card carousel (8 warehouse rate cards) */}
        <div className="mx-auto w-full max-w-[1120px]">
          <ServiceCarousel items={container7Items} />
        </div>

        {/* Container 8 — FCL heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <h2 className="text-2xl font-bold">
            {t("fclTitle")}
          </h2>
        </div>

        {/* Container 9 — Service card carousel (4 FCL rate cards) */}
        <div className="mx-auto w-full max-w-[1120px]">
          <ServiceCarousel items={container9Items} />
        </div>

        {/* Container 10 — FF LCL heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("ffLclBadge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("ffLclTitle")}
          </h2>
        </div>

        {/* Container 11 — Service card carousel (4 FF LCL rate cards) */}
        <div className="mx-auto w-full max-w-[1120px]">
          <ServiceCarousel items={container11Items} />
        </div>

        {/* Container 12 — FF FCL heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <h2 className="text-2xl font-bold">
            {t("fclFFTitle")}
          </h2>
        </div>

        {/* Container 13 — Service card carousel (4 FF FCL rate cards) */}
        <div className="mx-auto w-full max-w-[1120px]">
          <ServiceCarousel items={container13Items} />
        </div>

        {/* Container 14 — Banner card */}
        <div className="mx-auto w-full max-w-[1120px] flex justify-center">
          <div className="relative w-[1080px] h-[220px] overflow-hidden rounded-xl border border-border shadow-sm">
            <Image
              src="/images/banner/clearancebanboym.png"
              alt=""
              fill
              sizes="1080px"
              className="object-cover"
            />
            {/* Overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />

            {/* Content */}
            <div className="relative flex h-full items-center px-10">
              <div className="flex max-w-[640px] flex-col gap-3 text-white">
                <h3 className="text-2xl font-bold leading-tight">
                  {t("banner2Title")}
                </h3>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  {[
                    t("banner2Bullet1"),
                    t("banner2Bullet2"),
                    t("banner2Bullet3"),
                    t("banner2Bullet4"),
                  ].map((b, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-300" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex gap-3">
                  <button
                    type="button"
                    className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                  >
                    {t("banner1Cta1")}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-green-500 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600"
                  >
                    {t("banner1Cta2")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Container 15 — Why Pacred heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("whyPacredBadge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("whyPacredTitle")}
          </h2>
        </div>

        {/* Container 16 — 6 feature cards (340×330), centered */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex flex-wrap justify-center gap-5">
            {[
              { Icon: ShieldCheck, title: t("feature1Title"), desc: t("feature1Desc") },
              { Icon: Users, title: t("feature2Title"), desc: t("feature2Desc") },
              { Icon: BadgeCheck, title: t("feature3Title"), desc: t("feature3Desc") },
              { Icon: Zap, title: t("feature4Title"), desc: t("feature4Desc") },
              { Icon: Truck, title: t("feature5Title"), desc: t("feature5Desc") },
              { Icon: MessageSquare, title: t("feature6Title"), desc: t("feature6Desc") },
            ].map(({ Icon, title, desc }, i) => (
              <div
                key={i}
                className="flex w-[340px] h-[330px] flex-col gap-3 rounded-xl border border-border bg-white dark:bg-surface shadow-sm p-5"
              >
                {/* Top row: icon frame (left) + faded number (right) */}
                <div className="flex items-start justify-between">
                  <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30">
                    <Icon className="h-9 w-9 text-primary-600" />
                  </div>
                  <span className="text-5xl font-black leading-none tracking-tight text-zinc-200 dark:text-zinc-700">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                {/* Title + description */}
                <h3 className="mt-1 text-lg font-bold leading-snug text-foreground">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Container 17 — Reviews heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("reviewsBadge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("reviewsTitle")}
          </h2>
        </div>

        {/* Container 18 — Image card carousel (6 cards) */}
        <div className="mx-auto w-full max-w-[1120px]">
          <ServiceCarousel
            cardWidth={340}
            cardHeight={360}
            imageItems={Array.from({ length: 6 }, () => ({}))}
          />
        </div>

        {/* Container 19 — Image card carousel (6 cards) */}
        <div className="mx-auto w-full max-w-[1120px]">
          <ServiceCarousel
            cardWidth={340}
            cardHeight={360}
            imageItems={Array.from({ length: 6 }, () => ({}))}
          />
        </div>

        {/* Container 20 — Pacred Shipping heading + 2-column about text */}
        <div className="mx-auto w-full max-w-[1120px] mt-8">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-semibold tracking-tight text-pretty sm:text-5xl">
              Pacred Shipping ผู้เชี่ยวชาญด้านนำเข้า-ส่งออกครบวงจร
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 border-t border-border pt-10 sm:mt-16 sm:pt-16">
            {/* Left column */}
            <div className="space-y-5 text-base leading-relaxed text-foreground">
              <p>{t("aboutPara1L")}</p>
              <p>{t("aboutPara2L")}</p>
            </div>
            {/* Right column */}
            <div className="space-y-5 text-base leading-relaxed text-foreground">
              <p>{t("aboutPara1R")}</p>
              <p>{t("aboutPara2R")}</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

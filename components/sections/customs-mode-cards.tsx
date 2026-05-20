import Image from "next/image";
import {
  Ship,
  Plane,
  Truck,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const PATH = "/customs-clearance-shipping-suvarnabhumi";
const LINE_URL = "/line";

const MODES = [
  {
    mode: "แอร์",
    slug: "bkk",
    badge: "AIR FREIGHT",
    badgeIcon: Plane,
    title: "เคลียร์สินค้านำเข้าทางอากาศ",
    ports: "สนามบินสุวรรณภูมิ / ไปรษณีย์หลักสี่",
    image: "/images/countryport/suvannapoomlong.png",
    imageAlt: "เคลียร์สินค้านำเข้า สนามบินสุวรรณภูมิ Pacred",
    accent: "from-amber-400/35 to-orange-600/35",
    price: "2,800",
    services: [
      "เตรียม Invoice · Packing List · ใบอนุญาต (อย. / มอก.)",
      "ตรวจสอบพิกัดภาษี (HS Code) แม่นยำ",
      "ชำระภาษีแทนลูกค้า · เคลียร์เขต Free Zone",
      "ประสาน Air Cargo + ศุลกากร ผ่านด่านไว",
      "จัดส่งต่อด่วน ทั่วกรุงเทพฯ · ต่างจังหวัด",
    ],
    carriers: [
      { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
      { name: "Thai Cargo", logo: "/images/partners/thaicargo.png", url: "https://www.thaicargo.com" },
      { name: "UPS", logo: "/images/partners/upspartner.png", url: "https://www.ups.com" },
      { name: "TNT", logo: "/images/partners/tntpartner.png", url: "https://www.tnt.com" },
    ],
  },
  {
    mode: "เรือ",
    slug: "laem",
    badge: "SEA FREIGHT",
    badgeIcon: Ship,
    title: "เคลียร์สินค้านำเข้าทางเรือ",
    ports: "ท่าเรือคลองเตย / แหลมฉบัง / ICD",
    image: "/images/countryport/laemchabanglong.png",
    imageAlt: "เคลียร์สินค้านำเข้า ท่าเรือแหลมฉบัง / คลองเตย Pacred",
    accent: "from-sky-500/35 to-blue-700/35",
    price: "2,800",
    services: [
      "จัดทำใบขนสินค้าขาเข้า · ขาออก ครบทุกเอกสาร",
      "ประสานสายเรือ · ท่าเรือ · กรมศุลกากร",
      "แก้ปัญหาสินค้าถูกสุ่มตรวจ (X-ray / Random)",
      "รองรับ LCL / FCL · ทุก Term (CIF / FOB / EXW)",
      "Door-to-Door ส่งต่อถึงปลายทางทั่วประเทศ",
    ],
    carriers: [
      { name: "COSCO", logo: "/images/partners/coscopartner.png", url: "https://lines.coscoshipping.com" },
      { name: "Maersk", logo: "/images/partners/maerskpartner.png", url: "https://www.maersk.com" },
      { name: "Laem Chabang", logo: "/images/partners/laemchabangpartner.png", url: "https://www.laemchabangport.com" },
      { name: "BKP", logo: "/images/partners/bkp.png", url: "https://www.port.co.th/cs/bkp" },
    ],
  },
  {
    mode: "รถ",
    slug: "border",
    badge: "TRUCK · LAND",
    badgeIcon: Truck,
    title: "เคลียร์สินค้านำเข้าทางรถ",
    ports: "ด่านมุกดาหาร / นครพนม / แม่สอด",
    image: "/images/countryport/mukdahanlong.png",
    imageAlt: "เคลียร์สินค้านำเข้า ด่านมุกดาหาร / นครพนม Pacred",
    accent: "from-red-500/35 to-orange-700/35",
    price: "2,500",
    services: [
      "ขึ้นทะเบียนผู้นำเข้า · ส่งออก · จับคู่ (YY) ภายใน 30 นาที",
      "จัดทำใบขน · ประสานเจ้าหน้าที่ด่านชายแดน",
      "เคลียร์ Form D (อาเซียน) / Form E (จีน-ไทย)",
      "ใบอนุญาตเฉพาะ (อย. / มอก. / กรมเกษตร / ปศุสัตว์)",
      "Door-to-Door ส่งจากด่าน ถึงคลังลูกค้า",
    ],
    carriers: [
      { name: "FedEx", logo: "/images/partners/fedexpartner.png", url: "https://www.fedex.com" },
      { name: "DHL", logo: "/images/partners/dhlpartner.png", url: "https://www.dhl.com" },
      { name: "Alibaba", logo: "/images/partners/alibabapartner.png", url: "https://www.alibaba.com" },
      { name: "e-Tracking", logo: "/images/partners/etracking.png", url: "https://www.etracking.com" },
    ],
  },
];

export function CustomsModeCards() {
  return (
    <div className="relative">
      <div
        className="flex overflow-x-auto gap-3 -mx-4 px-4 pb-3 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:snap-none"
      >
        {MODES.map((c) => {
          const Icon = c.badgeIcon;
          return (
            <article
              key={c.mode}
              className="group flex flex-col shrink-0 w-[88%] sm:w-[400px] md:w-auto snap-start md:snap-none rounded-2xl md:rounded-3xl border border-border bg-white dark:bg-surface overflow-hidden shadow-[0_8px_22px_rgba(15,23,42,0.06)] hover:shadow-[0_22px_50px_rgba(179,0,0,0.14)] hover:border-primary-300 dark:hover:border-primary-800 transition-all duration-400"
            >
              <div className="relative h-40 md:h-48 overflow-hidden">
                <Image
                  src={c.image}
                  alt={c.imageAlt}
                  fill
                  sizes="(max-width: 768px) 88vw, 440px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${c.accent} mix-blend-multiply`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="absolute top-3 left-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-sm text-primary-700 text-[10.5px] md:text-[11.5px] font-black tracking-[0.10em] shadow-md">
                    <Icon className="w-3.5 h-3.5" strokeWidth={2.6} />
                    {c.badge}
                  </span>
                </div>
                <div className="absolute bottom-3 left-3 right-3">
                  <h3 className="text-[22px] md:text-[26px] font-black text-white leading-tight tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
                    {c.title}
                  </h3>
                  <p className="mt-1 text-[13.5px] md:text-[15px] text-white font-bold drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
                    {c.ports}
                  </p>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-3.5 p-4 md:p-5">
                <div className="rounded-xl bg-primary-50/60 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 px-3.5 py-3">
                  <div className="text-[10.5px] md:text-[11px] font-bold text-primary-700/80 dark:text-primary-300/80 tracking-[0.10em] uppercase leading-none">
                    ค่าพิธีการศุลกากร · เริ่มต้น
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-[28px] md:text-[32px] font-black text-primary-600 dark:text-primary-300 leading-none tracking-tight">
                      {c.price}
                    </span>
                    <span className="text-[14px] md:text-[15px] font-bold text-primary-700 dark:text-primary-300">
                      บาท
                    </span>
                    <span className="ml-auto text-[10.5px] md:text-[11px] text-muted font-medium">
                      + ค่าใช้จ่ายอื่นตามจริง
                    </span>
                  </div>
                </div>

                <ul className="flex flex-col gap-1.5 text-[12.5px] md:text-[13px] leading-snug text-foreground/90">
                  {c.services.map((s) => (
                    <li key={s} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600" strokeWidth={2.6} />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>

                <div>
                  <div className="text-[10.5px] md:text-[11px] font-bold text-foreground/60 tracking-[0.10em] uppercase mb-2">
                    พาร์ทเนอร์ที่ร่วมงาน
                  </div>
                  <div className="grid grid-cols-4 gap-2 items-center">
                    {c.carriers.map((carrier) => (
                      <a
                        key={carrier.name}
                        href={carrier.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`เปิดเว็บไซต์ ${carrier.name}`}
                        title={carrier.name}
                        className="relative h-8 md:h-10 rounded-lg bg-white border border-border/50 flex items-center justify-center p-1.5 hover:border-primary-300 hover:shadow-md transition-all"
                      >
                        <Image
                          src={carrier.logo}
                          alt={carrier.name}
                          fill
                          sizes="80px"
                          className="object-contain p-1.5"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-border bg-surface/60 dark:bg-background/60 px-4 md:px-5 py-3.5 md:py-4 space-y-2">
                <Link
                  href={`${PATH}/${c.slug}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-lg bg-primary-600 text-white font-black text-[13px] md:text-[13.5px] hover:bg-primary-700 transition-colors shadow-[0_4px_12px_rgba(220,38,38,0.25)]"
                >
                  ดูค่าใช้จ่ายเต็ม + รายละเอียด
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.6} />
                </Link>
                <TrackedExternalLink
                  href={LINE_URL}
                  cta="line_consult"
                  surface="customs_mode_cards"
                  ctaProps={{ mode: c.slug }}
                  className="inline-flex w-full items-center justify-center gap-1.5 h-10 rounded-lg border border-primary-200 bg-white text-primary-700 font-bold text-[12.5px] md:text-[13px] hover:bg-primary-50 hover:border-primary-300 transition-colors dark:bg-surface dark:border-primary-800 dark:text-primary-200"
                >
                  <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} />
                  ปรึกษาทาง LINE
                </TrackedExternalLink>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

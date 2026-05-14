import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight,
  MapPin,
  Phone,
  Navigation,
  ArrowRight,
  Truck,
  Boxes,
  ShieldCheck,
  Clock,
  Building2,
} from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { ImportExportBanner } from "@/components/sections/import-export-banner";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbSchema } from "@/components/seo/schemas";
import { buildPageMetadata } from "@/components/seo/page-meta";

const PATH = "/warehouses/thailand";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildPageMetadata({ locale, path: PATH, namespace: "seo.warehouses.thailand" });
}

const ADDRESS_TH = "48/3 หมู่ 12 ตำบลอ้อมน้อย อำเภอกระทุ่มแบน จังหวัดสมุทรสาคร 74130";
const ADDRESS_EN_QUERY = "48/3+Moo+12+Om+Noi+Krathum+Baen+Samut+Sakhon+74130";

const HIGHLIGHTS = [
  {
    icon: Boxes,
    title: "พื้นที่จัดเก็บกว่า 5,000 ตร.ม.",
    desc: "รองรับสินค้าจากตู้ FCL / LCL หลายตู้พร้อมกัน",
  },
  {
    icon: ShieldCheck,
    title: "กล้องวงจรปิด 24 ชม.",
    desc: "ระบบรักษาความปลอดภัยตลอด — สินค้าเข้า–ออก track ได้ทุกชิ้น",
  },
  {
    icon: Truck,
    title: "กระจายต่อทั่วประเทศ",
    desc: "ส่งต่อภายในกรุงเทพฯ ปริมณฑล และต่างจังหวัด พร้อมตัวเลือกรถ EXP / รถร่วม",
  },
  {
    icon: Clock,
    title: "เปิดทุกวัน 8:00–18:00",
    desc: "พร้อมรับ–ส่งสินค้าทุกวัน ไม่มีวันหยุด (ยกเว้นเทศกาลใหญ่)",
  },
];

const PHOTOS = [1, 2, 3, 4];

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = (locale === "en" ? "en" : "th") as "th" | "en";
  return (
    <>
      <JsonLd
        data={breadcrumbSchema(
          [
            { name: typedLocale === "th" ? "หน้าหลัก" : "Home", path: "/" },
            { name: typedLocale === "th" ? "ที่อยู่โกดังไทย" : "Thailand warehouse", path: PATH },
          ],
          typedLocale,
        )}
      />
      <NavBar />
      <SearchBar />
      <main>
        <section className="relative py-5 md:py-10">
          <div className="mx-auto w-full max-w-[1280px] px-3 md:px-4">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                หน้าหลัก
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <Link href="/about" className="hover:text-primary-600 transition-colors font-bold">
                เกี่ยวกับ Pacred
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white">ที่อยู่โกดังไทย</span>
            </nav>

            {/* Header */}
            <div className="mb-6 md:mb-9">
              <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                WAREHOUSE · THAILAND HUB
              </div>
              <h1 className="text-[24px] md:text-[44px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                ที่อยู่โกดัง<span className="text-primary-600"> ไทย 🇹🇭</span>
              </h1>
              <p className="mt-2 md:mt-3 text-[13px] md:text-[16px] leading-[1.6] font-medium text-muted max-w-[820px]">
                ฮับใหญ่ปลายทางของ Pacred Shipping — รับสินค้าจากโกดังจีน (กวางโจว / อี้อู)
                แล้วกระจายต่อทั่วประเทศไทย ครอบคลุมกรุงเทพฯ ปริมณฑล และต่างจังหวัด
              </p>
            </div>

            {/* Address + Map */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4 md:gap-6">

              {/* Address card */}
              <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 md:p-7 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shrink-0 shadow-[0_6px_14px_rgba(179,0,0,0.25)]">
                    <Building2 className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.4} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10.5px] md:text-[11px] font-black text-primary-600 tracking-[0.14em] uppercase">
                      THAILAND HUB · MAIN
                    </div>
                    <h2 className="text-[17px] md:text-[22px] font-black text-[#111827] dark:text-white leading-snug mt-0.5">
                      โกดังไทย · อ้อมน้อย
                    </h2>
                    <div className="mt-3 flex items-start gap-2 text-[12.5px] md:text-[14px] leading-[1.7] text-muted">
                      <MapPin className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                      <p className="font-medium">{ADDRESS_TH}</p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${ADDRESS_EN_QUERY}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[12px] md:text-[12.5px] font-black hover:shadow-[0_8px_18px_rgba(179,0,0,0.30)] transition-shadow"
                      >
                        <Navigation className="w-3.5 h-3.5" strokeWidth={2.6} />
                        เปิดใน Google Maps
                      </a>
                      <a
                        href="tel:0661253007"
                        className="inline-flex items-center gap-1.5 h-9 md:h-10 px-3.5 md:px-4 rounded-full bg-white dark:bg-background text-[#111827] dark:text-white border border-border text-[12px] md:text-[12.5px] font-black hover:border-primary-400 hover:text-primary-700 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
                        066-125-3007
                      </a>
                    </div>
                  </div>
                </div>

                {/* Quick info strip */}
                <div className="mt-5 pt-4 border-t border-dashed border-border grid grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                    <div>
                      <div className="text-[10.5px] md:text-[11px] font-bold text-muted uppercase tracking-wider">เวลาเปิด</div>
                      <div className="text-[12.5px] md:text-[13.5px] font-black text-[#111827] dark:text-white mt-0.5">
                        ทุกวัน 8:00–18:00
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Boxes className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                    <div>
                      <div className="text-[10.5px] md:text-[11px] font-bold text-muted uppercase tracking-wider">ประเภท</div>
                      <div className="text-[12.5px] md:text-[13.5px] font-black text-[#111827] dark:text-white mt-0.5">
                        Hub กระจายสินค้า
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map */}
              <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[420px] overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_10px_28px_rgba(15,23,42,0.08)] bg-surface">
                <iframe
                  src={`https://www.google.com/maps?q=${ADDRESS_EN_QUERY}&hl=th&z=15&output=embed`}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="แผนที่โกดังไทย Pacred"
                  className="absolute inset-0 w-full h-full border-0"
                />
                <div className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md border border-border">
                  <MapPin className="w-3.5 h-3.5 text-primary-600" strokeWidth={2.6} />
                  <span className="text-[11px] md:text-[12px] font-black text-primary-600 tracking-wide">
                    THAILAND HUB
                  </span>
                </div>
              </div>
            </div>

            {/* Photo gallery */}
            <div className="mt-8 md:mt-12">
              <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.08em] uppercase">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
                INSIDE THE WAREHOUSE
              </div>
              <h3 className="text-[18px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                บรรยากาศ
                <span className="text-primary-600"> โกดังจริง</span>
              </h3>

              <div className="mt-4 md:mt-5 grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3">
                {PHOTOS.map((n) => (
                  <div
                    key={n}
                    className="group relative aspect-[4/3] rounded-xl md:rounded-2xl overflow-hidden border border-border shadow-[0_6px_18px_rgba(15,23,42,0.06)]"
                  >
                    <Image
                      src={`/images/warehousethai118/${n}.png`}
                      alt={`บรรยากาศโกดังไทย Pacred ${n}`}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                    />
                    <div className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 dark:bg-surface/90 backdrop-blur-sm text-[9.5px] md:text-[10px] font-black text-primary-600">
                      WAREHOUSE {n}/4
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Highlights grid */}
            <div className="mt-8 md:mt-12">
              <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[11px] md:text-[12.5px] font-black tracking-[0.08em] uppercase">
                <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
                WHY THAILAND HUB
              </div>
              <h3 className="text-[18px] md:text-[26px] leading-[1.18] font-black tracking-[-0.03em] text-[#111827] dark:text-white">
                ทำไมโกดังไทยของเรา
                <span className="text-primary-600"> ถึงเหมาะกับธุรกิจคุณ</span>
              </h3>

              <div className="mt-4 md:mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
                  <div
                    key={title}
                    className="group rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-4 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.05)] hover:shadow-[0_18px_40px_rgba(179,0,0,0.12)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-0.5 transition-all duration-300"
                  >
                    <div className="inline-flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(179,0,0,0.20)] group-hover:scale-110 transition-transform">
                      <Icon className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2.4} />
                    </div>
                    <h4 className="mt-2.5 md:mt-3 text-[14px] md:text-[15.5px] font-black text-[#111827] dark:text-white leading-snug tracking-tight">
                      {title}
                    </h4>
                    <p className="mt-1 text-[12px] md:text-[12.5px] leading-[1.55] text-muted">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA to china warehouses */}
            <div className="mt-8 md:mt-12 rounded-2xl border border-dashed border-border bg-gradient-to-br from-surface/50 to-background dark:from-surface-alt/40 dark:to-background p-4 md:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <span className="inline-flex h-10 w-10 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600">
                <MapPin className="h-5 w-5" strokeWidth={2.5} />
              </span>
              <div className="flex-1">
                <div className="text-[13.5px] md:text-[15px] font-black text-[#111827] dark:text-white">
                  อยากดูที่อยู่โกดังต้นทางที่จีน?
                </div>
                <p className="text-[12px] md:text-[13px] text-muted mt-0.5 leading-[1.55]">
                  Pacred มีโกดังต้นทาง 2 แห่งในจีน — กวางโจว (Guangzhou) และ อี้อู (Yiwu)
                </p>
              </div>
              <Link
                href="/warehouses/china"
                className="shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[12px] md:text-[13px] font-black hover:shadow-[0_8px_18px_rgba(179,0,0,0.30)] transition-shadow"
              >
                ดูโกดังจีน
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={3} />
              </Link>
            </div>

          </div>
        </section>

        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}

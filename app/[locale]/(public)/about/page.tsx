import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Award, Clock, Boxes, ShieldCheck } from "lucide-react";
import { NavBar } from "@/components/sections/navbar";
import { SearchBar } from "@/components/sections/search-bar";
import { Footer } from "@/components/sections/footer";
import { PacredExperience } from "@/components/sections/pacred-experience";
import { WhyPacred } from "@/components/sections/why-pacred";
import { ImportExportBanner } from "@/components/sections/import-export-banner";

export const metadata = {
  title: "เกี่ยวกับ Pacred · Pacred Shipping",
  description:
    "Pacred Shipping ผู้เชี่ยวชาญด้านนำเข้า–ส่งออก เคลียร์พิธีการศุลกากรครบวงจร มากกว่า 14 ปี — ดูแลตั้งแต่ต้นน้ำถึงปลายน้ำ",
};

const STATS = [
  { icon: Award, value: "14+", suffix: "ปี", label: "ประสบการณ์" },
  { icon: Boxes, value: "50,000+", suffix: "ตู้", label: "ตู้ที่ดูแล" },
  { icon: Clock, value: "1", suffix: "ชม.", label: "รู้ผลประเมิน" },
  { icon: ShieldCheck, value: "100%", suffix: "", label: "ถูกต้องตามกฎหมาย" },
];

export default function AboutPage() {
  return (
    <>
      <NavBar />
      <SearchBar />
      <main>

        {/* Hero with Pacred Office image */}
        <section className="relative py-5 md:py-10">
          <div className="mx-auto w-full max-w-[1280px] px-3 md:px-4">

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
              <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
                หน้าหลัก
              </Link>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="font-bold text-[#111827] dark:text-white">เกี่ยวกับ Pacred</span>
            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 md:gap-8 items-stretch">

              {/* Left — text intro */}
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
                  <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
                  ABOUT US
                </div>
                <h1 className="text-[26px] md:text-[44px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
                  เกี่ยวกับ
                  <span className="text-primary-600"> Pacred Shipping</span>
                </h1>
                <p className="mt-2 md:mt-3 text-[13.5px] md:text-[16px] leading-[1.65] font-medium text-muted">
                  ผู้เชี่ยวชาญด้านนำเข้า–ส่งออก เคลียร์พิธีการศุลกากรครบวงจร
                  มากกว่า 14 ปี — ดูแลตั้งแต่ต้นน้ำถึงปลายน้ำ
                  จบในที่เดียว ด้วยทีมงานมืออาชีพและล่ามจีนช่วยปิดดีลโรงงาน
                </p>

                {/* Stats grid */}
                <div className="mt-5 md:mt-7 grid grid-cols-2 gap-2.5 md:gap-3">
                  {STATS.map(({ icon: Icon, value, suffix, label }) => (
                    <div
                      key={label}
                      className="group relative overflow-hidden rounded-xl md:rounded-2xl border border-border bg-white dark:bg-surface p-3 md:p-4 shadow-[0_4px_15px_rgba(15,23,42,0.04)] hover:shadow-[0_10px_24px_rgba(220,38,38,0.10)] hover:border-primary-200 dark:hover:border-primary-900 hover:-translate-y-0.5 transition-all"
                    >
                      <div className="inline-flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_4px_10px_rgba(220,38,38,0.20)]">
                        <Icon className="h-4 w-4 md:h-5 md:w-5" strokeWidth={2.4} />
                      </div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-[22px] md:text-[30px] leading-none font-black text-[#111827] dark:text-white tracking-[-0.03em]">
                          {value}
                        </span>
                        {suffix && (
                          <span className="text-[12px] md:text-[14px] font-extrabold text-primary-600">{suffix}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11.5px] md:text-[12.5px] font-bold text-muted">
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right — Pacred Office image */}
              <div className="relative aspect-[4/3] lg:aspect-auto lg:min-h-[420px] overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_14px_34px_rgba(15,23,42,0.10)]">
                <Image
                  src="/images/pacredoffice.jpg"
                  alt="ออฟฟิศ Pacred Shipping"
                  fill
                  sizes="(max-width: 1024px) 100vw, 620px"
                  className="object-cover"
                  priority
                />
                {/* Pacred logo watermark */}
                <div className="absolute top-3 left-3 md:top-4 md:left-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md">
                  <Image
                    src="/images/pacred-logo-red.png"
                    alt="Pacred"
                    width={20}
                    height={20}
                    className="h-4 w-4 object-contain"
                  />
                  <span className="text-[11px] md:text-[12px] font-black text-primary-600 tracking-wide">
                    PACRED HQ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Open Experience — text blocks */}
        <PacredExperience />

        {/* Why Pacred — features + certificate slider */}
        <WhyPacred />

        {/* Banner CTA */}
        <ImportExportBanner />
      </main>
      <Footer />
    </>
  );
}

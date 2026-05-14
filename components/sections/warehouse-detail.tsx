import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Check, Phone, MessageCircle, MapPin, Copy } from "lucide-react";

export type ShippingMarkLine = { label: string; value: string };

export type WarehouseDetailProps = {
  eyebrow: string;
  city: string;
  cityEn: string;
  province: string;
  flag: string;
  intro: string;
  features: string[];
  shippingMark: ShippingMarkLine[];
  shippingMarkNote: string;
  photo: string;
  hubLink?: string;
};

export function WarehouseDetail({
  eyebrow,
  city,
  cityEn,
  province,
  flag,
  intro,
  features,
  shippingMark,
  shippingMarkNote,
  photo,
  hubLink = "/warehouses/china",
}: WarehouseDetailProps) {
  return (
    <section className="relative py-5 md:py-10">
      <div className="mx-auto w-full max-w-[1140px] px-3 md:px-4">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-[11.5px] md:text-[12.5px] text-muted mb-4 md:mb-5 flex-wrap">
          <Link href="/" className="hover:text-primary-600 transition-colors font-bold">
            หน้าหลัก
          </Link>
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          <Link href={hubLink} className="hover:text-primary-600 transition-colors font-bold">
            ที่อยู่โกดังจีน
          </Link>
          <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
          <span className="font-bold text-[#111827] dark:text-white">โกดัง{city}</span>
        </nav>

        {/* Header */}
        <div className="mb-5 md:mb-7">
          <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[12px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            {eyebrow}
          </div>
          <h1 className="text-[24px] md:text-[40px] leading-[1.18] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
            โกดังรับสินค้า{city}{" "}
            <span className="text-primary-600">{flag} {cityEn}</span>
          </h1>
          <p className="mt-2 md:mt-3 text-[13px] md:text-[15.5px] leading-[1.6] font-medium text-muted max-w-[820px]">
            {intro}
          </p>
        </div>

        {/* Warehouse photo banner */}
        <div className="relative aspect-[16/9] md:aspect-[21/9] w-full mb-5 md:mb-8 overflow-hidden rounded-2xl md:rounded-3xl border border-border shadow-[0_14px_34px_rgba(15,23,42,0.10)] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-surface-alt dark:to-background">
          <Image
            src={photo}
            alt={`โกดัง${city} (${cityEn}) Pacred Shipping`}
            fill
            sizes="(max-width: 1140px) 100vw, 1140px"
            className="object-cover"
            priority
            unoptimized
          />
          {/* Bottom-left tag */}
          <div className="absolute bottom-3 left-3 md:bottom-4 md:left-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 dark:bg-surface/95 backdrop-blur-sm shadow-md">
            <span className="text-[16px] md:text-[18px] leading-none">{flag}</span>
            <span className="text-[11.5px] md:text-[13px] font-black text-primary-600 tracking-wide uppercase">
              {cityEn} Warehouse
            </span>
          </div>
          {/* Bottom-right province */}
          <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4 hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] md:text-[12px] font-bold">
            <MapPin className="h-3 w-3 md:h-3.5 md:w-3.5" strokeWidth={2.6} />
            {province}
          </div>
        </div>

        {/* Main split */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-5 md:gap-8 items-start">

          {/* Left — features + Shipping Mark */}
          <div className="space-y-5 md:space-y-7">

            {/* Features */}
            <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-[0_4px_14px_rgba(15,23,42,0.04)] p-4 md:p-6">
              <h2 className="text-[16px] md:text-[20px] font-black text-[#111827] dark:text-white mb-3 md:mb-4">
                ขอบเขตบริการของโกดัง{city}
              </h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-2.5">
                {features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 rounded-lg px-3 py-2 md:py-2.5 bg-primary-50/40 dark:bg-primary-900/15 border border-primary-100/60 dark:border-primary-900/30 text-[12.5px] md:text-[14px] leading-[1.5] font-medium text-[#374151] dark:text-white/85"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shadow-[0_3px_8px_rgba(220,38,38,0.25)]">
                      <Check className="h-3 w-3" strokeWidth={3.5} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Shipping Mark */}
            <div className="bg-white dark:bg-surface rounded-2xl border border-border shadow-[0_4px_14px_rgba(15,23,42,0.04)] p-4 md:p-6">
              <div className="flex items-center gap-2 mb-1 text-primary-600 text-[11px] md:text-[12px] font-black tracking-[0.12em] uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600 shrink-0" />
                SHIPPING MARK
              </div>
              <h3 className="text-[16px] md:text-[20px] font-black text-[#111827] dark:text-white mb-3 md:mb-4">
                ที่อยู่โกดัง / ที่อยู่จัดส่ง
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px] gap-4 md:gap-5 items-start">
                {/* Address table */}
                <div className="border border-border rounded-xl overflow-hidden">
                  {shippingMark.map((line, i) => (
                    <div
                      key={i}
                      className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 md:px-4 py-2 md:py-2.5 text-[12.5px] md:text-[14px] ${
                        i % 2 === 0 ? "bg-surface/60 dark:bg-surface-alt/40" : "bg-white dark:bg-surface"
                      }`}
                    >
                      <div className="shrink-0 w-full sm:w-[110px] text-[10.5px] md:text-[11.5px] font-black uppercase tracking-wider text-primary-600">
                        {line.label}
                      </div>
                      <div className="flex-1 min-w-0 font-medium text-[#111827] dark:text-white break-words">
                        {line.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shipping mark image */}
                <div className="relative aspect-[3/4] w-full max-w-[180px] mx-auto md:max-w-none rounded-xl overflow-hidden border border-border bg-white">
                  <Image
                    src="/images/shippingmark.png"
                    alt="ตัวอย่าง Shipping Mark Pacred"
                    fill
                    sizes="(max-width: 768px) 180px, 200px"
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </div>

              <div className="mt-3 md:mt-4 flex items-start gap-2 rounded-lg bg-yellow-50/70 dark:bg-yellow-900/15 border border-yellow-200/80 dark:border-yellow-900/40 px-3 py-2 text-[11.5px] md:text-[12.5px] leading-[1.55] text-yellow-900 dark:text-yellow-200">
                <Copy className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={2.4} />
                <span>{shippingMarkNote}</span>
              </div>
            </div>
          </div>

          {/* Right — Quick CTA card */}
          <aside className="lg:sticky lg:top-24">
            <div className="bg-gradient-to-b from-white to-surface dark:from-surface dark:to-surface-alt rounded-2xl border border-border shadow-[0_10px_30px_rgba(15,23,42,0.06)] p-4 md:p-6">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-primary-600" strokeWidth={2.6} />
                <span className="text-[12.5px] md:text-[13px] font-black text-[#111827] dark:text-white">
                  {province}
                </span>
              </div>
              <h3 className="text-[16px] md:text-[18px] font-black text-[#111827] dark:text-white leading-snug mb-2">
                ใช้บริการโกดัง{city} ติดต่อทีม Pacred
              </h3>
              <p className="text-[12px] md:text-[13px] text-muted leading-[1.55] mb-4">
                ทีมจีนของเราพร้อมรับสินค้า — ตรวจสอบ รวมบิล แพ็ก และส่งกลับไทยให้แบบครบจบ
              </p>

              <div className="flex flex-col gap-2">
                <a
                  href="tel:0661310253"
                  className="inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-primary-600 text-white text-[13px] md:text-[13.5px] font-extrabold shadow-[0_8px_18px_rgba(220,38,38,0.25)] hover:bg-primary-700 transition-all"
                >
                  <Phone className="h-4 w-4" strokeWidth={2.6} />
                  โทร 066-131-0253
                </a>
                <a
                  href="/line"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 h-10 rounded-xl border border-[#06C755] text-[#06C755] text-[13px] md:text-[13.5px] font-extrabold bg-white dark:bg-transparent hover:bg-[#06C755] hover:text-white transition-all"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={2.6} />
                  ทักไลน์ติดต่อด่วน
                </a>
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-[#111827] text-white text-[13px] md:text-[13.5px] font-extrabold hover:bg-black transition-all"
                >
                  สมัครสมาชิกเพื่อใช้โกดัง
                </Link>
              </div>

              <div className="mt-4 pt-4 border-t border-dashed border-border">
                <div className="text-[10.5px] md:text-[11px] font-black uppercase tracking-wider text-muted mb-1.5">
                  วิธีใช้โกดังในจีน
                </div>
                <ol className="text-[12px] md:text-[12.5px] leading-[1.6] text-[#374151] dark:text-white/85 space-y-1.5 list-decimal pl-4">
                  <li>สมัครสมาชิก Pacred Shipping (ฟรี)</li>
                  <li>นำรหัส PR ที่ได้แปะข้างกล่อง (Shipping Mark)</li>
                  <li>ใช้ที่อยู่โกดังด้านบนแจ้งโรงงาน/ร้านค้า</li>
                  <li>สินค้าถึงโกดัง ทีมเราตรวจสอบและจัดส่งกลับไทย</li>
                </ol>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

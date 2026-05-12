import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PromoCarousel } from "@/components/ui/promo-carousel";

const benefits = [
  {
    title: "ผู้ใช้ใหม่รับส่วนลดเพิ่ม",
    description: "ลูกค้าใหม่รับสิทธิ์ทันที",
    highlight: "",
    image: "/images/hero-section/icon-draf/people.png",
    href: "https://line.me/ti/p/@pacred",
    first: true,
  },
  {
    title: "ล่ามปิดดีลโรงงาน",
    description: "ล่ามจีนฝากสั่งซื้อปิดดีลโรงงาน",
    highlight: "ฟรี",
    image: "/images/hero-section/icon-draf/pcs-sales.png",
    href: "https://line.me/ti/p/@pacred",
    first: false,
  },
  {
    title: "เรทคุ้มเบากระเป๋า",
    description: "ฝากโอนหยวนชำระค่าสินค้า",
    highlight: "ถูก",
    image: "/images/hero-section/icon-draf/ongkorn.png",
    href: "https://line.me/ti/p/@pacred",
    first: false,
  },
  {
    title: "บาทขนส่งเหมาๆ",
    description: "ขนส่งทั่วกทม.ปริมณฑล 100",
    highlight: "100",
    image: "/images/hero-section/icon-draf/caricon.png",
    href: "https://line.me/ti/p/@pacred",
    first: false,
  },
];

export function Promotion() {
  const t = useTranslations("promotion");

  return (
    <section id="promotion" className="pb-6 pt-2">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Container 1 — Section heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex items-center gap-2 mb-1.5 text-primary-600 text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-2 h-2 rounded-full bg-primary-600 shrink-0" />
            PROMOTION
          </div>
          <h2 className="text-[38px] leading-[1.15] font-black tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("title")}
            <span className="text-primary-600">{t("titleHighlight")}</span>
          </h2>
        </div>

        {/* Container 2 — 4 ticket-style benefit cards */}
        <div className="mx-auto mt-[18px] w-full max-w-[1120px]">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((b, i) => (
              <div
                key={i}
                className={[
                  "group relative flex items-center min-h-[70px] rounded-xl border overflow-hidden px-3 py-2 transition-all duration-300 hover:-translate-y-[3px]",
                  b.first
                    ? "bg-primary-600 border-primary-600"
                    : "bg-white dark:bg-surface border-border hover:border-red-300 hover:shadow-[0_8px_20px_rgba(220,38,38,0.10)]",
                ].join(" ")}
              >
                {/* Notch circles (ticket tear effect) */}
                <span className="absolute top-[-6px] right-[75px] w-3 h-3 rounded-full bg-background z-[5]" />
                <span className="absolute bottom-[-6px] right-[75px] w-3 h-3 rounded-full bg-background z-[5]" />

                {/* Dashed divider */}
                <span className={`absolute right-[80px] top-2 bottom-2 z-[2] border-l border-dashed ${b.first ? "border-white/30" : "border-border"}`} />

                {/* Inner */}
                <div className="flex items-center w-full gap-2.5 z-[3]">

                  {/* Icon box */}
                  <div className={`w-[38px] h-[38px] rounded-lg flex items-center justify-center shrink-0 p-1 ${b.first ? "bg-white/20" : "bg-red-50 dark:bg-red-950/20"}`}>
                    <Image
                      src={b.image}
                      alt={b.title}
                      width={30}
                      height={30}
                      className={`object-contain w-full h-full ${b.first ? "brightness-0 invert" : ""}`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    <div className="flex items-baseline gap-1">
                      {b.highlight && (
                        <span className={`text-[18px] font-black leading-none shrink-0 ${b.first ? "text-white" : "text-primary-600"}`}>
                          {b.highlight}
                        </span>
                      )}
                      <h3 className={`text-[13px] font-bold truncate ${b.first ? "text-white" : "text-[#111827] dark:text-white"}`}>
                        {b.title}
                      </h3>
                    </div>
                    <p className={`text-[10px] leading-[1.2] mt-0.5 ${b.first ? "text-white/80" : "text-muted"}`}>
                      {b.description}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="w-[65px] shrink-0 text-right">
                    <Link
                      href="/register"
                      className={[
                        "inline-block text-[10px] font-bold px-1.5 py-1 rounded transition-colors",
                        b.first
                          ? "bg-white text-primary-600"
                          : "bg-red-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white",
                      ].join(" ")}
                    >
                      รับสิทธิ์
                    </Link>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Container 3 — Carousel */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <PromoCarousel />
        </div>

      </div>
    </section>
  );
}

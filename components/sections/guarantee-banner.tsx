import Image from "next/image";
import { ArrowRight, MousePointerClick } from "lucide-react";
import { TrackedExternalLink } from "@/components/analytics/tracked-link";

const LINE_URL = "/line";

const PARTNERS = [
  { name: "FedEx", logo: "/images/partners/fedexpartner.png", url: "https://www.fedex.com/th-th/home.html" },
  { name: "DHL",   logo: "/images/partners/dhlpartner.png",   url: "https://www.dhl.com/th-en/home.html" },
  { name: "TNT",   logo: "/images/partners/tntpartner.png",   url: "https://www.tnt.com/express/th_th/site/home.html" },
  { name: "UPS",   logo: "/images/partners/upspartner.png",   url: "https://www.ups.com/th/en/Home.page" },
];

export function GuaranteeBanner() {
  return (
    <section className="py-3 md:py-5">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">
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
                backgroundImage: "radial-gradient(circle, white 1px, transparent 1.4px)",
                backgroundSize: "16px 16px",
              }}
            />

            {/* Full-banner LINE click overlay */}
            <TrackedExternalLink
              href={LINE_URL}
              cta="line_consult"
              surface="home_guarantee_banner"
              aria-label="ทักไลน์ Pacred Shipping ปรึกษาเคลียร์ของฟรี"
              className="absolute inset-0 z-10"
            >
              <span className="sr-only">ทักไลน์ Pacred Shipping</span>
            </TrackedExternalLink>

            <div className="relative pointer-events-none grid grid-cols-[1fr_auto] items-center gap-3 md:gap-6 pl-4 md:pl-8 pr-2 md:pr-4 min-h-[150px] md:min-h-[180px]">

              {/* ── Left: text + partner logos ── */}
              <div className="min-w-0 py-3">

                {/* Desktop headline */}
                <p className="hidden md:flex flex-wrap lg:flex-nowrap items-center gap-x-3 gap-y-2 tracking-tight lg:whitespace-nowrap">
                  <span className="inline-flex items-baseline gap-x-2 text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                    <span className="text-[48px] font-black leading-none whitespace-nowrap">ของติดด่าน?</span>
                    <span className="text-[18px] font-bold">แค่</span>
                  </span>
                  <span className="inline-flex items-baseline gap-x-2 text-yellow-300 [text-shadow:0_3px_8px_rgba(0,0,0,0.55)]">
                    <span className="text-[72px] font-black leading-none whitespace-nowrap">2,800</span>
                    <span className="text-[18px] font-bold">บาท</span>
                  </span>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-white">
                    <span className="inline-block px-4 py-0.5 rounded-full bg-white text-primary-600 text-[26px] font-black tracking-tight shadow-[0_4px_12px_rgba(0,0,0,0.25)]">
                      Pacred Shipping
                    </span>
                    <ArrowRight className="w-7 h-7 transition-transform group-hover:translate-x-1.5" strokeWidth={2.8} />
                  </span>
                </p>

                {/* Mobile headline */}
                <div className="md:hidden flex flex-col gap-1">
                  <p className="flex items-baseline gap-1.5 text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.45)]">
                    <span className="text-[26px] font-black leading-none tracking-tight whitespace-nowrap">ของติดด่าน?</span>
                    <span className="text-[14px] font-bold">แค่</span>
                  </p>
                  <p className="flex items-baseline gap-1.5 text-yellow-300 [text-shadow:0_3px_8px_rgba(0,0,0,0.55)]">
                    <span className="text-[48px] font-black leading-none tracking-tight whitespace-nowrap">2,800</span>
                    <span className="text-[14px] font-bold">บาท</span>
                    <ArrowRight className="self-center shrink-0 ml-1 w-6 h-6 text-white transition-transform group-hover:translate-x-1" strokeWidth={2.8} />
                  </p>
                </div>

                {/* Partner logos — clickable (above the overlay via z-20) */}
                <div className="mt-2.5 md:mt-3 flex items-center gap-2 md:gap-3 pointer-events-auto relative z-20">
                  {PARTNERS.map((c) => (
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

              {/* ── Right: character photo ── */}
              <div className="relative w-[150px] md:w-[180px] h-[150px] md:h-[180px] shrink-0 md:mr-6">
                <Image
                  src="/images/visit/Visit04.png"
                  alt="ทีมเซลล์ Pacred Shipping"
                  fill
                  sizes="(max-width: 768px) 150px, 180px"
                  className="object-contain object-bottom drop-shadow-[0_4px_10px_rgba(0,0,0,0.30)]"
                />
              </div>

              {/* Document overlay — desktop only */}
              <div className="hidden md:block pointer-events-none absolute right-[240px] bottom-3 w-[110px] h-[110px] z-10 -rotate-[6deg]">
                <Image
                  src="/images/documenter.png"
                  alt=""
                  fill
                  sizes="110px"
                  className="object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.4)]"
                />
              </div>

              {/* คลิ๊กเลย! badge */}
              <div className="pointer-events-none absolute top-1 md:top-2 right-1 md:right-3 z-20 flex flex-col items-center -rotate-[6deg] transition-transform duration-300 group-hover:-rotate-[10deg] group-hover:scale-105">
                <span className="text-white text-[11px] md:text-[15px] font-black tracking-tight [text-shadow:0_1px_3px_rgba(0,0,0,0.55)] whitespace-nowrap">
                  คลิ๊กเลย!
                </span>
                <MousePointerClick className="mt-0.5 w-4 h-4 md:w-5 md:h-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" strokeWidth={2.6} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

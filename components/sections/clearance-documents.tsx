import Image from "next/image";
import { FileText, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

type DocMode = {
  image: string;
  badge: string;
  title: string;
  subtitle: string;
  docs: string[];
  ring: string;
};

const MODES: DocMode[] = [
  {
    image: "/images/home/iconfloating/searicon.png",
    badge: "ทางเรือ",
    title: "Sea Freight",
    subtitle: "LCL / FCL",
    docs: ["Invoice", "Packing List", "B/L (Bill of Lading)", "D/O (Delivery Order)", "Form E (ถ้ามี — ลดภาษี)"],
    ring: "bg-blue-50 dark:bg-blue-900/20",
  },
  {
    image: "/images/home/iconfloating/airicon.png",
    badge: "ทางอากาศ",
    title: "Air Cargo",
    subtitle: "งานด่วน · ของแตกหักง่าย",
    docs: ["Invoice", "Packing List", "AWB (Air Waybill)", "ใบอนุญาตนำเข้า (ถ้ามี)"],
    ring: "bg-orange-50 dark:bg-orange-900/20",
  },
  {
    image: "/images/home/iconfloating/caricon.png",
    badge: "ทางรถ",
    title: "Truck DDP",
    subtitle: "ด่านชายแดน · มุกดาหาร · หนองคาย",
    docs: ["Invoice", "Packing List", "ใบขนสินค้าทางบก", "เอกสารอนุญาตเฉพาะ (ถ้ามี)"],
    ring: "bg-primary-50 dark:bg-primary-900/20",
  },
];

export function ClearanceDocuments() {
  return (
    <section className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[1240px] px-3 md:px-4">

        {/* Header */}
        <div className="mb-4 md:mb-7">
          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            REQUIRED DOCUMENTS
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.25] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            เอกสารที่ต้องเตรียม
            <span className="text-primary-600"> ก่อนเริ่มเคลียร์</span>
          </h2>
          <p className="mt-1.5 md:mt-2 max-w-[820px] text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted">
            Pacred จัดเตรียมเอกสารเพิ่มและประสานหน่วยงานราชการให้ครบ — ลูกค้าส่งเฉพาะเอกสารพื้นฐานก็เริ่มได้
          </p>
        </div>

        {/* 3 modes — horizontal swipe on mobile */}
        <div className="relative">
        <div className="flex overflow-x-auto gap-3 pb-2 -mx-3 px-3 snap-x snap-mandatory md:mx-0 md:px-0 md:pb-0 md:overflow-visible md:grid md:grid-cols-3 md:gap-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MODES.map(({ image, badge, title, subtitle, docs, ring }) => (
            <Link
              key={title}
              href="/register"
              aria-label={`สมัครเลย · ${title}`}
              className="group relative shrink-0 w-[82%] min-w-[280px] md:w-auto md:min-w-0 snap-start block overflow-hidden bg-white dark:bg-surface rounded-xl md:rounded-2xl border border-border p-3.5 md:p-6 shadow-[0_4px_18px_rgba(15,23,42,0.05)] hover:shadow-[0_24px_50px_-12px_rgba(179,0,0,0.18)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400 cursor-pointer"
            >
              {/* Dot pattern overlay */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-[0.05] dark:group-hover:opacity-[0.08] transition-opacity duration-500"
                style={{
                  backgroundImage: "radial-gradient(circle at 1px 1px, #b30000 1px, transparent 0)",
                  backgroundSize: "16px 16px",
                }}
              />

              {/* Top accent line */}
              <div
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-500 to-transparent opacity-0 group-hover:opacity-100 -translate-x-full group-hover:translate-x-0 transition-all duration-700"
              />

              {/* Decorative ring blob */}
              <div className={`pointer-events-none absolute -right-10 -top-10 w-32 h-32 rounded-full ${ring} opacity-60 group-hover:opacity-100 transition-opacity duration-500`} />

              {/* Hover red gradient blob */}
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-14 -left-14 w-44 h-44 rounded-full bg-gradient-to-br from-primary-200/70 to-primary-400/30 dark:from-primary-900/40 dark:to-primary-700/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />

              <div className="relative">
                <div className="flex items-center gap-2.5 md:gap-3 mb-1">
                  <div className="relative inline-flex">
                    <div className="h-11 w-11 md:h-16 md:w-16 inline-flex items-center justify-center rounded-xl md:rounded-2xl bg-white dark:bg-surface-alt border border-border group-hover:border-primary-200 dark:group-hover:border-primary-900/60 shadow-[0_4px_10px_rgba(15,23,42,0.06)] overflow-hidden transition-colors duration-400">
                      <Image
                        src={image}
                        alt={badge}
                        width={64}
                        height={64}
                        unoptimized
                        className="w-full h-full object-cover grayscale opacity-60 transition-all duration-400 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 group-hover:-rotate-3"
                      />
                    </div>
                    {/* Yellow accent dot */}
                    <div className="absolute -top-1 -right-1 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_2px_6px_rgba(0,0,0,0.15)] scale-0 group-hover:scale-100 transition-transform duration-300" />
                  </div>
                  <span className="text-[10px] md:text-[11px] font-black tracking-[0.12em] uppercase text-muted group-hover:text-primary-600 transition-colors duration-300">{badge}</span>
                </div>

                <h3 className="mt-1 text-[15px] md:text-[22px] font-black text-[#111827] dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-300">
                  {title}
                </h3>
                <p className="text-[11.5px] md:text-[13px] font-bold text-muted">{subtitle}</p>

                <div className="my-2.5 md:my-4 border-t border-dashed border-border" />

                <ul className="flex flex-col gap-1.5 md:gap-2">
                  {docs.map((d) => (
                    <li key={d} className="flex items-start gap-2 md:gap-2.5 text-[12px] md:text-[14px] font-medium text-[#374151] dark:text-white/85">
                      <FileText className="mt-0.5 h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-primary-600" strokeWidth={2.4} />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>

                {/* Bottom: progress + "สมัครเลย →" */}
                <div className="mt-3 md:mt-4 flex items-center justify-between gap-2">
                  <div className="h-[2px] flex-1 bg-border overflow-hidden rounded-full">
                    <div className="h-full w-0 group-hover:w-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500 ease-out rounded-full" />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-black text-primary-600 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 whitespace-nowrap">
                    สมัครเลย
                    <ArrowRight className="w-3 h-3" strokeWidth={3} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
        </div>

      </div>
    </section>
  );
}

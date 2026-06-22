import Image from "next/image";
import { FileBadge, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Permit = {
  image?: string;
  icon?: typeof FileBadge;
  code: string;
  nameKey: string;
  descKey: string;
  color: string;
};

const PERMITS: Permit[] = [
  {
    image: "/images/tsi/มอก.png",
    code: "มอก.",
    nameKey: "nameTisi",
    descKey: "descTisi",
    color: "from-blue-500 to-blue-700",
  },
  {
    image: "/images/tsi/สมอ.png",
    code: "สมอ.",
    nameKey: "nameSmo",
    descKey: "descSmo",
    color: "from-emerald-500 to-emerald-700",
  },
  {
    image: "/images/tsi/กสทช.png",
    code: "กสทช.",
    nameKey: "nameNbtc",
    descKey: "descNbtc",
    color: "from-violet-500 to-violet-700",
  },
  {
    image: "/images/tsi/เกษตร.png",
    code: "กรมเกษตร",
    nameKey: "nameAgriculture",
    descKey: "descAgriculture",
    color: "from-amber-500 to-amber-700",
  },
  {
    image: "/images/tsi/ประมง.png",
    code: "กรมประมง",
    nameKey: "nameFisheries",
    descKey: "descFisheries",
    color: "from-cyan-500 to-cyan-700",
  },
  {
    image: "/images/tsi/ศุลกากร.png",
    code: "กรมศุลกากร",
    nameKey: "nameCustoms",
    descKey: "descCustoms",
    color: "from-primary-500 to-primary-700",
  },
  {
    icon: FileBadge,
    code: "Form E / FTA",
    nameKey: "nameFormE",
    descKey: "descFormE",
    color: "from-orange-500 to-orange-700",
  },
];

export async function ClearancePermits() {
  const t = await getTranslations("clearancePermits");
  return (
    <section className="py-4 md:py-8">
      <div className="mx-auto w-full max-w-[1240px] px-3 md:px-4">

        {/* Header */}
        <div className="mb-4 md:mb-7">
          <div className="flex items-center gap-1.5 mb-1 md:mb-1.5 text-primary-600 text-[10.5px] md:text-[13px] font-black tracking-[0.08em] uppercase">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-primary-600 shrink-0" />
            LICENSES & PERMITS
          </div>
          <h2 className="text-[20px] md:text-[38px] leading-[1.25] md:leading-[1.15] font-black tracking-[-0.03em] md:tracking-[-0.04em] text-[#111827] dark:text-white">
            {t("headingBefore")}
            <span className="text-primary-600"> {t("headingHighlight")}</span>
          </h2>
          <p className="mt-1.5 md:mt-2 max-w-[820px] text-[12px] md:text-[15px] leading-[1.5] md:leading-[1.55] font-medium text-muted">
            {t("subheading")}
          </p>
        </div>

        {/* Grid 4 cols */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
          {PERMITS.map(({ image, icon: Icon, code, nameKey, descKey, color }) => (
            <Link
              key={code}
              href="/register"
              aria-label={`${t("registerNow")} · ${code}`}
              className="group relative block bg-white dark:bg-surface rounded-xl md:rounded-2xl border border-border p-3 md:p-5 shadow-[0_4px_14px_rgba(15,23,42,0.04)] hover:shadow-[0_22px_44px_-12px_rgba(179,0,0,0.18)] hover:border-primary-300 dark:hover:border-primary-800 hover:-translate-y-1 transition-all duration-400 overflow-hidden cursor-pointer"
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

              {/* Hover gradient blob */}
              <div
                aria-hidden
                className="pointer-events-none absolute -top-14 -right-14 w-40 h-40 rounded-full bg-gradient-to-br from-primary-200/80 to-primary-400/40 dark:from-primary-900/40 dark:to-primary-700/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />

              {/* Icon */}
              {image ? (
                <div className="relative inline-flex mb-2 md:mb-3">
                  <div className="h-11 w-11 md:h-14 md:w-14 inline-flex items-center justify-center rounded-lg md:rounded-2xl bg-white dark:bg-surface-alt border border-border group-hover:border-primary-200 dark:group-hover:border-primary-900/60 overflow-hidden transition-colors duration-400">
                    <Image
                      src={image}
                      alt={code}
                      width={56}
                      height={56}
                      unoptimized
                      className="w-full h-full object-cover grayscale opacity-60 transition-all duration-400 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110"
                    />
                  </div>
                  {/* Yellow accent dot */}
                  <div className="absolute -top-1 -right-1 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_2px_6px_rgba(0,0,0,0.15)] scale-0 group-hover:scale-100 transition-transform duration-300" />
                </div>
              ) : Icon ? (
                <div className={`relative inline-flex h-11 w-11 md:h-14 md:w-14 items-center justify-center rounded-lg md:rounded-2xl bg-gradient-to-br ${color} text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)] mb-2 md:mb-3 grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-400`}>
                  <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.4} />
                  {/* Yellow accent dot */}
                  <div className="absolute -top-1 -right-1 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-white dark:border-surface shadow-[0_2px_6px_rgba(0,0,0,0.15)] scale-0 group-hover:scale-100 transition-transform duration-300" />
                </div>
              ) : null}

              <div className="relative text-[12.5px] md:text-[15px] font-black tracking-[-0.02em] text-[#111827] dark:text-white group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors duration-300">
                {code}
              </div>
              <div className="relative text-[11px] md:text-[12px] font-bold text-primary-600 mt-0.5">
                {t(nameKey)}
              </div>
              <p className="relative mt-1 md:mt-2 text-[10.5px] md:text-[12.5px] leading-[1.4] md:leading-[1.45] text-muted">
                {t(descKey)}
              </p>

              {/* Bottom: progress + "สมัครเลย →" */}
              <div className="relative mt-2 md:mt-3 flex items-center justify-between gap-2">
                <div className="h-[2px] flex-1 bg-border overflow-hidden rounded-full">
                  <div className="h-full w-0 group-hover:w-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500 ease-out rounded-full" />
                </div>
                <div className="flex items-center gap-1 text-[10.5px] font-black text-primary-600 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300 whitespace-nowrap">
                  {t("registerNow")}
                  <ArrowRight className="w-3 h-3" strokeWidth={3} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

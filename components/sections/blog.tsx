import { useTranslations } from "next-intl";
import { ServiceCarousel } from "@/components/ui/service-carousel";

export function Blog() {
  const t = useTranslations("blog");

  const row1Articles = [
    { title: t("article1"),  imageSrc: "/images/hero-section/banner/shipbanner.png" },
    { title: t("article2"),  imageSrc: "/images/hero-section/banner/hertrucl.png" },
    { title: t("article3"),  imageSrc: "/images/hero-section/banner/airbanner.png" },
    { title: t("article4"),  imageSrc: "/images/promotion/importchinawidth.png" },
    { title: t("article5"),  imageSrc: "/images/promotion/fclimportchinjesus.png" },
    { title: t("article6"),  imageSrc: "/images/hero-section/banner/leac.png" },
    { title: t("article7"),  imageSrc: "/images/hero-section/banner/sulakabanner.png" },
    { title: t("article8"),  imageSrc: "/images/promotion/importlclchina.png" },
  ];
  const row2Articles = [
    { title: t("article9"),  imageSrc: "/images/hero-section/banner/heropay.png" },
    { title: t("article10"), imageSrc: "/images/promotion/clearanceman.png" },
    { title: t("article11"), imageSrc: "/images/promotion/clearanceshort.png" },
    { title: t("article12"), imageSrc: "/images/promotion/fclimportchinman.png" },
    { title: t("article13"), imageSrc: "/images/hero-section/banner/saofire.png" },
    { title: t("article14"), imageSrc: "/images/hero-section/banner/sulakabanner.png" },
    { title: t("article15"), imageSrc: "/images/hero-section/banner/shipbanner.png" },
  ];

  // Big video card + 3 side cards in the 70/30 layout
  const bigCard = { title: t("c2BigTitle"), sub: t("c2BigSub"), img: "/images/knowledge/1.png" };
  const sideCards = [
    { title: t("c2Side1Title"), sub: t("c2Side1Sub"), img: "/images/knowledge/2.png" },
    { title: t("c2Side2Title"), sub: t("c2Side2Sub"), img: "/images/knowledge/3.png" },
    { title: t("c2Side3Title"), sub: t("c2Side3Sub"), img: "/images/knowledge/4.png" },
  ];

  return (
    <section id="blog" className="bg-background py-8">
      <div className="mx-auto w-full max-w-[1140px] px-[10px] flex flex-col gap-4">

        {/* Container 1 */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("c1Badge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">{t("c1Title")}</h2>
        </div>

        {/* Container 2 — 70/30 video card layout */}
        <div className="mx-auto w-full max-w-[1120px] flex gap-4">
          {/* Left 70% — big card */}
          <a
            href="#"
            className="group relative flex w-[70%] flex-col justify-end self-stretch overflow-hidden rounded-xl bg-primary-600 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg min-h-[280px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bigCard.img} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="relative z-10 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-6 pt-16">
              <h3 className="text-2xl font-bold leading-tight text-white">{bigCard.title}</h3>
              <p className="mt-1 text-sm font-medium text-white/85">{bigCard.sub}</p>
            </div>
          </a>

          {/* Right 30% — 3 small cards */}
          <div className="w-[30%] flex flex-col gap-4">
            {sideCards.map((c, i) => (
              <a
                key={i}
                href="#"
                className="group relative flex h-[124px] w-full flex-col justify-end overflow-hidden rounded-xl bg-primary-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.img} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="relative z-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 pt-8">
                  <h3 className="line-clamp-2 text-xs font-semibold leading-tight text-white">{c.title}</h3>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-white/80">{c.sub}</p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Container 3 */}
        <div className="mx-auto w-full max-w-[1120px]">
          <h2 className="text-2xl font-bold">{t("c3Title")}</h2>
        </div>

        {/* Container 4 — 2-row article carousel */}
        <div className="mx-auto w-full max-w-[1120px] flex flex-col gap-4">
          <ServiceCarousel cardWidth={260} cardHeight={350} imageHeight={160} blogItems={row1Articles} />
          <ServiceCarousel cardWidth={260} cardHeight={350} imageHeight={160} blogItems={row2Articles} />
        </div>

      </div>
    </section>
  );
}

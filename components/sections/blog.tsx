import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ServiceCarousel } from "@/components/ui/service-carousel";

export function Blog() {
  const t = useTranslations("blog");

  const row1Articles = [
    { title: t("article1") },
    { title: t("article2") },
    { title: t("article3") },
    { title: t("article4") },
    { title: t("article5") },
    { title: t("article6") },
    { title: t("article7") },
    { title: t("article8") },
  ];
  const row2Articles = [
    { title: t("article9") },
    { title: t("article10") },
    { title: t("article11") },
    { title: t("article12") },
    { title: t("article13") },
    { title: t("article14") },
    { title: t("article15") },
  ];

  return (
    <section id="blog" className="bg-background py-10">
      <div className="mx-auto w-full max-w-[1140px] px-[10px] flex flex-col gap-4">

        {/* Container 1 */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold tracking-widest text-primary-500">
            {t("c1Badge")}
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("c1Title")}
          </h2>
        </div>

        {/* Container 2 — 70/30 video card layout */}
        <div className="mx-auto w-full max-w-[1120px] flex gap-4">
          {/* Left 70% — big card */}
          <a
            href="#"
            className="group relative flex w-[70%] flex-col justify-end self-stretch overflow-hidden rounded-xl bg-primary-600 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="bg-gradient-to-t from-black/60 via-black/30 to-transparent p-6 pt-16">
              <h3 className="text-2xl font-bold leading-tight text-white">
                {t("c2BigTitle")}
              </h3>
              <p className="mt-1 text-sm font-medium text-white/85">
                {t("c2BigSub")}
              </p>
            </div>
          </a>

          {/* Right 30% — 3 small cards */}
          <div className="w-[30%] flex flex-col gap-4">
            {[
              { title: t("c2Side1Title"), sub: t("c2Side1Sub") },
              { title: t("c2Side2Title"), sub: t("c2Side2Sub") },
              { title: t("c2Side3Title"), sub: t("c2Side3Sub") },
            ].map((c, i) => (
              <a
                key={i}
                href="#"
                className="group relative flex h-[124px] w-full flex-col justify-end overflow-hidden rounded-xl bg-primary-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="bg-gradient-to-t from-black/60 via-black/25 to-transparent p-3 pt-8">
                  <h3 className="line-clamp-2 text-xs font-semibold leading-tight text-white">
                    {c.title}
                  </h3>
                  <p className="mt-0.5 truncate text-[11px] font-medium text-white/80">
                    {c.sub}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Container 3 */}
        <div className="mx-auto w-full max-w-[1120px]">
          <h2 className="text-2xl font-bold">
            {t("c3Title")}
          </h2>
        </div>

        {/* Container 4 — 2-row blog article carousel */}
        <div className="mx-auto w-full max-w-[1120px] flex flex-col gap-4">
          <ServiceCarousel
            cardWidth={260}
            cardHeight={350}
            imageHeight={160}
            blogItems={row1Articles}
          />
          <ServiceCarousel
            cardWidth={260}
            cardHeight={350}
            imageHeight={160}
            blogItems={row2Articles}
          />
        </div>

        {/* Container 5 */}
        <div className="mx-auto w-full max-w-[1120px]">
          <h2 className="text-2xl font-bold">
            {t("c5Title")}
          </h2>
        </div>

        {/* Container 6 — 5 columns × 5 tag link cards */}
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="flex justify-between gap-4">
            {Array.from({ length: 5 }, (_, col) => (
              <div key={col} className="flex flex-col gap-3">
                {Array.from({ length: 5 }, (_, row) => {
                  const idx = col * 5 + row + 1;
                  return (
                    <Link
                      key={row}
                      href="#"
                      className="group flex w-[200px] h-[70px] items-center justify-center rounded-xl border border-border bg-white dark:bg-surface shadow-sm px-3 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500 hover:shadow-md"
                    >
                      <span className="text-sm font-medium leading-tight text-foreground group-hover:text-primary-600">
                        {t(`tag${idx}` as Parameters<typeof t>[0])}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PromoCarousel } from "@/components/ui/promo-carousel";

export function Promotion() {
  const t = useTranslations("promotion");

  return (
    <section id="promotion" className="bg-background py-10">
      <div className="mx-auto w-full max-w-[1140px] px-[10px]">

        {/* Container 1 — Section heading */}
        <div className="mx-auto w-full max-w-[1120px]">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-500">
            PROMOTION
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            {t("title")}
            <span className="text-primary-600">{t("titleHighlight")}</span>
          </h2>
        </div>

        {/* Container 2 — 4 coupon cards */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="flex gap-5">
            {[
              { discount: "20%", off: "OFF", title: t("coupon1Title"), sub: t("coupon1Sub") },
              { discount: "฿100", off: "OFF", title: t("coupon2Title"), sub: t("coupon2Sub") },
              { discount: "FREE", off: "SHIP", title: t("coupon3Title"), sub: t("coupon3Sub") },
              { discount: "x2", off: "PTS", title: t("coupon4Title"), sub: t("coupon4Sub") },
            ].map((c, i) => (
              <div
                key={i}
                className="flex w-[260px] h-[70px] shrink-0 overflow-hidden rounded-xl border border-border bg-white dark:bg-surface shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex w-[72px] shrink-0 flex-col items-center justify-center bg-primary-600 text-white">
                  <span className="text-base font-bold leading-none">{c.discount}</span>
                  <span className="mt-1 text-[10px] font-semibold tracking-wider">{c.off}</span>
                </div>
                <div className="flex flex-1 items-center gap-2 border-l border-dashed border-border px-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground">{c.title}</span>
                    <span className="truncate text-xs text-muted">{c.sub}</span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-700"
                  >
                    {t("couponClaim")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Container 3 — Carousel */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <PromoCarousel />
        </div>

        {/* Container 4 — Section heading */}
        <div className="mx-auto mt-8 w-full max-w-[1120px]">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-500">
            Our Services
          </p>
          <h2 className="mt-1 text-2xl font-bold">
            ครบจบในที่เดียวกับ Pacred
          </h2>
        </div>

        {/* Container 5 — 5 service link cards */}
        <div className="mx-auto mt-6 w-full max-w-[1120px]">
          <div className="flex gap-4">
            {[
              { label: t("link1"), href: "#" },
              { label: t("link2"), href: "#" },
              { label: t("link3"), href: "#" },
              { label: t("link4"), href: "#" },
              { label: t("link5"), href: "#" },
            ].map((item, i) => (
              <Link
                key={i}
                href={item.href}
                className="group flex flex-1 h-[90px] items-center justify-center rounded-xl border border-border bg-white dark:bg-surface shadow-sm px-3 text-center transition-all duration-200 hover:-translate-y-1 hover:border-primary-500 hover:shadow-lg"
              >
                <span className="text-sm font-semibold text-foreground group-hover:text-primary-600">
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
